// 字数/输入校验与长度上限估算工具

export const MAX_INPUT = 200;

/** 计算 Unicode 字符数（按"字"计，兼容 emoji/ surrogate） */
export function countChars(text: string): number {
  return [...text.trim()].length;
}

/** 校验输入，返回错误信息（null 表示通过） */
export function validateInput(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "请先写下你想转化的内容";
  if (countChars(text) > MAX_INPUT) return `内容不能超过 ${MAX_INPUT} 字`;
  return null;
}

/** 粗略统计句子数（按中英文句末标点与换行切分，至少计 1 句） */
export function countSentences(text: string): number {
  const parts = text
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Math.max(1, parts.length);
}

/**
 * 估算改写结果的**字数上限**（按输入句数动态）。
 * 用户输入一句话 → 上限 200 字（用户明确要求）；每多一句 +150 字，封顶 720 字。
 */
export function estimateMaxChars(sentences: number): number {
  return Math.min(200 + (Math.max(1, sentences) - 1) * 150, 720);
}

/**
 * 估算流式生成的 token 上限，防止超长。
 * 由字数上限换算：中文约 1 字 ≈ 1.6 token，另加少量 buffer 让模型能自然收尾；
 * 下限 256、封顶 2048 防跑飞。
 */
export function estimateMaxTokens(sentences: number): number {
  const maxChars = estimateMaxChars(sentences);
  const tokens = Math.ceil(maxChars * 1.6) + 60;
  return Math.min(2048, Math.max(256, tokens));
}

/** 随机扰动，使每次生成略有不同（用于调用侧可选 seed） */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
