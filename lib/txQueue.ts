const DB_NAME = "smartsaku-offline";
const STORE = "pending-tx";

export type PendingTx = {
  clientId: string;
  amount: string; // minor units, as submitted
  direction: "IN" | "OUT";
  accountId: string;
  categoryId: string | null;
  note: string;
  date: string; // "YYYY-MM-DDTHH:mm" wall clock
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export function enqueueTx(item: PendingTx): Promise<IDBValidKey> {
  return tx("readwrite", (s) => s.put(item));
}

export function allTx(): Promise<PendingTx[]> {
  return tx<PendingTx[]>("readonly", (s) => s.getAll() as IDBRequest<PendingTx[]>);
}

export function removeTx(clientId: string): Promise<undefined> {
  return tx("readwrite", (s) => s.delete(clientId));
}

export async function countTx(): Promise<number> {
  try {
    return await tx<number>("readonly", (s) => s.count());
  } catch {
    return 0;
  }
}
