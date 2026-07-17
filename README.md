# Image Atelier

一个面向画廊工作流的多模型生图应用，支持 OpenAI 与 Gemini 提供商。

## 开发

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

桌面版开发预览（先构建前端，再启动 Electron）：

```bash
npm run desktop
```

## 发布

- 在 GitHub Actions 中手动运行 `Release Windows`，输入语义化版本号（如 `1.2.3`），工作流会创建 `v1.2.3` Release 并上传可直接双击运行的 Windows x64 portable EXE。
- `Publish Docker Image` 会在推送到 `main`、推送 `v*` 标签或手动运行时，将镜像发布到 `ghcr.io/yansd001/imageatelier`。手动运行时可输入镜像版本号。

本地运行容器：

```bash
docker run --rm -p 8080:80 ghcr.io/yansd001/imageatelier:latest
```

## 使用

打开页面后，在右上角设置中填写全局 `Base URL` 和 `API Key`。Base URL 只需要填写域名，例如 `https://code.yansd666.com`，程序会自动为 OpenAI 追加 `/v1`、为 Gemini 追加 `/v1beta`。OpenAI、Gemini 也可以单独填写配置进行覆盖。左侧选择提供商与模型，模型既可以从下拉建议中选择，也可以直接输入自定义模型 ID。

- OpenAI 显示尺寸、质量、背景、输出格式、生成数量，调用 `/images/generations`。
- Gemini 显示画面比例、图像分辨率、生成数量，调用 `models/{model}:generateContent`，解析 `inlineData` 图片响应。

生成面板支持上传最多 8 张 JPG、PNG 或 WEBP 参考图。OpenAI 会自动切换到 `/images/edits` multipart 请求，Gemini 会将参考图作为 `inlineData` 发送。任务、收藏、参考图和配置保存在浏览器 `localStorage` 中。画廊支持提示词搜索、收藏筛选、图片灯箱预览、上一张/下一张、下载、复制提示词和删除任务。

网站 logo 文件放在 `public/logo.png`。建议使用烟神殿原图，页面会以方形裁剪方式显示在左上角和浏览器标签页。
