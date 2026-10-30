"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  aiModelSchema,
  apiKeySchema,
  type AISettings,
} from "@/lib/ai-settings";
import type { Library } from "@/lib/model";
import {
  applyPaperLabels,
  labelBatchSize,
  labelFingerprint,
  labelInput,
  paperLabelsSchema,
} from "@/lib/paper-labels";

export function usePaperLabels({
  account,
  ai,
  library,
  enabled,
  update,
}: {
  account: string;
  ai: AISettings;
  library: Library;
  enabled: boolean;
  update: (value: Library | ((library: Library) => Library)) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const running = useRef(false);
  const alive = useRef(false);
  const controller = useRef<AbortController | null>(null);
  // Changing accounts or credentials invalidates pending results. Never store keys here on disk.
  const session = useMemo(
    () => ({ attempted: new Set<string>(), failed: false }),
    [account, ai.provider, ai.model, ai.apiKey, ai.accountId],
  );
  const current = useRef({ session, library, enabled, update });
  current.current = { session, library, enabled, update };
  const connected =
    aiModelSchema.safeParse(ai.model).success &&
    (ai.accountId !== undefined
      ? account === `github:${ai.accountId}`
      : apiKeySchema.safeParse(ai.apiKey).success);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    setError("");
  }, [session]);
  useEffect(() => {
    if (!enabled || !connected || running.current || session.failed) return;
    if (
      !library.papers.some(
        (p) => !p.graphLabel && !session.attempted.has(labelFingerprint(p)),
      )
    )
      return;
    const timer = setTimeout(async () => {
      if (
        running.current ||
        !alive.current ||
        current.current.session !== session
      )
        return;
      running.current = true;
      try {
        while (
          alive.current &&
          current.current.session === session &&
          current.current.enabled
        ) {
          const papers = current.current.library.papers
            .filter(
              (p) =>
                !p.graphLabel && !session.attempted.has(labelFingerprint(p)),
            )
            .slice(0, labelBatchSize)
            .map(labelInput);
          if (!papers.length) break;
          papers.forEach((p) => session.attempted.add(labelFingerprint(p)));
          setBusy(true);
          controller.current = new AbortController();
          const response = await api<unknown>("/paper-labels", {
            method: "POST",
            body: JSON.stringify({ ...ai, papers }),
            signal: controller.current.signal,
          });
          const parsed = paperLabelsSchema.safeParse(response);
          if (!parsed.success)
            throw new Error("논문의 짧은 이름을 확인하지 못했어요.");
          if (!alive.current || current.current.session !== session) break;
          current.current.update((latest) =>
            applyPaperLabels(latest, papers, parsed.data.labels),
          );
        }
      } catch (cause) {
        if (alive.current && current.current.session === session) {
          session.failed = true;
          setError(
            cause instanceof Error
              ? cause.message
              : "짧은 이름을 만들지 못했어요.",
          );
        }
      } finally {
        running.current = false;
        controller.current = null;
        if (alive.current) {
          setBusy(false);
          setTick((n) => n + 1);
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [enabled, connected, session, library.papers, tick, ai]);

  return {
    busy,
    error,
    retry: () => {
      if (running.current) return;
      session.failed = false;
      session.attempted.clear();
      setError("");
      setTick((n) => n + 1);
    },
  };
}
