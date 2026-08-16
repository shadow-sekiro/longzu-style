'use client';

import { motion } from 'framer-motion';
import { MAX_INPUT } from '@/lib/utils';

export function InputForm({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const count = [...value].length;
  const over = count > MAX_INPUT;
  const disabled = loading || over || count === 0;

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="写下你想说的话，让它燃起黄金瞳的光…"
        rows={4}
        className="font-sans-sc w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-4 text-[18px] leading-7 text-ash outline-none transition focus:border-gold/50 focus:shadow-[0_0_18px_rgba(184,134,11,0.25)]"
      />
      <div className="mt-3 flex items-center justify-between gap-4">
        <span
          className={`font-sans-sc text-sm ${over ? 'text-blood' : 'text-ash/50'}`}
        >
          {count}/{MAX_INPUT}
        </span>
        <motion.button
          type="button"
          disabled={disabled}
          onClick={onSubmit}
          whileTap={{ scale: 0.95 }}
          animate={
            loading
              ? {
                  scale: [1, 0.95, 1],
                  boxShadow: [
                    '0 0 0px rgba(184,134,11,0)',
                    '0 0 22px rgba(184,134,11,0.75)',
                    '0 0 0px rgba(184,134,11,0)',
                  ],
                }
              : {}
          }
          transition={loading ? { duration: 1, repeat: Infinity } : { duration: 0.2 }}
          className="btn-glow font-serif-sc rounded-full bg-gradient-to-b from-gold to-gold-deep px-7 py-3 text-[17px] font-semibold text-ink-950 transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? '燃烧中…' : '施放言灵'}
        </motion.button>
      </div>
    </div>
  );
}
