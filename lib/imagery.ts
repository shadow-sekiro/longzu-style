// 结构化意象素材池：把"笔法养分"拆成多个维度（可触物件 / 感官角度 / 比喻类型 / 反差钩子），
// 每次生成时随机抽组合，作为"写作手法参考"。
//
// **关键设计修正（2026-08-16）**：素材卡只提供"笔法养分"，绝不给"落点场景"——
// 之前版本随机塞一个场景（如"医院走廊的长椅"）当主菜，模型反而围绕卡片场景写、
// 把用户输入的地点/人物丢到一边（例：输入"北京下雨了"却写出医院的樟脑丸），
// 即"偏离原意"的结构性 bug。现改为：场景/地点/人物一律从用户输入抽取（extractAnchors），
// 素材卡只负责"怎么写得更龙族味"，不许成为要描写的内容。
//
// 设计要点：
// 1. 维度之间正交，组合数量巨大，模型每次拿到的"笔法卡"都不同；
// 2. 抽取时排除与用户输入重合的词，避免"复述原句意象"；
// 3. 这些词只是"笔法提示"，不是必须出现的词，更不是要写的场景——
//    配合 prompts.ts 的"必须先围绕输入锚点、素材卡仅作笔法参考"硬约束。

export type ImageryCard = {
  objects: string[]; // 2~3 件可触碰的物件（白描用，仅供参考，不是要写的场景）
  senses: string[]; // 2 种感官角度（光/色/气味/温度/声音/质感）
  trope: string; // 一种比喻类型（避免每次都用"像…"）
  hook: string; // 一个反差钩子（把日常拉到命运/史诗尺度的方式）
};

// 物件池——具体、可触、跨域，不局限于泡面/粉笔。注意：这些只是"白描手法示例"，
// 模型可以借鉴其"具体可触"的质感，但应当优先使用输入里真实存在的物件。
const OBJECTS = [
  '半瓶可乐', '卷边的准考证', '生锈的自行车铃', '融化的冰棍', '洗衣机的滚筒',
  '受潮的烟盒', '断了带的书包', '荧光笔的墨渍', '旧收音机的天线', '结霜的窗玻璃',
  '泡皱的船票', '褪色的合影', '卡住的拉链', '凉掉的关东煮', '裂屏的手机',
  '邻桌的订书机', '晾衣绳上的校服', '积灰的奖杯', '漏水的伞骨', '便利店的热饮柜',
];

// 感官角度池
const SENSES = [
  '霓虹在积水里碎成一片', '空调外机嗡嗡震着地板', '泡面汤的热气糊了镜片',
  '消毒水的味道钻进衣领', '铁栏杆冰得指尖发麻', '远处烟花闷闷地响',
  '樟脑丸的苦香绕着旧衣柜', '瓷砖缝里渗着潮气', '耳机里漏出半个走调的副歌',
  '夕阳把影子拉得比人还长', '风里裹着槐花的甜腥', '键盘的背光在脸上浮着青',
];

// 比喻手法池——只给"手法类型"提示，不给成句，避免模型照搬现成句式塌缩成新模板。
const TROPES = [
  '把情绪拟物成一个走错的小物件', '用"没拧紧的水龙头"之类的日常泄露形容压不住的心事',
  '把少年比作货架上过期却没下架的滞销品', '用"正在融的冰"写逞强一点点崩塌',
  '把沉默写成一种缓慢涨上来的潮水', '用"被反复折过的纸"比喻回不去的原状',
  '把某种等待写成信号灯明灭', '用"冬天晾不干的湿衣"形容黏着不散的低落',
];

// 反差钩子池——只给"方向提示"，不给成句，让模型自己造反差结尾。
const HOOKS = [
  '在收尾处让城市/世界忽然漏出一道缝隙，像某种仪式被悄然启动',
  '在平凡画面最高潮时，让命运像迟到的列车轰隆碾过他毫无准备的生活',
  '点出"他还以为今天只是普通的一天"，而更大的东西已经翻页',
  '暗示这场寻常景象落下的位置，早被写进了某份他读不懂的名单',
  '让某种古老的东西顺着网线、铁轨、地面爬过来，找寻它的候选人',
  '写出少年的无知恰恰是最锋利的——他还不知道自己已站在某个入口',
];

function pick<T extends string>(arr: T[], n: number, exclude: Set<string>): T[] {
  const pool = arr.filter((x) => !exclude.has(x));
  const src = pool.length >= n ? pool : arr;
  const copy = [...src];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/**
 * 从用户输入抽取"语义锚点"——这是生成必须围绕的「主菜」。
 * 任何给定的地点、人物、时间、物件、事件，都要作为硬约束强插进指令，
 * 防止模型自创无关场景（例：输入"北京下雨了"必须写北京、雨，不能跑去写医院）。
 * 返回结构化锚点对象；为空数组表示输入太抽象、无可锚定实体（此时让提示词兜底）。
 */
export type InputAnchors = {
  places: string[]; // 地点：北京、教室、老家……
  people: string[]; // 人物：他、小明、妈妈……
  times: string[]; // 时间：清晨、下雨时、周三……
  events: string[]; // 事件/状态：下雨了、考试、离别……
  objects: string[]; // 输入里出现的物件：伞、书、火车……
};

// 简单的中文地点/方位词，命中即视为地点锚点
const PLACE_HINTS = ['北京', '上海', '广州', '深圳', '杭州', '成都', '老家', '故乡', '教室', '宿舍', '出租屋', '公司', '学校', '医院', '地铁', '车站', '火车站', '机场', '天桥', '海边', '山', '街', '巷', '小区', '楼', '城', '镇', '村', '家', '书店', '网吧', '球场', '图书馆', '便利店', '厨房', '阳台', '窗口', '窗台', '天台'];
// 人物指示词
const PEOPLE_HINTS = ['我', '你', '他', '她', '我们', '你们', '他们', '哥', '姐', '弟', '妹', '妈', '爸', '爷', '奶', '老师', '同学', '室友', '朋友', '老板', '同事', ' stranger', '陌生人'];
// 时间词
const TIME_HINTS = ['清晨', '早晨', '上午', '中午', '午后', '下午', '傍晚', '黄昏', '夜晚', '深夜', '凌晨', '半夜', '春天', '夏天', '秋天', '冬天', '周一', '周二', '周三', '周四', '周五', '周六', '周日', '周末', '今天', '昨天', '明天', '前天', '除夕', '春节', '下雨时', '下雪时', '天亮', '天黑'];

export function extractAnchors(userInput: string): InputAnchors {
  const s = userInput;
  const has = (kw: string) => s.includes(kw);
  const places = PLACE_HINTS.filter(has);
  const people = PEOPLE_HINTS.filter((h) => h.trim() && has(h));
  const times = TIME_HINTS.filter(has);

  // 事件：以"……了"收尾的动词短语（下雨了/放学了/他走了），以及常见状态词
  const events: string[] = [];
  const leMatch = s.match(/[一-龥]{1,6}了/g);
  if (leMatch) events.push(...leMatch);
  if (has('下雨')) events.push('下雨');
  if (has('下雪')) events.push('下雪');
  if (has('离别') || has('走了') || has('离开')) events.push('离别');
  if (has('考试') || has('考研') || has('高考')) events.push('考试');

  // 物件：从 OBJECTS 池里看输入是否直接提及（若提及则作为真实物件锚点，优先于随机物件）
  const objects = OBJECTS.filter((o) => {
    const core = o.replace(/^(半瓶|卷边|生锈|融化|受潮|断了|结霜|泡皱|褪色|卡住|凉掉|裂屏|积灰|漏水|邻桌的|晾衣绳上的|漏水的|便利店的)/, '').slice(0, 2);
    return core.length >= 2 && has(core);
  });

  return { places, people, times, events: [...new Set(events)], objects };
}

/** 把锚点格式化成给模型的"首要硬约束"文本。 */
export function formatAnchors(anchors: InputAnchors): string {
  const parts: string[] = [];
  if (anchors.places.length) parts.push(`地点：${anchors.places.join('、')}`);
  if (anchors.people.length) parts.push(`人物：${anchors.people.join('、')}`);
  if (anchors.times.length) parts.push(`时间：${anchors.times.join('、')}`);
  if (anchors.events.length) parts.push(`事件/状态：${anchors.events.join('、')}`);
  if (anchors.objects.length) parts.push(`文中物件：${anchors.objects.join('、')}`);
  return parts.join('；');
}

/** 根据用户输入，生成一张"本次专属笔法卡"（只给笔法养分，不含场景）。 */
export function buildImageryCard(userInput: string): ImageryCard {
  const exclude = new Set(userInput.split(''));
  const objects = pick(OBJECTS, 2, exclude);
  const senses = pick(SENSES, 2, exclude);
  const trope = pick(TROPES, 1, exclude)[0];
  const hook = pick(HOOKS, 1, exclude)[0];
  return { objects, senses, trope, hook };
}

/** 把笔法卡格式化成给模型的指令文本（短、结构化、明确"只是笔法参考"）。 */
export function formatImageryCard(card: ImageryCard): string {
  return [
    `【笔法参考·可触物件质感】${card.objects.join('、')}（仅借鉴其"具体可触"的白描质感，优先用输入里真实存在的物件）`,
    `【笔法参考·感官角度】${card.senses.join('；')}（可借鉴其中某种感官写法，但感官对象须来自你的输入）`,
    `【笔法参考·比喻手法】${card.trope}`,
    `【笔法参考·反差钩子】${card.hook}`,
  ].join('\n');
}
