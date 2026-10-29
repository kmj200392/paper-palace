import { emptyLibrary, librarySchema, type Library } from "./model";

export const LIBRARY_PATH = "paper-palace/library.json";
export type DirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
};
export type FolderConnection = {
  handle: DirectoryHandle;
  base: Library | null;
};
export type FolderSnapshot = { library: Library; raw: string | null };
type PickerWindow = Window & {
  showDirectoryPicker?: (options: {
    id: string;
    mode: "readwrite";
  }) => Promise<DirectoryHandle>;
};
export const supportsFolders = () =>
  typeof window !== "undefined" &&
  typeof (window as PickerWindow).showDirectoryPicker === "function";
export function pickFolder() {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker)
    throw new Error(
      "이 브라우저는 폴더 저장을 지원하지 않아요. Chrome·Edge에서 열거나 GitHub / JSON 내보내기를 사용해 주세요.",
    );
  return picker.call(window, { id: "paper-palace-library", mode: "readwrite" });
}
export async function readFolder(
  handle: DirectoryHandle,
): Promise<FolderSnapshot> {
  try {
    const directory = await handle.getDirectoryHandle("paper-palace");
    const file = await (
      await directory.getFileHandle("library.json")
    ).getFile();
    if (file.size > 3_000_000)
      throw new Error(
        "폴더의 library.json이 3MB 한도를 넘었어요. 기존 파일은 보존했어요.",
      );
    const raw = await file.text();
    const parsed = librarySchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new Error(
        "폴더의 library.json 형식이 달라요. 기존 파일은 보존했어요.",
      );
    return { library: parsed.data, raw };
  } catch (e) {
    if (e instanceof Error && e.name === "NotFoundError")
      return { library: emptyLibrary(), raw: null };
    if (e instanceof SyntaxError)
      throw new Error(
        "폴더의 library.json을 읽지 못했어요. 잘못된 JSON 파일은 덮어쓰지 않아요.",
      );
    throw e;
  }
}
export async function writeFolder(
  handle: DirectoryHandle,
  expected: FolderSnapshot,
  library: Library,
) {
  const raw = JSON.stringify(librarySchema.parse(library), null, 2) + "\n";
  if (new TextEncoder().encode(raw).byteLength > 3_000_000)
    throw new Error(
      "라이브러리가 3MB 한도를 넘었어요. JSON으로 내보내 주세요.",
    );
  // Re-read immediately before replacement, including after a conflict dialog.
  // File System Access cannot lock out an arbitrary native editor; callers retry on a detected race.
  if ((await readFolder(handle)).raw !== expected.raw)
    throw new Error(
      "다른 프로그램에서 파일을 변경했어요. ‘폴더 다시 동기화’를 누르면 최신 내용부터 합쳐요.",
    );
  const directory = await handle.getDirectoryHandle("paper-palace", {
    create: true,
  });
  const file = await directory.getFileHandle("library.json", { create: true });
  const writer = await file.createWritable({
    mode: "exclusive",
  } as FileSystemCreateWritableOptions);
  try {
    await writer.write(raw);
    await writer.close();
  } catch (e) {
    await writer.abort().catch(() => {});
    throw e;
  }
}
