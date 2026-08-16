// 匿名设备身份（无需登录）：生成并持久化一个随机 did，
// 同时写入 localStorage 与 cookie，供 Server Action 读取以做限流/额度标识。

const DID_KEY = 'did';
const ONE_YEAR = 60 * 60 * 24 * 365;

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
}

/** 确保存在 did，并同步到 cookie；返回 did（SSR 阶段返回空串） */
export function ensureDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(DID_KEY) || '';
  if (!id) {
    id = uuid();
    localStorage.setItem(DID_KEY, id);
  }
  document.cookie = `did=${id}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
  return id;
}
