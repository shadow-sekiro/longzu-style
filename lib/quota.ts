// 设备额度：每设备每日免费次数 + 可充值次数。
// 优先用 Tair（跨实例、可持久化充值），无 TAIR_URL 降级内存（本地/单实例）。
// 免费额度按自然日重置；充值额度持久累计，免费耗尽后抵扣充值额度。

import { getTair } from '@/lib/tair';

export const FREE_DAILY = 20; // 每设备每日免费次数（待运营调整）

const g = globalThis as unknown as { __quotaFree?: Map<string, number>; __quotaPaid?: Map<string, number> };
const freeMem = g.__quotaFree ?? (g.__quotaFree = new Map());
const paidMem = g.__quotaPaid ?? (g.__quotaPaid = new Map());

function dayKey(did: string): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${did}:${d.getFullYear()}-${mm}-${dd}`;
}

function secondsUntilMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1, Math.floor((next.getTime() - now.getTime()) / 1000));
}

// ---- Tair 实现 ----
async function tairGetQuota(did: string): Promise<number> {
  const t = getTair()!;
  const freeKey = `quota:free:${dayKey(did)}`;
  const paidKey = `quota:paid:${did}`;
  const free = (await t.exists(freeKey)) ? Number(await t.get(freeKey)) : FREE_DAILY;
  const paid = Number((await t.get(paidKey)) || 0);
  return free + paid;
}

async function tairConsume(did: string): Promise<boolean> {
  const t = getTair()!;
  const freeKey = `quota:free:${dayKey(did)}`;
  const paidKey = `quota:paid:${did}`;
  const freeExists = await t.exists(freeKey);
  if (!freeExists) {
    await t.set(freeKey, FREE_DAILY - 1, 'EX', secondsUntilMidnight());
    return true;
  }
  const free = Number(await t.get(freeKey));
  if (free > 0) {
    await t.decr(freeKey);
    return true;
  }
  const paid = Number((await t.get(paidKey)) || 0);
  if (paid > 0) {
    await t.decr(paidKey);
    return true;
  }
  return false;
}

async function tairAdd(did: string, n: number): Promise<void> {
  const t = getTair()!;
  await t.incrby(`quota:paid:${did}`, n);
}

// ---- 内存降级 ----
function memGetQuota(did: string): number {
  return (freeMem.get(dayKey(did)) ?? FREE_DAILY) + (paidMem.get(did) ?? 0);
}
function memConsume(did: string): boolean {
  const dk = dayKey(did);
  const free = freeMem.get(dk) ?? FREE_DAILY;
  if (free > 0) {
    freeMem.set(dk, free - 1);
    return true;
  }
  const paid = paidMem.get(did) ?? 0;
  if (paid > 0) {
    paidMem.set(did, paid - 1);
    return true;
  }
  return false;
}
function memAdd(did: string, n: number): void {
  paidMem.set(did, (paidMem.get(did) ?? 0) + n);
}

export async function getQuota(deviceId: string): Promise<number> {
  return getTair() ? tairGetQuota(deviceId) : memGetQuota(deviceId);
}

/** 扣减一次额度，不足返回 false */
export async function consumeQuota(deviceId: string): Promise<boolean> {
  return getTair() ? tairConsume(deviceId) : memConsume(deviceId);
}

/** 为设备充值 n 次 */
export async function addQuota(deviceId: string, n: number): Promise<void> {
  return getTair() ? tairAdd(deviceId, n) : memAdd(deviceId, n);
}
