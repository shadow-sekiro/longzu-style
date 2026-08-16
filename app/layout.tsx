import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '言灵 · 龙族风文风生成',
  description: '龙族风格同人 / 致敬向文风生成器，将日常语句改写为龙族式暗黑史诗风的文字。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Noto+Sans+SC:wght@400;500&family=Noto+Serif+SC:wght@400;600&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
