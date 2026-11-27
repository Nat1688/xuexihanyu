/** Presentation only: Owner's reference artwork, no prototype data or navigation. */
export function CulturalWelcome() {
  return (
    <>
      <div className="cultural-welcome">
        <p className="cultural-eyebrow">你好 · MỖI NGÀY MỘT CHÚT TIẾNG TRUNG</p>
        <h1 className="cultural-title">
          HỌC TIẾNG TRUNG
          <span lang="zh-Hans">学习汉语</span>
        </h1>
        <p className="cultural-intro">Mỗi ngày, hiểu thêm một chút.</p>
      </div>
      <div className="cultural-landmarks" aria-hidden="true" />
    </>
  );
}
