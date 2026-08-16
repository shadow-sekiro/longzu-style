import type { NextConfig } from "next";

// 注意：不要设置自定义 distDir（如 .lzc）。本地 dev 的 safe-delete 护栏问题已通过
// 每次启动换端口 + 全新未使用过的 distDir 名解决（见 run_dev.py）；而在 next.config 里
// 写死 distDir 会导致 Vercel 找不到默认的 .next 产物目录，部署失败。
// 保持默认 distDir（.next）即可同时兼容本地 dev 与 Vercel 部署。
const nextConfig: NextConfig = {};

export default nextConfig;
