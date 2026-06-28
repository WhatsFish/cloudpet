// Domain contracts for cloudpet. The runtime has NO LLM — these types describe a
// deterministic, server-authoritative pet plus the data-driven copy bank that gives
// the (rule-based) personality its "soul".

export type Stage = "egg" | "baby" | "child" | "teen" | "adult";
export type LiveStat = "satiety" | "mood" | "cleanliness" | "energy" | "health";
export type NeedKind = "unwell" | "sleepy" | "hungry" | "dirty" | "bored";
export type MoodBand = "极好" | "好" | "平" | "低" | "极低";
export type TimeBand = "清晨" | "白天" | "傍晚" | "深夜";
export type StateFlagName = "SICK" | "SULKING" | "HIDING" | "LONELY" | "CRITICAL";

// state_flags bitmask (matches schema comment)
export const STATE = { SICK: 1, SULKING: 2, HIDING: 4, LONELY: 8, CRITICAL: 16 } as const;

export type AxisVector = { attach: number; curio: number; express: number };

// --- V3: care-history-driven divergent evolution (REDESIGN_V3 / Model C) ---
// How you raise the pet (which care you favor) steers which form it grows into at
// the teen fork. These counts are persisted aggregates on pet_state.
export type CareCounts = { feed: number; clean: number; doctor: number; affection: number };
// V4 care branches: feed→丰裕形, engage(洗澡+陪玩)→敏捷形, tend(看医生)→守护形, balanced→本形.
export type NurtureLean = "feed" | "engage" | "tend" | "balanced";
export type NurtureTilt = {
  leaning: NurtureLean;
  towardSpeciesId: string; // the form it is currently growing toward
  towardName: string;
  shares: CareCounts; // 0..1 share of each care kind (affection = play + pet)
  label: string; // 养育倾向 meter copy
};

// V8 explicit fork: the child→teen form is the player's deliberate choice, picked in a
// modal at the fork moment (POST /api/pet/evolve), not auto-derived from care ratios.
export type ForkOption = { branch: NurtureLean; speciesId: string; name: string; blurb: string };
export type Fork = {
  pending: boolean; // child has met all teen gates → waiting at the fork for the player to choose
  options: ForkOption[]; // the 4 forms: true form + 3 named variant forms. The player picks freely —
                         // care does NOT decide or even bias the form (no 推荐), so disliking a form
                         // never forces you to under-care the pet.
};

// --- personality model ---
export type Archetype = {
  key: string;
  nameCN: string;
  anchor: AxisVector; // fixed point in axis space (quiz matches to nearest)
  vibe: string;
  coreNeed: string;
};

// --- pet rows ---
export type PetRow = {
  id: number;
  user_id: string;
  archetype_key: string;
  species_id: string;
  name: string;
  stage: Stage;
  created_at: string;
};

// The mutable state snapshot (pet_state). Plain numbers; persisted verbatim.
export type Snapshot = {
  satiety: number;
  mood: number;
  cleanliness: number;
  energy: number;
  health: number;
  bond: number;
  exp: number;
  weight: number; // V8: 体型, grows over real days + per feed up to a per-stage cap
  asleep: boolean;
  sleep_since: string | null;
  state_flags: number;
  state_since: string | null;
  last_tick: string;
};

export type Inventory = { kibble: number; snack: number; soap: number; heart: number };
export type ItemKey = keyof Inventory;

// --- copy bank (the heart) ---
export type CopyRequires = {
  stage?: Stage[];
  moodBand?: MoodBand[];
  stateFlag?: (StateFlagName | "none")[];
  timeBand?: TimeBand[];
  streakMin?: number;
  bondMin?: number;
  daysMin?: number;
  pattern?: string[];
  need?: NeedKind[]; // V4: gate a line on the pet's current top need
};

export type CopyLine = {
  id: string;
  event: string;
  text: string; // may contain {slot} placeholders filled from pack.slots
  requires?: CopyRequires;
  weight?: number;
};

export type DiaryPart = { id: string; text: string; requires?: CopyRequires };

export type CreatureCopyPack = {
  archetypeKey: string;
  displayName: string;
  slots: Record<string, string[]>;
  lines: CopyLine[];
  diary: {
    openers: DiaryPart[];
    bodies: DiaryPart[];
    memory: DiaryPart[];
    signoffs: DiaryPart[];
  };
};

// Context passed to the copy selector.
export type CopyContext = {
  stage: Stage;
  moodBand: MoodBand;
  timeBand: TimeBand;
  dominantState: StateFlagName | "none";
  stateFlags: number;
  streakDays: number;
  bond: number;
  daysKnown: number;
  pattern: string[]; // behavioral aggregates, e.g. ["late_feeder","overfeeder"]
  need: NeedKind | null; // V4: the pet's current top need (drives need-voiced copy)
  seed: number; // stable-but-varying selection seed
};

// --- V4 needs / roadmap / recap view models ---
// rewardExp/rewardBond: the server-computed reward for answering this DUE need right now, so
// the A-button chip shows the exact value the action will grant (no client guess that can drift
// from server truth). Present only for due CARE needs (feed/clean/doctor → exp+bond).
export type NeedView = { kind: NeedKind; verb: Verb; label: string; rewardExp?: number; rewardBond?: number };
// V8: a care action's availability timer — due now, or how long until it's next available.
export type CareTimer = { verb: "feed" | "clean" | "doctor"; due: boolean; etaSec: number | null; label: string };
export type Roadmap = {
  level: { level: number; expInto: number; expSpan: number; expRemaining: number };
  stage: {
    stage: Stage | null; towardName: string;
    expReq: number; minDays: number; bondGate: number;
    expRemaining: number; daysRemaining: number; bondRemaining: number;
    unmet: ("exp" | "days" | "bond")[]; etaDays: number;
    // 进化提速 legibility: how many calendar days the pet's current bond has already shaved off
    // the day-gate vs a zero-bond pet, and how many MORE it could shave by bonding to full speed.
    daysSavedByBond: number; daysCouldSaveMore: number;
  } | null;
  line: string; // one-glance summary, e.g. "再 2 天 + 多陪它一点 → 进化成「提灯蛾」"
};
export type Recap = {
  kind: "level" | "stage" | "evolve" | "rest"; // "rest": gentle overnight EXP growth, no level-up

  daysAway: number; levelFrom: number; levelTo: number;
  stageFrom: Stage; stageTo: Stage; evolvedToName: string | null;
  expGained: number; line: string;
};

// --- API view models ---
export type PetView = {
  pet: { id: number; name: string; archetypeKey: string; stage: Stage; daysKnown: number; level: number };
  stats: { satiety: number; mood: number; cleanliness: number; energy: number; health: number };
  bond: number;
  exp: number;
  level: number;
  evolveProgress: number; // 0–100 within current stage toward next
  expForNextStage: number | null;
  moodBand: MoodBand;
  dominantState: StateFlagName | "none";
  badges: StateFlagName[] | string[];
  needHint: string; // gentle "what to do" prompt (mirrors dominant precedence)
  asleep: boolean;
  sprite: { creatureId: string; stage: Stage; mood: string; animation: string };
  needs: NeedView[]; // up to 3 DUE needs, priority-ordered
  topNeed: NeedView | null; // the single most important thing to do now (the primary CTA)
  asleepNow: boolean; // V5: sleep gates the other actions; the UI shows a sleep state
  roadmap: Roadmap; // next level / next evolution + what it needs
  recap: Recap | null; // GET only, one-shot: it grew while you were away
  growthPerDay: number; // V5: quantified growth speed (passive exp/day at current care)
  weight: number; // V8: 体重 (display weight/100 = kg); grows over real days
  sizeScale: number; // V8: sprite display scale derived from weight (~0.92..1.32)
  sparks: number; // V8: banked 灵感火花 (tap-for-EXP), regen over time
  sparkEtaSec: number; // V8: seconds until the next spark regens (0 when already at max)
  careTimers: CareTimer[]; // V8: per care verb — due now / next-due countdown
  bondHearts: number; // V5: 0–5 hearts, visible 亲密度
  bondNextPct: number; // 0–100 progress toward the NEXT heart (so bond visibly moves within a session)
  bondNextRemaining: number; // bond points still needed for the next heart (0 once at 5♥)
  streakDays: number;
  theme: string; // device skin
  voice: { line: string; lineId: string } | null; // today's 心声
  actions: ActionAvailability[];
  fork: Fork; // V8: the child→teen fork — pending flag + the 4 player-choosable forms
  equipped: { hat: string | null; aura: string | null }; // V8.8/V2§5 可装饰: equipped per slot (client overlays on the sprite)
};

// V2: 3 home buttons. care (battery) = feed/clean/doctor; affection (free) = play/pet/sleep.
export type Verb = "feed" | "clean" | "doctor" | "play" | "pet" | "sleep";

export type ReactionCue = { pose: string; fx: string; anim: string; copyEvent: string };

export type ActionAvailability = {
  verb: Verb;
  enabled: boolean;
  reason?: string; // why disabled (cooldown|unavailable|locked|no_item)
  remainingMs?: number;
};
