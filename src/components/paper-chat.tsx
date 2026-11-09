"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  LoaderCircle,
  MessageCircle,
  Plus,
  Quote,
  Square,
  StickyNote,
  X,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { hasAIConnection, type AISettings } from "@/lib/ai-settings";
import {
  chatAnswerSchema,
  chatContext,
  chatHistory,
  verifiedChatAnswer,
  type ChatMessage,
  type ChatQuote,
} from "@/lib/paper-chat";
import type { Citation, Source } from "@/lib/model";

type Turn = ChatMessage & { citations?: Citation[] };
export function PaperChat({
  title,
  source,
  sourceError,
  settings,
  visible,
  selection,
  onCitation,
  openSettings,
  onSaveNote,
}: {
  title: string;
  source: Source | null;
  sourceError: string;
  settings: AISettings;
  visible: boolean;
  selection: (ChatQuote & { request: number }) | null;
  onCitation: (citation: Citation) => void;
  openSettings: () => void;
  onSaveNote: (text: string) => void;
}) {
  const [messages, setMessages] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState<ChatQuote | null>(null);
  const [pending, setPending] = useState<ChatMessage | null>(null);
  const [error, setError] = useState("");
  const [partial, setPartial] = useState(false);
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  useEffect(() => {
    if (selection) {
      setQuote({ text: selection.text, page: selection.page });
      setError("");
    }
  }, [selection]);
  useEffect(() => {
    if (visible && selection) input.current?.focus();
  }, [visible, selection]);
  useEffect(() => {
    if (visible) end.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, visible]);
  async function send() {
    if (request.current) return;
    if (!hasAIConnection(settings)) {
      openSettings();
      return;
    }
    if (!source || (!draft.trim() && !quote)) return;
    const next: ChatMessage = {
      role: "user",
      content: draft.trim() || "선택한 문장을 문맥과 함께 설명해 줘.",
      ...(quote ? { quote } : {}),
    };
    const history = chatHistory(
      messages.map(({ role, content, quote }) => ({
        role,
        content,
        ...(quote ? { quote } : {}),
      })),
      next,
    );
    const recentQuestions = history
      .filter((message) => message.role === "user")
      .slice(-3);
    const context = chatContext(source.blocks, {
      ...next,
      content: recentQuestions.map((message) => message.content).join("\n"),
      quote:
        next.quote ||
        recentQuestions.findLast((message) => message.quote)?.quote,
    });
    const controller = new AbortController();
    request.current = controller;
    setPending(next);
    setError("");
    setDraft("");
    setQuote(null);
    setPartial(!context.contextComplete);
    try {
      const result = await api<unknown>("/chat", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          ...settings,
          title,
          ...context,
          messages: history,
        }),
      });
      if (request.current !== controller || controller.signal.aborted) return;
      const answer = verifiedChatAnswer(
        chatAnswerSchema.parse(result),
        context.blocks,
      );
      setMessages((previous) => [
        ...previous,
        next,
        {
          role: "assistant",
          content: answer.answer,
          citations: answer.citations,
        },
      ]);
    } catch (cause) {
      if (request.current !== controller) return;
      setDraft((value) => value || next.content);
      setQuote((value) => value || next.quote || null);
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "답변을 받지 못했어요. 다시 시도해 주세요.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(null);
      }
    }
  }
  const visibleMessages: Turn[] = [...messages, ...(pending ? [pending] : [])];
  return (
    <div className="paper-chat">
      <div className="chat-context-bar">
        <span title={settings.model}>{settings.model}</span>
        <button
          className="text-button"
          disabled={!!pending || !messages.length}
          onClick={() => {
            setMessages([]);
            setError("");
            setPartial(false);
            input.current?.focus();
          }}
        >
          <Plus size={13} /> 새 대화
        </button>
      </div>
      <div
        className="chat-messages"
        role="log"
        aria-label="논문 AI 대화"
        aria-live="polite"
        aria-busy={!!pending}
      >
        {!messages.length && !pending && (
          <div className="chat-empty">
            <MessageCircle size={25} />
            <h3>읽다가 궁금한 순간에.</h3>
            <p>
              논문에 대해 질문하거나, PDF에서 문장을 드래그해 AI에게 물어보세요.
            </p>
            <div className="chat-starters">
              {[
                "이 논문의 핵심 아이디어를 쉽게 설명해 줘",
                "기존 방법과 무엇이 다른지 비교해 줘",
                "실험 결과와 한계를 짚어 줘",
              ].map((text) => (
                <button
                  key={text}
                  onClick={() => {
                    setDraft(text);
                    input.current?.focus();
                  }}
                >
                  {text}
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          </div>
        )}
        {visibleMessages.map((message, index) => (
          <article key={index} className={`chat-message ${message.role}`}>
            <span className="chat-role">
              {message.role === "user" ? "나" : "Paper Palace"}
            </span>
            {message.quote && (
              <blockquote>
                <small>PDF {message.quote.page}쪽</small>
                {message.quote.text}
              </blockquote>
            )}
            {message.role === "user" ? (
              <p className="chat-user-text">{message.content}</p>
            ) : (
              <div className="chat-markdown">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  skipHtml
                  components={{
                    img: () => null,
                    a: ({ children }) => <span>{children}</span>,
                  }}
                >
                  {message.content}
                </Markdown>
              </div>
            )}
            {"citations" in message && !!message.citations?.length && (
              <div className="citations">
                {message.citations.map((citation, i) => (
                  <button
                    className="citation"
                    key={i}
                    onClick={() => onCitation(citation)}
                  >
                    <Quote size={12} />
                    <span>{citation.quote}</span>
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
            )}
            {message.role === "assistant" && (
              <button
                className="chat-save-note text-button"
                onClick={() => onSaveNote(message.content)}
              >
                <StickyNote size={13} /> 메모에 저장
              </button>
            )}
          </article>
        ))}
        {pending && (
          <div className="chat-thinking" role="status">
            <LoaderCircle className="spin" size={15} /> 논문을 참고해 답변하는
            중…
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {quote && (
          <div className="chat-quote">
            <div>
              <small>
                <Quote size={12} /> PDF {quote.page}쪽 · 선택한 문장
              </small>
              <p>{quote.text}</p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="질문에서 선택한 문장 빼기"
              onClick={() => setQuote(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <label className="sr-only" htmlFor="paper-chat-question">
          논문에 질문하기
        </label>
        <textarea
          ref={input}
          id="paper-chat-question"
          value={draft}
          maxLength={6000}
          rows={3}
          placeholder={
            quote
              ? "이 문장에 대해 무엇이 궁금한가요?"
              : "논문에 대해 질문해 보세요…"
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="chat-compose-actions">
          <small>
            {!source
              ? sourceError
                ? "원문을 불러오면 질문할 수 있어요."
                : "질문에 참고할 원문을 읽는 중…"
              : partial
                ? "질문과 관련된 본문 일부를 참고해요"
                : "원문을 참고해 답변해요"}
          </small>
          {pending ? (
            <button
              key="stop"
              type="button"
              className="chat-send"
              aria-label="답변 중지"
              onClick={(event) => {
                event.preventDefault();
                request.current?.abort();
              }}
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              key="send"
              type="submit"
              className="chat-send"
              aria-label={
                hasAIConnection(settings) ? "질문 보내기" : "AI 연결하기"
              }
              disabled={!source || (!draft.trim() && !quote)}
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
        <p className="chat-footnote">
          {hasAIConnection(settings)
            ? "연결한 AI 계정 사용 · "
            : "AI 연결 필요 · "}
          대화는 이 논문을 닫으면 사라져요
        </p>
      </form>
    </div>
  );
}
