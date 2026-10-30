"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api, ApiError, isAuthenticationError } from "@/lib/api";
import {
  accountAISettings,
  defaultAISettings,
  type AccountAIKey,
  type AccountAIKeys,
  type AIProvider,
  type AISettings,
} from "@/lib/ai-settings";
import { readLocal } from "@/lib/storage";
import { providerPreferenceKey } from "@/lib/ai-vault";

type KeyResponse = { userId: number; keys: AccountAIKey[] };
export function useAccountAI(
  userId: number | undefined,
  setAi: Dispatch<SetStateAction<AISettings>>,
) {
  const [keys, setKeys] = useState<AccountAIKeys>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const mutating = useRef(false);
  const restoredAccount = useRef<number | undefined>(undefined);
  const activeAccount = useRef(userId);
  activeAccount.current = userId;

  const refresh = useCallback(async () => {
    if (mutating.current) return;
    const ticket = ++generation.current;
    if (!userId) {
      setKeys({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [result, preference] = await Promise.all([
        api<KeyResponse>("/ai-keys"),
        readLocal(providerPreferenceKey).catch(() => undefined),
      ]);
      if (generation.current !== ticket || activeAccount.current !== userId)
        return;
      if (result.userId !== userId)
        throw new ApiError(409, "로그인 계정이 바뀌었어요. 새로고침해 주세요.");
      const next = Object.fromEntries(
        result.keys.map((key) => [key.provider, key]),
      ) as AccountAIKeys;
      const initial = restoredAccount.current !== userId;
      restoredAccount.current = userId;
      setKeys(next);
      setAi((current) => {
        if (current.apiKey) return current;
        // Keep an active model choice; otherwise reconnect the last selected provider.
        if (current.accountId === userId)
          return next[current.provider]
            ? current
            : defaultAISettings(current.provider);
        if (!initial) return current;
        if (preference === "openai" || preference === "anthropic") {
          const preferred = next[preference];
          return preferred
            ? accountAISettings(preferred, userId)
            : defaultAISettings(preference);
        }
        const key = result.keys.toSorted(
          (a, b) => b.updatedAt - a.updatedAt,
        )[0];
        return key
          ? accountAISettings(key, userId)
          : defaultAISettings(current.provider);
      });
    } catch (e) {
      if (generation.current !== ticket || activeAccount.current !== userId)
        return;
      setError((e as Error).message);
      // A failed status check is not evidence that a saved connection was removed.
      if (isAuthenticationError(e)) {
        setKeys({});
        setAi((current) =>
          current.accountId ? defaultAISettings(current.provider) : current,
        );
      }
    } finally {
      if (generation.current === ticket) setLoading(false);
    }
  }, [userId, setAi]);

  useEffect(() => {
    restoredAccount.current = undefined;
    setKeys({});
    setError("");
    setAi((current) =>
      current.accountId && current.accountId !== userId
        ? defaultAISettings(current.provider)
        : current,
    );
    void refresh();
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("paper-palace:account-ai");
    if (channel) channel.onmessage = focus;
    return () => {
      generation.current++;
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      channel?.close();
    };
  }, [refresh, userId, setAi]);

  const announce = () => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("paper-palace:account-ai");
    channel.postMessage("changed");
    channel.close();
  };
  const save = async (settings: AISettings) => {
    if (!userId) throw new Error("먼저 GitHub으로 로그인해 주세요.");
    if (mutating.current) throw new Error("AI 연결을 처리하는 중이에요.");
    mutating.current = true;
    try {
      const ticket = ++generation.current;
      const result = await api<{ key: AccountAIKey }>("/ai-keys", {
        method: "PUT",
        body: JSON.stringify({
          accountId: userId,
          provider: settings.provider,
          model: settings.model,
          ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
        }),
      });
      // Read back metadata to catch browsers that rejected the HttpOnly cookie.
      const check = await api<KeyResponse>("/ai-keys");
      const accepted = check.keys.find(
        (key) =>
          key.provider === settings.provider &&
          key.updatedAt === result.key.updatedAt &&
          key.model === result.key.model,
      );
      if (check.userId !== userId || !accepted)
        throw new Error(
          "AI 연결을 보관하지 못했어요. 이 사이트의 쿠키 허용 여부를 확인해 주세요.",
        );
      if (activeAccount.current !== userId || generation.current !== ticket)
        return;
      setKeys(Object.fromEntries(check.keys.map((key) => [key.provider, key])));
      setAi((current) =>
        current.provider === settings.provider &&
        current.model === settings.model &&
        current.apiKey === settings.apiKey
          ? accountAISettings(accepted, userId)
          : current,
      );
      setError("");
      setLoading(false);
      announce();
    } finally {
      mutating.current = false;
      setLoading(false);
    }
  };
  const remove = async (provider: AIProvider) => {
    if (!userId) throw new Error("먼저 GitHub으로 로그인해 주세요.");
    if (mutating.current) throw new Error("AI 연결을 처리하는 중이에요.");
    mutating.current = true;
    try {
      const ticket = ++generation.current;
      await api("/ai-keys", {
        method: "DELETE",
        body: JSON.stringify({ accountId: userId, provider }),
      });
      const check = await api<KeyResponse>("/ai-keys");
      if (
        check.userId !== userId ||
        check.keys.some((key) => key.provider === provider)
      )
        throw new Error(
          "AI 연결 해제를 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.",
        );
      if (activeAccount.current !== userId || generation.current !== ticket)
        return;
      setKeys(Object.fromEntries(check.keys.map((key) => [key.provider, key])));
      setAi((current) =>
        current.provider === provider && current.accountId === userId
          ? defaultAISettings(provider)
          : current,
      );
      setError("");
      setLoading(false);
      announce();
    } finally {
      mutating.current = false;
      setLoading(false);
    }
  };
  return { keys, loading, error, refresh, save, remove };
}
export type AccountAIConnection = ReturnType<typeof useAccountAI>;
