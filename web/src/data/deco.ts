// 可装饰 catalog (V2 §5: multi-slot categories + level-gated unlocks). Ownership is COMPUTE-ON-READ
// — an item is "owned" the moment its unlock condition is met (no inventory table); only the EQUIPPED
// choice per slot is persisted (pet_state.equipped_hat / equipped_aura). Unlocks are spread across the
// whole 50-day journey — early ones teach the system, the best are gated on level / adult / long
// streak / high bond — so a maxed pet always has a fresh thing to chase. This is the post-teen
// "成年后不再变平" reward track and the concrete answer to "Lv 有什么用" (levels unlock cosmetics).

export type DecoSlot = "hat" | "aura"; // hat = head overlay (anchored); aura = full-sprite halo (centered)

export type DecoUnlock =
  | { type: "always" }
  | { type: "stage"; order: number }   // pet stage order ≥ N (baby1/child2/teen3/adult4)
  | { type: "level"; lv: number }      // derived level ≥ N  (V2 §5 — makes leveling materially rewarding)
  | { type: "streak"; days: number }   // current streak ≥ N (uses max_streak_reached, so it stays unlocked)
  | { type: "days"; days: number }     // daysKnown ≥ N
  | { type: "bond"; bond: number };    // bond ≥ N

export type DecoItem = { id: string; slot: DecoSlot; name: string; blurb: string; unlock: DecoUnlock };

// id == the PNG asset (miniprogram/assets/deco/<id>.png). Order = display order in the 衣柜.
export const DECO: DecoItem[] = [
  // —— 头饰 hat ——（沿用既有 7 顶 + 新增 level 门）
  { id: "flower", slot: "hat", name: "小雏菊", blurb: "别在头边的一朵小花，谁见了都想多看两眼", unlock: { type: "always" } },
  { id: "bow", slot: "hat", name: "蝴蝶结", blurb: "系上就精神了三分", unlock: { type: "stage", order: 2 } },
  { id: "beanie", slot: "hat", name: "毛线帽", blurb: "连着来看它三天，亲手织的暖", unlock: { type: "streak", days: 3 } },
  { id: "straw", slot: "hat", name: "草帽", blurb: "相伴一周的夏日纪念", unlock: { type: "days", days: 7 } },
  { id: "cap", slot: "hat", name: "鸭舌帽", blurb: "Lv5 的小潮崽，出门戴上有型", unlock: { type: "level", lv: 5 } },
  { id: "party", slot: "hat", name: "派对帽", blurb: "长成少年的庆祝", unlock: { type: "stage", order: 3 } },
  { id: "ribbon", slot: "hat", name: "缎带花环", blurb: "Lv12 的优雅，绕头一圈的小心意", unlock: { type: "level", lv: 12 } },
  { id: "crown", slot: "hat", name: "小皇冠", blurb: "养到成年的勋章——只有陪它走到这里的人能给它戴上", unlock: { type: "stage", order: 4 } },
  { id: "antlers", slot: "hat", name: "鹿角枝", blurb: "Lv16 解锁，顶着一对毛茸茸的小鹿角", unlock: { type: "level", lv: 16 } },
  { id: "wizard", slot: "hat", name: "巫师帽", blurb: "羁绊深到一定程度才肯显形的神秘尖帽", unlock: { type: "bond", bond: 700 } },
  { id: "halo_hat", slot: "hat", name: "天使环", blurb: "Lv24 的乖宝宝，头顶一圈柔光", unlock: { type: "level", lv: 24 } },

  // —— 光环 aura ——（V2 §5 新品类：全身居中 overlay，无需锚点；对应 §3 觉醒 / §7 季节光环）
  { id: "aura_spark", slot: "aura", name: "微光环", blurb: "Lv8 解锁，身周漾起一圈细碎的光", unlock: { type: "level", lv: 8 } },
  { id: "aura_leaf", slot: "aura", name: "春樱环", blurb: "相伴满 21 天的春日花瓣，绕着它轻轻打转", unlock: { type: "days", days: 21 } },
  { id: "aura_star", slot: "aura", name: "星辉环", blurb: "Lv20 的觉醒之光，星子绕身而行", unlock: { type: "level", lv: 20 } },
  { id: "aura_tide", slot: "aura", name: "潮汐环", blurb: "Lv28 的纪元光环，最稳的玩家才点得亮", unlock: { type: "level", lv: 28 } },
  { id: "aura_crown", slot: "aura", name: "本命环", blurb: "羁绊满到 1000 才会浮现的至高光环", unlock: { type: "bond", bond: 1000 } },
];

const BY_ID = new Map(DECO.map((d) => [d.id, d]));
export function decoItem(id: string): DecoItem | undefined { return BY_ID.get(id); }
export const DECO_SLOTS: DecoSlot[] = ["hat", "aura"];

// the live facts an unlock is judged against (all compute-on-read off the pet snapshot).
export type DecoCtx = { stageOrder: number; level: number; daysKnown: number; streakDays: number; maxStreak: number; bond: number };

export function isUnlocked(u: DecoUnlock, c: DecoCtx): boolean {
  switch (u.type) {
    case "always": return true;
    case "stage": return c.stageOrder >= u.order;
    case "level": return c.level >= u.lv;
    case "streak": return Math.max(c.streakDays, c.maxStreak) >= u.days; // a once-reached streak stays earned
    case "days": return c.daysKnown >= u.days;
    case "bond": return c.bond >= u.bond;
  }
}

// short "how to earn it" hint shown on a locked item in the 衣柜.
export function lockHint(u: DecoUnlock): string {
  const STAGE_CN = ["蛋", "幼年", "童年", "少年", "成年"];
  switch (u.type) {
    case "always": return "";
    case "stage": return `养到${STAGE_CN[u.order] ?? "更大"}解锁`;
    case "level": return `升到 Lv${u.lv} 解锁`;
    case "streak": return `连续陪它 ${u.days} 天解锁`;
    case "days": return `相伴满 ${u.days} 天解锁`;
    case "bond": return `亲密度到 ${u.bond} 解锁`;
  }
}
