// Small view helpers shared across pages.

export function spritePath(creatureId: string, stage: string, mood: string): string {
  if (stage === "egg") return `/assets/pets/${creatureId}/egg.png`;
  return `/assets/pets/${creatureId}/${stage}_${mood}.png`;
}

export const FALLBACK_SPRITE = "/assets/pets/_fallback/blob.png";

export function cooldownText(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `${min}分钟`;
  const h = Math.floor(min / 60);
  return `${h}小时${min % 60 ? min % 60 + "分" : ""}`;
}

export const VERB_LABEL: Record<string, string> = {
  feed: "喂食", snack: "喂零食", clean: "洗澡", play: "陪玩",
  pet: "抚摸", sleep: "哄睡", doctor: "看医生", checkin: "每日签到",
};

export const STAGE_LABEL: Record<string, string> = {
  egg: "🥚 蛋", baby: "🐣 幼年", child: "🐥 童年", teen: "🦊 少年", adult: "🌟 成年",
};

export const STAT_META: { key: string; label: string; color: string }[] = [
  { key: "satiety", label: "饱食", color: "#FFB84D" },
  { key: "mood", label: "心情", color: "#FF9EC4" },
  { key: "cleanliness", label: "清洁", color: "#7FD4F2" },
  { key: "energy", label: "精力", color: "#9ED47F" },
  { key: "health", label: "健康", color: "#FF7A7A" },
];
