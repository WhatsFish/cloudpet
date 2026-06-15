// 可装饰 catalog (V1: one head slot). Ownership is COMPUTE-ON-READ — a hat is "owned" the moment
// its unlock condition is met (no inventory table); only the EQUIPPED choice is persisted
// (pet_state.equipped_hat). Unlocks are spread across the whole life — a couple are early (teach
// the system), the best are gated on adult / long streak / high bond — so a maxed-out pet always
// has a fresh thing to chase. This is the post-teen "成年后不再变平" reward track.

export type DecoSlot = "hat";

export type DecoUnlock =
  | { type: "always" }
  | { type: "stage"; order: number }   // pet stage order ≥ N (baby1/child2/teen3/adult4)
  | { type: "streak"; days: number }   // current streak ≥ N (uses max_streak_reached, so it stays unlocked)
  | { type: "days"; days: number }     // daysKnown ≥ N
  | { type: "bond"; bond: number };    // bond ≥ N

export type DecoItem = { id: string; slot: DecoSlot; name: string; blurb: string; unlock: DecoUnlock };

// id == the PNG asset (miniprogram/assets/deco/<id>.png). Order = display order in the 衣柜.
export const DECO: DecoItem[] = [
  { id: "flower", slot: "hat", name: "小雏菊", blurb: "别在头边的一朵小花，谁见了都想多看两眼", unlock: { type: "always" } },
  { id: "bow", slot: "hat", name: "蝴蝶结", blurb: "系上就精神了三分", unlock: { type: "stage", order: 2 } },
  { id: "beanie", slot: "hat", name: "毛线帽", blurb: "连着来看它三天，亲手织的暖", unlock: { type: "streak", days: 3 } },
  { id: "straw", slot: "hat", name: "草帽", blurb: "相伴一周的夏日纪念", unlock: { type: "days", days: 7 } },
  { id: "party", slot: "hat", name: "派对帽", blurb: "长成少年的庆祝", unlock: { type: "stage", order: 3 } },
  { id: "crown", slot: "hat", name: "小皇冠", blurb: "养到成年的勋章——只有陪它走到这里的人能给它戴上", unlock: { type: "stage", order: 4 } },
  { id: "wizard", slot: "hat", name: "巫师帽", blurb: "羁绊深到一定程度才肯显形的神秘尖帽", unlock: { type: "bond", bond: 700 } },
];

const BY_ID = new Map(DECO.map((d) => [d.id, d]));
export function decoItem(id: string): DecoItem | undefined { return BY_ID.get(id); }

// the live facts an unlock is judged against (all compute-on-read off the pet snapshot).
export type DecoCtx = { stageOrder: number; daysKnown: number; streakDays: number; maxStreak: number; bond: number };

export function isUnlocked(u: DecoUnlock, c: DecoCtx): boolean {
  switch (u.type) {
    case "always": return true;
    case "stage": return c.stageOrder >= u.order;
    case "streak": return Math.max(c.streakDays, c.maxStreak) >= u.days; // a once-reached streak stays earned
    case "days": return c.daysKnown >= u.days;
    case "bond": return c.bond >= u.bond;
  }
}

// short "how to earn it" hint shown on a locked hat in the 衣柜.
export function lockHint(u: DecoUnlock): string {
  const STAGE_CN = ["蛋", "幼年", "童年", "少年", "成年"];
  switch (u.type) {
    case "always": return "";
    case "stage": return `养到${STAGE_CN[u.order] ?? "更大"}解锁`;
    case "streak": return `连续陪它 ${u.days} 天解锁`;
    case "days": return `相伴满 ${u.days} 天解锁`;
    case "bond": return `亲密度到 ${u.bond} 解锁`;
  }
}
