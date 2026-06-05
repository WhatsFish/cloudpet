import { request } from "./api";

type LoginResp = { user_id: string; is_anonymous: boolean };

// Ensures a server-issued user_id is stored locally. Called once at launch (and
// defensively before authed calls). Sends the device tz offset (minutes east of
// UTC) so the server can validate it for daily/sleep windows. If wx.login fails
// (e.g. DevTools without an AppID) the server falls back to an anonymous id.

export async function ensureUserId(): Promise<string> {
  const existing = wx.getStorageSync("user_id");
  if (existing) return existing;

  let code = "";
  try {
    code = await new Promise<string>((resolve, reject) => {
      wx.login({
        success: (r) => (r.code ? resolve(r.code) : reject(new Error("no code"))),
        fail: (e) => reject(new Error(e.errMsg)),
      });
    });
  } catch {
    code = "";
  }

  const tzOffsetMinutes = -new Date().getTimezoneOffset(); // east of UTC is positive

  const resp = await request<LoginResp>({
    path: "/login",
    method: "POST",
    body: code ? { code, tz_offset_minutes: tzOffsetMinutes } : { tz_offset_minutes: tzOffsetMinutes },
    noAuth: true,
  });

  wx.setStorageSync("user_id", resp.user_id);
  wx.setStorageSync("is_anonymous", resp.is_anonymous);
  return resp.user_id;
}
