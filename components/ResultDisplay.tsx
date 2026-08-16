'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Typewriter } from './Typewriter';

type State = 'idle' | 'loading' | 'done' | 'error';

export function ResultDisplay({
  text,
  state,
  errorMsg,
  onRetry,
}: {
  text: string;
  state: State;
  errorMsg?: string;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (state === 'idle') {
    return (
      <div className="mt-8 min-h-[120px]">
        <p className="font-serif-sc text-center text-ash/40">
          言灵尚未觉醒。写下你的句子，点燃黄金瞳的光。
        </p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="mt-8 min-h-[120px]">
        <div className="card-burn rounded-2xl p-5 text-center">
          <p className="font-serif-sc text-blood">{errorMsg}</p>
          <button
            onClick={onRetry}
            className="font-sans-sc mt-3 text-gold underline underline-offset-4"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 min-h-[120px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="card-burn rounded-2xl p-6"
      >
        {text ? (
          <>
            <div className="mb-3 flex items-center justify-end">
              {state === 'done' && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="font-sans-sc rounded-lg border border-gold/40 px-3 py-1 text-xs text-gold transition-colors hover:bg-gold/10"
                >
                  {copied ? '已复制 ✓' : '复制'}
                </button>
              )}
            </div>
            <Typewriter
              text={text}
              className="font-serif-sc whitespace-pre-wrap text-[18px] leading-[2] text-glow-gold"
            />
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="font-serif-sc text-ash/40">正在凝聚言灵…</p>
            <span className="text-gold/60 text-xs tracking-widest">龙族·言灵 加载中</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
