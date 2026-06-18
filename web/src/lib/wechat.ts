// Exchange a wx.login() code for an openid via WeChat's jscode2session API.
// Returns null if AppID / AppSecret are not configured (dev / pre-registration
// mode — caller should fall back to anonymous user).

type Jscode2sessionOk = { openid: string; session_key: string; unionid?: string };
type Jscode2sessionErr = { errcode: number; errmsg: string };

export async function exchangeCodeForOpenid(code: string): Promise<string | null> {
  const appid = process.env.WX_APP_ID;
  const secret = process.env.WX_APP_SECRET;
  if (!appid || !secret) return null;

  const url =
    `https://api.weixin.qq.com/sns/jscode2session` +
    `?appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`jscode2session HTTP ${res.status}`);
  const body = (await res.json()) as Jscode2sessionOk | Jscode2sessionErr;
  if ("errcode" in body && body.errcode !== 0) {
    throw new Error(`jscode2session ${body.errcode}: ${body.errmsg}`);
  }
  if (!("openid" in body)) throw new Error("jscode2session: missing openid");
  return body.openid;
}

// ── 内容安全(WeChat 审核要求:存储/展示的用户文本必须过 msgSecCheck)─────────────
// access_token via the stable_token endpoint (doesn't invalidate other holders,
// safe across restarts), cached in-process until ~5 min before expiry.
let _tokenCache: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string | null> {
  const appid = process.env.WX_APP_ID;
  const secret = process.env.WX_APP_SECRET;
  if (!appid || !secret) return null; // secret not configured (dev) → caller fail-opens

  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now) return _tokenCache.token;

  const res = await fetch("https://api.weixin.qq.com/cgi-bin/stable_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credential", appid, secret }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`stable_token HTTP ${res.status}`);
  const body = (await res.json()) as {
    access_token?: string; expires_in?: number; errcode?: number; errmsg?: string;
  };
  if (!body.access_token) throw new Error(`stable_token ${body.errcode}: ${body.errmsg}`);
  _tokenCache = { token: body.access_token, expiresAt: now + (body.expires_in ?? 7200) * 1000 - 5 * 60_000 };
  return body.access_token;
}

export type SecCheckResult = { ok: boolean; reason?: string };

/**
 * Content-safety check for user-entered text (pet names) via wxa/msg_sec_check v2.
 * FAIL-OPEN: if the secret isn't set, the token can't be fetched, the openid is
 * anonymous/dev, or the API errors transiently, we ALLOW (+ log) so a WeChat-side
 * hiccup never blocks a legitimate rename. Only a definitive non-'pass' verdict
 * (or the 87014 content-hit errcode) blocks. scene=1 = 资料/昵称.
 */
export async function checkTextSec(content: string, openid: string): Promise<SecCheckResult> {
  const REJECT = { ok: false, reason: "这个名字可能不太合适，换一个试试吧～" };
  try {
    if (openid.startsWith("anon-")) return { ok: true }; // not a real openid → skip
    const token = await getAccessToken();
    if (!token) return { ok: true }; // secret unset (dev) → don't block

    const res = await fetch(`https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 2, openid, scene: 1, content }),
      cache: "no-store",
    });
    if (!res.ok) { console.error(`msg_sec_check HTTP ${res.status}`); return { ok: true }; }
    const body = (await res.json()) as {
      errcode?: number; errmsg?: string;
      result?: { suggest?: "pass" | "review" | "risky"; label?: number };
    };
    if (body.errcode && body.errcode !== 0) {
      if (body.errcode === 87014) return REJECT; // 内容命中安全策略
      // 40001 token失效 / 61010 openid非近2h访问 / 限频 等 = 调用问题,非内容问题 → fail-open
      console.error(`msg_sec_check errcode ${body.errcode}: ${body.errmsg}`);
      return { ok: true };
    }
    const suggest = body.result?.suggest;
    return suggest === "risky" || suggest === "review" ? REJECT : { ok: true };
  } catch (e) {
    console.error("checkTextSec failed, allowing:", e instanceof Error ? e.message : e);
    return { ok: true };
  }
}
