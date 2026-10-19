> 安装前置条件：Node.js >= 22.19.0（建议 Node.js 22 LTS）。Pi SDK 使用已发布的 npm 包，版本固定为 0.76.0，无需另行 checkout pi-mono。运行 `npm install`，再运行 `npm run dev`，默认端口为 8286。

# Audit Studio

独立仓库：https://github.com/cnLuca0702/audit-studio

本地开发端口 **8286**（`npm run dev`）。推送代码：

```bash
./push.sh "你的提交说明"
```

部署说明见 [DEPLOY.md](./DEPLOY.md)。

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### 对话文档导出

对话支持通过 `export_document` 工具生成 `.docx`、`.pdf`、`.md`、`.txt`，文件保存到当前工作目录的 `outputs/`，重名时自动添加序号。右侧文件栏支持浏览、预览和下载；Word 显示正文预览，PDF 使用浏览器内嵌预览，Markdown 显示排版预览。

本地运行前安装 PDF 渲染引擎：

```bash
npx playwright install chromium --with-deps
```

中文 PDF 还需要系统中文字体（例如 Debian/Ubuntu 的 `fonts-noto-cjk`）。也可通过 `CHROMIUM_PATH` 指定已有 Chromium。Docker 镜像已安装 Chromium 和 Noto CJK 字体，无需额外操作。更新后重新建立或恢复对话会话，以加载新的文档工具。

文档导出回归验证：`node --test src/lib/chat-documents.test.mjs`。
