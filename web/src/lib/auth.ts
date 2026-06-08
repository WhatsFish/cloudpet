import { NextRequest } from "next/server";

const VALID = /^[A-Za-z0-9_-]+$/;

function ok(id: string | null): id is string {
  // Only alphanumeric / hyphen / underscore so the value is safe to log and to pass to
  // parameterized queries. (openid + our anon-<uuid> both satisfy this.)
  return !!id && id.length >= 6 && id.length <= 128 && VALID.test(id);
}

/**
 * Resolve the caller's identity.
 *
 * The mini-program reaches us through 微信云托管, whose gateway authenticates wx.login and
 * injects `X-WX-OPENID` AFTER authentication — the client cannot forge or remove it. So when
 * that header is present it is the AUTHORITATIVE identity and we trust it over the client-set
 * `X-User-Id`. This closes the IDOR where a client could send any other user's openid in
 * `X-User-Id` and read/mutate their pet: once real openids are in use, the gateway header wins.
 *
 * `X-User-Id` remains the identity only for the dev / direct path (DevTools or 真机调试 hitting
 * Azure with "不校验合法域名", where no gateway header exists) and for the anon-<uuid> users that
 * predate openid login — there the id is a server-minted random UUID (a bearer secret), not an
 * enumerable openid, so trusting the header is acceptable.
 */
export function getUserId(req: NextRequest): string | null {
  const gw = req.headers.get("x-wx-openid");
  if (ok(gw)) return gw; // gateway-authenticated, unforgeable

  const id = req.headers.get("x-user-id");
  if (ok(id)) return id; // dev/direct + legacy anon fallback
  return null;
}
