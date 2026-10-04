# Frame & Speak · 有框架地说

A bilingual (中文 / English) speaking-practice coach: draw a topic or describe your own situation, answer step by step with a framework, then get feedback, a model answer with a marked read-aloud script, and vocabulary.

一个中英双语的表达练习应用：抽一道题或描述你自己的场景，按框架一步步回答，然后拿到评分、改写建议、带连读 / 停顿 / 重音标记的朗读稿和生词卡。

## 功能 Features

- **两个独立板块**：中文板块练中文表达，English 板块练英文口语（卡壳处可以直接写中文）。
- **题库**：生活 18 题、工作 18 题、图表 28 题（11 种常见图表，练数据汇报），每题自带回答框架和每步可用表达。
- **自由场景**：描述一个真实场景，生成专属的题目和向导。
- **反馈**：结构、清晰、用词、自然四项评分，修改建议，示范回答，逐句播放的朗读稿，生词卡。

## 两种用法 Two ways to use it

### 1. 网页版（Claude Artifact）· `index.html`

一个单文件网页。作为 Claude Artifact 发布时，向导和反馈由打开页面的人自己的 Claude 账户生成；直接用浏览器打开时，题库、框架和图表可用，AI 功能不可用。

To run it as a Claude Artifact, ask Claude to publish `index.html` as an artifact with the `sample` capability.

好词好句本和练习记录只保存在每个人自己的浏览器里（localStorage），互不可见；换浏览器或清除网站数据后会清空。

### 2. MCP 服务器 · `mcp/`

把应用接进 ChatGPT、Claude 等支持 MCP 的 AI 助手：练习卡和反馈卡直接显示在对话里（MCP Apps），向导和点评由用户自己的 AI 完成，服务器不存密钥、不调用模型。

可以直接用公开实例：

```
https://frame-speak-mcp.aitoolscollection.workers.dev/mcp
```

或者部署你自己的（Cloudflare Workers 免费版即可）：

```bash
cd mcp
npm install
npx wrangler login
npm run deploy
```

详见 [mcp/README.md](mcp/README.md)。题库和表达只维护一份：改 `index.html`，`npm run build` 会自动同步到 MCP 服务器。

## License

MIT
