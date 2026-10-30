"use client";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  FolderGit2,
  FolderOpen,
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
} from "lucide-react";
import { Brand } from "./brand";
import { MakerCredit } from "./maker-credit";
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
  loadLibrary,
  saveLibrary,
  exportLibrary,
  readLocal,
  writeLocal,
} from "@/lib/storage";
import { api } from "@/lib/api";
import { useStorageConnections } from "./use-storage-connections";
import { libraryContent } from "@/lib/reconcile";
import { type FolderConnection } from "@/lib/folder";
import { importPaper } from "@/lib/source";
type User = { id: number; login: string; name: string };
export default function Workspace() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    try {
      setSidebarCollapsed(
        localStorage.getItem("paper-palace:sidebar-collapsed") === "true",
      );
    } catch {
      /* Preferences can be unavailable in private mode. */
    }
  }, []);
  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem("paper-palace:sidebar-collapsed", String(next));
    } catch {
      /* Keep the in-memory preference. */
    }
  };
  const [suggesting, setSuggesting] = useState(false);
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [account, setAccount] = useState("guest"),
    [library, setLibraryState] = useState<Library>(emptyLibrary),
    [view, setView] = useState<"library" | "graph">("library"),
    [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
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
    [syncing, setSyncing] = useState(false),
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
  const fileInput = useRef<HTMLInputElement>(null),
    latest = useRef(library),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setLibrary = useCallback(
    (value: Library | ((l: Library) => Library)) => {
      const next = typeof value === "function" ? value(latest.current) : value;
      latest.current = next;
      setLibraryState(next);
    },
    [],
  );
  const storage = useStorageConnections({
    account,
    ready,
    latest,
    update: setLibrary,
  });
  const paperLabels = usePaperLabels({
    account,
    ai,
    library,
    enabled: ready && !settingsOpen,
    update: setLibrary,
  });
  const [connectingFolder, setConnectingFolder] = useState(false);
  const storageAction = async (action: () => Promise<unknown>) => {
    setConnectingFolder(true);
    try {
      await action();
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        notify((e as Error).message);
    } finally {
      setConnectingFolder(false);
    }
  };
  const notify = (s: string) => {
    setToast(s);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6500);
  };
  const mutate = (fn: (l: Library) => Library) =>
    setLibrary((l) => ({ ...fn(l), updatedAt: new Date().toISOString() }));
  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const [me, conf] = await Promise.all([
          api<{ user: User | null }>("/me"),
          api<typeof config>("/config"),
        ]);
        if (stopped) return;
        setUser(me.user);
        setConfig(conf);
        const acc = me.user ? `github:${me.user.id}` : "guest";
        const [lib, savedRepo] = await Promise.all([
          loadLibrary(acc),
          readLocal<string>(`repo:${acc}`),
        ]);
        if (stopped) return;
        setAccount(acc);
        setLibrary(lib);
        setRepo(savedRepo || "");
        // The explicit login button carries this tab's library and folder through OAuth.
        // A normal account switch never imports another account's cache implicitly.
        const transferKey = sessionStorage.getItem(
          "paper-palace:login-transfer",
        );
        if (me.user && transferKey) {
          const transfer = await readLocal<{
            library: Library;
            folder: FolderConnection | null;
            createdAt: number;
          }>(transferKey);
          let transferred = false;
          if (transfer && Date.now() - transfer.createdAt < 60 * 60 * 1000) {
            try {
              const merged = await storage.merge(
                null,
                lib,
                librarySchema.parse(transfer.library),
                "로그인 전 라이브러리",
              );
              await saveLibrary(acc, merged);
              if (transfer.folder)
                await writeLocal(`folder:${acc}`, transfer.folder);
              setLibrary(merged);
              transferred = true;
              setSettingsOpen(true);
              notify(
                "로그인 전 자료를 이어받았어요. 저장소를 선택하고 동기화하세요.",
              );
            } catch (e) {
              setError(
                (e as Error).message +
                  " 새로고침하면 로그인 전 연결을 다시 이어받을 수 있어요.",
              );
            }
          }
          if (
            transferred ||
            !transfer ||
            Date.now() - transfer.createdAt >= 60 * 60 * 1000
          ) {
            sessionStorage.removeItem("paper-palace:login-transfer");
            await writeLocal(transferKey, null);
          }
        }
        const params = new URLSearchParams(location.search);
        if (params.has("error"))
          setError(
            params.get("error") === "auth_setup"
              ? "GitHub 로그인 설정을 준비 중이에요. 브라우저 저장으로 먼저 사용할 수 있어요."
              : "GitHub 로그인에 실패했어요. 다시 로그인해 주세요.",
          );
      } catch (e) {
        setError((e as Error).message);
        try {
          setLibrary(await loadLibrary("guest"));
        } catch {
          setError(
            "브라우저 저장소를 열 수 없어요. 저장 설정을 확인해 주세요.",
          );
        }
      } finally {
        if (!stopped) setReady(true);
      }
    })();
    return () => {
      stopped = true;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(
      () => saveLibrary(account, library).catch((e) => setError(e.message)),
      300,
    );
    return () => clearTimeout(timer);
  }, [library, account, ready]);
  useEffect(() => {
    const flush = () => {
      if (ready) saveLibrary(account, latest.current).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [ready, account]);
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
    if (busy) return;
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
  const login = async () => {
    if (!ready) return;
    try {
      await storage.serial(async () => {
        if (storage.folder) await storage.flushFolder();
        await saveLibrary(account, latest.current);
        const key = `login-transfer:${crypto.randomUUID()}`;
        await writeLocal(key, {
          library: latest.current,
          folder:
            (await readLocal<FolderConnection>(`folder:${account}`)) || null,
          createdAt: Date.now(),
        });
        sessionStorage.setItem("paper-palace:login-transfer", key);
      });
      location.assign("/api/auth/login");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const sync = async () => {
    if (!user || !repo) {
      setSettingsOpen(true);
      return;
    }
    if (syncing) return;
    setSyncing(true);
    const selectedRepo = repo;
    let remoteSaved: Library | null = null;
    try {
      await storage.serial(async () => {
        if (storage.folder) await storage.flushFolder();
        const remote = await api<{
          library: Library | null;
          sha: string | null;
        }>(`/library?repo=${encodeURIComponent(selectedRepo)}`);
        const baseline = await readLocal<Library>(
          `github-base:${account}:${selectedRepo}`,
        );
        const before = latest.current;
        const incoming = remote.library
          ? librarySchema.parse(remote.library)
          : emptyLibrary();
        let merged = await storage.merge(
          baseline || null,
          before,
          incoming,
          selectedRepo,
        );
        merged = await storage.integrate(before, merged);
        if (
          !remote.library ||
          libraryContent(merged) !== libraryContent(remote.library)
        ) {
          await api("/library", {
            method: "PUT",
            body: JSON.stringify({
              repo: selectedRepo,
              sha: remote.sha,
              library: merged,
            }),
          });
        }
        remoteSaved = merged;
        await writeLocal(`github-base:${account}:${selectedRepo}`, merged);
        await saveLibrary(account, latest.current);
        await writeLocal(`repo:${account}`, selectedRepo);
        if (storage.folder) {
          try {
            await storage.flushFolder();
          } catch (e) {
            throw new Error(
              "GitHub에는 동기화했지만 폴더 저장은 완료하지 못했어요. " +
                (e as Error).message,
            );
          }
        }
      });
      const pending =
        remoteSaved &&
        libraryContent(remoteSaved) !== libraryContent(latest.current);
      notify(
        pending
          ? "동기화를 마쳤어요. 동기화 중 추가된 변경은 한 번 더 동기화해 주세요."
          : storage.folder
            ? "GitHub와 로컬 폴더에 동기화했어요."
            : "GitHub에 동기화했어요.",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };
  const logout = async () => {
    try {
      await storage.serial(async () => {
        if (storage.folder) await storage.flushFolder();
      });
      await saveLibrary(account, latest.current);
      await api("/auth/logout", { method: "POST" });
      setAi((a) => ({ ...a, apiKey: "", accountId: undefined }));
      location.assign("/app/");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const importJSON = async (file: File) => {
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
    notify("논문을 삭제했어요. GitHub에서도 반영하려면 동기화해 주세요.");
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
  return (
    <div className={`workspace${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside
        id="workspace-sidebar"
        className="sidebar"
        hidden={sidebarCollapsed}
      >
        <Brand compact />
        <span className="sidebar-label">MY PALACE</span>
        <nav aria-label="연구 공간 메뉴">
          <button
            className={view === "library" && !selected ? "active" : ""}
            onClick={() => {
              setView("library");
              setSelected(null);
            }}
          >
            <LibraryIcon size={19} /> 라이브러리{" "}
            <span>{library.papers.length}</span>
          </button>
          <button
            className={view === "graph" && !selected ? "active" : ""}
            onClick={() => {
              setView("graph");
              setSelected(null);
            }}
          >
            <Network size={19} /> 지식 지도 <span>{library.edges.length}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-quote">
            A little reading.
            <br />
            <em>A new connection.</em>
          </div>
          <button
            className="sidebar-settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={17} /> 연결 및 설정
          </button>
          {user ? (
            <button className="user-info" onClick={() => setSettingsOpen(true)}>
              <span className="avatar">
                {user.login.slice(0, 1).toUpperCase()}
              </span>
              <span>
                {user.name}
                <small>@{user.login}</small>
              </span>
              <ChevronRight size={15} />
            </button>
          ) : (
            <button className="github-login" onClick={login} disabled={!ready}>
              <Github size={18} /> GitHub으로 로그인
            </button>
          )}
          <a className="sidebar-home" href="/">
            Paper Palace 소개 <ArrowUpRight size={12} />
          </a>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <div className="workspace-context">
            <button
              className="icon-button sidebar-toggle"
              onClick={toggleSidebar}
              aria-controls="workspace-sidebar"
              aria-expanded={!sidebarCollapsed}
              aria-label={
                sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"
              }
              title={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={19} />
              ) : (
                <PanelLeftClose size={19} />
              )}
            </button>
            <span className="workspace-context-label">
              {selected
                ? "READING ROOM"
                : view === "graph"
                  ? "YOUR PERSONAL RESEARCH GRAPH"
                  : "YOUR PERSONAL LIBRARY"}
            </span>
          </div>
          <div>
            <button
              className={`key-status ${hasAIConnection(ai) ? "connected" : ""}`}
              onClick={() => setSettingsOpen(true)}
            >
              <KeyRound size={14} />
              {hasAIConnection(ai) ? "AI 연결됨" : "AI 연결"}
            </button>
            <button
              className="text-button sync-button"
              disabled={syncing}
              onClick={sync}
            >
              <RefreshCw size={15} className={syncing ? "spin" : ""} />
              {syncing ? "동기화 중" : "GitHub 동기화"}
            </button>
            <button
              className="button primary small"
              onClick={() => {
                setError("");
                setAddOpen(true);
              }}
            >
              <Plus size={16} /> 논문 추가
            </button>
          </div>
        </header>
        <main id="main" className={selected ? "reader-main" : "library-main"}>
          {storage.folder &&
            (storage.status === "permission" || storage.status === "error") && (
              <div className="error-banner" role="alert">
                <span>{storage.message || "폴더 저장을 확인해 주세요."}</span>
                <button
                  className="text-button"
                  onClick={() => setSettingsOpen(true)}
                >
                  저장 위치 관리
                </button>
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
          {!ready ? (
            <div className="loading-state">
              <LoaderCircle size={22} className="spin" /> 나의 연구 공간을 여는
              중…
            </div>
          ) : paper ? (
            <Reader
              key={paper.id}
              paper={paper}
              settings={ai}
              openSettings={() => setSettingsOpen(true)}
              notify={notify}
              onBack={() => setSelected(null)}
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
          ) : (
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
              <div className="local-notice storage-overview">
                <span>
                  <span
                    className={`status-dot ${storage.status === "error" || storage.status === "permission" ? "needs-attention" : ""}`}
                  />
                  {storage.folder
                    ? `${storage.folder.handle.name} · ${storage.status === "saved" ? "폴더 저장됨" : storage.status === "saving" ? "폴더 저장 중" : storage.status === "permission" ? "재연결 필요" : storage.status === "error" ? "폴더 저장 확인 필요" : "폴더 확인 중"}`
                    : "브라우저에 저장 중"}
                  <small>
                    {repo && user
                      ? `GitHub · ${repo} · 수동 동기화`
                      : "폴더와 GitHub를 언제든 함께 연결할 수 있어요."}
                  </small>
                </span>
                <button
                  className="text-button"
                  onClick={() => setSettingsOpen(true)}
                >
                  저장 위치 관리 <ArrowUpRight size={13} />
                </button>
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
        <footer className="workspace-footer">
          <span>Read. Connect. Remember.</span>
          <div className="workspace-footer-links">
            <a href="/privacy/">개인정보 안내</a>
            <MakerCredit />
          </div>
        </footer>
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
        <section className="settings-section folder-settings">
          <h3>
            <FolderOpen size={18} /> 로컬 폴더
          </h3>
          <p>
            논문·요약·메모·그래프를 내 컴퓨터에 저장하세요. GitHub와 함께
            연결하면 같은 라이브러리를 다른 기기에서도 이어갈 수 있어요.
          </p>
          {storage.folder && (
            <div className="folder-connection">
              <strong>
                <FolderOpen size={16} /> {storage.folder.handle.name}
              </strong>
              <code>paper-palace/library.json</code>
              <p role="status">
                {storage.status === "saved"
                  ? "폴더 저장됨 · 변경 사항 자동 저장"
                  : storage.status === "saving"
                    ? "폴더에 저장하는 중…"
                    : storage.status === "permission"
                      ? "폴더 접근 권한을 다시 허용해 주세요."
                      : storage.status === "error"
                        ? "폴더 저장이 멈췄어요. 브라우저의 자료는 유지돼요."
                        : "폴더 연결 확인 중…"}
              </p>
            </div>
          )}
          {storage.message && (
            <p className="inline-error" role="alert">
              {storage.message}
            </p>
          )}
          <div className="button-row">
            <button
              className="button small"
              disabled={
                !storage.supported ||
                !storage.loaded ||
                connectingFolder ||
                syncing
              }
              onClick={() => storageAction(storage.attach)}
            >
              <FolderOpen size={15} />
              {storage.folder ? "다른 폴더 연결" : "로컬 폴더 연결"}
            </button>
            {storage.folder && (
              <>
                <button
                  className="button small"
                  disabled={connectingFolder || syncing}
                  onClick={() => storageAction(storage.reconnect)}
                >
                  <RefreshCw size={15} />
                  {storage.status === "permission"
                    ? "폴더 다시 연결"
                    : "폴더 다시 동기화"}
                </button>
                <button
                  className="text-button"
                  disabled={connectingFolder || syncing}
                  onClick={() => storageAction(storage.detach)}
                >
                  <Unplug size={14} /> 폴더 연결 해제
                </button>
              </>
            )}
          </div>
          <p className="form-hint">
            현재 자료와 폴더 안의 기존 자료를 합쳐요. 페이지가 열려 있을 때 자동
            저장하고 외부 변경을 확인해요. 연결을 해제해도 파일과 현재
            라이브러리는 남아요. PDF와 API 키는 폴더에 저장하지 않아요.
          </p>
          {!storage.supported && (
            <p className="inline-error">
              이 브라우저는 폴더 연결을 지원하지 않아요. Chrome·Edge에서 열거나
              GitHub / JSON 가져오기·내보내기를 사용해 주세요.
            </p>
          )}
        </section>
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
                  disabled={syncing || connectingFolder}
                  onChange={(e) => {
                    setRepo(e.target.value);
                    void writeLocal(`repo:${account}`, e.target.value).catch(
                      (e) => notify(e.message),
                    );
                  }}
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
                선택한 저장소·현재 라이브러리·연결한 폴더의 자료를 합칩니다.
                원격 변경을 가져오거나 보낼 때 동기화 버튼을 눌러 주세요. 원문
                파일과 API 키는 저장하지 않아요.
              </p>
              <button
                className="button small"
                disabled={!repo || syncing || connectingFolder}
                onClick={sync}
              >
                <RefreshCw size={15} className={syncing ? "spin" : ""} />
                {syncing ? "동기화 중…" : "GitHub과 동기화"}
              </button>
              {repo && (
                <button
                  className="text-button local-import"
                  disabled={syncing || connectingFolder}
                  onClick={async () => {
                    try {
                      await writeLocal(`repo:${account}`, "");
                      setRepo("");
                      notify(
                        "GitHub 저장소 연결을 해제했어요. 현재 자료와 폴더 파일은 유지돼요.",
                      );
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  <Unplug size={14} /> GitHub 저장소 연결 해제
                </button>
              )}
              <button
                className="text-button local-import"
                onClick={async () => {
                  try {
                    const guest = await loadLibrary("guest");
                    await storage.serial(async () => {
                      const before = latest.current;
                      const merged = await storage.merge(
                        null,
                        before,
                        guest,
                        "로그인 전 라이브러리",
                      );
                      await storage.integrate(before, merged);
                    });
                    notify(
                      `로그인 전에 저장한 ${guest.papers.length}편을 가져왔어요.`,
                    );
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                로그인 전에 이 브라우저에 저장한 자료 가져오기
              </button>
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
                disabled={!ready || connectingFolder}
              >
                <Github size={17} /> GitHub으로 로그인
              </button>
              <p className="form-hint">
                현재 논문과 연결한 로컬 폴더를 로그인 후에도 이어서 사용해요.
              </p>
              {!config.githubConfigured && (
                <p className="form-hint">
                  로그인 연결을 준비 중입니다. 지금은 브라우저 저장과 JSON
                  내보내기를 사용할 수 있어요.
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
            >
              <ArrowDownToLine size={15} /> JSON 내보내기
            </button>
            <button
              className="button small"
              onClick={() => fileInput.current?.click()}
            >
              <ArrowUpFromLine size={15} /> JSON 가져오기
            </button>
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              aria-label="라이브러리 JSON 파일 가져오기"
              accept=".json,application/json"
              onChange={(e) => {
                if (e.target.files?.[0]) void importJSON(e.target.files[0]);
              }}
            />
          </div>
        </section>
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
      {storage.conflictDialog}
    </div>
  );
}
