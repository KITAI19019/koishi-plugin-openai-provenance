import { Context, h, Schema, Session } from 'koishi'
import {
  detectImageFormat,
  normalizeProvenanceResponse,
  renderTemplate,
} from './provenance'
import type { ContentProvenanceResponse } from './types'

export const name = 'openai-provenance'
export const inject = ['http']

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/content_provenance_checks'
const MIB = 1024 * 1024

const defaults = {
  processingMessage: '正在检测，请稍候……',
  detectedMessage: `检测结果：发现受支持的 OpenAI 溯源信号
{details}

说明：该结果表示图片中存在受支持的溯源证据，不代表文件从未被编辑。`,
  notDetectedMessage: `检测结果：未检测到受支持的 OpenAI 溯源信号

这不等于“确定不是 AI 图片”。图片压缩、截图、裁剪、格式转换、元数据移除、旧模型生成或其他公司的模型都可能无法被识别。`,
  invalidMetadataMessage: `检测结果：未获得可信结论

图片中存在无效的 C2PA 元数据，不能将其作为可靠的来源证明。该结果也不代表图片一定不是 AI 生成。`,
  errorMessage: '检测失败：{error}',
  missingApiKeyMessage: '插件尚未配置 OpenAI API Key，请联系机器人管理员。',
  noQuoteMessage: '请先引用一条包含图片的消息，再发送“{command}”。',
  noImageMessage: '被引用的消息中没有找到图片。',
  imageIndexOutOfRangeMessage: '被引用的消息共有 {count} 张图片，找不到第 {index} 张。',
}

export interface Config {
  apiKey?: string
  commandName: string
  quoteReply: boolean
  showDetails: boolean
  maxFileSizeMiB: number
  downloadTimeoutMs: number
  apiTimeoutMs: number
  retryCount: number
  processingMessage: string
  detectedMessage: string
  notDetectedMessage: string
  invalidMetadataMessage: string
  errorMessage: string
  missingApiKeyMessage: string
  noQuoteMessage: string
  noImageMessage: string
  imageIndexOutOfRangeMessage: string
}

const messageSchema = (description: string, defaultValue: string, rows = 4) => {
  return Schema.string()
    .role('textarea', { rows: [2, rows] })
    .default(defaultValue)
    .description(description)
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    apiKey: Schema.string()
      .role('secret')
      .description('OpenAI API Key。推荐通过环境变量插值填写。'),
    commandName: Schema.string()
      .pattern(/^[^\s./]+$/)
      .default('验图')
      .description('引用图片后执行的指令名称。'),
    quoteReply: Schema.boolean()
      .default(true)
      .description('回复检测结果时是否引用用户的指令消息。'),
    showDetails: Schema.boolean()
      .default(true)
      .description('检测到信号时，是否将详细信息填入 {details}。'),
  }).description('基础设置'),
  Schema.object({
    maxFileSizeMiB: Schema.number()
      .min(1)
      .max(50)
      .step(1)
      .default(20)
      .description('允许下载的最大图片大小，单位 MiB。OpenAI 上限为 50 MiB。'),
    downloadTimeoutMs: Schema.number()
      .min(1000)
      .max(120000)
      .step(1000)
      .default(15000)
      .role('ms')
      .description('从消息平台下载图片的超时时间。'),
    apiTimeoutMs: Schema.number()
      .min(1000)
      .max(120000)
      .step(1000)
      .default(30000)
      .role('ms')
      .description('等待 OpenAI 检测结果的超时时间。'),
    retryCount: Schema.number()
      .min(0)
      .max(3)
      .step(1)
      .default(2)
      .description('遇到 429 或 5xx 临时错误时的最大重试次数。'),
  }).description('请求限制'),
  Schema.object({
    processingMessage: messageSchema(
      '开始下载和检测图片时发送。留空则不发送处理中提示。',
      defaults.processingMessage,
      3,
    ),
    detectedMessage: messageSchema(
      '检测到信号时发送。可用：{details}、{signalType}、{issuer}、{model}、{generatedAt}、{validationState}。',
      defaults.detectedMessage,
      8,
    ),
    notDetectedMessage: messageSchema(
      '未检测到受支持信号时发送。',
      defaults.notDetectedMessage,
      8,
    ),
    invalidMetadataMessage: messageSchema(
      '未检测到信号且 C2PA 元数据无效时发送。可使用与检测成功相同的变量。',
      defaults.invalidMetadataMessage,
      8,
    ),
    errorMessage: messageSchema(
      '检测失败时发送。可用：{error}。',
      defaults.errorMessage,
      3,
    ),
    missingApiKeyMessage: messageSchema(
      '尚未配置 API Key 时发送。',
      defaults.missingApiKeyMessage,
      3,
    ),
    noQuoteMessage: messageSchema(
      '没有引用消息时发送。可用：{command}。',
      defaults.noQuoteMessage,
      3,
    ),
    noImageMessage: messageSchema(
      '引用消息不含图片时发送。',
      defaults.noImageMessage,
      3,
    ),
    imageIndexOutOfRangeMessage: messageSchema(
      '选择的图片序号不存在时发送。可用：{count}、{index}。',
      defaults.imageIndexOutOfRangeMessage,
      3,
    ),
  }).description('回复文案'),
])

class SafeError extends Error {}

function createReply(session: Session, text: string, quoteReply: boolean) {
  const content = h.text(text)
  if (quoteReply && session.messageId) {
    return [h.quote(session.messageId), content]
  }
  return content
}

async function getQuotedImageUrls(session: Session) {
  if (!session.quote) return null

  let content = session.quote.content
  if (!content && session.quote.id) {
    try {
      const message = await session.bot.getMessage(
        session.channelId,
        session.quote.id,
      )
      content = message.content
    } catch {}
  }

  return h.select(content || '', 'img, image')
    .map((element) => element.attrs.src ?? element.attrs.url)
    .filter((url): url is string => typeof url === 'string' && !!url)
}

async function readLimitedResponse(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SafeError(`图片超过 ${Math.floor(maxBytes / MIB)} MiB 的大小限制。`)
  }

  if (!response.body) {
    const data = new Uint8Array(await response.arrayBuffer())
    if (data.byteLength > maxBytes) {
      throw new SafeError(`图片超过 ${Math.floor(maxBytes / MIB)} MiB 的大小限制。`)
    }
    return data
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new SafeError(`图片超过 ${Math.floor(maxBytes / MIB)} MiB 的大小限制。`)
    }
    chunks.push(value)
  }

  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function downloadImage(ctx: Context, url: string, config: Config) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SafeError('引用消息中的图片地址无效。')
  }

  if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) {
    throw new SafeError(`不支持 ${parsed.protocol} 协议的图片地址。`)
  }

  let data: Uint8Array
  try {
    data = await ctx.http.get<Uint8Array>(url, {
      timeout: config.downloadTimeoutMs,
      responseType: (response) => readLimitedResponse(
        response,
        config.maxFileSizeMiB * MIB,
      ),
    })
  } catch (error) {
    if (error instanceof SafeError) throw error
    if (ctx.http.isError(error) && error.code === 'ETIMEDOUT') {
      throw new SafeError('下载引用图片超时。')
    }
    throw new SafeError('无法下载引用图片，图片链接可能已经过期。')
  }

  const format = detectImageFormat(data)
  if (!format) {
    throw new SafeError('仅支持 PNG、JPEG 和 WebP 图片。')
  }

  return { data, ...format }
}

function retryDelay(headers: Headers | undefined, attempt: number) {
  const retryAfter = headers?.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) {
      return Math.min(Math.max(seconds * 1000, 0), 30000)
    }
    const date = Date.parse(retryAfter)
    if (!Number.isNaN(date)) {
      return Math.min(Math.max(date - Date.now(), 0), 30000)
    }
  }
  return Math.min(1000 * 2 ** attempt, 5000)
}

function safeApiError(ctx: Context, error: unknown) {
  if (error instanceof SafeError) return error
  if (!ctx.http.isError(error)) {
    return new SafeError('发生了未知错误。')
  }

  const status = error.response?.status
  if (error.code === 'ETIMEDOUT') return new SafeError('请求超时。')
  if (status === 400) return new SafeError('图片格式不受支持、文件损坏或被接口拒绝。')
  if (status === 401 || status === 403) return new SafeError('OpenAI API Key 无效或没有访问权限。')
  if (status === 404) return new SafeError('当前 OpenAI 组织可能没有 Content Provenance API 访问权限。')
  if (status === 429) return new SafeError('OpenAI 接口请求过于频繁，请稍后再试。')
  if (status && status >= 500) return new SafeError('OpenAI 服务暂时不可用，请稍后再试。')
  return new SafeError('无法连接 OpenAI 检测接口。')
}

async function checkProvenance(
  ctx: Context,
  config: Config,
  image: Awaited<ReturnType<typeof downloadImage>>,
) {
  for (let attempt = 0; ; attempt++) {
    const uploadBytes = new Uint8Array(image.data.byteLength)
    uploadBytes.set(image.data)
    const form = new FormData()
    form.append(
      'file',
      new Blob([uploadBytes.buffer], { type: image.mimeType }),
      `quoted-image.${image.extension}`,
    )

    try {
      const response = await ctx.http<ContentProvenanceResponse>(
        'POST',
        OPENAI_ENDPOINT,
        {
          data: form,
          headers: {
            Authorization: `Bearer ${config.apiKey!.trim()}`,
          },
          timeout: config.apiTimeoutMs,
          responseType: 'json',
        },
      )
      return response.data
    } catch (error) {
      const status = ctx.http.isError(error) ? error.response?.status : undefined
      const transient = status === 429 || (status !== undefined && status >= 500)
      if (!transient || attempt >= config.retryCount) throw error
      await new Promise((resolve) => setTimeout(
        resolve,
        retryDelay(error.response?.headers, attempt),
      ))
    }
  }
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger(name)
  const command = ctx.command(
    `${config.commandName} [index:posint]`,
    '检测引用图片中的 OpenAI 内容溯源信号',
    { captureQuote: false },
  )

  command
    .option('index', '-i, --index <index:posint> 选择引用消息中的第几张图片')
    .action(async ({ session, options }, index) => {
      const reply = (text: string) => createReply(session, text, config.quoteReply)
      const imageUrls = await getQuotedImageUrls(session)

      if (imageUrls === null) {
        return reply(renderTemplate(config.noQuoteMessage, {
          command: config.commandName,
        }))
      }

      if (!imageUrls.length) return reply(config.noImageMessage)

      const selectedIndex = options.index ?? index ?? 1
      if (selectedIndex > imageUrls.length) {
        return reply(renderTemplate(config.imageIndexOutOfRangeMessage, {
          count: imageUrls.length,
          index: selectedIndex,
        }))
      }

      if (!config.apiKey?.trim()) return reply(config.missingApiKeyMessage)
      if (config.processingMessage) {
        await session.send(h.text(config.processingMessage))
      }

      try {
        const image = await downloadImage(ctx, imageUrls[selectedIndex - 1], config)
        const response = await checkProvenance(ctx, config, image)
        const result = normalizeProvenanceResponse(response)
        const variables = {
          ...result,
          details: config.showDetails ? result.details : '',
        }

        if (result.status === 'detected') {
          return reply(renderTemplate(config.detectedMessage, variables))
        }
        if (result.status === 'invalid_metadata') {
          return reply(renderTemplate(config.invalidMetadataMessage, variables))
        }
        return reply(renderTemplate(config.notDetectedMessage, variables))
      } catch (error) {
        const safeError = safeApiError(ctx, error)
        logger.warn('provenance check failed: %s', safeError.message)
        return reply(renderTemplate(config.errorMessage, {
          error: safeError.message,
        }))
      }
    })
}
