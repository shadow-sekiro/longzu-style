// 构建「龙族」原著语料向量库：解析 txt → 切片 → 调可配置 embedding 端点 → 写 data/corpus.jsonl（JSONL）
//
// 用法：
//   npm run corpus                  # 默认用阿里云 DashScope text-embedding-v2
//   EMBED_BASE_URL=http://localhost:1234/v1 EMBED_MODEL=text-embedding-qwen3-embedding-4b npm run corpus   # 用本机 LM Studio（免费）
//
// 断点续跑：每批向量化完成即追加写入 data/corpus.partial.jsonl；中断后重跑只计算剩余片段。
// 注意：构建与运行时必须用同一个 embedding 模型，否则向量空间不同、检索失效。
// 切换模型后需重跑本脚本重建 data/corpus.jsonl（自动检测模型不匹配并提示删除残文件）。
// 产物为 JSONL（每行一个 {chunk,vector,source}），以支撑数万片段、超大文件下的流式读写，避免一次性读入巨型字符串触发 V8 上限。

import { readFileSync, readdirSync, mkdirSync, existsSync, appendFileSync, unlinkSync, createReadStream, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

// ---- 配置（可由环境变量覆盖，构建/运行时须一致） ----
const EMBED_BASE_URL = (process.env.EMBED_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-v2';
const EMBED_API_KEY = process.env.EMBED_API_KEY || process.env.DASHSCOPE_API_KEY || '';

// 原著目录：脚本在 longzu-style 下运行，原著在上一级的「龙族TXT」
const SRC_DIR = process.env.CORPUS_SRC || resolve(process.cwd(), '..', '龙族TXT');
const OUT_DIR = resolve(process.cwd(), 'data');
const OUT_FILE = join(OUT_DIR, 'corpus.jsonl');
const PARTIAL = join(OUT_DIR, 'corpus.partial.jsonl');

// 切片参数
const MIN_CHUNK = 30; // 低于此长度的片段视为噪声，丢弃
const MAX_CHUNK = 500; // 长段落按句子切到该上限内
const BATCH = Number(process.env.CORPUS_BATCH || 8); // 每批片段数（本地 CPU 推理调小，避免卡死）
const BATCH_PAUSE_MS = Number(process.env.CORPUS_PAUSE || 800); // 批次间停顿，给系统喘息

// ---- 文本切片 ----
const NOISE_RE = /^(第[一二三四五六七八九十百千0-9]+章|序章|尾声|楔子|后记|番外|引子|附录)/;
const PAGE_RE = /^-?\s*\d+\s*-?$/;

function splitSentences(para) {
  return para.split(/(?<=[。！？；…\n])/).map((s) => s.trim()).filter(Boolean);
}

function isNoise(line) {
  if (PAGE_RE.test(line)) return true;
  if (NOISE_RE.test(line)) return true;
  if (line.replace(/[\s\p{P}]/gu, '').length < 4) return true;
  return false;
}

function chunkText(text) {
  const paragraphs = text
    .split(/\n{1,}/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const chunks = [];
  for (const para of paragraphs) {
    if (isNoise(para)) continue;
    if (para.length <= MAX_CHUNK) {
      if (para.length >= MIN_CHUNK) chunks.push(para);
      continue;
    }
    const sentences = splitSentences(para);
    let buf = '';
    for (const s of sentences) {
      if (buf && (buf + s).length > MAX_CHUNK) {
        if (buf.length >= MIN_CHUNK) chunks.push(buf.trim());
        buf = s;
      } else {
        buf += s;
      }
    }
    if (buf.trim().length >= MIN_CHUNK) chunks.push(buf.trim());
  }
  return chunks;
}

// ---- embedding 调用（OpenAI 兼容接口，DashScope 与 LM Studio 通用） ----
async function embedBatch(texts) {
  const headers = { 'Content-Type': 'application/json' };
  if (EMBED_API_KEY) headers['Authorization'] = `Bearer ${EMBED_API_KEY}`;
  const resp = await fetch(`${EMBED_BASE_URL}/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`embedding HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  const json = await resp.json();
  const list = Array.isArray(json?.data)
    ? json.data
    : (json?.output?.embeddings ?? []);
  return list.map((d) => d.embedding);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 断点续跑：流式读取已完成的 partial 文件（避免一次性读入超大字符串） ----
async function loadPartial() {
  const keys = new Set();
  let meta = null;
  let count = 0;
  if (!existsSync(PARTIAL)) return { meta: null, keys, count };
  const rl = createInterface({ input: createReadStream(PARTIAL), crlfDelay: Infinity });
  for await (const ln of rl) {
    if (!ln) continue;
    const o = JSON.parse(ln);
    if (o.__meta__) { meta = o; continue; }
    keys.add(o.chunk.slice(0, 80));
    count += 1;
  }
  return { meta, keys, count };
}

// ---- 主流程 ----
async function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(`[build-corpus] 找不到原著目录：${SRC_DIR}`);
    process.exit(1);
  }
  const files = readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith('.txt'));
  if (!files.length) {
    console.error(`[build-corpus] 目录内无 .txt 文件：${SRC_DIR}`);
    process.exit(1);
  }

  // 1) 读取并切片
  const raw = [];
  for (const f of files) {
    const name = f.replace(/\.txt$/i, '');
    const text = readFileSync(join(SRC_DIR, f), 'utf8');
    const chunks = chunkText(text);
    for (const c of chunks) raw.push({ chunk: c, source: name });
    console.log(`[build-corpus] ${f}: ${chunks.length} 片段`);
  }

  // 2) 去重（完全相同的片段只保留一份）
  const seen = new Set();
  const items = [];
  for (const it of raw) {
    const key = it.chunk.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
  }
  console.log(`[build-corpus] 去重后共 ${items.length} 片段`);

  // 3) 断点续跑：加载已有进度，校验模型一致
  const part = await loadPartial();
  if (part.meta) {
    if (part.meta.model !== EMBED_MODEL || part.meta.baseURL !== EMBED_BASE_URL) {
      console.error(`[build-corpus] 已有断点文件模型/端点不匹配（partial=${part.meta.model}@${part.meta.baseURL}），请删除 ${PARTIAL} 后重跑`);
      process.exit(1);
    }
    console.log(`[build-corpus] 断点续跑：已完成 ${part.count} 条，继续剩余片段`);
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
    appendFileSync(PARTIAL, JSON.stringify({ __meta__: true, model: EMBED_MODEL, baseURL: EMBED_BASE_URL }) + '\n');
  }
  const remaining = items.filter((it) => !part.keys.has(it.chunk.slice(0, 80)));
  console.log(`[build-corpus] 待向量化 ${remaining.length} 片段（批次 ${BATCH}，批间停顿 ${BATCH_PAUSE_MS}ms）`);

  // 4) 分批向量化（每批成功即落盘，支持中断续跑）
  for (let i = 0; i < remaining.length; i += BATCH) {
    const batch = remaining.slice(i, i + BATCH);
    const texts = batch.map((b) => b.chunk);
    let emb;
    let attempt = 0;
    while (true) {
      try {
        emb = await embedBatch(texts);
        break;
      } catch (e) {
        attempt += 1;
        if (attempt >= 3) throw e;
        console.warn(`[build-corpus] 批次 ${i} 失败，${attempt}s 后重试：${e.message}`);
        await sleep(1000 * attempt);
      }
    }
    for (let k = 0; k < batch.length; k++) {
      appendFileSync(PARTIAL, JSON.stringify({ chunk: batch[k].chunk, vector: emb[k], source: batch[k].source }) + '\n');
    }
    const pct = Math.round(((i + batch.length) / remaining.length) * 100);
    console.log(`[build-corpus] 进度 ${pct}% (${i + batch.length}/${remaining.length})`);
    await sleep(BATCH_PAUSE_MS);
  }

  // 5) 汇总写出（流式写 JSONL，避免一次性构造超大字符串），并删除 partial
  if (!existsSync(PARTIAL)) {
    console.error('[build-corpus] 未找到 partial 文件，无法汇总，请重跑构建');
    process.exit(1);
  }
  // 先取首条确认维度
  let firstDim = 0;
  {
    const rl = createInterface({ input: createReadStream(PARTIAL), crlfDelay: Infinity });
    for await (const ln of rl) {
      if (!ln) continue;
      const o = JSON.parse(ln);
      if (o.__meta__) continue;
      if (Array.isArray(o.vector) && o.vector.length) { firstDim = o.vector.length; break; }
    }
  }
  if (!firstDim) {
    console.error('[build-corpus] 未读取到任何有效向量，中止写入（partial 保留以便续跑）');
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const ws = createWriteStream(OUT_FILE, { encoding: 'utf8' });
  ws.write(JSON.stringify({ __meta__: true, model: EMBED_MODEL, baseURL: EMBED_BASE_URL, dim: firstDim, builtAt: new Date().toISOString() }) + '\n');
  let written = 0;
  const rl = createInterface({ input: createReadStream(PARTIAL), crlfDelay: Infinity });
  for await (const ln of rl) {
    if (!ln) continue;
    const o = JSON.parse(ln);
    if (o.__meta__) continue;
    if (!Array.isArray(o.vector) || o.vector.length !== firstDim) {
      console.error('[build-corpus] 向量维度异常，中止写入（partial 保留以便续跑）');
      ws.destroy();
      process.exit(1);
    }
    const line = JSON.stringify({ chunk: o.chunk, vector: o.vector, source: o.source }) + '\n';
    if (!ws.write(line)) await new Promise((r) => ws.once('drain', r));
    written += 1;
  }
  await new Promise((res) => ws.end(res));
  if (written !== items.length) {
    console.error(`[build-corpus] 写出数量不匹配（${written} ≠ 去重 ${items.length}），中止删除 partial 以便续跑`);
    process.exit(1);
  }
  unlinkSync(PARTIAL);
  console.log(`[build-corpus] 完成 → ${OUT_FILE}（${written} 片段，维度 ${firstDim}）`);
}

main().catch((e) => {
  console.error('[build-corpus] 失败（可重跑续算）：', e);
  process.exit(1);
});
