# 龙族生文器 · 部署上线（Vercel）

最快上线路径：推 GitHub → Vercel 导入 → 配一个环境变量 → 上线。

## 一、准备（本地，已替你做好）
- `.gitignore` 已忽略 `.env*.local`、大语料 `data/corpus.bin` 等（不会进仓库）。
- `vercel.json` 已配置：框架 nextjs、构建 `next build`、区域 `hkg1`（香港，近国内）。
- `app/api/generate/route.ts` 已设 `export const maxDuration = 60`（Vercel 函数超时上限）。

## 二、推到 GitHub（你来做）
```bash
cd e:\work\龙族生文器\longzu-style
git init
git add -A
git commit -m "init: 龙族生文器"
# 然后在 GitHub 网页新建一个空仓库（不要勾 README），复制它的 git 地址
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

## 三、Vercel 导入（你来做）
1. 打开 https://vercel.com ，用 GitHub 登录。
2. Add New → Project → 选刚才的仓库 → Deploy。
3. 在 "Environment Variables" 里加一条（**必须**，否则上线即 500）：
   - `DASHSCOPE_API_KEY` = `sk-...`（即本地 `.env.local` 里那串）
4. 点 Deploy。约 1-2 分钟构建完，得到 `https://<项目>.vercel.app`。

## 四、重要约束
- **套餐**：Hobby 免费版函数超时上限 **10 秒**，而 qwen-plus 整段生成可能 60-90s，会被截断半截。
  解决：要么升级 **Pro（$20/月，函数超时可到 60s+）**，要么只输入很短的句子（单句 ≤200 字，生成快的可能压进 10s）。
  已用 `maxDuration=60`，Pro 版下不会截断。
- **语料（corpus.bin）**：本次上线**不含** 240MB 语料的相似召回，生成靠内置「精华池 8 段」兜底，风格仍正常。
  后续要完整 RAG，把 `data/corpus.bin` + `data/corpus.chunks` 放到对象存储（如 Vercel Blob / 腾讯云 COS），
  改 `lib/corpus.ts` 的 `binPath` 指向远程 URL 即可。
- **嵌入服务**：`.env.local` 里 `EMBED_BASE_URL=http://localhost:1234` 不会传到 Vercel（被忽略）。
  Vercel 上不设该变量，会回退到 DashScope 云端 embedding，相似召回在云端也能工作（需 DashScope Key 有 embedding 权限）。
- **本地 LM Studio（1234 端口）**：云端用不了，已被平滑降级，不影响生成。

## 五、国内访问
Vercel 默认域名国内有时慢/偶发不可达。若要稳定国内访问，建议：
- 绑自定义域名（国内备案域名）+ Vercel，或
- 改用腾讯云 CloudBase / 阿里云函数计算部署（同构 Next.js）。
