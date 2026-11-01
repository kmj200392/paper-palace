import { emptyLibrary, librarySchema, type Library } from "./model";
import { libraryContent } from "./reconcile";

export type RemoteLibrary = { library: Library | null; sha: string | null };
export type LibraryMerge = (
  base: Library | null,
  current: Library,
  incoming: Library,
  label: string,
) => Promise<Library>;
export type GitHubLibraryState = {
  library: Library | null;
  status: "idle" | "loading" | "ready" | "saving" | "error";
  dirty: boolean;
  error: string;
};
type Transport = {
  read: () => Promise<RemoteLibrary>;
  write: (library: Library, sha: string | null) => Promise<unknown>;
};

// This session owns only the open tab's working state. GitHub is the durable copy.
export class GitHubLibrarySession {
  private state: GitHubLibraryState = {
    library: null,
    status: "idle",
    dirty: false,
    error: "",
  };
  private baseline: Library | null = null;
  private listeners = new Set<() => void>();
  private generation = 0;
  private active = false;
  private flight: Promise<void> | null = null;
  private lastWrite = 0;
  constructor(
    private transport: Transport,
    private merge: LibraryMerge,
    private label: string,
    private writeInterval = 1500,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<GitHubLibraryState>) {
    this.state = { ...this.state, ...patch };
    this.state.dirty =
      !!this.state.library &&
      !!this.baseline &&
      libraryContent(this.state.library) !== libraryContent(this.baseline);
    this.listeners.forEach((listener) => listener());
  }
  private current(generation: number) {
    return this.active && this.generation === generation;
  }
  private validated(remote: RemoteLibrary) {
    if (
      !remote ||
      !(remote.sha === null || typeof remote.sha === "string") ||
      (remote.library !== null && !remote.sha)
    )
      throw new Error(
        "GitHub 자료의 버전을 확인하지 못했어요. 다시 불러와 주세요.",
      );
    return {
      library:
        remote.library === null
          ? emptyLibrary()
          : librarySchema.parse(remote.library),
      sha: remote.sha,
    };
  }
  async open() {
    this.active = true;
    const generation = ++this.generation;
    this.baseline = null;
    this.publish({ library: null, status: "loading", error: "" });
    try {
      const remote = this.validated(await this.transport.read());
      if (!this.current(generation)) return;
      this.baseline = remote.library;
      this.publish({ library: remote.library, status: "ready" });
    } catch (error) {
      if (this.current(generation))
        this.publish({ status: "error", error: (error as Error).message });
    }
  }
  close() {
    this.active = false;
    this.generation++;
  }
  update = (value: Library | ((library: Library) => Library)) => {
    if (!this.active || !this.state.library || !this.baseline) return;
    const library =
      typeof value === "function" ? value(this.state.library) : value;
    this.publish({ library });
  };
  sync = (): Promise<void> => {
    if (this.flight) return this.flight;
    if (!this.active || !this.state.library || !this.baseline)
      return Promise.reject(new Error("먼저 GitHub 자료를 불러와 주세요."));
    const task = this.synchronize();
    this.flight = task;
    void task
      .finally(() => {
        if (this.flight === task) this.flight = null;
      })
      .catch(() => {});
    return task;
  };
  private async synchronize() {
    const generation = this.generation;
    this.publish({ status: "saving", error: "" });
    try {
      // Leave room between commits, including explicit save/leave actions.
      const delay = this.lastWrite + this.writeInterval - Date.now();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      if (!this.current(generation)) return;
      const remote = this.validated(await this.transport.read());
      if (!this.current(generation)) return;
      let before = this.state.library!;
      let merged = await this.merge(
        this.baseline,
        before,
        remote.library,
        this.label,
      );
      // A note edit or an AI response may arrive during fetch or conflict review.
      while (
        this.current(generation) &&
        libraryContent(this.state.library!) !== libraryContent(before)
      ) {
        const now = this.state.library!;
        merged = await this.merge(before, now, merged, "저장 중 도착한 변경");
        before = now;
      }
      if (!this.current(generation)) return;
      this.publish({ library: merged });
      if (libraryContent(merged) !== libraryContent(remote.library)) {
        this.lastWrite = Date.now();
        await this.transport.write(merged, remote.sha);
      }
      if (!this.current(generation)) return;
      // Newer edits made while PUT was running stay dirty for the next save.
      this.baseline = merged;
      this.publish({ status: "ready", error: "" });
    } catch (error) {
      if (this.current(generation))
        this.publish({ status: "error", error: (error as Error).message });
      throw error;
    }
  }
  discard() {
    if (this.baseline)
      this.publish({ library: this.baseline, status: "ready", error: "" });
  }
  async flush() {
    if (this.flight) await this.flight;
    for (let attempt = 0; this.state.dirty && attempt < 4; attempt++)
      await this.sync();
    if (this.state.dirty)
      throw new Error(
        "아직 저장하지 못한 변경이 있어요. 저장을 마친 뒤 이동해 주세요.",
      );
  }
}
