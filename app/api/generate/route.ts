import { SYSTEM_PROMPT, buildUserInstruction } from '@/lib/prompts';
import { validateInput, estimateMaxTokens, countSentences } from '@/lib/utils';
import { checkRateLimit } from '@/lib/rateLimit';
import { consumeQuota } from '@/lib/quota';
import { embedQuery } from '@/lib/embed';
import { retrieve } from '@/lib/corpus';
import { getStyleDimensions, getEssenceSample } from '@/lib/essence';
import { buildImageryCard, formatImageryCard, extractAnchors, formatAnchors } from '@/lib/imagery';

// 用普通 HTTP SSE 流式把生成结果推给浏览器，替代不稳定的 ai/rsc StreamableValue 传输层。
// 浏览器用原生 fetch + ReadableStream 直读，断流/假结束的概率大幅降低。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel 函数最大执行时长（秒）。Hobby 版上限 10s 会截断长生成；Pro 版可到 60s/300s。
// 本地 dev 忽略此值。流式首字很快，但整段生成可能 60-90s，建议 Pro 版或控制输入长度。
export const maxDuration = 60;

const encoder = new TextEncoder();

function sse(chunk: string): Uint8Array {
  return encoder.encode(chunk);
}

export async function POST(request: Request): Promise<Response> {
  let body: { input?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const userInput = (body.input ?? '').toString();
  const error = validateInput(userInput);
  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  // 设备身份：匿名 did cookie，缺失回退 IP
  const did = request.cookies.get('did')?.value || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (!process.env.DASHSCOPE_API_KEY) {
    return Response.json({ error: '服务端尚未配置 API Key，请联系管理员' }, { status: 500 });
  }

  // 额度与限流（控费 + 防刷）
  const hasQuota = await consumeQuota(did);
  if (!hasQuota) {
    return Response.json({ error: '今日言灵已用尽，扫码续燃或明日再来', code: 'QUOTA_EXHAUSTED' }, { status: 429 });
  }
  const limit = await checkRateLimit(did);
  if (!limit.ok) {
    return Response.json({ error: '言灵冷却中，施放过于频繁，请稍后再试', code: 'RATE_LIMITED' }, { status: 429 });
  }

  const model = process.env.MODEL ?? 'qwen-plus';
  const maxTokens = estimateMaxTokens(countSentences(userInput));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendText = (delta: string) => controller.enqueue(sse(`data: ${JSON.stringify(delta)}\n\n`));
      const sendDone = () => controller.enqueue(sse('data: [DONE]\n\n'));
      const sendError = (msg: string) => controller.enqueue(sse(`event: error\ndata: ${JSON.stringify(msg)}\n\n`));

      try {
        // 结构化素材体系（替代写死的示例/精华池，彻底打散"固定意象塌缩"）：
        //  1) 随输入随机生成"素材卡"（场景/物件/感官/比喻/反差钩子，每次不同）
        //  2) 随机抽取风格维度（每次侧重不同）
        //  3) 随机 1 段正版原著气质示范（可选）
        // 相似召回（retrieve）作为可选补充，离线时静默降级，不阻断生成。
        const card = buildImageryCard(userInput);
        const anchors = extractAnchors(userInput);
        const anchorsText = formatAnchors(anchors);
        const dimensions = getStyleDimensions(3);
        const essenceSample = (() => {
          try {
            return getEssenceSample();
          } catch {
            return null;
          }
        })();
        let similar: string | null = null;
        try {
          const queryVec = await embedQuery(userInput);
          const hit = (await retrieve(queryVec, 1))[0];
          if (hit) similar = hit.chunk;
        } catch (re) {
          // 嵌入服务（LM Studio）离线时降级：仅靠锚点 + 笔法卡 + 维度 + 气质示范，仍可用。
          console.error('[generate] 相似检索失败，仅用锚点+笔法卡体系：', re);
        }

        const res = await fetch(
          'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                  role: 'user',
                  content: buildUserInstruction(userInput, {
                    anchors: anchorsText,
                    card: formatImageryCard(card),
                    dimensions,
                    essenceSample: similar ?? essenceSample,
                  }),
                },
              ],
              temperature: 0.7,
              max_tokens: maxTokens,
              stream: true,
            }),
          },
        );

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => '');
          console.error('[generate] DashScope 请求失败：', res.status, detail);
          sendError('生成失败，请稍后重试');
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        // 流式读取停顿超时：DashScope 连接偶尔"假死"，连续 30s 无数据即判定卡死。
        const STALL_MS = 30000;
        while (true) {
          const stallTimer = new Promise<ReadableStreamReadResult<Uint8Array> | undefined>(
            (resolve) => setTimeout(() => resolve(undefined), STALL_MS),
          );
          const readResult = await Promise.race([reader.read(), stallTimer]);
          if (readResult === undefined) {
            console.error('[generate] DashScope 流式读取超时（>%dms 无数据），连接疑似卡死', STALL_MS);
            reader.cancel().catch(() => {});
            sendError('生成超时：与模型服务的连接长时间无响应，请稍后重试');
            controller.close();
            return;
          }
          const { done, value } = readResult;
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                sendText(delta);
              }
            } catch {
              // 忽略不完整/心跳行
            }
          }
        }
        // 处理缓冲区残留的最后一行
        if (buf.trim()) {
          const line = buf.trim();
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            if (data !== '[DONE]') {
              try {
                const json = JSON.parse(data);
                const delta = json?.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta.length > 0) sendText(delta);
              } catch {
                // 忽略
              }
            }
          }
        }
        sendDone();
      } catch (err) {
        console.error('[generate] stream error:', err);
        sendError('生成失败，请稍后重试');
      } finally {
        try {
          controller.close();
        } catch {
          // 已关闭则忽略
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      // 禁止任何中间层（Next 自身/代理/浏览器扩展）对 SSE 做 gzip 分块缓冲，
      // 否则首块到达后后续帧可能被攒批，表现为"蹦几个字就卡住"。
      'Content-Encoding': 'identity',
    },
  });
}
