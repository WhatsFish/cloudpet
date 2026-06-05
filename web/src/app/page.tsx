export const dynamic = "force-static";

export default function Landing() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-16">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">云宠物</h1>
        <p className="text-neutral-500 text-sm">
          测一测，领养一只为你而来的本命小宠。
        </p>
      </header>

      <section className="space-y-4 text-sm leading-7">
        <p>
          这是一个微信小程序，不是网页应用。在微信里搜索「本命小宠」打开使用。
        </p>
        <p>
          做什么：进来先做一个简短的性格小测，根据你的性格匹配到一只
          <strong>专属于你的本命小宠</strong>——一只像素风、不常见但很可爱的小生物。
          然后像以前的 QQ 宠物一样，看着它一天天长大。
        </p>
        <p>
          怎么玩：喂食、洗澡、陪玩、抚摸、哄睡……它会饿、会闹脾气、会想你，
          但<strong>永远不会死、不会走丢</strong>。每只宠物都有自己的性格、口头禅和每天的「心声」。
        </p>
        <p className="text-neutral-500">
          一人一只，慢慢养。是陪伴，不是抽奖。
        </p>
      </section>

      <footer className="mt-16 pt-6 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
        部分内容会随宠物成长逐步解锁。本产品为休闲养成小游戏。
      </footer>
    </main>
  );
}
