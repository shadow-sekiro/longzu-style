'use client';

import { useEffect, useRef, useState } from 'react';

export function Typewriter({
  text,
  speed = 28,
  className,
}: {
  text: string;
  speed?: number;
  className?: string;
}) {
  const [shown, setShown] = useState('');
  const targetRef = useRef(text);
  const idxRef = useRef(0);

  targetRef.current = text;

  // 新的一轮生成：文本回退时重置
  useEffect(() => {
    if (text.length < idxRef.current) {
      idxRef.current = 0;
      setShown('');
    }
  }, [text]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (idxRef.current < targetRef.current.length) {
        idxRef.current += 1;
        setShown(targetRef.current.slice(0, idxRef.current));
      } else {
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [speed]);

  return <p className={className}>{shown}</p>;
}
