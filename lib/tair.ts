// 阿里云 Tair（Redis 兼容）单例。缺 TAIR_URL 时返回 null，调用方降级内存。
// 连接挂 globalThis，避免 dev 热重载 / Serverless 复用重复建连。

import Redis from 'ioredis';

type G = { __tairClient?: Redis | null };
const g = globalThis as unknown as G;

export function getTair(): Redis | null {
  if ('__tairClient' in g) return g.__tairClient ?? null;

  const url = process.env.TAIR_URL;
  if (!url) {
    console.warn('[tair] 未配置 TAIR_URL，使用内存降级（仅本地/单实例有效，多实例部署请配置 Tair）');
    g.__tairClient = null;
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    lazyConnect: false,
  });
  client.on('error', (e) => console.error('[tair] 连接错误：', e));
  g.__tairClient = client;
  return client;
}
