// /api/webhooks/alipay —— 支付成功回调占位
// 真实接入时需：① 校验支付平台签名；② 查订单取 did；③ addQuota 为该设备充值。
// 当前为占位：接收 { did, quota } 直接充值，仅用于打通链路，生产前务必补签名校验。
import { NextResponse } from 'next/server';
import { addQuota } from '@/lib/quota';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { did?: string; quota?: number };
  const { did, quota } = body;
  if (!did || !quota || quota <= 0) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  await addQuota(did, Math.floor(quota));
  return NextResponse.json({ ok: true });
}
