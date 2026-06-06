// The 「照顾电池」, compute-on-read (no cron). 3 charges; +1 every 5h (cap 3);
// hard reset to 3 at the user's local midnight (reuses the daily_reset_on marker).

import { CARE } from "./constants";
import { nextLocalHour } from "./time";

export type ChargeState = {
  charges: number;
  chargesUpdatedAt: string; // ISO; regen anchor
  resetDailyTo: string | null; // set when a midnight reset fired (route persists daily_reset_on)
  chargesRefreshInMs: number; // ms to next +1 (0 if full)
  dailyResetInMs: number; // ms to local midnight
  changed: boolean;
};

export function computeCharges(
  careCharges: number,
  chargesUpdatedAt: string | null,
  dailyResetOn: string | null,
  nowMs: number,
  tzOffsetMin: number,
  localDate: string,
): ChargeState {
  let charges = careCharges;
  let updatedAt = chargesUpdatedAt ? Date.parse(chargesUpdatedAt) : nowMs;
  let changed = false;
  let resetDailyTo: string | null = null;

  if (dailyResetOn !== localDate) {
    // new local day → hard reset to full
    charges = CARE.maxCharges;
    updatedAt = nowMs;
    resetDailyTo = localDate;
    changed = true;
  } else if (charges < CARE.maxCharges) {
    const gained = Math.floor((nowMs - updatedAt) / CARE.regenMs);
    if (gained > 0) {
      charges = Math.min(CARE.maxCharges, charges + gained);
      updatedAt = charges >= CARE.maxCharges ? nowMs : updatedAt + gained * CARE.regenMs;
      changed = true;
    }
  }

  const chargesRefreshInMs = charges >= CARE.maxCharges ? 0 : Math.max(0, updatedAt + CARE.regenMs - nowMs);
  const dailyResetInMs = Math.max(0, nextLocalHour(nowMs, tzOffsetMin, 0) - nowMs);

  return {
    charges,
    chargesUpdatedAt: new Date(updatedAt).toISOString(),
    resetDailyTo,
    chargesRefreshInMs,
    dailyResetInMs,
    changed,
  };
}
