import type {
  ContentProvenanceResponse,
  DetectedImageFormat,
  NormalizedProvenanceResult,
} from './types'

const validationStateLabels = {
  trusted: '可信',
  valid: '有效',
  invalid: '无效',
  not_present: '不存在',
} as const

function startsWith(data: Uint8Array, signature: number[]) {
  return signature.every((value, index) => data[index] === value)
}

export function detectImageFormat(data: Uint8Array): DetectedImageFormat | null {
  if (data.length >= 8 && startsWith(data, [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])) {
    return { mimeType: 'image/png', extension: 'png' }
  }

  if (data.length >= 3 && startsWith(data, [0xff, 0xd8, 0xff])) {
    return { mimeType: 'image/jpeg', extension: 'jpg' }
  }

  if (
    data.length >= 12
    && startsWith(data, [0x52, 0x49, 0x46, 0x46])
    && data[8] === 0x57
    && data[9] === 0x45
    && data[10] === 0x42
    && data[11] === 0x50
  ) {
    return { mimeType: 'image/webp', extension: 'webp' }
  }

  return null
}

function formatGeneratedAt(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

export function normalizeProvenanceResponse(
  response: ContentProvenanceResponse,
): NormalizedProvenanceResult {
  if (!response || !Array.isArray(response.results)) {
    throw new TypeError('OpenAI 返回了无法识别的检测结果。')
  }

  const results = response.results.filter((item) => {
    return item
      && (item.type === 'c2pa' || item.type === 'synthid')
      && (item.outcome === 'detected' || item.outcome === 'not_detected')
  })

  if (!results.length) {
    throw new TypeError('OpenAI 返回的检测结果为空。')
  }

  const detected = results.filter((item) => item.outcome === 'detected')
  const c2pa = results.find((item) => item.type === 'c2pa')
  const detectedC2pa = detected.find((item) => item.type === 'c2pa')
  const primary = detectedC2pa ?? detected[0] ?? c2pa ?? results[0]

  let status: NormalizedProvenanceResult['status'] = 'not_detected'
  if (detected.length) {
    status = 'detected'
  } else if (c2pa?.type === 'c2pa' && c2pa.validation_state === 'invalid') {
    status = 'invalid_metadata'
  }

  const signalType = detected
    .map((item) => item.type === 'c2pa' ? 'C2PA' : 'SynthID')
    .join('、')

  const issuer = primary.type === 'c2pa' ? primary.issuer ?? '' : ''
  const model = primary.model ?? ''
  const generatedAt = formatGeneratedAt(primary.generated_at)
  const validationState = c2pa?.type === 'c2pa'
    ? validationStateLabels[c2pa.validation_state]
    : ''

  const detailLines: string[] = []
  if (signalType) detailLines.push(`信号类型：${signalType}`)
  if (validationState) detailLines.push(`C2PA 验证状态：${validationState}`)
  if (issuer) detailLines.push(`发行方：${issuer}`)
  if (model) detailLines.push(`模型：${model}`)
  if (generatedAt) detailLines.push(`生成时间：${generatedAt}`)

  return {
    status,
    signalType,
    issuer,
    model,
    generatedAt,
    validationState,
    details: detailLines.join('\n'),
  }
}

export function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
) {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, key) => {
    return String(variables[key] ?? '')
  }).replace(/\n{3,}/g, '\n\n').trim()
}
