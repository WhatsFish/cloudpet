// The copy bank: one authored pack per creature (JSON, designer-editable without touching
// code) + a generic fallback. Server-only — the client never ships the bank; the API
// resolves a finished line and returns the string.

import type { CreatureCopyPack } from "@/lib/types";
import puff from "./puff.json";
import claude from "./claude.json";
import blocky from "./blocky.json";
import penguin from "./penguin.json";
import bear from "./bear.json";
import seal from "./seal.json";
import { DEFAULT_PACK } from "./_default";

const PACKS: Record<string, CreatureCopyPack> = {
  puff: puff as CreatureCopyPack,
  claude: claude as CreatureCopyPack,
  blocky: blocky as CreatureCopyPack,
  penguin: penguin as CreatureCopyPack,
  bear: bear as CreatureCopyPack,
  seal: seal as CreatureCopyPack,
};

export function getPack(creatureId: string): CreatureCopyPack {
  return PACKS[creatureId] ?? DEFAULT_PACK;
}

export function hasAuthoredPack(creatureId: string): boolean {
  return creatureId in PACKS;
}
