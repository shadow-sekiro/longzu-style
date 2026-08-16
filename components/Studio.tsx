'use client';

import { useState, useEffect, useRef } from 'react';
import { InputForm } from './InputForm';
import { ResultDisplay } from './ResultDisplay';
import { RechargeModal } from './RechargeModal';
import { ensureDeviceId } from '@/lib/deviceId';

type State = 'idle' | 'loading' | 'done' | 'error';

// 客户端看门狗：自收到首个字起，若超过该时长无任何新数据，判定连接已断，转为错误可重试，
// 避免 ai/rsc 时代"流被提前切断却假结束成 done、半截文字卡住"的问题。
const WATCHDOG_MS = 35000;

export function Studio() {
  const [input, setInput] = useState('');
  const [text, setText] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showRecharge, setShowRecharge] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // 挂载即写入匿名设备身份（did cookie），供服务端限流/额度使用
  useEffect(() => {
    ensureDeviceId();
  }, []);

  function mapError(raw: string): string {
    if (raw.includes('API_KEY')) return '服务端尚未配置 API Key，请联系管理员';
    if (raw.includes('QUOTA_EXHAUSTED')) return '今日言灵已用尽，扫码续燃或明日再来';
    if (raw.includes('RATE_LIMITED')) return '言灵冷却中，施放过于频繁，请稍后再试';
    return raw || '生成失败，请稍后重试';
  }

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || state === 'loading') return;
    setState('loading');
    setText('');
    setErrorMsg('');

    let acc = '';
    let lastTs = Date.now();
    let gotFirst = false;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let evt = ''; // 暂存 SSE event 类型（用于 event: error 配对）

    const startWatchdog = () => {
      watchdog = setInterval(() => {
        if (Date.now() - lastTs > WATCHDOG_MS) {
          if (watchdog) clearInterval(watchdog);
          readerRef.current?.cancel().catch(() => {});
          setErrorMsg('生成超时：连接长时间无响应，请点击重试');
          setState('error');
        }
      }, 2000);
    };

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: trimmed }),
      });

      if (!res.ok || !res.body) {
        let msg = '生成失败，请稍后重试';
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          // 忽略解析失败
        }
        if (msg.includes('QUOTA_EXHAUSTED')) setShowRecharge(true);
        setErrorMsg(mapError(msg));
        setState('error');
        return;
      }

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buf = '';
      let gotDone = false; // 是否已收到业务层 [DONE] 信号（区分底层流关闭与正常结束）

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) {
            evt = '';
            continue;
          }
          if (line.startsWith('event:')) {
            evt = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            gotDone = true; // 业务层正常结束信号
            evt = '';
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            if (evt === 'error') {
              if (watchdog) clearInterval(watchdog);
              setErrorMsg(mapError(parsed));
              if (String(parsed).includes('QUOTA_EXHAUSTED')) setShowRecharge(true);
              setState('error');
              return;
            }
            if (typeof parsed === 'string' && parsed.length > 0) {
              acc += parsed;
              setText(acc);
              lastTs = Date.now();
              if (!gotFirst) {
                gotFirst = true;
                startWatchdog();
              }
            }
          } catch {
            // 忽略非 JSON 行
          }
          evt = '';
        }
      }

      if (watchdog) clearInterval(watchdog);

      // 关键修复：底层流关闭（done）必须伴随业务层 [DONE] 才算真正完成。
      // 浏览器底层偶发"虚假 done"（网络层提前断流）会导致半截文字卡住、显示复制按钮。
      // 此时若未收到 [DONE]，视为连接中断，转错误可重试，而非假结束成 done。
      if (!gotDone) {
        readerRef.current?.cancel().catch(() => {});
        setErrorMsg('连接中断：生成未完成，请点击重试');
        setState('error');
        return;
      }
      // 完整性兜底：正常生成应有实质内容。若收到 [DONE] 却几乎无文字（首帧即断的
      // 假完成 / 模型空回），不视为成功，提示重试而非卡在半截。
      if (acc.trim().length < 10) {
        setErrorMsg('生成内容不完整，请点击重试');
        setState('error');
        return;
      }
      setState('done');
    } catch (err) {
      if (watchdog) clearInterval(watchdog);
      const raw = err instanceof Error ? err.message : '生成失败，请稍后重试';
      setErrorMsg(mapError(raw));
      setState('error');
    } finally {
      readerRef.current = null;
    }
  }

  return (
    <>
      <InputForm
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        loading={state === 'loading'}
      />
      <ResultDisplay
        text={text}
        state={state}
        errorMsg={errorMsg}
        onRetry={handleSubmit}
      />
      <RechargeModal open={showRecharge} onClose={() => setShowRecharge(false)} />
    </>
  );
}
