// V2 §4 订阅消息（subscribe-message）push — SWITCHABLE STUB.
//
// WeChat 一次性订阅消息 requires: (1) the client calls wx.requestSubscribeMessage to get a per-send
// grant (we record those in sub_grant), and (2) the server sends via POST
// https://api.weixin.qq.com/cgi-bin/message/subscribe/send using an access_token derived from
// WX_APP_ID/WX_APP_SECRET. That platform wiring is enabled by the operator; until then this module
// is a NO-OP that only logs intent, so the rest of §4 (濒危 state + revival) ships and works today.
//
// Enable by setting CLOUDPET_PUSH_ENABLED=1 in the web container env AND filling in sendViaWeChat().
// Throttling/opt-in/grant-consumption are enforced here regardless, so flipping the flag is safe.

import { CRITICAL } from "@/lib/game/constants";

export type CriticalPushInput = {
  openid: string;            // WeChat openid (the subscribe-message touser)
  petName: string;
  subOptIn: boolean;         // app_user.sub_opt_in
  lastReunionGiftMs: number | null; // pet_cooldown.last_reunion_gift — doubles as the push throttle anchor
  nowMs: number;
};

export type CriticalPushResult =
  | { sent: false; reason: "disabled" | "not_opted_in" | "throttled" | "no_openid" }
  | { sent: true };

const enabled = (): boolean => process.env.CLOUDPET_PUSH_ENABLED === "1";

/** Decide-and-(maybe)-send a 濒危 reminder. Pure-ish: callers persist last_reunion_gift on `sent`. */
export async function maybeSendCriticalPush(i: CriticalPushInput): Promise<CriticalPushResult> {
  if (!enabled()) return { sent: false, reason: "disabled" };
  if (!i.subOptIn) return { sent: false, reason: "not_opted_in" };
  if (!i.openid || i.openid.startsWith("anon-")) return { sent: false, reason: "no_openid" };
  const throttleMs = CRITICAL.pushThrottleH * 3600_000;
  if (i.lastReunionGiftMs != null && i.nowMs - i.lastReunionGiftMs < throttleMs) {
    return { sent: false, reason: "throttled" };
  }
  await sendViaWeChat(i.openid, i.petName);
  return { sent: true };
}

// Real send — left unimplemented on purpose (operator enables). Kept here so the call site is final.
async function sendViaWeChat(_openid: string, petName: string): Promise<void> {
  // TODO(operator): fetch access_token (cache ~110min), consume a sub_grant row, POST subscribe/send
  // with a "你的{petName}快撑不住了，回来看看它吧" template. For now: log intent only.
  console.log(`[push:stub] would send 濒危 reminder for pet "${petName}" (CLOUDPET_PUSH_ENABLED=1 but sendViaWeChat is a stub)`);
}
