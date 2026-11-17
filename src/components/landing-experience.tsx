"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Expand,
  Github,
  MessageSquare,
  Network,
  Scan,
  X,
  ZoomIn,
} from "lucide-react";
import { Brand } from "./brand";
import styles from "./landing-experience.module.css";

const scenes = [
  {
    name: "지식 지도",
    icon: Network,
    image: "/previews/graph.webp",
    title: "한 편의 논문이,\n다음 생각으로.",
    text: "읽었던 논문을 연결하고, 그 사이에서 맥락을 발견하세요. 흩어져 있던 아이디어가 나만의 지도가 됩니다.",
    detail: "짧은 논문 이름 · 방향이 있는 연결 · 자유로운 탐색",
    note: "연결 속에서 다시 떠오르는 아이디어",
    alt: "Paper Palace의 실제 지식 지도 화면. 궁전 내부 배경에 Attention, RAG, ReAct, A-Mem, Mem0, MemRefine 논문이 화살표로 연결되어 있다.",
  },
  {
    name: "원문 읽기",
    icon: BookOpen,
    image: "/previews/reader.webp",
    title: "논문을 읽는 동안,\n이해는 바로 곁에.",
    text: "원본 PDF와 AI 정리를 나란히. 연구 배경부터 결과까지 흐름을 잡고, 근거가 궁금하면 원문으로 돌아가세요.",
    detail: "원본 그림과 수식 · 근거 문장 연결 · 조절 가능한 읽기 공간",
    note: "원문과 설명을 오가지 않아도 되도록",
    alt: "Paper Palace의 실제 읽기 화면. 왼쪽에는 Mem0 원본 PDF, 오른쪽에는 논문의 위치와 연구 배경에 대한 예시 정리가 나란히 표시되어 있다.",
  },
  {
    name: "AI 대화",
    icon: MessageSquare,
    image: "/previews/chat.webp",
    title: "멈칫한 그 문장이,\n질문의 시작.",
    text: "원문에서 문장을 선택해 바로 물어보세요. 논문의 맥락을 따라 대화하고, 남겨 두고 싶은 답변은 나의 메모에 저장하세요.",
    detail: "PDF 문장 인용 · 논문을 참고한 답변 · 직접 남기는 메모",
    note: "선택한 문장이 질문의 맥락으로",
    alt: "Paper Palace의 실제 AI 채팅 화면. Mem0 논문에서 선택한 문장을 인용한 질문과 장기 기억에 관한 예시 답변이 원본 PDF 옆에 표시되어 있다.",
  },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 64);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <header
      className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}
    >
      <Brand />
      <nav aria-label="주 메뉴">
        <a href="#reading">공간 둘러보기</a>
        <a href="#your-library">나의 라이브러리</a>
        <Link className={styles.headerEnter} href="/app/">
          연구 공간 열기 <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}

function ProductScreen({
  active,
  onChange,
  hero = false,
}: {
  active: number;
  onChange: (index: number) => void;
  hero?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const imageArea = useRef<HTMLDivElement>(null);
  const [detailScene, setDetailScene] = useState(active);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    const element = imageArea.current;
    if (!zoomed || !element) return;
    const travel = element.scrollWidth - element.clientWidth;
    element.scrollLeft =
      detailScene === 0 ? travel / 2 : detailScene === 2 ? travel : 0;
    element.scrollTop = 0;
  }, [zoomed, detailScene]);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <div
        className={`${styles.productScreen} ${hero ? styles.heroScreen : ""}`}
      >
        <div className={styles.screenBar}>
          <span className={styles.screenBrand}>
            Paper Palace <span>/</span> 나의 연구 공간
          </span>
          <span className={styles.previewLabel}>
            <span /> 실제 화면 미리보기
          </span>
        </div>
        {hero && (
          <div className={styles.screenTabs} aria-label="소개 화면 선택">
            {scenes.map((scene, index) => (
              <button
                key={scene.name}
                aria-pressed={index === active}
                onClick={() => onChange(index)}
              >
                <scene.icon size={14} aria-hidden="true" />
                {scene.name}
              </button>
            ))}
          </div>
        )}
        <button
          className={styles.screenViewport}
          onClick={() => {
            setDetailScene(active);
            setZoomed(false);
            setOpen(true);
          }}
          aria-label={`${scenes[active].name} 실제 화면 크게 보기`}
          aria-haspopup="dialog"
        >
          {scenes.map((scene, index) => (
            <img
              key={scene.name}
              src={scene.image}
              width="1280"
              height="720"
              alt={scene.alt}
              aria-hidden={index !== active}
              className={`${styles.screenImage} ${index === active ? styles.imageActive : ""}`}
              loading={hero && index === 0 ? "eager" : "lazy"}
              fetchPriority={hero && index === 0 ? "high" : "auto"}
              draggable={false}
            />
          ))}
          <span className={styles.expandHint}>
            <Expand size={14} aria-hidden="true" /> 크게 보기
          </span>
        </button>
        <div className={styles.screenBottom}>
          <span key={active} className={styles.screenNote}>
            <Check size={13} aria-hidden="true" />
            {scenes[active].note}
          </span>
          <span>예시 논문으로 둘러보기</span>
        </div>
      </div>
      <dialog
        ref={dialog}
        className={styles.lightbox}
        aria-label="Paper Palace 실제 화면 미리보기"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (zoomed && (event.target as HTMLElement).dataset.previewPan)
            return;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            setDetailScene(
              (index) =>
                (index + (event.key === "ArrowRight" ? 1 : 2)) % scenes.length,
            );
          }
        }}
      >
        <div className={styles.lightboxBody}>
          <div className={styles.lightboxHeader}>
            <div>
              <strong>{scenes[detailScene].name}</strong>
              <span>실제 서비스 화면 · 예시 논문과 설명</span>
            </div>
            <button
              className={styles.zoomButton}
              onClick={() => setZoomed((value) => !value)}
              aria-label={
                zoomed ? "미리보기 화면에 맞추기" : "미리보기 원본 크기로 확대"
              }
              aria-pressed={zoomed}
            >
              {zoomed ? <Scan size={16} /> : <ZoomIn size={16} />}
              <span>{zoomed ? "화면 맞춤" : "원본 크기"}</span>
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="미리보기 닫기"
              autoFocus
            >
              <X size={23} />
            </button>
          </div>
          <div
            ref={imageArea}
            className={`${styles.lightboxImageArea} ${zoomed ? styles.imageZoomed : ""}`}
            role="region"
            tabIndex={zoomed ? 0 : undefined}
            data-preview-pan="true"
            aria-label="시연 화면"
          >
            {open && (
              <img
                src={scenes[detailScene].image}
                width="1280"
                height="720"
                alt={scenes[detailScene].alt}
              />
            )}
          </div>
          <div className={styles.lightboxFooter}>
            <button
              onClick={() => setDetailScene((index) => (index + 2) % 3)}
              aria-label="이전 시연 화면"
            >
              <ChevronLeft size={18} />
            </button>
            <span aria-live="polite">
              {detailScene + 1} / 3 <span>{scenes[detailScene].name}</span>
            </span>
            <button
              onClick={() => setDetailScene((index) => (index + 1) % 3)}
              aria-label="다음 시연 화면"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function PalaceEntrance() {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const element = root.current;
    if (!element || reduced) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const progress = Math.max(
        0,
        Math.min(1, -rect.top / (rect.height * 0.45)),
      );
      element.style.setProperty("--screen-tilt", `${9 * (1 - progress)}deg`);
      element.style.setProperty("--screen-scale", `${0.94 + 0.06 * progress}`);
      element.style.setProperty(
        "--room-shift",
        `${Math.min(100, Math.max(0, -rect.top * 0.14))}px`,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [reduced]);
  return (
    <section
      ref={root}
      className={styles.entrance}
      aria-labelledby="entrance-title"
    >
      <div className={styles.room} aria-hidden="true" />
      <div className={styles.entranceCopy}>
        <p className={styles.invitation}>
          <span /> 읽고, 연결하고, 오래 기억하는 공간
        </p>
        <h1 id="entrance-title">
          읽은 논문이, <br />
          나의 지식 궁전으로.
        </h1>
        <p className={styles.intro}>
          한 편씩 깊이 읽고, 연결 속에서 다시 발견하세요.
          <br />
          당신의 다음 생각이 시작되는 곳, Paper Palace.
        </p>
        <div className={styles.entranceActions}>
          <Link href="/app/" className={styles.enterButton}>
            나의 궁전 시작하기 <ArrowUpRight size={19} aria-hidden="true" />
          </Link>
          <a href="#reading" className={styles.tourLink}>
            먼저 둘러볼게요 <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
        <p className={styles.assurance}>
          <Github size={14} aria-hidden="true" /> GitHub으로 시작 · 무료
          오픈소스
        </p>
      </div>
      <div
        className={styles.heroProduct}
        onPointerMove={(event) => {
          if (reduced || event.pointerType !== "mouse") return;
          const rect = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty(
            "--pointer-x",
            `${((event.clientX - rect.left) / rect.width - 0.5) * 2}deg`,
          );
          event.currentTarget.style.setProperty(
            "--pointer-y",
            `${-((event.clientY - rect.top) / rect.height - 0.5) * 1.2}deg`,
          );
        }}
        onPointerLeave={(event) => {
          event.currentTarget.style.setProperty("--pointer-x", "0deg");
          event.currentTarget.style.setProperty("--pointer-y", "0deg");
        }}
      >
        <ProductScreen active={active} onChange={setActive} hero />
      </div>
      <div className={styles.scrollCue} aria-hidden="true">
        <span /> 아래로, 생각이 이어지는 방식
      </div>
    </section>
  );
}

export function ProductJourney() {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLElement>(null);
  const manualUntil = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const wide = window.matchMedia(
      "(min-width: 981px) and (min-height: 720px)",
    );
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!wide.matches || reduced) return;
      const rect = element.getBoundingClientRect();
      const progress = Math.max(
        0,
        Math.min(1, -rect.top / Math.max(1, rect.height - window.innerHeight)),
      );
      element.style.setProperty("--tour-progress", String(progress));
      if (Date.now() > manualUntil.current)
        setActive(Math.min(2, Math.floor(progress * 3)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [reduced]);
  const selectScene = (index: number) => {
    setActive(index);
    const element = root.current;
    if (
      !element ||
      reduced ||
      !window.matchMedia("(min-width: 981px) and (min-height: 720px)").matches
    )
      return;
    manualUntil.current = Date.now() + 1200;
    const rect = element.getBoundingClientRect();
    window.scrollTo({
      top:
        rect.top +
        window.scrollY +
        (rect.height - window.innerHeight) * ((index + 0.25) / 3),
      behavior: "smooth",
    });
  };
  return (
    <section
      id="reading"
      className={styles.journey}
      ref={root}
      aria-labelledby="journey-title"
    >
      <div className={styles.journeySticky}>
        <div className={styles.journeyCopy}>
          <p className={styles.journeyLead}>당신의 연구가 흐르는 방식</p>
          <div
            className={styles.chapterCopy}
            key={active}
            aria-live="polite"
            aria-atomic="true"
          >
            <h2 id="journey-title">
              {scenes[active].title.split("\n").map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
            <p>{scenes[active].text}</p>
          </div>
          <div className={styles.chapterNav} aria-label="서비스 둘러보기 단계">
            {scenes.map((scene, index) => (
              <button
                key={scene.name}
                onClick={() => selectScene(index)}
                aria-pressed={active === index}
                aria-controls="journey-screen"
              >
                <span className={styles.chapterNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <scene.icon size={17} aria-hidden="true" />
                <span>{scene.name}</span>
                <ArrowRight
                  size={16}
                  className={styles.chapterArrow}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
          <span className={styles.journeyScrollHint}>
            <ArrowDown size={13} aria-hidden="true" /> 스크롤하거나 단계를 눌러
            둘러보세요
          </span>
        </div>
        <div className={styles.journeyStage} id="journey-screen">
          <ProductScreen active={active} onChange={selectScene} />
          <p className={styles.journeyDetail} key={active}>
            {scenes[active].detail}
          </p>
          <div className={styles.journeyProgress} aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    </section>
  );
}
