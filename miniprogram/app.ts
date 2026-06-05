import { ensureUserId } from "./utils/auth";

App({
  onLaunch() {
    ensureUserId().catch((e) => {
      console.error("login failed:", e);
    });
  },
});
