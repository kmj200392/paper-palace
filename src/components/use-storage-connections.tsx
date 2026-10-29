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
import {
  pickFolder,
  readFolder,
  writeFolder,
  supportsFolders,
  type FolderConnection,
} from "@/lib/folder";
import { readLocal, writeLocal } from "@/lib/storage";
import { Dialog } from "./dialog";

export type FolderStatus =
  | "none"
  | "checking"
  | "saving"
  | "saved"
  | "permission"
  | "error";
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
export function useStorageConnections({
  account,
  ready,
  latest,
  update,
}: {
  account: string;
  ready: boolean;
  latest: MutableRefObject<Library>;
  update: (library: Library) => void;
}) {
  const [folder, setFolder] = useState<FolderConnection | null>(null);
  const [status, setStatus] = useState<FolderStatus>("none");
  const [message, setMessage] = useState("");
  const [supported, setSupported] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const current = useRef<FolderConnection | null>(null),
    paused = useRef(false);
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
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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
      // Edits or an AI response can arrive while a file/network request is running.
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

  const flushFolder = useCallback(async () => {
    const connection = current.current;
    if (!connection) return latest.current;
    const work = async () => {
      if (!mounted.current || current.current !== connection)
        return latest.current;
      try {
        if (
          (await connection.handle.queryPermission({ mode: "readwrite" })) !==
          "granted"
        ) {
          setStatus("permission");
          throw new Error(
            "폴더 접근 권한이 필요해요. ‘폴더 다시 연결’을 눌러 주세요.",
          );
        }
        setStatus("saving");
        const disk = await readFolder(connection.handle);
        const before = latest.current;
        let merged = await merge(
          connection.base,
          before,
          disk.library,
          connection.handle.name + " 폴더",
        );
        merged = await integrate(before, merged);
        if (
          disk.raw === null ||
          libraryContent(merged) !== libraryContent(disk.library)
        )
          await writeFolder(connection.handle, disk, merged);
        connection.base = merged;
        await writeLocal(`folder:${account}`, connection);
        paused.current = false;
        setStatus("saved");
        setMessage("");
        return latest.current;
      } catch (e) {
        paused.current = true;
        const permission =
          e instanceof Error &&
          (e.name === "NotAllowedError" || e.message.includes("권한"));
        setStatus(permission ? "permission" : "error");
        setMessage(
          e instanceof Error
            ? e.message
            : "폴더를 저장하지 못했어요. 연결 상태를 확인해 주세요.",
        );
        throw e;
      }
    };
    return navigator.locks
      ? navigator.locks.request("paper-palace:folder-write", work)
      : work();
  }, [account, integrate, latest, merge]);

  useEffect(() => {
    setSupported(supportsFolders());
    if (!ready) return;
    let stopped = false;
    setLoaded(false);
    void readLocal<FolderConnection>(`folder:${account}`)
      .then((value) => {
        if (stopped) return;
        current.current = value || null;
        setFolder(value || null);
        paused.current = false;
        setStatus(value ? "checking" : "none");
        setLoaded(true);
      })
      .catch((e) => {
        if (!stopped) {
          setStatus("error");
          setMessage(e.message);
          setLoaded(true);
        }
      });
    return () => {
      stopped = true;
    };
  }, [account, ready]);

  // Browser cache is saved separately. Disk is flushed while the page is open;
  // never claim a successful folder save in an unload callback.
  const content = libraryContent(latest.current);
  useEffect(() => {
    if (!loaded || !folder || paused.current) return;
    setStatus("checking");
    const timer = setTimeout(() => {
      void serial(() =>
        paused.current || current.current !== folder
          ? Promise.resolve(latest.current)
          : flushFolder(),
      ).catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [content, loaded, folder, serial, flushFolder]);
  useEffect(() => {
    if (!loaded || !folder) return;
    let pending = false;
    const refresh = () => {
      if (pending || paused.current || document.visibilityState !== "visible")
        return;
      pending = true;
      void serial(() =>
        paused.current || current.current !== folder
          ? Promise.resolve(latest.current)
          : flushFolder(),
      )
        .catch(() => {})
        .finally(() => {
          pending = false;
        });
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [loaded, folder, serial, flushFolder]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        current.current &&
        libraryContent(latest.current) !==
          libraryContent(
            current.current.base || {
              version: 1,
              papers: [],
              edges: [],
              deleted: {},
              updatedAt: "",
            },
          )
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [latest]);

  const attach = async () => {
    // Must be called before any await, directly from a button gesture.
    const handle = await pickFolder();
    return serial(async () => {
      const next: FolderConnection = { handle, base: null };
      // Validate before replacing the remembered connection.
      await readFolder(handle);
      await writeLocal(`folder:${account}`, next);
      current.current = next;
      setFolder(next);
      paused.current = false;
      await flushFolder();
    });
  };
  const reconnect = async () => {
    const connection = current.current;
    if (!connection) return;
    const permission = await connection.handle.requestPermission({
      mode: "readwrite",
    });
    if (permission !== "granted")
      throw new Error(
        "폴더 권한이 승인되지 않았어요. 브라우저의 자료는 유지돼요.",
      );
    await serial(flushFolder);
  };
  const detach = () =>
    serial(async () => {
      await writeLocal(`folder:${account}`, null);
      current.current = null;
      paused.current = false;
      setFolder(null);
      setStatus("none");
      setMessage("");
    });
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
    folder,
    status,
    message,
    supported,
    loaded,
    attach,
    reconnect,
    detach,
    flushFolder,
    serial,
    merge,
    integrate,
    conflictDialog,
  };
}
