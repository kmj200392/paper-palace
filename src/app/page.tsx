import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Github,
  Plus,
  BookOpen,
  Network,
  MessageSquare,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { MakerCredit } from "@/components/maker-credit";
import { ResearchPreview, ReadingPreview } from "@/components/research-preview";

export default function Home() {
  return (
    <div className="palace-site">
      <header className="palace-header">
        <Brand />
        <nav aria-label="주 메뉴">
          <a href="#reading">읽는 방식</a>
          <a href="#your-library">나의 라이브러리</a>
          <Link className="button primary small" href="/app/">
            연구 공간 열기 <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </header>
      <main id="main">
        <section className="palace-hero">
          <div className="palace-hero-copy">
            <p className="hero-invitation">
              <span aria-hidden="true" /> 논문을 위한 나만의 서재
            </p>
            <h1>
              읽은 논문이
              <br />
              다음 생각으로
              <br />
              이어지는 곳.
            </h1>
            <p className="palace-intro">
              논문을 읽고, 질문하고, 서로 연결하세요.
              <br />
              흩어져 있던 지식이 나의 연구 지도가 됩니다.
            </p>
            <Link className="button primary hero-enter" href="/app/">
              나의 연구 공간 열기 <ArrowUpRight size={19} aria-hidden="true" />
            </Link>
            <p className="hero-assurance">
              <Github size={15} aria-hidden="true" /> GitHub으로 시작하는 무료
              연구 공간
            </p>
          </div>
          <ResearchPreview />
        </section>
        <div className="palace-principle">
          <span>Read. Connect. Remember.</span>
          <p>기억해야 할 논문보다, 이어갈 생각이 더 많아지도록.</p>
        </div>
        <section className="palace-reading" id="reading">
          <div className="palace-section-heading">
            <h2>
              원문 곁에,
              <br />
              이해를 돕는 한 페이지.
            </h2>
            <p>
              연구 배경부터 실험 결과까지 맥락을 잡고,
              <br />
              궁금한 문장은 바로 질문하세요.
              <br />
              그림과 수식은 원본 PDF 그대로 읽습니다.
            </p>
          </div>
          <ReadingPreview />
          <div className="reading-annotations">
            <p>
              <BookOpen size={18} aria-hidden="true" />
              <span>
                <strong>근거를 따라 읽기</strong>정리에서 원문의 해당 위치로
              </span>
            </p>
            <p>
              <MessageSquare size={18} aria-hidden="true" />
              <span>
                <strong>문장에서 시작하는 질문</strong>PDF를 드래그해 AI에게
                물어보기
              </span>
            </p>
            <p>
              <Network size={18} aria-hidden="true" />
              <span>
                <strong>논문 너머의 연결</strong>내 그래프에서 다음 논문
                발견하기
              </span>
            </p>
          </div>
        </section>
        <section className="palace-ownership" id="your-library">
          <div className="ownership-mark" aria-hidden="true">
            <svg viewBox="240 200 850 750">
              <image
                href="/brand/paper-palace.png"
                width="1254"
                height="1254"
              />
            </svg>
          </div>
          <div className="ownership-copy">
            <h2>
              오래 쌓을 지식은,
              <br />
              내가 가진 공간에.
            </h2>
            <p>
              논문, 요약, 메모와 연결은 나의 비공개 GitHub 저장소에 보관합니다.
              기기가 달라져도 같은 서재에서 이어 읽고, 필요하면 언제든 꺼내
              가져갈 수 있어요.
            </p>
            <a
              href="https://github.com/kmj200392/paper-palace"
              target="_blank"
              rel="noopener noreferrer"
              className="ownership-link"
            >
              <Github size={17} aria-hidden="true" /> 오픈소스 살펴보기{" "}
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
          <dl className="ownership-facts">
            <div>
              <dt>나의 저장소</dt>
              <dd>GitHub 비공개 저장소에 자동 저장</dd>
            </div>
            <div>
              <dt>바로 쓰는 AI</dt>
              <dd>개인 API 키 없이 정리와 채팅</dd>
            </div>
            <div>
              <dt>자유로운 이동</dt>
              <dd>JSON 가져오기와 내보내기</dd>
            </div>
          </dl>
        </section>
        <section className="palace-faq">
          <div>
            <h2>궁금할 수 있는 것들.</h2>
            <p>가볍게 시작해서, 오래 쓸 수 있도록.</p>
          </div>
          <div>
            {[
              [
                "무료로 사용할 수 있나요?",
                "네. Paper Palace는 무료 오픈소스 서비스입니다. AI 기능도 별도의 API 키 없이 사용할 수 있어요. 안정적인 운영을 위해 짧은 시간에 많은 요청을 보내면 일시적으로 제한될 수 있습니다.",
              ],
              [
                "어떤 논문을 추가할 수 있나요?",
                "현재 arXiv 논문 링크를 지원합니다. 링크를 추가한 뒤 원본 PDF와 정리를 함께 읽을 수 있어요.",
              ],
              [
                "GitHub 계정이 필요한가요?",
                "네. GitHub으로 로그인하고 비공개 저장소를 연결하면 연구 공간을 사용할 수 있습니다. 논문과 메모는 선택한 저장소에 자동으로 저장됩니다.",
              ],
              [
                "AI 답변과 대화는 어떻게 다뤄지나요?",
                "AI가 제시한 근거 문구를 원문에서 확인할 수 있습니다. 답변에는 오류가 있을 수 있으니 원문과 함께 읽어 주세요. 채팅은 논문을 닫으면 사라지고, 직접 메모에 저장한 답변만 남습니다.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={18} aria-hidden="true" />
                </summary>
                <div>
                  <p>{a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
        <section className="palace-invite">
          <div>
            <p>한 편의 논문에서 시작해 보세요.</p>
            <h2>다음 생각이 기다리는 서재.</h2>
          </div>
          <Link className="button primary" href="/app/">
            연구 공간으로 이동 <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="palace-footer">
        <Brand />
        <p>Read. Connect. Remember.</p>
        <div>
          <Link href="/privacy/">개인정보 안내</Link>
          <MakerCredit />
        </div>
      </footer>
    </div>
  );
}
