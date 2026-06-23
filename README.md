# poster-lancy-site

AI 海报生成工具 —— 基于 GPT Image 的 ChatGPT 风格生图流程。

模拟 ChatGPT 生图流程：提示词理解 → 上下文整合 → 多轮修正 → 参数选择 → 图片生成。

## 功能

- 💬 对话模型增强提示词（支持多轮迭代修改）
- 🎨 生图模型生成图片（OpenAI / grsai / Agnes 等多服务商）
- ⚙️ 侧边栏配置：服务商、API Key、模型、超时、Temperature、系统提示词
- 📦 配置/对话导出，本地存储（localStorage）
- 🖼️ 图片预览、下载、放大查看

## 技术栈

- 纯静态 HTML + CSS + JavaScript（无构建步骤）
- 部署在 Vercel

## 本地开发

直接用浏览器打开 `index.html`，或启动任意静态服务器：

```bash
npx serve .
```

## 部署

- 仓库：https://github.com/robin-fc/poster-lancy-site
- 域名：https://poster.lancy.site
- 平台：Vercel（静态站点，自动部署）

## 相关项目

- 入口站：[lancy.site](https://lancy.site) —— 兰心 AI 实验室
- AI 漫剧：[comic.lancy.site](https://comic.lancy.site)
- 公众号优化：[blog.lancy.site](https://blog.lancy.site)

## License

MIT
