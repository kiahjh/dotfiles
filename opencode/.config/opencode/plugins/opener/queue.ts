import { isOffer, type Offer } from "./model";

export interface Storage {
  get(key: string): Promise<unknown>;
  set(key: string, value: Offer[]): Promise<void>;
}

export function createQueue(storage: Storage) {
  const pending = new Map<string, Promise<unknown>>();
  const key = (sessionID: string) => `pending/${sessionID}`;
  async function read(sessionID: string): Promise<Offer[]> {
    const stored = await storage.get(key(sessionID));
    return Array.isArray(stored) ? stored.filter(isOffer).filter((item) => item.sessionID === sessionID) : [];
  }
  function update<T>(sessionID: string, change: (items: Offer[]) => Promise<T>): Promise<T> {
    const result = (pending.get(sessionID) ?? Promise.resolve()).catch(() => {}).then(async () => change(await read(sessionID)));
    pending.set(sessionID, result);
    void result.finally(() => { if (pending.get(sessionID) === result) pending.delete(sessionID); }).catch(() => {});
    return result;
  }
  return {
    async list(sessionID: string) {
      await pending.get(sessionID)?.catch(() => {});
      return read(sessionID);
    },
    add(item: Offer) {
      return update(item.sessionID, async (items) => {
        const existing = items.find((current) => current.id === item.id || current.target === item.target);
        if (existing) return existing;
        if (items.length >= 20) throw new Error("There are already 20 pending items in this session. Open or dismiss one before offering another.");
        await storage.set(key(item.sessionID), [...items, item]);
        return item;
      });
    },
    dismiss(sessionID: string, id: string) {
      return update(sessionID, (items) => storage.set(key(sessionID), items.filter((item) => item.id !== id)));
    },
  };
}
