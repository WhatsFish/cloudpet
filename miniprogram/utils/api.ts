// Thin wrapper over wx.request. Attaches the stored user_id as X-User-Id. Rejects
// on non-2xx with an Error carrying `.statusCode` and `.data` so callers can branch
// (e.g. 404 no_pet → go to quiz; 429 cooldown → show the remaining time).

const BASE_URL = "https://ai-native.japaneast.cloudapp.azure.com/cloudpet/api";

export type ApiError = Error & { statusCode: number; data: unknown };

type RequestOpts = {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  noAuth?: boolean;
};

export function request<T = unknown>(opts: RequestOpts): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opts.noAuth) {
    const uid = wx.getStorageSync("user_id");
    if (uid) headers["X-User-Id"] = uid;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + opts.path,
      method: opts.method ?? "GET",
      header: headers,
      data: opts.body as WechatMiniprogram.RequestOption["data"],
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else {
          const err = new Error(`HTTP ${res.statusCode}`) as ApiError;
          err.statusCode = res.statusCode;
          err.data = res.data;
          reject(err);
        }
      },
      fail: (e) => {
        const err = new Error(e.errMsg) as ApiError;
        err.statusCode = 0;
        err.data = null;
        reject(err);
      },
    });
  });
}
