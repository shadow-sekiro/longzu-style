// 每 IP 固定窗口限流。
// 作用：封住"别人无限刷你的通义千问账单"的敞口。
//
// 后端优先级：配置了 TAIR_URL → 用 Tair 原子窗口（跨实例有效，适合 ECS/FC 多实例）；
// 否则 → 内存版（单实例/本地有效，dev 与无云资源时可用）。
// 对外接口 checkRateLimit(identifier) 保持不变，调用方无需改动。

import { getTair } from '@/lib/tair';

const WINDOW_MS = 60_000; // 限流时间窗：60 秒
const MAX_REQUESTS = 6; // 每标识每窗最多施放 6 次（可按需调整）

type Window = { count: number; resetAt: number };

// 挂在 globalThis 上，避免 dev 热重载清空计数
const g = globalThis as unknown as { __rateLimitBuckets?: Map<string, Window> };
const buckets: Map<string, Window> = g.__rateLimitBuckets ?? (g.__rateLimitBuckets = new Map());

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetMs: number;
};

/** 内存降级实现 */
function checkRateLimitMemory(identifier: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(identifier);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_REQUESTS - 1, resetMs: WINDOW_MS };
  }
  if (bucket.count >= MAX_REQUESTS) {
    return { ok: false, remaining: 0, resetMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { ok: true, remaining: MAX_REQUESTS - bucket.count, resetMs: bucket.resetAt - now };
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const tair = getTair();
  if (tair) {
    const key = `ratelimit:${identifier}`;
    const count = await tair.incr(key);
    if (count === 1) await tair.pexpire(key, WINDOW_MS);
    const ttl = await tair.pttl(key);
    const resetMs = ttl > 0 ? ttl : WINDOW_MS;
    if (count > MAX_REQUESTS) return { ok: false, remaining: 0, resetMs };
    return { ok: true, remaining: MAX_REQUESTS - count, resetMs };
  }
  return checkRateLimitMemory(identifier);
}

// 轻量清理：桶数量超阈值时剔除已过期项，避免长运行内存无限增长
if (buckets.size > 5000) {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}
