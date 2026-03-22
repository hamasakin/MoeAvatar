<div align="center">

# 🎨 MoeAvatar
**基于 Gemini AI 的二次元头像风格化工具**

[在线预览](https://moeavatar.vercel.app) | [快速开始](#快速开始) | [功能特性](#功能特性)
</div>

---

## ✨ 功能特性

- 🖼️ **全图模式预览**：彻底修复预览裁剪问题，支持完整图片展示与缩放。
- 🚀 **极致性能优化**：针对 10MB+ 大图进行了深度优化，使用 **Blob URL** 管理状态，内存占用极低。
- 🤖 **Gemini AI 驱动**：集成 Google Gemini 3.1 系列模型，实现精准的角色分析与二次元风格化。
- 📱 **响应式设计**：使用 Tailwind CSS 4.0 构建，适配多种屏幕尺寸，提供丝滑的交互体验。
- 📥 **高质量导出**：支持 800x800 高清头像导出，自动合成滤镜与 AI 样式。

## 🛠️ 技术栈

- **Core**: React 19, TypeScript
- **Styling**: Tailwind CSS 4, Framer Motion
- **AI**: Google Gemini API (@google/genai)
- **Tooling**: Vite 6, pnpm

## 🚀 快速开始

### 1. 克隆并安装依赖
```bash
git clone https://github.com/hamasakin/MoeAvatar.git
cd MoeAvatar
pnpm install
```

### 2. 环境配置
在项目根目录创建 `.env` 文件，并填写以下配置：
```env
VITE_API_BASE_URL="您的 API 网关地址"
VITE_API_KEY="您的 API Key"
VITE_ANALYSIS_MODEL="gemini-3-flash-preview"
VITE_IMAGE_MODEL="gemini-3.1-flash-image-preview"
```

### 3. 启动开发环境
```bash
pnpm dev
```

## 🌐 部署

本项目已适配 Vercel：
```bash
npx vercel --prod
```
*提示：部署后请在 Vercel 控制台的 Environment Variables 中配置上述环境变量。*

## 📜 许可证
MIT License
