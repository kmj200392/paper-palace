import {
  librarySchema,
  emptyLibrary,
  type Library,
  type Source,
} from "./model";
const DB = "paper-palace";
async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("data");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(new Error("이 브라우저에서 로컬 저장소를 열 수 없어요."));
  });
}
export async function readLocal<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("data"),
      r = t.objectStore("data").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => d.close();
  });
}
export async function writeLocal(key: string, value: unknown) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const t = d.transaction("data", "readwrite");
    t.objectStore("data").put(value, key);
    t.oncomplete = () => {
      d.close();
      resolve();
    };
    t.onerror = () => {
      d.close();
      reject(
        new Error(
          "저장 공간이 부족하거나 브라우저 저장이 차단되어 있어요. JSON으로 내보내 주세요.",
        ),
      );
    };
  });
}
export async function loadLibrary(account: string) {
  const value = await readLocal(`library:${account}`);
  return value ? librarySchema.parse(value) : emptyLibrary();
}
export const saveLibrary = (account: string, value: Library) =>
  writeLocal(`library:${account}`, value);
export const loadSource = (id: string) => readLocal<Source>(`source:${id}`);
export const saveSource = (source: Source) =>
  writeLocal(`source:${source.arxivId}`, source);
export function exportLibrary(library: Library) {
  const a = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob([JSON.stringify(library, null, 2)], {
        type: "application/json",
      }),
    );
  a.href = url;
  a.download = `paper-palace-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
