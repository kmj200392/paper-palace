"use client";

import { useState } from "react";
import { PalaceCourtyard, PaperPortal } from "./palace-architecture";
import {
  ArrowUpRight,
  BookOpen,
  Network,
  Check,
  ChevronRight,
} from "lucide-react";

const ideas = [
  {
    name: "Attention",
    year: "2017",
    title: "Attention Is All You Need",
    topic: "문맥을 이해하는 출발점",
    text: "단어 사이의 관계를 직접 계산하는 어텐션. 이후의 언어 모델을 이해하는 데 바탕이 되는 아이디어입니다.",
  },
  {
    name: "Mem0",
    year: "2025",
    title: "Building Production-Ready AI Agents with Scalable Long-Term Memory",
    topic: "대화를 넘어 이어지는 기억",
    text: "대화에서 중요한 정보를 골라 기억하고, 다음 질문에 필요한 순간 다시 꺼내 쓰는 방법을 살펴봅니다.",
  },
  {
    name: "A-Mem",
    year: "2025",
    title: "Agentic Memory for LLM Agents",
    topic: "서로 연결되는 에이전트의 기억",
    text: "기억을 개별 기록으로만 남기지 않고, 관련된 기억 사이에 연결을 만드는 접근입니다.",
  },
];

export function ResearchPreview() {
  const [active, setActive] = useState(1);
  const idea = ideas[active];
  return (
    <div className="research-preview">
      <div className="folio-topline">
        <span>
          <Network size={15} aria-hidden="true" /> 생각이 머무는 궁전
        </span>
        <span>미리보기</span>
      </div>
      <div className="folio-map">
        <PalaceCourtyard />
        <svg
          viewBox="0 0 880 660"
          className="entrance-paths"
          aria-hidden="true"
        >
          <path d="M280 355Q425 285 575 345M575 345Q570 440 440 470M280 355Q280 445 440 470" />
        </svg>
        {ideas.map((item, index) => (
          <button
            key={item.name}
            className={`folio-node folio-node-${index} ${active === index ? "selected" : ""}`}
            aria-pressed={active === index}
            onClick={() => setActive(index)}
          >
            <PaperPortal />
            <span>{item.name}</span>
            <small>{item.year}</small>
          </button>
        ))}
      </div>
      <div className="folio-paper" key={idea.name} aria-live="polite">
        <div className="folio-paper-meta">
          <span>{idea.name}</span>
          <span>
            {idea.year} <Check size={12} aria-hidden="true" />
          </span>
        </div>
        <h3>{idea.title}</h3>
        <p className="folio-topic">{idea.topic}</p>
        <p>{idea.text}</p>
        <div className="folio-paper-bottom">
          <span>논문과 연결을 눌러 살펴보세요</span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </div>
      </div>
      <p className="folio-caption">설명을 위한 논문·연결 예시</p>
    </div>
  );
}

const chapters = [
  {
    title: "연구 배경",
    en: "Motivation",
    label: "왜 이 문제를 풀었을까?",
    summary:
      "문장을 순서대로 처리하면 앞선 계산이 끝날 때까지 기다려야 합니다. Transformer는 이런 순차 처리의 제약을 줄이는 데서 출발합니다.",
    source: "Sequence modeling without recurrence",
    focus: 0,
  },
  {
    title: "핵심 아이디어",
    en: "Core concept",
    label: "무엇이 다른 접근일까?",
    summary:
      "각 단어가 다른 단어와 얼마나 관련 있는지 계산합니다. 여러 어텐션 헤드가 서로 다른 관계를 함께 살펴봅니다.",
    source: "Multi-head attention",
    focus: 1,
  },
  {
    title: "방법",
    en: "Method",
    label: "아이디어를 어떻게 구현했을까?",
    summary:
      "어텐션과 피드포워드 층을 쌓고, 위치 정보를 더합니다. 인코더와 디코더가 입력 문장과 출력 문장 사이의 관계를 학습합니다.",
    source: "The Transformer architecture",
    focus: 2,
  },
  {
    title: "실험 설정",
    en: "Experiments",
    label: "무엇과 비교했을까?",
    summary:
      "영어–독일어, 영어–프랑스어 번역 과제로 성능을 평가합니다. 기존 모델과 번역 품질, 학습에 필요한 계산량을 비교합니다.",
    source: "Machine translation evaluation",
    focus: 3,
  },
  {
    title: "결과와 한계",
    en: "Results",
    label: "무엇을 기억해야 할까?",
    summary:
      "번역 성능과 학습 효율을 함께 개선했습니다. 논문의 결과가 어떤 데이터와 조건에서 나왔는지 원문과 나란히 확인할 수 있습니다.",
    source: "Translation quality and training cost",
    focus: 4,
  },
];

export function ReadingPreview() {
  const [active, setActive] = useState(1);
  const chapter = chapters[active];
  return (
    <div className="reading-exhibit">
      <div className="exhibit-bar">
        <span>
          <BookOpen size={16} aria-hidden="true" /> Attention Is All You Need
        </span>
        <span>읽기 화면 예시</span>
      </div>
      <div className="exhibit-body">
        <div className="exhibit-document" aria-label="원문 구성 예시">
          <div className="exhibit-page">
            <span className="manuscript-category">
              Neural information processing
            </span>
            <h3>
              Attention Is
              <br />
              All You Need
            </h3>
            <p className="manuscript-authors">Vaswani et al. / 2017</p>
            <div className="manuscript-rule" />
            <h4>{chapter.en}</h4>
            <p>
              문장을 순서대로 처리하는 방법에서 벗어나,
              <br />
              단어 사이의 관계에 집중합니다.
            </p>
            <div className="manuscript-lines" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="manuscript-highlight" key={active}>
              <span>{chapter.source}</span>
              <small>해설과 연결된 원문 위치</small>
            </div>
            <div className="manuscript-diagram" aria-hidden="true">
              <span>Query</span>
              <span>Attention</span>
              <span>Output</span>
            </div>
            <div className="manuscript-lines" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <span className="manuscript-page-number">1</span>
          </div>
        </div>
        <div className="exhibit-companion">
          <div className="exhibit-companion-title">
            <span>논문 정리</span>
            <span>원문과 함께 읽기</span>
          </div>
          <div className="exhibit-chapters" aria-label="해설 주제 선택">
            {chapters.map((item, index) => (
              <button
                key={item.en}
                aria-pressed={active === index}
                onClick={() => setActive(index)}
                className={active === index ? "active" : ""}
              >
                <span>{item.title}</span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="exhibit-explanation" key={active} aria-live="polite">
            <h3>{chapter.label}</h3>
            <p>{chapter.summary}</p>
            <span className="exhibit-citation">
              <BookOpen size={14} aria-hidden="true" /> 왼쪽 원문에서 함께 확인
            </span>
          </div>
          <p className="exhibit-note">
            정리 항목을 눌러 읽는 방식을 살펴보세요.
          </p>
        </div>
      </div>
    </div>
  );
}
