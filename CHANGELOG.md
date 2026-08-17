# Changelog

## 1.0.1 - 2026-08-17

- Export `./package.json` so Koishi's package scanner can discover and configure the installed plugin.
- Remove an unused workspace-only TypeScript type dependency so standalone CI builds succeed.

## 1.0.0 - 2026-08-17

- 支持检测被引用 PNG、JPEG 和 WebP 图片中的 OpenAI C2PA 与 SynthID 信号。
- 支持多图消息按序号选择图片。
- 支持在 Koishi 面板中自定义全部回复文案。
- 区分检测到、未检测到和 C2PA 元数据无效三类结果。
- 增加文件大小、下载超时、API 超时和临时错误重试控制。
- 增加安全错误信息、格式签名检查和单元测试。
