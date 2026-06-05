// Generic fallback voice. In V1 every bonded pet is one of the 3 shipped creatures,
// so this is only a safety net (and the placeholder voice for the 7 un-shipped
// archetypes shown in 图鉴). Kept compact; the selector's FALLBACK chain covers
// any event not listed here.

import type { CreatureCopyPack } from "@/lib/types";

export const DEFAULT_PACK: CreatureCopyPack = {
  archetypeKey: "_default",
  displayName: "小宠",
  slots: {
    kaomoji: ["(´･ω･`)", "(*´▽`*)", "(｡･ω･｡)", "(>ω<)", "ヽ(•‿•)ノ"],
    endearment: ["你", "主人"],
    food: ["小点心", "热乎的饭饭", "好吃的"],
    activity: ["玩一会儿", "晒太阳", "打个滚"],
  },
  lines: [
    { id: "_d.greet.open.1", event: "greet.open", text: "{endearment}来啦~今天也想见你{kaomoji}" },
    { id: "_d.greet.open.2", event: "greet.open", text: "嘿，是{endearment}！{kaomoji}" },
    { id: "_d.feed.love.1", event: "feed.love", text: "{food}最好吃了，谢谢{endearment}~{kaomoji}" },
    { id: "_d.feed.neutral.1", event: "feed.neutral", text: "嗯…吃饱啦{kaomoji}" },
    { id: "_d.clean.1", event: "clean", text: "干干净净的，舒服多了{kaomoji}" },
    { id: "_d.play.1", event: "play", text: "一起{activity}最开心啦{kaomoji}" },
    { id: "_d.play.declined.1", event: "play.declined", text: "现在…不太想动呢{kaomoji}" },
    { id: "_d.pet.1", event: "pet", text: "被{endearment}摸摸，好安心{kaomoji}" },
    { id: "_d.sleep.tuck.1", event: "sleep.tuck", text: "那…晚安啦{kaomoji}" },
    { id: "_d.sleep.wake.1", event: "sleep.wake", text: "唔…睡醒啦，第一眼就看到{endearment}{kaomoji}" },
    { id: "_d.medicine.1", event: "medicine", text: "苦苦的…但有{endearment}在就忍得住{kaomoji}" },
    { id: "_d.checkin.1", event: "checkin", text: "今天也来看我啦，好开心{kaomoji}" },
    { id: "_d.state.hungry.1", event: "state.hungry", text: "肚子有点饿了…想吃{food}{kaomoji}" },
    { id: "_d.state.dirty.1", event: "state.dirty", text: "身上有点脏脏的，想洗澡澡了{kaomoji}" },
    { id: "_d.state.sleepy.1", event: "state.sleepy", text: "好困…眼皮打架了{kaomoji}" },
    { id: "_d.state.sick.1", event: "state.sick", text: "唔…不太舒服，{endearment}陪陪我{kaomoji}" },
    { id: "_d.state.sulky.1", event: "state.sulky", text: "哼…才不理你呢{kaomoji}" },
    { id: "_d.state.hiding.1", event: "state.hiding", text: "（躲在角落里，不太想出来）" },
    { id: "_d.state.lonely.1", event: "state.lonely", text: "一个人…有点想{endearment}了{kaomoji}" },
    { id: "_d.mood.elated.1", event: "mood.elated", text: "今天超级开心！{kaomoji}" },
    { id: "_d.idle.mutter.1", event: "idle.mutter", text: "（小声哼着歌）{kaomoji}" },
    { id: "_d.idle.mutter.2", event: "idle.mutter", text: "今天也是平平淡淡的好日子呀{kaomoji}" },
    { id: "_d.beg.want.1", event: "beg.want", text: "那个…可以给我一点{food}吗{kaomoji}" },
    { id: "_d.growth.promote.1", event: "growth.promote", text: "我好像…长大了一点点！{kaomoji}" },
    { id: "_d.streak.milestone.1", event: "streak.milestone", text: "我们已经一起{streak}天啦{kaomoji}" },
    { id: "_d.reunion.gift.1", event: "reunion.gift", text: "你回来啦…我一直在等{kaomoji}" },
    { id: "_d.name.given.1", event: "name.given", text: "这是我的名字吗？我好喜欢{kaomoji}" },
  ],
  diary: {
    openers: [
      { id: "_d.o.1", text: "今天" },
      { id: "_d.o.2", text: "这一天" },
      { id: "_d.o.3", text: "夜里", requires: { timeBand: ["深夜"] } },
    ],
    bodies: [
      { id: "_d.b.1", text: "和{endearment}待在一起，就很满足。" },
      { id: "_d.b.2", text: "晒着太阳发了会儿呆。" },
      { id: "_d.b.3", text: "想{endearment}多陪陪我。" },
    ],
    memory: [
      { id: "_d.m.streak", text: "我们已经第{streak}天没分开啦，", requires: { streakMin: 7 } },
      { id: "_d.m.days", text: "认识{endearment}第{days}天了，", requires: { daysMin: 3 } },
    ],
    signoffs: [
      { id: "_d.s.1", text: "明天也要来哦{kaomoji}" },
      { id: "_d.s.2", text: "晚安{kaomoji}" },
    ],
  },
};
