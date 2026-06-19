// One shared share-card config for the whole app (转发好友 + 朋友圈). Every page's
// onShareAppMessage/onShareTimeline returns this, so the title/cover/path live in ONE place.
// Tapping the shared card opens the 性格测试 directly → new-user funnel.
const TITLE = "我的本命宠也太可爱了吧…来测测你的?";
const COVER = "/assets/share/cover.png";

export function shareAppMessage() {
  return { title: TITLE, path: "/pages/quiz/quiz", imageUrl: COVER };
}

export function shareTimeline() {
  // 朋友圈 has no custom path (always opens the home/entry page).
  return { title: TITLE, imageUrl: COVER };
}
