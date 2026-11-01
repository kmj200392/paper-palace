"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import {
  GitHubLibrarySession,
  type LibraryMerge,
  type RemoteLibrary,
} from "@/lib/github-library";

export function useGitHubLibrary(
  accountId: number | undefined,
  repo: string,
  merge: LibraryMerge,
) {
  const session = useMemo(
    () =>
      new GitHubLibrarySession(
        {
          read: () =>
            api<RemoteLibrary>(
              `/library?repo=${encodeURIComponent(repo)}&accountId=${accountId}`,
              { signal: AbortSignal.timeout(30000) },
            ),
          write: (library, sha) =>
            api("/library", {
              method: "PUT",
              body: JSON.stringify({ accountId, repo, library, sha }),
              signal: AbortSignal.timeout(30000),
            }),
        },
        merge,
        repo,
      ),
    [accountId, repo, merge],
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useEffect(() => {
    if (accountId && repo) void session.open();
    return () => session.close();
  }, [session, accountId, repo]);
  useEffect(() => {
    if (!state.dirty || state.status !== "ready") return;
    const timer = setTimeout(() => {
      void session.sync().catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [session, state]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (session.getSnapshot().dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [session]);
  return { ...state, session };
}
