const DATABASE = "chess-forge-files";
const STORE = "handles";
const KEY = "auto-import";

export interface AutoImportHandle extends FileSystemFileHandle {
  queryPermission(options?: {
    mode?: "read" | "readwrite";
  }): Promise<PermissionState>;
  requestPermission(options?: {
    mode?: "read" | "readwrite";
  }): Promise<PermissionState>;
}

declare global {
  interface Window {
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<AutoImportHandle[]>;
  }
}

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(
        database.transaction(STORE, mode).objectStore(STORE),
      );
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export const supportsAutoImport = () =>
  !!window.showOpenFilePicker && !!window.indexedDB;

export const getAutoImportHandle = () =>
  transaction<AutoImportHandle | undefined>("readonly", (store) =>
    store.get(KEY),
  );

export const setAutoImportHandle = (handle: AutoImportHandle) =>
  transaction<IDBValidKey>("readwrite", (store) => store.put(handle, KEY));

export const clearAutoImportHandle = () =>
  transaction<undefined>("readwrite", (store) => store.delete(KEY));

export async function chooseAutoImportFile() {
  if (!window.showOpenFilePicker)
    throw new Error("自動読込に対応していないブラウザです。");
  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: [
      {
        description: "Chess Forge 駒セット",
        accept: { "application/json": [".json"] },
      },
    ],
  });
  if (!handle) return null;
  await setAutoImportHandle(handle);
  return handle;
}

export async function readAutoImportFile(handle: AutoImportHandle) {
  let permission = await handle.queryPermission({ mode: "read" });
  if (permission !== "granted")
    permission = await handle.requestPermission({ mode: "read" });
  if (permission !== "granted")
    throw new Error("自動読込ファイルの参照が許可されませんでした。");
  return handle.getFile();
}
