"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  sectionKeys,
  sectionLabels,
  type Library,
  type Paper,
  type Edge,
} from "@/lib/model";
import {
  libraryContent,
  reconcileLibraries,
  resolveMerge,
  type MergeResult,
} from "@/lib/reconcile";
import { Dialog } from "./dialog";

function ConflictPreview({ item }: { item: Paper | Edge }) {
  if (!("arxivId" in item))
    return (
      <div className="conflict-content">
        <p>
          {item.source} → {item.label} → {item.target}
        </p>
        <p>{item.note || "연결 메모 없음"}</p>
      </div>
    );
  return (
    <div className="conflict-content">
      <p>
        <strong>나의 메모</strong>
        <br />
        {item.notes || "메모 없음"}
      </p>
      <p>
        태그: {item.tags.join(", ") || "없음"} ·{" "}
        {item.status === "read"
          ? "읽음"
          : item.status === "reading"
            ? "읽는 중"
            : "읽기 전"}
      </p>
      <details>
        <summary>요약과 논문 정보</summary>
        <p>
          {item.title}
          <br />
          arXiv:{item.arxivId} · {item.published}
          <br />
          {item.authors.join(", ")}
        </p>
        <p>{item.abstract}</p>
        {item.analysis ? (
          <>
            <p>{item.analysis.positioning}</p>
            {sectionKeys.map((key) => (
              <div key={key}>
                <strong>{sectionLabels[key][0]}</strong>
                {item.analysis!.sections[key].map((point, i) => (
                  <p key={i}>{point.text}</p>
                ))}
              </div>
            ))}
            <p>{item.analysis.limitations.join("\n")}</p>
          </>
        ) : (
          <p>AI 요약 없음</p>
        )}
      </details>
    </div>
  );
}
export function useLibraryReconciliation({
  latest,
  update,
}: {
  latest: MutableRefObject<Library>;
  update: (library: Library) => void;
}) {
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [review, setReview] = useState<{
    result: MergeResult;
    label: string;
  } | null>(null);
  const [choices, setChoices] = useState<Record<string, "local" | "remote">>(
    {},
  );
  const decision = useRef<
    ((choices: Record<string, "local" | "remote"> | null) => void) | null
  >(null);
  useEffect(() => {
    return () => {
      decision.current?.(null);
    };
  }, []);

  const merge = useCallback(
    async (
      base: Library | null,
      local: Library,
      remote: Library,
      label: string,
    ) => {
      const result = reconcileLibraries(base, local, remote);
      if (!result.conflicts.length) return resolveMerge(result);
      setChoices({});
      setReview({ result, label });
      const selected = await new Promise<Record<
        string,
        "local" | "remote"
      > | null>((resolve) => {
        decision.current = resolve;
      });
      setReview(null);
      decision.current = null;
      if (!selected)
        throw new Error(
          "합치기를 보류했어요. 원본은 그대로 유지돼요. 준비되면 다시 동기화해 주세요.",
        );
      return resolveMerge(result, selected);
    },
    [],
  );
  const serial = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const result = queue.current.then(task, task);
    queue.current = result.catch(() => {});
    return result;
  }, []);
  const integrate = useCallback(
    async (base: Library, incoming: Library) => {
      let merged = incoming;
      let before = base;
      // Edits or an AI response can arrive while a network request is running.
      while (libraryContent(latest.current) !== libraryContent(before)) {
        const now = latest.current;
        merged = await merge(before, now, merged, "동기화 중 도착한 변경");
        before = now;
      }
      if (libraryContent(latest.current) !== libraryContent(merged))
        update(merged);
      return latest.current;
    },
    [latest, merge, update],
  );

  const conflictDialog = (
    <Dialog
      open={!!review}
      onClose={() => decision.current?.(null)}
      title="양쪽 변경 내용 확인"
      wide
    >
      <p className="dialog-description">
        {review?.label}와 현재 라이브러리에서 같은 항목이 달라졌어요. 항목마다
        남길 버전을 선택해 주세요. 선택 전에는 저장하지 않아요.
      </p>
      {review?.result.conflicts.map((conflict) => (
        <fieldset className="merge-conflict" key={conflict.id}>
          <legend>{conflict.title}</legend>
          {(["local", "remote"] as const).map((side) => (
            <label key={side}>
              <span>
                <input
                  type="radio"
                  name={`conflict-${conflict.id}`}
                  checked={choices[conflict.id] === side}
                  onChange={() =>
                    setChoices((c) => ({ ...c, [conflict.id]: side }))
                  }
                />
                {side === "local" ? "현재 라이브러리" : review.label}
              </span>
              {conflict[side].deleted ? (
                <p>삭제된 항목</p>
              ) : (
                <ConflictPreview item={conflict[side].item!} />
              )}
            </label>
          ))}
        </fieldset>
      ))}
      <div className="button-row">
        <button
          className="button primary"
          disabled={
            !review || review.result.conflicts.some((c) => !choices[c.id])
          }
          onClick={() => decision.current?.(choices)}
        >
          선택한 내용 합치기
        </button>
        <button className="button" onClick={() => decision.current?.(null)}>
          나중에
        </button>
      </div>
    </Dialog>
  );
  return {
    serial,
    merge,
    integrate,
    conflictDialog,
  };
}
