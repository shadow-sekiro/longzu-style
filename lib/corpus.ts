// 内存语料检索：载入 data/corpus.bin（二进制向量文件，由 scripts/build-corpus-bin.mjs 转换），
// 按余弦相似度取 top-k 原著片段作为文风参考。
// 二进制格式：头(8B: uint32 片段数N、uint32 维度D) + N*D Float32 向量 + N int32 文本byteOffset + N int32 文本byteLength。
// 文本本体在 data/corpus.chunks（utf8 拼接），偏移/长度在 bin 尾部。
// 相比原来逐行 JSON.parse 1.2GB corpus.jsonl，二进制加载为亚秒级、零 JSON 解析。

import { open } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type CorpusData = {
  count: number;
  dim: number;
  vectors: Float32Array; // 长度 count*dim
  chunks: Buffer; // utf8 文本拼接
  offsets: Int32Array;
  lengths: Int32Array;
};

const g = globalThis as unknown as { __corpusCache?: Promise<CorpusData | null> };

async function loadCorpus(): Promise<CorpusData | null> {
  if (g.__corpusCache) return g.__corpusCache;
  const p = (async () => {
    const binPath = path.join(process.cwd(), 'data', 'corpus.bin');
    const chunksPath = path.join(process.cwd(), 'data', 'corpus.chunks');
    try {
      const bin = await readFile(binPath);
      if (bin.length < 8) throw new Error('corpus.bin 过小');
      const count = bin.readUInt32LE(0);
      const dim = bin.readUInt32LE(4);
      const vecBytes = count * dim * 4;
      const offBytes = count * 4;
      const vecStart = 8;
      const offStart = vecStart + vecBytes;
      const lenStart = offStart + offBytes;
      if (bin.length < lenStart + offBytes) throw new Error('corpus.bin 尺寸不匹配');
      const vectors = new Float32Array(
        bin.buffer,
        bin.byteOffset + vecStart,
        count * dim,
      );
      const offsets = new Int32Array(
        bin.buffer,
        bin.byteOffset + offStart,
        count,
      );
      const lengths = new Int32Array(
        bin.buffer,
        bin.byteOffset + lenStart,
        count,
      );
      const chunks = await readFile(chunksPath);
      return { count, dim, vectors, chunks, offsets, lengths };
    } catch (e) {
      console.error('[corpus] 载入二进制语料失败，请先运行 `node scripts/build-corpus-bin.mjs`：', e);
      return null;
    }
  })();
  g.__corpusCache = p;
  return p;
}

function cosine(a: Float32Array, base: number, b: number[], len: number): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const av = a[base + i];
    const bv = b[i];
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type CorpusItem = { chunk: string; source: string };

/** 取与查询向量最相似的 topK 个原著片段（风格参考） */
export async function retrieve(queryVec: number[], topK = 3): Promise<CorpusItem[]> {
  const data = await loadCorpus();
  if (!data || !data.count || !queryVec.length) return [];
  const { count, dim, vectors, chunks, offsets, lengths } = data;
  const scored: { idx: number; score: number }[] = new Array(count);
  for (let i = 0; i < count; i++) {
    scored[i] = { idx: i, score: cosine(vectors, i * dim, queryVec, dim) };
  }
  scored.sort((a, b) => b.score - a.score);
  const out: CorpusItem[] = [];
  for (let k = 0; k < topK && k < scored.length; k++) {
    const i = scored[k].idx;
    const text = chunks.toString('utf8', offsets[i], offsets[i] + lengths[i]);
    out.push({ chunk: text, source: '' });
  }
  return out;
}

// 注意：不在模块加载期预热 corpus.bin。Vercel 等云端环境没有该文件（被 .gitignore 排除），
// 若在此处顶层 readFile 会触发 next build 的 "Collecting page data" 阶段 ENOENT 报错并导致构建失败。
// 改为首次 retrieve 时惰性加载（命中 globalThis 缓存，运行时约 4ms），云端无语料则平滑降级为空结果。
