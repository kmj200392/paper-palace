import { ArrowUpRight, BookOpen, Network, Quote } from "lucide-react";
export function PalaceMap() {
  return (
    <div
      className="palace-illustration"
      aria-label="논문과 아이디어가 연결되는 연구 지도 예시"
    >
      <div className="arch arch-outer" />
      <div className="arch arch-inner" />
      <span className="map-coordinate">A SPACE FOR CONNECTED THINKING</span>
      <svg className="map-lines" viewBox="0 0 600 570" aria-hidden="true">
        <path d="M120 145 Q245 150 295 285 T480 410 M455 120 Q340 160 295 285 T125 435 M120 145 Q270 0 455 120 M125 435 Q310 535 480 410" />
        <circle cx="295" cy="285" r="64" />
        <circle cx="295" cy="285" r="82" className="orbit" />
      </svg>
      <div className="map-center">
        <Network size={25} />
        <span>Your research</span>
      </div>
      <div className="map-paper map-paper-one">
        <span className="tiny-label">01 · THE FOUNDATION</span>
        <BookOpen size={19} />
        <h3>
          A question
          <br />
          worth asking.
        </h3>
        <i />
        <i />
        <span className="paper-category">MOTIVATION</span>
      </div>
      <div className="map-paper map-paper-two">
        <span className="tiny-label">02 · THE CONNECTION</span>
        <h3>
          One idea.
          <br />
          New possibilities.
        </h3>
        <div className="mini-dots">
          <b />
          <b />
          <b />
        </div>
        <span className="paper-category">CORE CONCEPT</span>
      </div>
      <div className="map-paper map-paper-three">
        <span className="tiny-label">03 · YOUR PERSPECTIVE</span>
        <Quote size={19} />
        <h3>
          Make it
          <br />
          part of your thinking.
        </h3>
        <span className="paper-category">NOTES & CONNECTIONS</span>
      </div>
      <div className="map-note">
        <span>
          Something new
          <br />
          starts here.
        </span>
        <ArrowUpRight size={21} />
      </div>
      <span className="map-caption">
        FIG. 01 — IDEAS FIND THEIR PLACE <em>개념 예시</em>
      </span>
    </div>
  );
}
