'use client';

import { useEffect, useState } from 'react';

type OrderInfo = {
  orderId?: string;
  payUrl?: string;
  qr?: string;
  hint?: string;
};

/** 免登录充值弹窗（占位 UI）：展示二维码占位与说明，无注册流程 */
export function RechargeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<OrderInfo | null>(null);
  const [error, setError] = useState('');

  async function createOrder() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/checkout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '下单失败');
      setInfo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '下单失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !info && !loading) createOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-md rounded-2xl border border-amber-500/30 bg-zinc-900 p-6 text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-amber-300">续燃言灵</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 transition hover:text-zinc-100"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        {info ? (
          <div className="space-y-3 text-sm">
            <p className="text-zinc-300">{info.hint}</p>
            <p className="text-zinc-500">订单号：{info.orderId}</p>
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-zinc-600 text-zinc-500">
              [ 支付二维码占位 ]
            </div>
            <p className="text-xs text-zinc-500">
              支付成功后额度将自动到账（接入真实支付渠道后生效）。
            </p>
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-zinc-400">
            {loading ? '生成订单中…' : '点击生成充值订单'}
            {!loading && (
              <button
                onClick={createOrder}
                className="mt-3 block w-full rounded-lg bg-amber-500/90 py-2 font-medium text-zinc-900 transition hover:bg-amber-400"
              >
                生成充值订单
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
