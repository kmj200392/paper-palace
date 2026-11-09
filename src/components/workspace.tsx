"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  FolderGit2,
  Unplug,
  Github,
  KeyRound,
  Library as LibraryIcon,
  LoaderCircle,
  LogOut,
  Network,
  Plus,
  Search,
  Sparkles,
  Settings,
  RefreshCw,
  Trash2,
  X,
  Link2,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Compass,
} from "lucide-react";
import { Brand } from "./brand";
import { MakerCredit } from "./maker-credit";
import { PaperDiscovery } from "./paper-discovery";
import { addRecommendation } from "@/lib/recommendations";
import { AIConnection } from "./ai-connection";
import { useAccountAI } from "./use-account-ai";
import { usePaperLabels } from "./use-paper-labels";
import { defaultAISettings, hasAIConnection } from "@/lib/ai-settings";
import { Dialog } from "./dialog";
import { Graph } from "./graph";
import { Reader, type AISettings } from "./reader";
import {
  type Library,
  type Paper,
  type Edge,
  emptyLibrary,
  mergeLibraries,
  librarySchema,
} from "@/lib/model";
import {
  loadLegacyLibrary,
  exportLibrary,
  readLocal,
  writeLocal,
} from "@/lib/storage";
import { api } from "@/lib/api";
import { useLibraryReconciliation } from "./use-library-reconciliation";
import { useGitHubLibrary } from "./use-github-library";
import { importPaper } from "@/lib/source";
type User = { id: number; login: string; name: string };
export default function Workspace() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let collapsed = window.matchMedia("(max-width: 600px)").matches;
    try {
      const saved = localStorage.getItem("paper-palace:sidebar-collapsed");
      if (saved !== null) collapsed = saved === "true";
    } catch {
      /* Preferences can be unavailable in private mode. */
    }
    setSidebarCollapsed(collapsed);
  }, []);
  const resizeSidebar = (next: boolean) => {
    setSidebarCollapsed(next);
    try {
      localStorage.setItem("paper-palace:sidebar-collapsed", String(next));
    } catch {
      /* Keep the in-memory preference. */
    }
  };
  const closeMobileSidebar = () => {
    if (window.matchMedia("(max-width: 600px)").matches) resizeSidebar(true);
  };
  const [bootAttempt, setBootAttempt] = useState(0);
  const [bootError, setBootError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [renewable, setRenewable] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [account, setAccount] = useState("guest"),
    [view, setView] = useState<"library" | "graph" | "discover">("library"),
    [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  useEffect(() => {
    if (selected) setSidebarCollapsed(true);
  }, [selected]);
  const [addOpen, setAddOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [edgeOpen, setEdgeOpen] = useState(false),
    [deleteId, setDeleteId] = useState<string | null>(null),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(""),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [repo, setRepo] = useState(""),
    [repos, setRepos] = useState<{ full_name: string }[]>([]),
    [config, setConfig] = useState({
      githubConfigured: false,
      githubAppSlug: "",
    }),
    [ai, setAi] = useState<AISettings>(() => defaultAISettings("openai")),
    [edgeDraft, setEdgeDraft] = useState({
      source: "",
      target: "",
      label: "builds on",
      note: "",
    });
  const accountAI = useAccountAI(user?.id, setAi);
  const storage = useLibraryReconciliation();
  const remote = useGitHubLibrary(user?.id, repo, storage.merge);
  const empty = useMemo(emptyLibrary, []);
  const library = remote.library || empty;
  const libraryReady = !!remote.library;
  const syncing = remote.status === "saving";
  const setLibrary = remote.session.update;
  const fileInput = useRef<HTMLInputElement>(null),
    latest = useRef(library),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = library;
  const [navigating, setNavigating] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<{
    label: string;
    action: () => Promise<void>;
  } | null>(null);
  const paperLabels = usePaperLabels({
    account,
    scope: `${account}:${repo}`,
    ai,
    library,
    enabled: libraryReady && !settingsOpen && !sessionExpired && !navigating,
    update: setLibrary,
  });
  const notify = (s: string) => {
    setToast(s);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6500);
  };
  const mutate = (fn: (l: Library) => Library) =>
    setLibrary((l) => ({ ...fn(l), updatedAt: new Date().toISOString() }));
  useEffect(() => {
    let stopped = false,
      retryPending = false;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    setBootError("");
    (async () => {
      try {
        const [me, conf] = await Promise.all([
          api<{ user: User | null; renewable?: boolean }>("/me", {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20000),
            ]),
          }),
          api<typeof config>("/config", {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20000),
            ]),
          }),
        ]);
        if (stopped) return;
        if (
          !me ||
          !("user" in me) ||
          (me.user !== null &&
            (!Number.isInteger(me.user.id) || !me.user.login))
        )
          throw new Error(
            "로그인 상태를 확인하지 못했어요. 다시 연결하는 중이에요.",
          );
        if (conf) setConfig(conf);
        const acc = me.user ? `github:${me.user.id}` : "guest";
        // Remember only the connection preference, never a browser library.
        const savedRepo = me.user
          ? await readLocal<string>(`repo:${acc}`).catch(() => "")
          : "";
        if (stopped) return;
        setAccount(acc);
        setUser(me.user);
        setRenewable(me.renewable !== false);
        setRepo(savedRepo || "");
        // Retired local handoffs must never be replayed into a GitHub library.
        try {
          sessionStorage.removeItem("paper-palace:login-transfer");
        } catch {
          // Session storage can be disabled without blocking sign-in.
        }
        const params = new URLSearchParams(location.search);
        if (params.has("error"))
          setError(
            params.get("error") === "auth_setup"
              ? "GitHub 로그인 설정을 준비 중이에요. 잠시 후 다시 시도해 주세요."
              : "GitHub 로그인에 실패했어요. 다시 로그인해 주세요.",
          );
        if (!stopped) setReady(true);
      } catch (e) {
        if (stopped) return;
        setBootError((e as Error).message);
        retryPending = true;
        // Do not load research data while authentication is unknown.
        retry = setTimeout(
          () => setBootAttempt((n) => n + 1),
          Math.min(30000, 3000 * 2 ** Math.min(bootAttempt, 4)),
        );
      }
    })();
    const retryOnline = () => {
      if (retryPending) setBootAttempt((n) => n + 1);
    };
    window.addEventListener("online", retryOnline);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(retry);
      window.removeEventListener("online", retryOnline);
    };
  }, [bootAttempt]);
  useEffect(() => {
    if (!ready || !user) return;
    let stopped = false,
      checking = false;
    const controller = new AbortController();
    const check = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const result = await api<{ user: User | null }>("/me", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
        });
        if (!stopped && result && "user" in result)
          setSessionExpired(result.user?.id !== user.id);
      } catch {
        /* Keep the current account and library during a temporary outage. */
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(check, 30 * 60 * 1000);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [ready, user]);
  const refreshRepos = async () => {
    try {
      const data = await api<{ repositories: { full_name: string }[] }>(
        "/repos",
      );
      setRepos(data.repositories);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  useEffect(() => {
    if (settingsOpen && user) void refreshRepos();
  }, [settingsOpen, user]);
  const addPaper = async (value: string) => {
    if (busy || !libraryReady) return;
    setBusy("논문 정보를 가져오는 중…");
    setError("");
    try {
      const paper = await importPaper(value);
      const exists = latest.current.papers.find((p) => p.id === paper.id);
      if (exists) {
        setSelected(exists.id);
        notify("이미 라이브러리에 있는 논문이에요.");
      } else {
        mutate((l) => ({ ...l, papers: [paper, ...l.papers] }));
        setSelected(paper.id);
        notify("논문을 라이브러리에 놓았어요.");
      }
      setAddOpen(false);
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const leave = async (label: string, action: () => Promise<void>) => {
    if (navigating) return;
    setNavigating(true);
    try {
      await remote.session.flush();
      await action();
    } catch (e) {
      notify((e as Error).message);
      if (remote.session.getSnapshot().dirty)
        setPendingLeave({ label, action });
    } finally {
      setNavigating(false);
    }
  };
  const login = () =>
    leave("다시 로그인", async () => {
      location.assign("/api/auth/login");
    });
  const sync = async () => {
    if (!user || !repo) {
      setSettingsOpen(true);
      return;
    }
    try {
      if (!libraryReady) await remote.session.open();
      else await remote.session.sync();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const changeRepo = (next: string) =>
    leave(next ? "저장소 변경" : "저장소 연결 해제", async () => {
      await writeLocal(`repo:${account}`, next).catch(() => {
        notify(
          "저장소 선택을 기억하지 못했어요. 다음 방문에 다시 선택해 주세요.",
        );
      });
      setSelected(null);
      setView("library");
      setRepo(next);
    });
  const logout = () =>
    leave("로그아웃", async () => {
      await api("/auth/logout", { method: "POST" });
      setAi((a) => ({ ...a, apiKey: "", accountId: undefined }));
      location.assign("/app/");
    });
  const exportLegacy = async (legacyAccount: string) => {
    try {
      const old = await loadLegacyLibrary(legacyAccount);
      if (!old.papers.length && !old.edges.length) {
        notify("이전 버전에 저장된 자료가 없어요.");
        return;
      }
      exportLibrary(old);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const importJSON = async (file: File) => {
    if (!libraryReady) return;
    try {
      if (file.size > 3000000)
        throw new Error("3MB 이하의 JSON 파일을 가져와 주세요.");
      const data = librarySchema.parse(JSON.parse(await file.text()));
      mutate((l) => mergeLibraries(l, data));
      notify(`${data.papers.length}편을 가져왔어요.`);
    } catch (e) {
      notify(
        e instanceof SyntaxError ||
          (e instanceof Error && e.name === "ZodError")
          ? "Paper Palace 내보내기 형식의 JSON을 선택해 주세요."
          : (e as Error).message,
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const deletePaper = () => {
    if (!deleteId) return;
    const now = new Date().toISOString();
    mutate((l) => ({
      ...l,
      papers: l.papers.filter((p) => p.id !== deleteId),
      edges: l.edges.filter(
        (e) => e.source !== deleteId && e.target !== deleteId,
      ),
      deleted: { ...l.deleted, [deleteId]: now },
    }));
    setDeleteId(null);
    setSelected(null);
    notify("논문을 삭제했어요. GitHub에 자동 저장해요.");
  };
  const saveEdge = () => {
    const { source, target, label, note } = edgeDraft;
    if (!source || !target || source === target || !label.trim()) {
      notify("서로 다른 두 논문과 관계 이름을 입력해 주세요.");
      return;
    }
    const edge: Edge = {
      id: crypto.randomUUID(),
      source,
      target,
      label: label.trim(),
      note,
      origin: "manual",
      updatedAt: new Date().toISOString(),
    };
    mutate((l) => ({ ...l, edges: [...l.edges, edge] }));
    setEdgeOpen(false);
    notify("두 논문을 연결했어요.");
  };
  const suggestAI = async () => {
    if (!hasAIConnection(ai)) {
      setSettingsOpen(true);
      return;
    }
    if (suggesting) return;
    const papers = library.papers
      .filter((p) => p.analysis)
      .slice(0, 40)
      .map((p) => ({
        id: p.id,
        title: p.title,
        positioning: p.analysis!.positioning,
        tags: p.tags,
        method: p
          .analysis!.sections.method.map((s) => s.text)
          .join(" ")
          .slice(0, 2500),
      }));
    if (papers.length < 2) {
      notify("먼저 논문 두 편 이상을 AI로 정리해 주세요.");
      return;
    }
    setSuggesting(true);
    try {
      const data = await api<{
        relations: {
          source: string;
          target: string;
          label: string;
          note: string;
        }[];
      }>("/relate", {
        method: "POST",
        body: JSON.stringify({ ...ai, papers }),
      });
      mutate((l) => {
        const edges = [...l.edges];
        for (const r of data.relations) {
          if (
            !edges.some(
              (e) =>
                (e.source === r.source && e.target === r.target) ||
                (e.target === r.source && e.source === r.target),
            )
          )
            edges.push({
              ...r,
              id: crypto.randomUUID(),
              origin: "suggested",
              updatedAt: new Date().toISOString(),
            });
        }
        return { ...l, edges };
      });
      notify(
        data.relations.length
          ? "AI 연결 후보를 점선으로 표시했어요. 근거를 확인하고 채택해 주세요."
          : "요약만으로 뚜렷한 연결을 찾지 못했어요.",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSuggesting(false);
    }
  };
  const suggestions = useMemo(() => {
    const pairs: { a: Paper; b: Paper; tags: string[] }[] = [];
    for (let i = 0; i < library.papers.length; i++)
      for (let j = i + 1; j < library.papers.length; j++) {
        if (pairs.length >= 8) break;
        const a = library.papers[i],
          b = library.papers[j];
        if (
          library.edges.some(
            (e) =>
              (e.source === a.id && e.target === b.id) ||
              (e.source === b.id && e.target === a.id),
          )
        )
          continue;
        const tags = a.tags.filter((t) =>
          b.tags.some((bt) => bt.toLowerCase() === t.toLowerCase()),
        );
        if (tags.length) pairs.push({ a, b, tags });
      }
    return pairs;
  }, [library.papers, library.edges]);
  const papers = library.papers.filter(
    (p) =>
      (filter === "all" || p.status === filter) &&
      `${p.title} ${p.graphLabel || ""} ${p.authors.join(" ")} ${p.tags.join(" ")} ${p.notes}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const paper = library.papers.find((p) => p.id === selected);
  if (!ready)
    return (
      <main className="session-loading" aria-busy={!bootError}>
        <Brand />
        <div role="status">
          <LoaderCircle size={22} className="spin" />
          {bootError
            ? "로그인 연결을 다시 확인하고 있어요."
            : "나의 연구 공간을 여는 중…"}
        </div>
        {bootError && (
          <>
            <p>{bootError}</p>
            <button
              className="button secondary"
              onClick={() => setBootAttempt((n) => n + 1)}
            >
              다시 연결
            </button>
          </>
        )}
      </main>
    );
  return (
    <div
      className={`workspace${sidebarCollapsed ? " sidebar-collapsed" : ""}${paper ? " reader-focused" : ""}`}
    >
      <aside
        id="workspace-sidebar"
        className="sidebar"
        aria-label="연구 공간 사이드바"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !sidebarCollapsed) {
            closeMobileSidebar();
            sidebarToggle.current?.focus();
          }
        }}
      >
        <div className="sidebar-heading">
          <Brand compact />
          <button
            ref={sidebarToggle}
            className="icon-button sidebar-toggle"
            onClick={() => resizeSidebar(!sidebarCollapsed)}
            aria-controls="workspace-sidebar"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            title={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
          </button>
        </div>
        <button
          className="sidebar-item sidebar-add"
          disabled={!libraryReady || navigating}
          aria-label="논문 추가"
          title="논문 추가"
          onClick={() => {
            setError("");
            setAddOpen(true);
          }}
        >
          <Plus size={19} aria-hidden="true" />
          <span className="sidebar-text">논문 추가</span>
        </button>
        <span className="sidebar-label">
          {selected
            ? "READING ROOM"
            : view === "discover"
              ? "YOUR NEXT CONNECTION"
              : view === "graph"
                ? "YOUR PERSONAL RESEARCH GRAPH"
                : "YOUR PERSONAL LIBRARY"}
        </span>
        <nav aria-label="연구 공간 메뉴">
          <button
            className={`sidebar-item ${view === "library" && !selected ? "active" : ""}`}
            aria-label="라이브러리"
            aria-current={view === "library" && !selected ? "page" : undefined}
            title={`라이브러리 · ${library.papers.length}편`}
            onClick={() => {
              setView("library");
              setSelected(null);
              closeMobileSidebar();
            }}
          >
            <LibraryIcon size={19} aria-hidden="true" />
            <span className="sidebar-text">라이브러리</span>
            <span className="sidebar-count">{library.papers.length}</span>
          </button>
          <button
            className={`sidebar-item ${view === "graph" && !selected ? "active" : ""}`}
            aria-label="지식 지도"
            disabled={!libraryReady}
            aria-current={view === "graph" && !selected ? "page" : undefined}
            title={`지식 지도 · ${library.edges.length}개 연결`}
            onClick={() => {
              setView("graph");
              setSelected(null);
              closeMobileSidebar();
            }}
          >
            <Network size={19} aria-hidden="true" />
            <span className="sidebar-text">지식 지도</span>
            <span className="sidebar-count">{library.edges.length}</span>
          </button>
          <button
            className={`sidebar-item ${view === "discover" && !selected ? "active" : ""}`}
            aria-label="논문 찾기"
            disabled={!libraryReady}
            aria-current={view === "discover" && !selected ? "page" : undefined}
            title="내 그래프를 바탕으로 논문 찾기"
            onClick={() => {
              setView("discover");
              setSelected(null);
              closeMobileSidebar();
            }}
          >
            <Compass size={19} aria-hidden="true" />
            <span className="sidebar-text">논문 찾기</span>
          </button>
        </nav>
        <div className="sidebar-connections">
          <button
            className={`sidebar-item key-status ${hasAIConnection(ai) ? "connected" : ""}`}
            aria-label={hasAIConnection(ai) ? "AI 연결됨" : "AI 연결"}
            title={hasAIConnection(ai) ? "AI 연결됨 · 연결 설정" : "AI 연결"}
            onClick={() => setSettingsOpen(true)}
          >
            <KeyRound size={18} aria-hidden="true" />
            <span className="sidebar-text">
              {hasAIConnection(ai) ? "AI 연결됨" : "AI 연결"}
            </span>
          </button>
          <button
            className="sidebar-item sync-button"
            aria-label={syncing ? "동기화 중" : "GitHub 동기화"}
            title={syncing ? "동기화 중" : "GitHub 동기화"}
            disabled={syncing || navigating || remote.status === "loading"}
            onClick={sync}
          >
            <RefreshCw
              size={18}
              className={syncing ? "spin" : ""}
              aria-hidden="true"
            />
            <span className="sidebar-text">
              {syncing ? "동기화 중" : "GitHub 동기화"}
            </span>
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-quote">
            A little reading.
            <br />
            <em>A new connection.</em>
          </div>
          <button
            className="sidebar-item sidebar-settings"
            aria-label="연결 및 설정"
            title="연결 및 설정"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={18} aria-hidden="true" />
            <span className="sidebar-text">연결 및 설정</span>
          </button>
          {user ? (
            <button
              className="user-info"
              aria-label={`${user.name || user.login} 계정 설정`}
              title={`${user.name || user.login} · @${user.login}`}
              onClick={() => setSettingsOpen(true)}
            >
              <span className="avatar">
                {user.login.slice(0, 1).toUpperCase()}
              </span>
              <span className="sidebar-text">
                {user.name}
                <small>@{user.login}</small>
              </span>
              <ChevronRight
                size={15}
                className="sidebar-user-chevron"
                aria-hidden="true"
              />
            </button>
          ) : (
            <button
              className="sidebar-item github-login"
              aria-label="GitHub으로 로그인"
              title="GitHub으로 로그인"
              onClick={login}
              disabled={!ready}
            >
              <Github size={18} aria-hidden="true" />
              <span className="sidebar-text">GitHub으로 로그인</span>
            </button>
          )}
          <a
            className="sidebar-item sidebar-home"
            href="/"
            aria-label="Paper Palace 소개"
            title="Paper Palace 소개"
          >
            <ArrowUpRight size={18} aria-hidden="true" />
            <span className="sidebar-text">Paper Palace 소개</span>
          </a>
        </div>
      </aside>
      {!sidebarCollapsed && (
        <button
          className="sidebar-scrim"
          aria-label="사이드바 접기"
          tabIndex={-1}
          onClick={() => {
            resizeSidebar(true);
            sidebarToggle.current?.focus();
          }}
        />
      )}
      <div className={`workspace-main${selected ? " is-reading" : ""}`}>
        <main id="main" className={selected ? "reader-main" : "library-main"}>
          {libraryReady && (!paper || remote.error) && (
            <div
              className={`github-save-status ${remote.status === "error" ? "has-error" : ""}`}
            >
              <span role="status">
                <Github size={16} />{" "}
                {remote.status === "error"
                  ? "GitHub 저장 확인 필요"
                  : syncing
                    ? "GitHub와 동기화 중…"
                    : remote.dirty
                      ? "GitHub 저장 대기 중…"
                      : "GitHub에 저장됨"}
                <small>{repo}</small>
              </span>
              <button
                className="text-button"
                disabled={syncing || navigating}
                onClick={sync}
              >
                {remote.status === "error" ? "다시 시도" : "지금 동기화"}
              </button>
              {remote.error && (
                <p role="alert">
                  {remote.error}
                  {remote.dirty
                    ? " 저장하지 못한 변경은 이 탭에만 남아 있어요."
                    : ""}{" "}
                  <button
                    className="text-button"
                    onClick={() => exportLibrary(library)}
                  >
                    JSON으로 백업
                  </button>
                </p>
              )}
            </div>
          )}
          {error && !addOpen && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="알림 닫기"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {libraryReady && (
            <div hidden={!!paper || view !== "discover"}>
              <PaperDiscovery
                key={`${account}:${repo}`}
                library={library}
                settings={ai}
                openSettings={() => setSettingsOpen(true)}
                onOpen={(id) => setSelected(id)}
                onAdd={(recommendation, connections) => {
                  mutate((l) =>
                    addRecommendation(l, recommendation, connections),
                  );
                  notify(
                    connections
                      ? "논문과 검토할 점선 연결을 지도에 추가했어요."
                      : "읽을 목록에 논문을 추가했어요.",
                  );
                }}
              />
            </div>
          )}
          {user && (sessionExpired || !renewable) && (
            <div className="session-notice" role="status">
              <span>
                {sessionExpired
                  ? "로그인 연결을 다시 확인해 주세요. 현재 연구 자료는 그대로 유지돼요."
                  : "로그인을 한 번 갱신하면 앞으로 자동으로 유지돼요."}
              </span>
              <button
                className="button secondary small"
                onClick={() => void login()}
              >
                다시 로그인
              </button>
            </div>
          )}
          {!libraryReady ? (
            <section className="github-onboarding">
              {remote.status === "loading" ? (
                <LoaderCircle size={32} className="spin" />
              ) : (
                <Github size={36} />
              )}
              <p className="eyebrow">YOUR PAPERS, YOUR GITHUB</p>
              <h1>
                {!user
                  ? "GitHub에 연구 공간을 열어 보세요."
                  : !repo
                    ? "저장소를 연결해 주세요."
                    : remote.status === "error"
                      ? "자료를 불러오지 못했어요."
                      : "GitHub에서 자료를 불러오는 중…"}
              </h1>
              <p>
                {!user
                  ? "로그인하고 비공개 저장소를 연결하면 논문·메모·그래프를 어디서든 이어갈 수 있어요."
                  : !repo
                    ? "선택한 저장소에서 자료를 불러오고, 변경사항을 자동으로 저장해요."
                    : remote.error || "저장된 라이브러리를 확인하고 있어요."}
              </p>
              {!user ? (
                <button
                  className="button primary"
                  onClick={login}
                  disabled={navigating || !config.githubConfigured}
                >
                  <Github size={18} /> GitHub으로 시작하기
                </button>
              ) : (
                remote.status !== "loading" && (
                  <div className="button-row">
                    {repo && (
                      <button className="button primary" onClick={sync}>
                        다시 불러오기
                      </button>
                    )}
                    <button
                      className="button secondary"
                      onClick={() => setSettingsOpen(true)}
                    >
                      GitHub 연결 설정
                    </button>
                  </div>
                )
              )}
            </section>
          ) : paper ? (
            <Reader
              key={`${account}:${repo}:${paper.id}`}
              paper={paper}
              syncState={
                remote.status === "error"
                  ? "error"
                  : syncing
                    ? "saving"
                    : remote.dirty
                      ? "pending"
                      : "saved"
              }
              onSync={sync}
              settings={ai}
              openSettings={() => setSettingsOpen(true)}
              notify={notify}
              onBack={() => {
                setSelected(null);
                setView("library");
              }}
              onUpdate={(p) =>
                mutate((l) => ({
                  ...l,
                  papers: l.papers.map((old) =>
                    old.id === paper.id
                      ? {
                          ...old,
                          ...p,
                          tags:
                            p.analysis && p.tags
                              ? [...new Set([...old.tags, ...p.tags])].slice(
                                  0,
                                  30,
                                )
                              : p.tags || old.tags,
                        }
                      : old,
                  ),
                }))
              }
              onDelete={() => setDeleteId(paper.id)}
            />
          ) : view === "discover" ? null : (
            <>
              <div className="library-heading">
                <div>
                  <p className="eyebrow">
                    {view === "graph"
                      ? "CONNECT THE IDEAS"
                      : "A PLACE FOR EVERY PAPER"}
                  </p>
                  <h1>
                    {view === "graph" ? "나의 지식 지도." : "나의 라이브러리."}
                  </h1>
                  <p>
                    {view === "graph"
                      ? "논문 사이의 관계에서, 다음 질문을 발견하세요."
                      : "읽은 논문, 떠오른 생각. 하나의 공간에 차곡차곡."}
                  </p>
                </div>
                <span className="library-counter">
                  {String(library.papers.length).padStart(2, "0")}
                  <small>PAPERS</small>
                </span>
              </div>
              <div className="library-tools">
                <label className="search-field">
                  <Search size={18} aria-hidden="true" />
                  <span className="sr-only">논문 검색</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="제목, 저자, 태그, 메모 검색"
                  />
                </label>
                {view === "library" ? (
                  <label className="filter-field">
                    <SlidersHorizontal size={15} />
                    <span className="sr-only">읽기 상태 필터</span>
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">전체 논문</option>
                      <option value="unread">읽기 전</option>
                      <option value="reading">읽는 중</option>
                      <option value="read">읽음</option>
                    </select>
                  </label>
                ) : (
                  <div className="graph-actionbar">
                    <button
                      className="button small"
                      disabled={
                        suggesting ||
                        library.papers.filter((p) => p.analysis).length < 2
                      }
                      onClick={suggestAI}
                      title="최대 40편의 논문 제목과 AI 요약을 선택한 제공자에 전송합니다. API 사용료가 발생합니다."
                    >
                      {suggesting ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}{" "}
                      {suggesting ? "연결을 찾는 중…" : "AI 연결 제안"}
                    </button>
                    <button
                      className="button small"
                      disabled={library.papers.length < 2}
                      onClick={() => {
                        setEdgeDraft({
                          source: library.papers[0]?.id || "",
                          target: library.papers[1]?.id || "",
                          label: "builds on",
                          note: "",
                        });
                        setEdgeOpen(true);
                      }}
                    >
                      <Link2 size={15} /> 연결 만들기
                    </button>
                  </div>
                )}
              </div>
              {view === "library" ? (
                <>
                  {!library.papers.length ? (
                    <div className="welcome-empty">
                      <div className="empty-arch">
                        <BookOpen size={42} />
                        <span>EX LIBRIS</span>
                      </div>
                      <p className="eyebrow">YOUR FIRST CHAPTER</p>
                      <h2>첫 번째 논문을 놓아 보세요.</h2>
                      <p>
                        arXiv 링크 하나로 시작해요.
                        <br />
                        읽고, 메모하고, 연결할수록 나의 연구 지도가 자라납니다.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => setAddOpen(true)}
                      >
                        <Plus size={17} /> 논문 추가하기
                      </button>
                      <button
                        className="text-button example-link"
                        disabled={!!busy}
                        onClick={() => addPaper("1706.03762")}
                      >
                        {busy ? (
                          <LoaderCircle size={14} className="spin" />
                        ) : null}{" "}
                        Attention Is All You Need로 시작해 보기{" "}
                        <ArrowUpRight size={13} />
                      </button>
                      <div className="empty-steps">
                        <span>
                          01 <strong>Read</strong> 원문과 함께 이해하기
                        </span>
                        <span>
                          02 <strong>Connect</strong> 생각의 관계 남기기
                        </span>
                        <span>
                          03 <strong>Remember</strong> 다시 꺼내 보는 지식
                        </span>
                      </div>
                    </div>
                  ) : !papers.length ? (
                    <div className="empty-state">
                      <Search size={30} />
                      <h2>검색 결과가 없어요.</h2>
                      <p>다른 검색어나 읽기 상태를 선택해 보세요.</p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSearch("");
                          setFilter("all");
                        }}
                      >
                        필터 초기화
                      </button>
                    </div>
                  ) : (
                    <div className="paper-grid">
                      {papers.map((p, i) => (
                        <article className="paper-card" key={p.id}>
                          <button
                            className="paper-card-main"
                            onClick={() => setSelected(p.id)}
                          >
                            <div className="paper-card-top">
                              <span className="paper-number">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span
                                className={`status-pill status-${p.status}`}
                              >
                                {p.status === "read"
                                  ? "읽음"
                                  : p.status === "reading"
                                    ? "읽는 중"
                                    : "읽기 전"}
                              </span>
                            </div>
                            <h2>{p.title}</h2>
                            <p className="card-authors">
                              {p.authors.slice(0, 2).join(", ")}
                              {p.authors.length > 2 ? " et al." : ""}
                            </p>
                            <p className="card-description">
                              {p.analysis?.positioning || p.abstract}
                            </p>
                            <div className="tag-list">
                              {p.tags.slice(0, 3).map((t) => (
                                <span className="tag" key={t}>
                                  {t}
                                </span>
                              ))}
                            </div>
                            <div className="card-footer">
                              <span>
                                {p.published.slice(0, 4)} · arXiv:{p.id}
                              </span>
                              <ArrowUpRight size={18} />
                            </div>
                          </button>
                        </article>
                      ))}
                      <button
                        className="add-card"
                        onClick={() => setAddOpen(true)}
                      >
                        <Plus size={24} />
                        <span>다음 논문을 놓을 자리</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Graph
                    papers={papers}
                    edges={library.edges}
                    onSelect={setSelected}
                  />
                  {(paperLabels.busy || paperLabels.error) && (
                    <div className="graph-label-status" role="status">
                      {paperLabels.busy ? (
                        <>
                          <LoaderCircle size={14} className="spin" /> 짧은 이름
                          만드는 중…
                        </>
                      ) : (
                        <>
                          <span>
                            {paperLabels.error} 임시 이름으로 표시하고 있어요.
                          </span>
                          <button
                            className="text-button"
                            onClick={paperLabels.retry}
                          >
                            이름 다시 만들기
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <div className="connections-detail">
                    <div>
                      <h2>
                        내가 기록한 연결 <span>{library.edges.length}</span>
                      </h2>
                      {!library.edges.length ? (
                        <p className="muted">
                          ‘연결 만들기’로 논문 두 편의 관계를 남겨 보세요.
                        </p>
                      ) : (
                        library.edges.map((e) => (
                          <div className="edge-row" key={e.id}>
                            {e.origin === "suggested" && (
                              <button
                                className="button small accept-edge"
                                onClick={() =>
                                  mutate((l) => ({
                                    ...l,
                                    edges: l.edges.map((x) =>
                                      x.id === e.id
                                        ? {
                                            ...x,
                                            origin: "manual",
                                            updatedAt: new Date().toISOString(),
                                          }
                                        : x,
                                    ),
                                  }))
                                }
                              >
                                채택
                              </button>
                            )}
                            <div>
                              <p>
                                <button onClick={() => setSelected(e.source)}>
                                  {
                                    library.papers.find(
                                      (p) => p.id === e.source,
                                    )?.title
                                  }
                                </button>
                                <span>→ {e.label} →</span>
                                <button onClick={() => setSelected(e.target)}>
                                  {
                                    library.papers.find(
                                      (p) => p.id === e.target,
                                    )?.title
                                  }
                                </button>
                              </p>
                              {e.origin === "suggested" && (
                                <small className="proposal-label">
                                  AI 제안 · 요약 기반, 관계 근거 미검증
                                </small>
                              )}
                              {e.note && <small>{e.note}</small>}
                            </div>
                            <button
                              className="icon-button"
                              aria-label="연결 삭제"
                              onClick={() =>
                                mutate((l) => ({
                                  ...l,
                                  edges: l.edges.filter((x) => x.id !== e.id),
                                  deleted: {
                                    ...l.deleted,
                                    [e.id]: new Date().toISOString(),
                                  },
                                }))
                              }
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    {!!suggestions.length && (
                      <div className="suggestions">
                        <h2>
                          이어 볼까요? <small>공통 태그 기반 제안</small>
                        </h2>
                        {suggestions.map((s) => (
                          <button
                            key={`${s.a.id}-${s.b.id}`}
                            onClick={() => {
                              setEdgeDraft({
                                source: s.a.id,
                                target: s.b.id,
                                label: "related to",
                                note: `공통 태그: ${s.tags.join(", ")}`,
                              });
                              setEdgeOpen(true);
                            }}
                          >
                            <span>
                              {s.a.title} <em>↔</em> {s.b.title}
                            </span>
                            <small>{s.tags.join(" · ")}</small>
                            <Plus size={16} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </main>
        {!paper && (
          <footer className="workspace-footer">
            <span>Read. Connect. Remember.</span>
            <div className="workspace-footer-links">
              <a href="/privacy/">개인정보 안내</a>
              <MakerCredit />
            </div>
          </footer>
        )}
      </div>
      <Dialog
        open={addOpen}
        onClose={() => {
          if (!busy) setAddOpen(false);
        }}
        title="논문을 놓을 자리"
      >
        <p className="dialog-description">
          읽고 싶은 논문의 arXiv 링크를 붙여 넣어 주세요.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addPaper(input);
          }}
        >
          <label htmlFor="arxiv-input">arXiv 링크 또는 ID</label>
          <input
            autoFocus
            id="arxiv-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://arxiv.org/abs/2501.12345"
            required
            disabled={!!busy}
          />
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <p className="form-hint">
            AI가 연결되어 있으면 그래프의 짧은 이름을 자동으로 만들어요. 상세
            해설은 원문을 연 뒤 직접 시작할 수 있어요.
          </p>
          <button
            className="button primary full"
            disabled={!!busy || !input.trim()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Plus size={17} />
            )}{" "}
            {busy || "라이브러리에 추가하기"}
          </button>
        </form>
      </Dialog>
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="나의 연구 공간 설정"
        wide
      >
        {settingsOpen && (
          <AIConnection ai={ai} setAi={setAi} user={user} account={accountAI} />
        )}
        <section className="settings-section">
          <h3>
            <FolderGit2 size={18} /> GitHub 저장소
          </h3>
          {user ? (
            <>
              <div className="account-line">
                <span>
                  <Github size={16} /> @{user.login}
                </span>
                <button className="text-button" onClick={logout}>
                  <LogOut size={14} /> 로그아웃
                </button>
              </div>
              <p>논문·요약·메모·그래프를 저장할 비공개 저장소를 연결하세요.</p>
              <ol className="setup-steps">
                <li>
                  <a
                    href="https://github.com/new?name=paper-palace-library&visibility=private"
                    target="_blank"
                    rel="noreferrer"
                  >
                    비공개 저장소 만들기 <ArrowUpRight size={13} />
                  </a>
                  <small>
                    Private 선택을 확인하세요. 이미 있는 저장소도 사용할 수
                    있어요.
                  </small>
                </li>
                <li>
                  {config.githubAppSlug ? (
                    <a
                      href={`https://github.com/apps/${config.githubAppSlug}/installations/new`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Paper Palace 앱에 해당 저장소 연결{" "}
                      <ArrowUpRight size={13} />
                    </a>
                  ) : (
                    <span>GitHub 앱 설정을 준비 중입니다.</span>
                  )}
                  <small>
                    Only select repositories에서 데이터용 저장소를 선택하세요.
                  </small>
                </li>
              </ol>
              <label htmlFor="repo-select">연결할 저장소</label>
              <div className="repo-select">
                <select
                  id="repo-select"
                  value={repo}
                  disabled={
                    syncing ||
                    navigating ||
                    !!busy ||
                    suggesting ||
                    paperLabels.busy
                  }
                  onChange={(e) => void changeRepo(e.target.value)}
                >
                  <option value="">비공개 저장소 선택</option>
                  {repo && !repos.some((r) => r.full_name === repo) && (
                    <option value={repo}>{repo}</option>
                  )}
                  {repos.map((r) => (
                    <option key={r.full_name} value={r.full_name}>
                      {r.full_name}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  onClick={refreshRepos}
                  aria-label="저장소 새로고침"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              <p className="form-hint">
                논문·요약·메모·그래프는 이 저장소에 자동 저장해요. 다른 기기의
                변경은 새로고침하거나 동기화 버튼을 눌러 불러올 수 있어요. 원문
                파일과 API 키는 GitHub에 저장하지 않아요.
              </p>
              <button
                className="button small"
                disabled={
                  !repo || syncing || navigating || remote.status === "loading"
                }
                onClick={sync}
              >
                <RefreshCw size={15} className={syncing ? "spin" : ""} />
                {syncing ? "동기화 중…" : "GitHub과 동기화"}
              </button>
              {repo && (
                <button
                  className="text-button local-import"
                  disabled={syncing || navigating}
                  onClick={() => void changeRepo("")}
                >
                  <Unplug size={14} /> GitHub 저장소 연결 해제
                </button>
              )}
            </>
          ) : (
            <>
              <p>
                GitHub으로 로그인하고 나의 비공개 저장소에 연구 기록을
                보관하세요.
              </p>
              <button
                className="button primary"
                onClick={login}
                disabled={!ready}
              >
                <Github size={17} /> GitHub으로 로그인
              </button>
              <p className="form-hint">
                연구 자료는 GitHub에만 보관해요. 먼저 로그인하고 저장소를 연결해
                주세요.
              </p>
              {!config.githubConfigured && (
                <p className="form-hint">
                  로그인 연결을 준비 중입니다. 잠시 후 다시 시도해 주세요.
                </p>
              )}
            </>
          )}
        </section>
        <section className="settings-section">
          <h3>
            <ArrowDownToLine size={18} /> 자료 가져오기와 내보내기
          </h3>
          <p>현재 계정의 논문·요약·메모·연결을 JSON으로 보관하세요.</p>
          <div className="button-row">
            <button
              className="button small"
              onClick={() => exportLibrary(library)}
              disabled={!libraryReady}
            >
              <ArrowDownToLine size={15} /> JSON 내보내기
            </button>
            <button
              className="button small"
              onClick={() => fileInput.current?.click()}
              disabled={!libraryReady}
            >
              <ArrowUpFromLine size={15} /> JSON 가져오기
            </button>
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              aria-label="라이브러리 JSON 파일 가져오기"
              disabled={!libraryReady}
              accept=".json,application/json"
              onChange={(e) => {
                if (e.target.files?.[0]) void importJSON(e.target.files[0]);
              }}
            />
          </div>
        </section>
        {user && (
          <details className="legacy-library-backup">
            <summary>이전 버전 자료 백업</summary>
            <p className="form-hint">
              이전 버전에서 브라우저에만 저장했던 자료를 JSON 파일로 꺼낼 수
              있어요. GitHub 자료에 자동으로 합치지 않아요.
            </p>
            <div className="button-row">
              <button
                className="button small"
                onClick={() => void exportLegacy(account)}
              >
                이전 계정 자료 내보내기
              </button>
              <button
                className="button small"
                onClick={() => void exportLegacy("guest")}
              >
                이전 비로그인 자료 내보내기
              </button>
            </div>
          </details>
        )}
        <button
          className="button primary full"
          onClick={() => {
            setSettingsOpen(false);
            notify(
              hasAIConnection(ai)
                ? "AI를 사용할 준비가 됐어요."
                : "설정을 닫았어요.",
            );
          }}
        >
          완료 <Check size={16} />
        </button>
      </Dialog>
      <Dialog
        open={edgeOpen}
        onClose={() => setEdgeOpen(false)}
        title="생각의 연결 남기기"
      >
        <p className="dialog-description">
          두 논문이 어떻게 이어지는지, 나의 관점으로 기록하세요.
        </p>
        <label>
          출발 논문
          <select
            value={edgeDraft.source}
            onChange={(e) =>
              setEdgeDraft((d) => ({ ...d, source: e.target.value }))
            }
          >
            <option value="">선택</option>
            {library.papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          관계
          <input
            value={edgeDraft.label}
            maxLength={100}
            onChange={(e) =>
              setEdgeDraft((d) => ({ ...d, label: e.target.value }))
            }
            placeholder="예: builds on, compares with, 같은 문제"
            list="relations"
          />
        </label>
        <datalist id="relations">
          <option value="builds on" />
          <option value="compares with" />
          <option value="extends" />
          <option value="related to" />
          <option value="contrasts with" />
        </datalist>
        <label>
          도착 논문
          <select
            value={edgeDraft.target}
            onChange={(e) =>
              setEdgeDraft((d) => ({ ...d, target: e.target.value }))
            }
          >
            <option value="">선택</option>
            {library.papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          연결에 대한 메모
          <textarea
            value={edgeDraft.note}
            maxLength={2000}
            onChange={(e) =>
              setEdgeDraft((d) => ({ ...d, note: e.target.value }))
            }
            placeholder="어떤 관점에서 연결되나요?"
            rows={3}
          />
        </label>
        <button className="button primary full" onClick={saveEdge}>
          <Link2 size={16} /> 연결 저장
        </button>
      </Dialog>
      <Dialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="이 논문을 삭제할까요?"
      >
        <p className="dialog-description">
          논문 요약·메모와 연결도 함께 삭제됩니다. 필요한 자료는 먼저 JSON으로
          내보내 주세요.
        </p>
        <div className="button-row">
          <button className="button" onClick={() => setDeleteId(null)}>
            취소
          </button>
          <button className="button danger" onClick={deletePaper}>
            논문 삭제
          </button>
        </div>
      </Dialog>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="알림 닫기"
          >
            <X size={15} />
          </button>
        </div>
      )}
      <Dialog
        open={!!pendingLeave}
        onClose={() => setPendingLeave(null)}
        title="아직 GitHub에 저장하지 못했어요"
      >
        <p className="dialog-description">
          저장하지 않은 변경이 이 탭에 남아 있어요. 다시 저장하거나 JSON으로
          백업한 후 이동할 수 있어요.
        </p>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() => exportLibrary(library)}
          >
            JSON으로 백업
          </button>
          <button className="button" onClick={() => setPendingLeave(null)}>
            계속 작업하기
          </button>
          <button
            className="button danger"
            onClick={async () => {
              const next = pendingLeave;
              if (!next) return;
              remote.session.discard();
              setPendingLeave(null);
              try {
                await next.action();
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            미저장 변경 버리고 {pendingLeave?.label}
          </button>
        </div>
      </Dialog>
      {storage.conflictDialog}
    </div>
  );
}
