import { ensureUserId } from "./utils/auth";
import { CLOUD_ENV } from "./utils/api";

App({
  onLaunch() {
    // 微信云托管: init the cloud SDK once so utils/api can callContainer (免备案 entry).
    if (wx.cloud) {
      try { wx.cloud.init({ env: CLOUD_ENV }); } catch (e) { console.log("cloud.init failed", e); }
    }
    ensureUserId().catch((e) => {
      console.error("login failed:", e);
    });
    // Pixel font (Zpix 最像素) loaded globally so the whole UI reads retro. Graceful:
    // if the CDN is unreachable / not whitelisted (体验版 needs the domain in
    // downloadFile 合法域名), it silently falls back to the system stack — text stays
    // readable. In 真机调试 / DevTools "不校验域名" it loads fine.
    try {
      wx.loadFontFace({
        global: true,
        family: "Zpix",
        source: 'url("https://cdn.jsdelivr.net/gh/SolidZORO/zpix-pixel-font/dist/Zpix.ttf")',
        success: () => console.log("Zpix loaded"),
        fail: () => console.log("Zpix unavailable → system font"),
      });
    } catch (e) {
      console.log("loadFontFace unsupported", e);
    }
  },
});
