# 言灵 · 龙族风文风生成（最小可用版）

将日常大白话一键改写为「龙族风 / 暗黑史诗风」文学文本的轻量级网页应用。
前端以打字机效果逐字呈现，背景为暗黑雨夜 Canvas 粒子特效。

> 本工具为《龙族》风格的同人 / 致敬向文风生成器，由粉丝制作，非官方产品，与原作者及版权方无关联。生成内容均为 AI 原创，仅供个人学习交流，请勿用于商业或任何侵权用途。

## 技术栈

- Next.js 15（App Router）+ TypeScript
- Tailwind CSS v4 / Framer Motion
- Vercel AI SDK（`ai` + `@ai-sdk/openai`）
- 通义千问（阿里云百炼 DashScope，OpenAI 兼容端点）
- 部署：Docker + Nginx 反向代理

## 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
#   编辑 .env，填入真实 DASHSCOPE_API_KEY（在 https://dashscope.console.aliyun.com/ 获取）

# 3. 启动开发服务器
npm run dev
# 打开 http://localhost:3000
```

无 `DASHSCOPE_API_KEY` 时，点击生成会提示「服务端尚未配置 API Key」。

## 阿里云 Docker 部署

前置：服务器已安装 Docker 与 Docker Compose，且可访问外网（构建时需拉取依赖与 Google Fonts）。

```bash
# 1. 上传整个 longzu-style 目录到服务器

# 2. 配置密钥（务必放在服务器本地，不要提交到仓库）
cp .env.example .env
vim .env            # 填入 DASHSCOPE_API_KEY 与 MODEL

# 3. 构建并启动（后台运行）
docker compose up -d --build

# 4. 访问
#    http://<服务器公网IP>      （nginx 已监听 80 端口反代到容器 3000）
```

常用命令：

```bash
docker compose logs -f app     # 查看应用日志
docker compose restart         # 重启
docker compose down            # 停止并移除容器
```

### 绑定域名 + HTTPS（可选）

1. 在服务器上用 certbot 申请证书，得到 `fullchain.pem` 与 `privkey.pem`。
2. 修改 `nginx.conf`：取消底部 `server { listen 443 ssl; ... }` 注释，填入域名与证书路径。
3. 将证书挂载进 nginx 容器（`docker-compose.yml` 的 `nginx.volumes` 增加一行 `- /path/certs:/etc/nginx/certs:ro`）。
4. `docker compose up -d nginx` 重新加载。

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key（必填） | 无 |
| `MODEL` | 通义千问模型名 | `qwen-plus` |

## 目录结构

```
app/            页面、布局、Server Action（生成逻辑）
components/     输入、结果展示、打字机、雨夜特效
lib/            风格 Prompt 与工具函数
public/         静态资源（favicon）
Dockerfile / docker-compose.yml / nginx.conf   部署配置
```

## 版权说明

- 本项目为《龙族》粉丝向的同人 / 致敬作品，非官方产品，与原作者江南及版权方无任何关联。
- `lib/prompts.ts` 中的风格示范句均为原创，不引用《龙族》或任何既有文学作品原文。
- 生成内容为模型原创，仅供个人学习交流，请勿用于商业或任何侵权用途。
