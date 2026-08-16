// /api/checkout —— 下单占位（免登录，按匿名设备身份 did 关联订单）
// 真实支付渠道（微信/支付宝/Stripe）接入后，此处返回真实收银台链接/二维码。
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTair } from '@/lib/tair';

export async function POST() {
  const ck = await cookies();
  const did = ck.get('did')?.value;
  if (!did) {
    return NextResponse.json({ error: 'missing device id' }, { status: 400 });
  }

  const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tair = getTair();
  if (tair) {
    await tair.set(
      `order:${orderId}`,
      JSON.stringify({ did, status: 'pending', createdAt: Date.now() }),
      'EX',
      1800,
    );
  }

  // 占位返回：真实接入后替换 payUrl / qr 为支付平台数据
  return NextResponse.json({
    orderId,
    payUrl: '占位：接入支付后返回收银台链接',
    qr: '占位：接入支付后返回二维码图片地址',
    hint: '支付渠道待接入（微信 / 支付宝 / Stripe 三选一）',
  });
}
