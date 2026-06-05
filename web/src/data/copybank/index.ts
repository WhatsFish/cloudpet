// The copy bank: one authored pack per shipped creature (JSON, designer-editable
// without touching code) + a generic fallback. Server-only — the client never
// ships the bank; the API resolves a finished line and returns the string.

import type { CreatureCopyPack } from "@/lib/types";
import mochi from "./mochi_pudding.json";
import echo from "./echo_fox.json";
import ember from "./ember_imp.json";
import { DEFAULT_PACK } from "./_default";

const PACKS: Record<string, CreatureCopyPack> = {
  mochi_pudding: mochi as CreatureCopyPack,
  echo_fox: echo as CreatureCopyPack,
  ember_imp: ember as CreatureCopyPack,
};

export function getPack(creatureId: string): CreatureCopyPack {
  return PACKS[creatureId] ?? DEFAULT_PACK;
}

export function hasAuthoredPack(creatureId: string): boolean {
  return creatureId in PACKS;
}
