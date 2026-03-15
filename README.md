# XImagine-A（Grok Draw Studio）

## 中文介紹

XImagine-A 是一個以 Grok-Imagine / OpenAI兼容圖片介面為核心的 AI 繪圖工作台。前端以 Vite + React + TypeScript 建置，後端以 Cloudflare Worker 作為代理，提供「文生圖」與「參考圖編輯」能力，並支援自訂 API端點與 API Key。

### 功能亮點

- 支援 Grok-Imagine / OpenAI Images / Chat Completions兼容介面
- 文生圖與參考圖編輯模式
- 自訂 API URL、API Key 與兼容模式
- 結果畫廊、收藏、提示詞複用與下載
- 專為 Cloudflare Pages + Worker 部署而設計
- OpenAI SDK兼容：
 - `POST /v1/chat/completions`
 - `POST /v1/images/generations`
 - `POST /v1/images/edits`
 - 支援 `stream: true` SSE 串流（Chat Completions）

### 技術棧

- 前端：Vite + React + TypeScript
- 後端：Cloudflare Worker
- 部署：Cloudflare Pages / Wrangler

### 快速開始

>需先安裝 Node.js18+。

```bash
npm install
npm run dev
```

### 建置與預覽

```bash
npm run build
npm run preview
```

### Cloudflare 本地與部署

```bash
npm run cf:dev
npm run cf:deploy
```

### OpenAI SDK兼容說明

- Base URL 指向你的部署網址（例如 `https://<your-domain>`）
- 驗證方式：`Authorization: Bearer <key>`
-端點：
 - `/v1/chat/completions`（支援 SSE）
 - `/v1/images/generations`
 - `/v1/images/edits`

### 環境變數

可在 `wrangler.toml` 設定預設上游 API端點與 Key：

- `GROK_API_URL`
- `GROK_API_KEY`

---

## English Introduction

XImagine-A is an AI image generation studio built for Grok-Imagine and OpenAI-compatible image APIs. The frontend uses Vite + React + TypeScript, and the backend relies on a Cloudflare Worker proxy to support text-to-image and image editing workflows. It also allows custom API endpoints and API keys.

### Highlights

- Supports Grok-Imagine, OpenAI Images, and Chat Completions compatible endpoints
- Text-to-image and reference-image editing modes
- Custom API URL, API Key, and compatibility mode
- Result gallery with favorite, prompt reuse, and download
- Optimized for Cloudflare Pages + Worker deployment
- OpenAI SDK compatible:
 - `POST /v1/chat/completions`
 - `POST /v1/images/generations`
 - `POST /v1/images/edits`
 - SSE streaming support for Chat Completions (`stream: true`)

### Tech Stack

- Frontend: Vite + React + TypeScript
- Backend: Cloudflare Worker
- Deployment: Cloudflare Pages / Wrangler

### Quick Start

> Requires Node.js18+.

```bash
npm install
npm run dev
```

### Build & Preview

```bash
npm run build
npm run preview
```

### Cloudflare Local & Deploy

```bash
npm run cf:dev
npm run cf:deploy
```

### OpenAI SDK Compatibility

- Base URL: your deployment domain (e.g. `https://<your-domain>`)
- Auth: `Authorization: Bearer <key>`
- Endpoints:
 - `/v1/chat/completions` (SSE supported)
 - `/v1/images/generations`
 - `/v1/images/edits`

### Environment Variables

Configure default upstream API settings in `wrangler.toml`:

- `GROK_API_URL`
- `GROK_API_KEY`
