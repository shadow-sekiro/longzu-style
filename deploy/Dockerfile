# 多阶段构建 Next.js 生产镜像（ECS 容器化可选）
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# 注意：data/corpus.json 已被 .gitignore 忽略，但本地磁盘存在时会被 COPY 进镜像。
# 若镜像内需要语料，请在 build 前于本地运行 `npm run corpus` 生成，
# 或在容器启动时挂载已构建好的 data/corpus.json，再由 entrypoint 调用。
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app
COPY --from=builder /app/data ./data 2>/dev/null || true
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000
CMD ["npm", "run", "start"]
