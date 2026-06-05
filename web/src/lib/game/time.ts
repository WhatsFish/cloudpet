// All wall-clock reasoning is server UTC + a SERVER-VALIDATED per-user tz offset
// (minutes east of UTC). The client clock is never trusted. Local "wall-clock"
// fields are read by shifting the UTC instant by the offset and reading UTC parts.

import type { TimeBand } from "@/lib/types";

const TZ_MIN = -720; // UTC-12
const TZ_MAX = 840; // UTC+14
export const DEFAULT_TZ = 480; // UTC+8 (China)

/** Clamp/sanitize a client-proposed tz offset; fall back to default if absurd. */
export function validateTz(n: unknown): number {
  const v = typeof n === "number" ? n : parseInt(String(n), 10);
  if (!Number.isFinite(v)) return DEFAULT_TZ;
  const i = Math.round(v);
  if (i < TZ_MIN || i > TZ_MAX) return DEFAULT_TZ;
  return i;
}

function shifted(nowMs: number, tzOffsetMin: number): Date {
  return new Date(nowMs + tzOffsetMin * 60_000);
}

/** User-local calendar date as YYYY-MM-DD. */
export function localDateStr(nowMs: number, tzOffsetMin: number): string {
  const d = shifted(nowMs, tzOffsetMin);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** User-local hour as a float in [0,24). */
export function localHour(nowMs: number, tzOffsetMin: number): number {
  const d = shifted(nowMs, tzOffsetMin);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

export function timeBand(nowMs: number, tzOffsetMin: number): TimeBand {
  const h = localHour(nowMs, tzOffsetMin);
  if (h >= 23 || h < 5) return "深夜";
  if (h < 9) return "清晨";
  if (h < 18) return "白天";
  return "傍晚";
}

/** Sleep/nap window: [23:00, 07:00) local. */
export function isNight(nowMs: number, tzOffsetMin: number): boolean {
  const h = localHour(nowMs, tzOffsetMin);
  return h >= 23 || h < 7;
}

/** First local-07:00 instant at or after `fromMs` (the active-sleep wake time). */
export function nextLocalHour(fromMs: number, tzOffsetMin: number, hour: number): number {
  const d = shifted(fromMs, tzOffsetMin);
  const atHour = Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0, 0,
  ) - tzOffsetMin * 60_000;
  if (atHour > fromMs) return atHour;
  return atHour + 24 * 3600_000; // next day
}

export function daysBetween(aMs: number, bMs: number): number {
  return Math.max(0, (bMs - aMs) / (24 * 3600_000));
}
