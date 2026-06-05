import { NextRequest } from "next/server";

export function getUserId(req: NextRequest): string | null {
  const id = req.headers.get("x-user-id");
  if (!id || id.length < 6 || id.length > 128) return null;
  // Only alphanumeric / hyphen / underscore so the value is safe to log and to
  // pass to parameterized queries. (openid + our anon-<uuid> both satisfy this.)
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}
