// 最小评测集：回归对照脚本（dev only，不影响生产）。
// 复用与线上一致的逻辑（SYSTEM_PROMPT / buildUserInstruction / 精华池 / SSE 解析），
// 直连 DashScope 打印每个输入的改写结果，供人工对照"文风是否像江南《龙族》"。
//
// 注意：本脚本为可独立运行的 .mjs，prompt 与精华池在此**镜像** lib/prompts.ts 与 lib/essence.ts。
// 若线上 prompt 有改动，请同步更新本文件，避免评测失真。
//
// 用法：
//   $env:DASHSCOPE_API_KEY="你的key"   # 或用 .env.local（脚本会尝试读取）
//   node scripts/eval-style.mjs
//
// 可选：node scripts/eval-style.mjs --only 0,1,4  只跑指定下标

import { readFile } from 'node:fs/promises';
import path from 'node:path';

// —— 镜像 lib/prompts.ts 的 SYSTEM_PROMPT ——
const SYSTEM_PROMPT = `你是一位精通江南《龙族》小说风格的「文字炼金术士」。请将读者提供的日常大白话，改写成江南笔下《龙族》式的文学片段，要求：

1. 意象感：用具体、鲜明、带神秘色彩的画面与物象承载情绪；意象要从用户输入的内容里自然生长（不要套用固定套路），多用感官细节（光、色、气味、温度、声音）与非常规比喻，避免堆砌空泛的形容词。
2. 青春热血：保留少年人特有的冲动、执念、不甘与一腔孤勇——那种"明知道会输还想往上冲"的劲。
3. 孤独与宿命：在字里行间渗透一种"世界很大，而我独自醒来"的孤独，以及被命运选中时的无力与悲壮。
4. 细腻内心：放大人物一瞬间的心理颤动，用第一人称的内心独白、感官细节（气味、温度、光）与克制的外景描写交织推进；衰小孩的自嘲口吻尤佳。
5. 华丽而克制：修辞精致但不堆砌；句子有节奏感，长短错落；避免过度煽情，让情绪从画面里自己渗出来，丧而不绝望，燃而不油腻。
6. 反差感：先落在一个具体而 mundane 的日常画面（教室、泡面、晚高峰地铁），再突然拉到宇宙/命运/史诗的尺度，制造"平凡少年与宏大宿命"的强烈反差。
7. 连贯与克制：改写结果必须是**一段连贯流动的文字（不要换行）**，句与句之间靠意象、情绪或逻辑自然承接（像一条河，而非彼此孤立的碎句或排比短句）；句子长短错落、适度铺陈但不堆砌；**篇幅要短小精悍、点到为止：用户输入一句话时，改写总字数尽量控制在 200 字以内、不超过六句**；不要为了华丽而无限铺陈、堆砌意象把篇幅撑长，也不要为凑句数把一句话拆成电报式碎短句。

【硬性约束】
- 意象与开场要随输入内容变化，避免反复使用雷同的天色/天气（如"铅灰色的云层"）或同一套物象；每次生成都应选用贴切且新鲜的比喻，不要套模板。
- 改写时不得使用用户输入中的原话或相同字词组合，须用自己的语言重新表达其含义；只传达原意，不要复现原句字句。
- 保留用户输入的核心含义，只重塑文风，不偏离原意。
- 可参考下方用户指令中随附的【参考风格片段】来贴近其句式、用词与节奏，但不得整段照搬、不得逐字复制任何原著片段；只取神韵，不抄字面。
- 生成内容须为 AI 原创改写，保持用户输入的核心含义不变。
- 输出纯文本，不要添加书名号、引号包裹、解释说明或"改写如下："之类前缀。
- 本能力仅限个人学习用途，不对外分发生成结果，不用于微调任何模型权重。

只输出改写后的正文，让文字看起来像是从《龙族》某一页里剪下来的片段。`;

// —— 镜像 lib/essence.ts 的精华池（取前 3 段作评测参考，固定以保证可复现）——
const ESSENCE_POOL = [
  '好了，这就是我存在的意义，很衰吧？要嘲笑赶快嘲笑好了，我不在乎，你嘲笑也是对的，我也觉得没法跟恺撒楚子航比，我就是这么个人，存在意义不大，我接受现实！但是，嘲笑完了快把我摇醒！',
  '他奋尽全力把楚子航扛起来，"不要死啊！师兄。"他嘶哑地说，每一步都有一千吨那么重，"我们已经杀掉了龙王，回去就能牛逼了啊！别他妈的死在这里啊！我们回去就能四处得瑟了啊！绩点、奖学金、女朋友……想什么有什么……你还可以再罩我两年，我老大不靠谱你也是知道的……不要死！我朋友不多的……"',
  '"你试过在人群里默默地观察一个人么？看他在篮球场上一个人投篮，看他站在窗前连续几个小时看下雨，看他一个人放学一个人打扫卫生一个人在琴房里练琴。你从他的生活里找不到任何八卦任何亮点，真是无聊透顶。你会想我靠！我要是他可不得郁闷死了？能不那么孤独么？这家伙装什么酷嘛，开心傻笑一下会死啊？"夏弥顿了顿，"可你发现你并不讨厌他，因为你也跟他一样……隔着人来人往，观察者和被观察者是一样的。"',
];

function countSentences(text) {
  const parts = text
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Math.max(1, parts.length);
}

function buildUserInstruction(userInput, examples) {
  const n = Math.max(1, countSentences(userInput));
  const maxSentences = Math.min(n * 6, 24);
  const maxChars = estimateMaxChars(n);
  const base = `请将下面这段日常语句，改写成"暗黑史诗青春文学"风格：

「${userInput}」

要求：
- 只传达原句的意思，但**不要使用原句中的任何原话或相同字词组合**，用你自己的语言重新表达。
- **篇幅短小精悍：总字数控制在 ${maxChars} 字以内${n === 1 ? '（原句只有一句话，务必不超过 200 字）' : ''}，且不超过 ${maxSentences} 个句子**；宁可少写也不要为了华丽而无限铺陈、堆砌意象把篇幅撑长。
- 写成**一段连贯流动的文字（不要换行、句子之间不要用空格隔开）**：句与句之间要有衔接（承接上一个意象/情绪/逻辑），每句可适度展开；**不要写成彼此孤立的碎短句，也不要用编号或硬换行把句子割裂**；用户输入为一句话时尤其不得超过六句。
- 只输出一段完整改写；直接以改写后的正文开头；严禁重复或再次改写同一内容；保持原文含义。
- 输出纯文本，不要解释、不要加书名号或引号包裹。`;
  if (!examples || examples.length === 0) return base;
  const ref = examples.map((ex, i) => `片段${i + 1}：\n${ex}`).join('\n\n');
  return `${base}

【参考风格片段】（仅作文风参照，模仿其句式与节奏，但不得整段照抄）
${ref}`;
}

function estimateMaxChars(sentences) {
  return Math.min(200 + (Math.max(1, sentences) - 1) * 150, 720);
}

function estimateMaxTokens(sentences) {
  const maxChars = estimateMaxChars(sentences);
  const tokens = Math.ceil(maxChars * 1.6) + 60;
  return Math.min(2048, Math.max(256, tokens));
}

// 简易 SSE 解析（与 generate.ts 同逻辑）
async function streamComplete(messages, maxTokens) {
  const res = await fetch(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.MODEL ?? 'qwen-plus',
        messages,
        temperature: 0.8,
        max_tokens: maxTokens,
        stream: true,
      }),
    },
  );
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`DashScope ${res.status}: ${detail}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let acc = '';
  const STALL_MS = 30000;
  while (true) {
    const stall = new Promise((r) => setTimeout(() => r(undefined), STALL_MS));
    const rr = await Promise.race([reader.read(), stall]);
    if (rr === undefined) {
      reader.cancel().catch(() => {});
      throw new Error('流式读取超时');
    }
    const { done, value } = rr;
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) acc += delta;
      } catch {}
    }
  }
  if (buf.trim()) {
    const line = buf.trim();
    if (line.startsWith('data:')) {
      const data = line.slice(5).trim();
      if (data !== '[DONE]') {
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) acc += delta;
        } catch {}
      }
    }
  }
  return acc;
}

async function main() {
  if (!process.env.DASHSCOPE_API_KEY) {
    // 尝试从 .env.local 读取
    try {
      const raw = await readFile(path.join(process.cwd(), '.env.local'), 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*DASHSCOPE_API_KEY=(.*)\s*$/);
        if (m) process.env.DASHSCOPE_API_KEY = m[1].replace(/^["']|["']$/g, '');
      }
    } catch {}
  }
  if (!process.env.DASHSCOPE_API_KEY) {
    console.error('缺少 DASHSCOPE_API_KEY（请设置环境变量或写在 .env.local）');
    process.exit(1);
  }

  const raw = await readFile(path.join(process.cwd(), 'data', 'eval-inputs.json'), 'utf8');
  const items = JSON.parse(raw);

  let only = null;
  const oi = process.argv.indexOf('--only');
  if (oi >= 0) only = process.argv[oi + 1].split(',').map((s) => parseInt(s, 10));

  for (let i = 0; i < items.length; i++) {
    if (only && !only.includes(i)) continue;
    const { input, note } = items[i];
    const examples = ESSENCE_POOL.slice(0, 3);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserInstruction(input, examples) },
    ];
    process.stdout.write(`\n========== [${i}] 输入：${input} ==========\n`);
    if (note) process.stdout.write(`（期望检查点：${note}）\n`);
    try {
      const out = await streamComplete(messages, estimateMaxTokens(countSentences(input)));
      process.stdout.write(`${out}\n`);
    } catch (e) {
      process.stdout.write(`[错误] ${e.message}\n`);
    }
    await new Promise((r) => setTimeout(r, 800)); // 轻微节流
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
