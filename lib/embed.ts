// 运行时 embedding：调用可配置端点（默认 DashScope，亦支持 LM Studio）。
// 与 scripts/build-corpus.mjs 共用同一组环境变量，构建/运行时必须同源同模型。

const EMBED_TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS || 20000); // 嵌入请求超时，避免 RAG 阶段永久挂起

const EMBED_BASE_URL = (
  process.env.EMBED_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
).replace(/\/$/, '');
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-v2';
const EMBED_API_KEY = process.env.EMBED_API_KEY || process.env.DASHSCOPE_API_KEY || '';

type EmbedRespItem = { embedding?: number[] };

async function postEmbed(texts: string[]): Promise<number[][]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (EMBED_API_KEY) headers['Authorization'] = `Bearer ${EMBED_API_KEY}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), EMBED_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(`${EMBED_BASE_URL}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error)?.name === 'AbortError') {
      throw new Error(`embedding 超时（>${EMBED_TIMEOUT_MS}ms），请确认嵌入服务可正常响应`);
    }
    throw e;
  }
  clearTimeout(timer);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`embedding HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  const json = (await resp.json()) as {
    data?: EmbedRespItem[];
    output?: { embeddings?: EmbedRespItem[] };
  };
  const list = Array.isArray(json.data) ? json.data : json.output?.embeddings ?? [];
  return list.map((d) => d.embedding ?? []);
}

/** 批量向量化（构建期/批量检索用） */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  return postEmbed(texts);
}

/** 单条查询向量化（生成前检索用） */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await postEmbed([text]);
  if (!vec || !vec.length) throw new Error('embedQuery 返回空向量');
  return vec;
}
