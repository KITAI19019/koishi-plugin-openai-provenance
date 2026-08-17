# koishi-plugin-openai-provenance

[![npm](https://img.shields.io/npm/v/koishi-plugin-openai-provenance?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-openai-provenance)
[![license](https://img.shields.io/npm/l/koishi-plugin-openai-provenance?style=flat-square)](./LICENSE)

用于验证 OpenAI 工具生成图像的 Koishi 插件。通过 OpenAI Content Provenance API，检测聊天消息中被引用图片是否包含受支持的 C2PA Content Credentials 或 SynthID 水印/溯源信号，可用于 OpenAI AI 生成图片检测与来源提示。

> 这不是通用 AI 图片鉴定器。`not_detected` 只表示没有发现当前支持的 OpenAI 溯源信号，不能证明图片不是 AI 生成，也不能排除图片由其他公司的模型生成。

## 功能

- 引用图片后使用指令检测，适合 QQ 等聊天平台。
- 支持 PNG、JPEG 和 WebP，默认限制为 20 MiB，可配置到 50 MiB。
- 分别处理“检测到信号”“未检测到信号”和“C2PA 元数据无效”。
- 对 429 和 OpenAI 5xx 临时错误进行有限重试。
- 支持多图消息选择序号。
- 所有面向用户的回复文案均可在 Koishi 面板中修改。

## 前置条件

- Koishi `4.18.7` 或更高兼容版本。
- Node.js 18 或更高版本。
- 可以访问 `https://api.openai.com` 的网络环境。
- 具有 Content Provenance API 访问权限的 OpenAI API Key。

OpenAI 接口说明见 [Content provenance 官方文档](https://developers.openai.com/api/docs/guides/content-provenance)。

## 安装

发布到 Koishi 插件市场后，可在控制台插件市场搜索 `openai-provenance` 并安装。

也可以在 Koishi 应用目录安装：

```bash
npm install koishi-plugin-openai-provenance
```

安装完成后，在 Koishi 控制台添加并启用插件。

## 快速使用

1. 在插件配置中填写 OpenAI API Key。
2. 在聊天平台中引用一条包含图片的消息。
3. 发送 `验图`。
4. 等待机器人返回检测结果。

多图消息可以指定图片序号：

```text
验图 2
验图 --index 2
```

未指定序号时默认检测第 1 张图片。序号从 `1` 开始。

## 配置

| 配置项 | 默认值 | 说明 |
|---|---:|---|
| `apiKey` | 未设置 | OpenAI API Key；在面板中以密文输入框显示 |
| `commandName` | `验图` | 触发检测的指令名称 |
| `quoteReply` | `true` | 检测结果是否引用用户的指令消息 |
| `showDetails` | `true` | 检测到信号时是否输出详细信息 |
| `maxFileSizeMiB` | `20` | 最大图片大小，范围 1～50 MiB |
| `downloadTimeoutMs` | `15000` | 下载被引用图片的超时时间 |
| `apiTimeoutMs` | `30000` | 等待 OpenAI 响应的超时时间 |
| `retryCount` | `2` | 429 或 5xx 错误的最大重试次数 |

插件面板还可以分别修改处理中、检测成功、未检测到、元数据无效及错误场景的回复文案。

### 回复文案变量

| 变量 | 含义 |
|---|---|
| `{details}` | 格式化后的检测详情 |
| `{signalType}` | `C2PA`、`SynthID` 或两者 |
| `{issuer}` | C2PA 发行方 |
| `{model}` | 返回结果中的模型名称 |
| `{generatedAt}` | 返回结果中的生成时间 |
| `{validationState}` | C2PA 验证状态 |
| `{error}` | 已过滤敏感信息的错误描述 |
| `{command}` | 当前指令名称 |
| `{count}` | 被引用消息中的图片数量 |
| `{index}` | 用户选择的图片序号 |

## 如何理解结果

- **检测到信号**：图片中存在当前接口支持的 OpenAI C2PA 或 SynthID 溯源证据。
- **未检测到信号**：没有发现受支持信号，但图片仍可能经过截图、压缩、裁剪、格式转换或元数据移除，也可能来自旧模型或其他生成工具。
- **C2PA 元数据无效**：检测到了无效清单，不能把它当作可靠来源证明。

检测结果适合作为内容审核和来源提示的一项证据，不应单独用于处罚、封禁或其他高风险自动决策。

## 数据与安全

- 被检测图片会上传到 OpenAI Content Provenance API。
- 插件不会主动把图片写入本地文件或数据库。
- API Key 使用 Koishi 的密文配置字段，插件日志不会输出原始 Key。
- 请勿将 API Key、Koishi 配置文件或日志中的敏感凭据提交到 GitHub。

## 常见问题

### 提示当前组织可能没有接口权限

OpenAI 对没有 Content Provenance API 访问权限的组织可能返回 HTTP 404。请确认 API Key 所属组织具有该接口权限。

### 被引用消息中找不到图片

适配器需要在引用消息内容中提供标准 Koishi `img` 元素。若图片链接已经过期，也可能无法下载。

### 检测结果为未检测到

这不是错误，也不代表图片一定不是 AI 生成。请结合返回说明和其他证据判断。

## 本地开发

```bash
npm install
npm test
npm run build
npm pack --dry-run
```

## 许可证

[MIT](./LICENSE)
