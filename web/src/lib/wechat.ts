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
