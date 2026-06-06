// Domain contracts for cloudpet. The runtime has NO LLM — these types describe a
// deterministic, server-authoritative pet plus the data-driven copy bank that gives
// the (rule-based) personality its "soul".

export type Stage = "egg" | "baby" | "child" | "teen" | "adult";
export type LiveStat = "satiety" | "mood" | "cleanliness" | "energy" | "health";
export type MoodBand = "极好" | "好" | "平" | "低" | "极低";
export type TimeBand = "清晨" | "白天" | "傍晚" | "深夜";
export type StateFlagName = "SICK" | "SULKING" | "HIDING" | "LONELY";

// state_flags bitmask (matches schema comment)
export const STATE = { SICK: 1, SULKING: 2, HIDING: 4, LONELY: 8 } as const;

export type AxisVector = { attach: number; curio: number; express: number };

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
  seed: number; // stable-but-varying selection seed
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
  careCharges: number; // 0–3 「照顾电池」
  chargesRefreshInMs: number; // ms to next +1 (0 if full)
  dailyResetInMs: number; // ms to local-midnight reset
  careCoveredToday: boolean; // satiety/cleanliness/health all >= 30
  streakDays: number;
  theme: string; // device skin
  voice: { line: string; lineId: string } | null; // today's 心声
  actions: ActionAvailability[];
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
