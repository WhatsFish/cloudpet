// Thin request wrapper. Attaches the stored user_id as X-User-Id. Rejects on non-2xx with
// an Error carrying `.statusCode` and `.data` so callers can branch (404 no_pet → quiz, etc).
//
// Transport: by default goes through 微信云托管 (wx.cloud.callContainer) so the client needs
// NO ICP-备案 domain — the `cloudpet` 云托管 service is an nginx reverse-proxy that forwards
// to the Azure backend (see cloudrun/). Flip USE_CLOUD=false to hit Azure directly via
// wx.request (only works in DevTools / 真机调试 with "不校验合法域名"; fails on 体验版/正式版).

const USE_CLOUD = true;
export const CLOUD_ENV = "prod-d6g98vvjd567ac415"; // 云托管 环境ID
export const CLOUD_SERVICE = "cloudpet"; // 云托管 服务名
const BASE_URL = "https://ai-native.japaneast.cloudapp.azure.com/cloudpet/api"; // direct (fallback)

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
  const method = opts.method ?? "GET";

  return new Promise((resolve, reject) => {
    const settle = (statusCode: number, data: unknown) => {
      if (statusCode >= 200 && statusCode < 300) {
        resolve(data as T);
      } else {
        const err = new Error(`HTTP ${statusCode}`) as ApiError;
        err.statusCode = statusCode;
        err.data = data;
        reject(err);
      }
    };
    const failNet = (msg: string) => {
      const err = new Error(msg) as ApiError;
      err.statusCode = 0;
      err.data = null;
      reject(err);
    };

    if (USE_CLOUD) {
      // 云托管: routed by WeChat's gateway via env + X-WX-SERVICE. nginx maps "/<path>"
      // -> "https://<azure>/cloudpet/api/<path>".
      (wx.cloud as unknown as { callContainer: (o: unknown) => void }).callContainer({
        config: { env: CLOUD_ENV },
        path: opts.path,
        method,
        header: { ...headers, "X-WX-SERVICE": CLOUD_SERVICE },
        data: opts.body,
        success: (res: { statusCode: number; data: unknown }) => settle(res.statusCode, res.data),
        fail: (e: { errMsg?: string }) => failNet(e.errMsg || "callContainer failed"),
      });
    } else {
      wx.request({
        url: BASE_URL + opts.path,
        method,
        header: headers,
        data: opts.body as WechatMiniprogram.RequestOption["data"],
        success: (res) => settle(res.statusCode, res.data),
        fail: (e) => failNet(e.errMsg),
      });
    }
  });
}
