import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  GitBranch,
  KeyRound,
  Check,
  Plus,
  MoveUpRight,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { PalaceMap } from "@/components/palace-map";
export default function Home() {
  return (
    <>
      <header className="site-header">
        <Brand />
        <nav aria-label="주 메뉴">
          <a href="#how-it-works">어떻게 쓰나요</a>
          <a href="#your-library">나만의 라이브러리</a>
          <Link className="nav-cta" href="/app/">
            서비스로 이동하기 <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main id="main">
        <section className="hero section-shell">
          <div className="hero-copy">
            <p className="eyebrow">
              <span /> A PALACE FOR YOUR PAPERS
            </p>
            <h1>
              Read.
              <br />
              Connect.
              <br />
              <em>Remember.</em>
            </h1>
            <h2>
              읽은 논문이,
              <br />
              쌓이는 지식이 되도록.
            </h2>
            <p className="hero-description">
              흩어진 논문 사이에서 생각의 연결을 발견하세요.
              <br className="desktop-break" /> Paper Palace는 읽은 논문을
              연결해,
              <br className="desktop-break" /> 나만의 연구 지도로 기억하는
              공간입니다.
            </p>
            <Link className="button primary" href="/app/">
              나의 연구 공간 열기 <ArrowUpRight size={18} />
            </Link>
            <p className="hero-footnote">
              무료 오픈소스 · 나의 폴더와 GitHub에 저장 · 나의 AI로 읽기
            </p>
          </div>
          <PalaceMap />
        </section>
        <div className="manifesto-strip">
          <span>LESS COLLECTING.</span>
          <i>More connecting.</i>
          <span>논문을 모으는 곳에서, 생각을 연결하는 곳으로.</span>
          <span className="strip-symbol">✳</span>
        </div>
        <section className="section-shell story-section" id="how-it-works">
          <div className="section-intro">
            <p className="eyebrow">01 / READ WITH CONTEXT</p>
            <h2>
              다 읽기 전에,
              <br />
              <em>먼저 이해하세요.</em>
            </h2>
            <p>
              왜 시작했는지, 무엇을 제안하는지, 어떻게 검증했는지.
              <br />
              논문 한 편을 다섯 개의 질문으로 펼쳐 보세요.
            </p>
          </div>
          <div className="reading-preview">
            <div className="preview-toolbar">
              <span>
                <BookOpen size={15} /> Paper reader
              </span>
              <span className="preview-label">화면 구성 예시</span>
              <span className="window-dots">● ● ●</span>
            </div>
            <div className="preview-columns">
              <div className="preview-original">
                <span className="tiny-label">ORIGINAL PAPER</span>
                <h3>
                  A new perspective
                  <br />
                  on a familiar problem
                </h3>
                <span className="mock-authors">
                  The research, in its own words.
                </span>
                <h4>1. Introduction</h4>
                <div className="text-lines">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="source-highlight">
                  요약 속 근거를 누르면
                  <br />
                  원문의 해당 부분으로 이동합니다.
                </div>
                <div className="text-lines">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="preview-summary">
                <span className="tiny-label">YOUR READING COMPANION</span>
                {[
                  ["01", "Motivation", "어떤 문제에서 출발했나요?"],
                  ["02", "Core concept", "핵심 아이디어는 무엇인가요?"],
                  ["03", "Method", "어떤 방법으로 풀었나요?"],
                  ["04", "Experimental setup", "어떤 조건에서 검증했나요?"],
                  ["05", "Results", "무엇을 얻었고, 무엇이 남았나요?"],
                ].map(([n, en, ko]) => (
                  <div className="summary-line" key={n}>
                    <span>{n}</span>
                    <div>
                      <h4>{en}</h4>
                      <p>{ko}</p>
                    </div>
                    <MoveUpRight size={14} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="section-shell connection-section">
          <div className="connection-art" aria-hidden="true">
            <div className="idea-node idea-one">
              Paper A<small>the foundation</small>
            </div>
            <div className="idea-node idea-two">
              Paper B<small>a different approach</small>
            </div>
            <div className="idea-node idea-three">
              Your next idea<small>a connection you noticed</small>
            </div>
            <svg viewBox="0 0 500 320">
              <path d="M130 75 Q235 60 350 135 M130 75 Q180 240 240 245 M350 135 Q350 250 240 245" />
            </svg>
            <span className="relation-label">builds on</span>
            <span className="relation-label second">inspires</span>
          </div>
          <div className="section-intro">
            <p className="eyebrow">02 / CONNECT THE IDEAS</p>
            <h2>
              논문 사이에,
              <br />
              <em>나의 관점이 생깁니다.</em>
            </h2>
            <p>
              같은 질문, 다른 방법, 이어지는 발견.
              <br />
              논문 간의 관계를 직접 연결하고 메모하세요.
              <br />
              AI와 태그로 발견한 연결 후보를 검토하고 지도에 더하세요.
            </p>
            <Link href="/app/" className="text-link">
              지식 지도 만들기 <ArrowRight size={17} />
            </Link>
          </div>
        </section>
        <section className="ownership-section" id="your-library">
          <div className="section-shell">
            <div className="section-intro">
              <p className="eyebrow">03 / KEEP IT YOURS</p>
              <h2>
                오래 쌓을 지식이니까.
                <br />
                <em>온전히, 나의 것으로.</em>
              </h2>
            </div>
            <div className="ownership-columns">
              <article>
                <GitBranch size={24} />
                <h3>Your papers. Your space.</h3>
                <p>
                  논문 목록, 요약, 메모와 연결을 나의 로컬 폴더나 비공개 GitHub
                  저장소에 보관하세요. 둘을 함께 연결하고, 다른 기기에서도
                  이어갈 수 있어요.
                </p>
              </article>
              <article>
                <KeyRound size={24} />
                <h3>Your key. Your choice.</h3>
                <p>
                  나의 OpenAI 또는 Claude API 키로 분석하세요. 키는 열려 있는
                  탭에서만 유지되며, AI 이용 요금은 해당 제공자에서 부과됩니다.
                </p>
              </article>
              <article>
                <BookOpen size={24} />
                <h3>Open by design.</h3>
                <p>
                  서비스 코드와 논문 읽기 Skill을 공개합니다. 웹에서도, 나의
                  에이전트에서도 같은 형식으로 생각을 이어가세요.
                </p>
              </article>
            </div>
          </div>
        </section>
        <section className="section-shell faq-section">
          <div>
            <p className="eyebrow">A FEW THINGS TO KNOW</p>
            <h2>시작하기 전에.</h2>
          </div>
          <div>
            {[
              [
                "무료로 사용할 수 있나요?",
                "Paper Palace는 무료 오픈소스 서비스입니다. 논문 저장·읽기·연결은 무료이며, AI 분석 비용은 본인의 API 계정에 부과됩니다. 호스팅과 GitHub의 무료 사용 한도 내에서 운영합니다.",
              ],
              [
                "ChatGPT나 Claude 구독 계정을 연결하나요?",
                "현재는 API 키를 입력하는 방식입니다. ChatGPT·Claude 구독과 API 사용료는 별개입니다. 구독 계정 로그인을 통한 AI 이용은 제공하지 않습니다.",
              ],
              [
                "원문과 요약은 어떻게 연결되나요?",
                "arXiv HTML 또는 PDF에서 원문을 읽고, AI가 제시한 인용 문구가 추출된 본문에 있는지 검증합니다. 확인된 근거를 누르면 해당 본문으로 이동합니다. PDF는 페이지도 함께 확인할 수 있어요.",
              ],
              [
                "로그인하지 않고도 쓸 수 있나요?",
                "로그인 없이 브라우저에 저장하거나 지원되는 브라우저에서 로컬 폴더를 연결할 수 있어요. 나중에 GitHub을 연결해 현재 자료를 동기화할 수도 있고, GitHub을 먼저 쓰다가 폴더를 추가할 수도 있어요. 폴더 연결을 지원하지 않는 브라우저에서는 JSON 내보내기도 사용할 수 있어요.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing section-shell">
          <span className="closing-arch" />
          <p className="eyebrow">YOUR NEXT PAPER HAS A PLACE.</p>
          <h2>
            한 편의 논문에서,
            <br />
            <em>나만의 Palace로.</em>
          </h2>
          <Link href="/app/" className="button primary">
            서비스로 이동하기 <ArrowUpRight size={19} />
          </Link>
          <span className="closing-note">
            <Check size={14} /> 지금, 첫 번째 논문을 놓아 보세요.
          </span>
        </section>
      </main>
      <footer className="site-footer">
        <Brand compact />
        <p>Made for curious minds.</p>
        <div>
          <a
            href="https://github.com/kmj200392/paper-palace"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <ArrowUpRight size={13} />
          </a>
          <Link href="/privacy/">개인정보 안내</Link>
          <span>© 2026 Paper Palace</span>
        </div>
      </footer>
    </>
  );
}
