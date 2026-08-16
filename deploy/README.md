# 阿里云部署清单（言灵·龙族）

应用已具备：RAG 文风学习、每设备每日免费额度、IP/设备限流、免登录充值弹窗占位、支付回调占位。
本清单说明如何在阿里云跑起来并接入分发/监控。

> 前置：阿里云账号、已备案域名（如需国内 HTTPS）。所有费用均按量起步，稳定后可转包年包月。

## 1. 选部署形态
- **ECS（推荐）**：开一台 2C4G 左右 ECS，`npm run build && npm run start` 即可，Server Action 流式与本地一致最稳。
- 函数计算 FC（低成本备选）：按调用计费，但需额外配置流式响应，且 Tair 连接需用代理复用，个人项目建议先用 ECS。

## 2. 构建语料（RAG）
构建与运行时必须用**同一个 embedding 模型**，否则检索失效。
- 默认（阿里云 DashScope）：在本地或 ECS 上设置 `DASHSCOPE_API_KEY` 后运行：
  ```bash
  npm run corpus
  ```
- 用本机 LM Studio（免费）：先在本机 LM Studio 加载 `nomic-embed-text` 并启动服务，再：
  ```bash
  EMBED_BASE_URL=http://localhost:1234/v1 EMBED_MODEL=nomic-embed-text npm run corpus
  ```
  部署到 ECS 后若仍想免费，需在 ECS 内网也跑一个同样的嵌入模型（CPU 即可）。
- 产物 `data/corpus.json` 已 gitignore，请随部署包一起带上（Docker 镜像内已 COPY，或运行时挂载）。

## 3. 环境变量
复制 `.env.example` 为 `.env`（或 ECS 的环境变量面板），至少填：
- `DASHSCOPE_API_KEY`：通义千问生成用（必填）
- `EMBED_*`：向量化端点（默认 DashScope，可改 LM Studio）
- `TAIR_URL`：阿里云 Tair 连接串（**多实例必填**，否则限流/额度仅单机有效）
- 支付相关：暂留空（占位）

## 4. 限流/额度的持久化（Tair）
- 在阿里云开通 **Tair（Redis 版）**，获取连接串填入 `TAIR_URL`。
- 未配置时自动降级内存（仅本地/单实例），请勿在生产多实例下依赖。

## 5. 跑起来（ECS 裸机方式）
```bash
# 1) 安装依赖并构建
npm ci
npm run build
# 2) 确保 data/corpus.json 已生成
# 3) 用进程管理器常驻（推荐 pm2）
npm i -g pm2
pm2 start "npm run start" --name yanling
pm2 save && pm2 startup
```

## 6. 反向代理 + HTTPS（Nginx）
- 将 `deploy/nginx.conf` 放到 `/etc/nginx/conf.d/yanling.conf`，改 `server_name` 为你的域名。
- 申请免费证书（阿里云 SSL 或 certbot），在 nginx 中加 443 + HTTP→HTTPS 跳转。
- `nginx -t && systemctl reload nginx`。
- 关键：`proxy_buffering off` 已配置，保证流式打字机实时推送。

## 7. 容器方式（可选）
```bash
docker build -t yanling .
docker run -d -p 3000:3000 --env-file .env yanling
```
（Dockerfile 见同目录；注意构建/运行前先生成 `data/corpus.json`。）

## 8. CDN / DCDN 分发
- 在阿里云 **CDN / 全站加速 DCDN** 添加域名，源站指向 ECS 公网 IP。
- 缓存规则：仅缓存 `/_next/static/*`（长缓存），动态路径与 `/api`、`Server Action` 回源不缓存。

## 9. 日志与监控（SLS）
- 开通 **SLS 日志服务**，采集 ECS 的 Nginx 访问日志与 `pm2`/`next` 应用日志。
- 可选接入 **云监控** 对 ECS CPU/内存、Tair 命中率做告警。

## 10. 支付闭环（待填）
- 接入微信支付 / 支付宝 / Stripe 后：
  - 前端 `RechargeModal` 点击 → `POST /api/checkout` 返回真实收银台链接/二维码。
  - 支付平台回调 `POST /api/webhooks/<channel>`，**务必校验签名**后调用 `addQuota(did, n)` 充值。
  - 当前 `webhooks/alipay/route.ts` 为占位，生产前必须补签名校验与订单状态幂等处理。

## 费用参考（按量，非包年）
- 模型调用：构建语料一次性几元；运行时每次生成仅一句 query 向量化（忽略不计）+ 一次 qwen-plus 生成（按 token，个人用量极低）。
- ECS：按量约几毛/小时，长期转包年包月更省。
- Tair / CDN / SLS：量小近乎免费。
