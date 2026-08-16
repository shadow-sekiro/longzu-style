import { SceneBackground } from '@/components/SceneBackground';
import { Studio } from '@/components/Studio';

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-[640px] flex-col px-4 py-10 sm:px-6">
      <SceneBackground />

      <header className="text-center">
        <h1 className="font-display text-[40px] font-semibold leading-tight text-glow-gold sm:text-[44px]">
          言灵·龙族
        </h1>
        <p className="font-sans-sc mt-2 text-[16px] text-ash/60">
          但为君故
        </p>
        <div className="gold-rule mx-auto mt-4 w-40" />
      </header>

      <section className="mt-10 flex-1">
        <Studio />
      </section>

      <footer className="mt-12 text-center">
        <details className="group font-sans-sc">
          <summary className="cursor-pointer text-[13px] text-ash/40 underline-offset-4 hover:text-gold hover:underline">
            关于 / 免责声明
          </summary>
          <p className="mt-3 text-[12px] leading-relaxed text-ash/30">
            本工具为《龙族》风格的同人 /
            致敬向文风生成器，由粉丝制作，非官方产品，与原作者及版权方无关联。生成内容均为
            AI 原创，仅供个人学习交流，请勿用于商业或任何侵权用途。
          </p>
        </details>
      </footer>
    </main>
  );
}
