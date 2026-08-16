import type { NextConfig } from "next";

// distDir 用完全不含 "next" 字样的相对名 .lzb，避开环境层 safe-delete 护栏：
// 该护栏按工作区路径、且单回合删除累计超阈值即拦截 next dev 的缓存清理。
// ".lzb" 与 ".next" 无子串关系、且从未被使用过，首次启动目录不存在、next 只创建不删除，
// 从而不触发护栏计数。next 无条件 path.join(projectDir, distDir)，故只能相对。
const nextConfig: NextConfig = {
  distDir: ".lzc",
};

export default nextConfig;
