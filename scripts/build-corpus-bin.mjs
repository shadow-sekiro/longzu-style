// 把 data/corpus.jsonl 一次性转换为二进制语料（data/corpus.bin + data/corpus.meta.json）。
// 不重新 embedding——只把已算好的 2560 维向量写成 Float32 二进制、片段文本写成索引，
// 目的是让运行时「加载 1.2GB JSONL（逐行 JSON.parse，数十秒）」变成「读二进制（亚秒级）」。
//
// 用法：
//   node scripts/build-corpus-bin.mjs
//
// 产物：
//   data/corpus.bin      头(8字节：uint32 片段数N、uint32 维度D) + N*D 个 Float32 向量 + N 个 int32 文本起始偏移 + N 个 int32 文本长度
//   data/corpus.chunks  纯文本拼接（utf8），每片段一段，偏移/长度在 corpus.bin 尾部
//   data/corpus.meta.json  { count, dim, model, builtAt }
//
// 注意：corpus.jsonl 由 `npm run corpus` 生成；本脚本仅做格式转换，不再调用 embedding。

import { readFileSync, existsSync, mkdirSync, writeFileSync, createReadStream, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

const cwd = process.cwd();
const JSONL = resolve(cwd, 'data', 'corpus.jsonl');
const BIN = resolve(cwd, 'data', 'corpus.bin');
const CHUNKS = resolve(cwd, 'data', 'corpus.chunks');
const META = resolve(cwd, 'data', 'corpus.meta.json');

if (!existsSync(JSONL)) {
  console.error(`[build-corpus-bin] 找不到 ${JSONL}，请先运行 \`npm run corpus\` 生成语料`);
  process.exit(1);
}

async function main() {
  // 先读 JSONL 收集（无法避免遍历，但只此一次；不保留 JSON 字符串到内存，逐行转 Float32）
  const rl = createInterface({ input: createReadStream(JSONL), crlfDelay: Infinity });

  let meta = null;
  let dim = 0;
  const vectors = []; // 每个元素 Float32Array(D)
  const chunks = []; // 每个元素 string

  let lineNo = 0;
  for await (const ln of rl) {
    if (!ln) continue;
    lineNo++;
    const o = JSON.parse(ln);
    if (o.__meta__) {
      meta = o;
      continue;
    }
    const v = o.vector;
    if (!Array.isArray(v) || !v.length) {
      console.warn(`[build-corpus-bin] 跳过第 ${lineNo} 行：向量为空`);
      continue;
    }
    if (!dim) dim = v.length;
    else if (v.length !== dim) {
      console.error(`[build-corpus-bin] 维度不一致（期望 ${dim}，实得 ${v.length}）于第 ${lineNo} 行，中止`);
      process.exit(1);
    }
    vectors.push(Float32Array.from(v));
    chunks.push(o.chunk ?? '');
  }

  const count = vectors.length;
  if (!count || !dim) {
    console.error('[build-corpus-bin] 未读取到任何有效向量，中止');
    process.exit(1);
  }

  // 1) 文本拼接为 corpus.chunks（utf8 字节），记录每个片段的 byteOffset 与 byteLength
  let textBuf = Buffer.alloc(0);
  const offsets = new Int32Array(count);
  const lengths = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const b = Buffer.from(chunks[i], 'utf8');
    offsets[i] = textBuf.length;
    lengths[i] = b.length;
    textBuf = Buffer.concat([textBuf, b]);
  }
  writeFileSync(CHUNKS, textBuf);

  // 2) 向量矩阵：N*D Float32
  const flat = new Float32Array(count * dim);
  for (let i = 0; i < count; i++) flat.set(vectors[i], i * dim);

  // 3) 头 + 向量 + 偏移/长度
  const header = Buffer.alloc(8);
  header.writeUInt32LE(count, 0);
  header.writeUInt32LE(dim, 4);
  const vecBuf = Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength);
  const offBuf = Buffer.from(offsets.buffer, offsets.byteOffset, offsets.byteLength);
  const lenBuf = Buffer.from(lengths.buffer, lengths.byteOffset, lengths.byteLength);

  mkdirSync(resolve(cwd, 'data'), { recursive: true });
  writeFileSync(BIN, Buffer.concat([header, vecBuf, offBuf, lenBuf]));

  writeFileSync(
    META,
    JSON.stringify({
      count,
      dim,
      model: meta?.model ?? 'unknown',
      builtAt: new Date().toISOString(),
    }, null, 2),
  );

  console.log(`[build-corpus-bin] 完成 → ${BIN}（${count} 片段，维度 ${dim}，文本 ${textBuf.length} 字节，向量 ${(flat.byteLength / 1e6).toFixed(1)} MB）`);
}

main().catch((e) => {
  console.error('[build-corpus-bin] 失败：', e);
  process.exit(1);
});
