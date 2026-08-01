import type { InstalledModel, LibraryEntry, ModelManifest, Profile } from "../model/types";

const DB_NAME = "youjian-local";
const DB_VERSION = 1;

type StoreName = "profiles" | "ratings" | "preferences" | "modelPackages" | "models";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("profiles")) db.createObjectStore("profiles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("ratings")) db.createObjectStore("ratings", { keyPath: "key" });
      if (!db.objectStoreNames.contains("preferences")) db.createObjectStore("preferences");
      if (!db.objectStoreNames.contains("modelPackages")) db.createObjectStore("modelPackages");
      if (!db.objectStoreNames.contains("models")) db.createObjectStore("models", { keyPath: "manifest.modelVersion" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(store: StoreName, mode: IDBTransactionMode, action: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

async function all<T>(store: StoreName): Promise<T[]> {
  return transaction(store, "readonly", (objectStore) => objectStore.getAll());
}

export async function listProfiles(): Promise<Profile[]> {
  return (await all<Profile>("profiles")).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveProfile(profile: Profile): Promise<void> {
  await transaction("profiles", "readwrite", (store) => store.put(profile));
}

export async function deleteProfile(profileId: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["profiles", "ratings", "preferences"], "readwrite");
    tx.objectStore("profiles").delete(profileId);
    const ratings = tx.objectStore("ratings").openCursor();
    ratings.onsuccess = () => {
      const cursor = ratings.result;
      if (!cursor) return;
      if (String(cursor.key).startsWith(`${profileId}:`)) cursor.delete();
      cursor.continue();
    };
    tx.objectStore("preferences").delete(`collections:${profileId}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

export async function listRatings(profileId: string): Promise<LibraryEntry[]> {
  const rows = await all<{ key: string; profileId: string; entry: LibraryEntry }>("ratings");
  return rows.filter((row) => row.profileId === profileId).map((row) => row.entry);
}

export async function saveRating(profileId: string, entry: LibraryEntry): Promise<void> {
  await transaction("ratings", "readwrite", (store) => store.put({ key: `${profileId}:${entry.vndbId}`, profileId, entry }));
}

export async function saveRatings(profileId: string, entries: LibraryEntry[]): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("ratings", "readwrite");
    const store = tx.objectStore("ratings");
    for (const entry of entries) store.put({ key: `${profileId}:${entry.vndbId}`, profileId, entry });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeRating(profileId: string, vndbId: number): Promise<void> {
  await transaction("ratings", "readwrite", (store) => store.delete(`${profileId}:${vndbId}`));
}

export interface Collections {
  wishlist: number[];
  hidden: number[];
}

export async function getCollections(profileId: string): Promise<Collections> {
  return (await transaction<Collections | undefined>("preferences", "readonly", (store) => store.get(`collections:${profileId}`))) || { wishlist: [], hidden: [] };
}

export async function saveCollections(profileId: string, value: Collections): Promise<void> {
  await transaction("preferences", "readwrite", (store) => store.put(value, `collections:${profileId}`));
}

export async function getPreference<T>(key: string, fallback: T): Promise<T> {
  return (await transaction<T | undefined>("preferences", "readonly", (store) => store.get(key))) ?? fallback;
}

export async function setPreference<T>(key: string, value: T): Promise<void> {
  await transaction("preferences", "readwrite", (store) => store.put(value, key));
}

export async function saveModelPackage(version: string, packageId: string, bytes: ArrayBuffer): Promise<void> {
  await transaction("modelPackages", "readwrite", (store) => store.put(bytes, `${version}:${packageId}`));
}

export async function getModelPackage(version: string, packageId: string): Promise<ArrayBuffer | undefined> {
  return transaction<ArrayBuffer | undefined>("modelPackages", "readonly", (store) => store.get(`${version}:${packageId}`));
}

export async function saveModelShard(version: string, packageId: string, index: number, bytes: ArrayBuffer): Promise<void> {
  await transaction("modelPackages", "readwrite", (store) => store.put(bytes, `shard:${version}:${packageId}:${index}`));
}

export async function getModelShard(version: string, packageId: string, index: number): Promise<ArrayBuffer | undefined> {
  return transaction<ArrayBuffer | undefined>("modelPackages", "readonly", (store) => store.get(`shard:${version}:${packageId}:${index}`));
}

export async function deleteModelShard(version: string, packageId: string, index: number): Promise<void> {
  await transaction("modelPackages", "readwrite", (store) => store.delete(`shard:${version}:${packageId}:${index}`));
}

export async function activateModel(manifest: ModelManifest): Promise<void> {
  const installed: InstalledModel = { manifest, installedAt: new Date().toISOString() };
  await transaction("models", "readwrite", (store) => store.put(installed));
  await setPreference("activeModel", manifest.modelVersion);
}

export async function getActiveModel(): Promise<InstalledModel | null> {
  const version = await getPreference<string | null>("activeModel", null);
  if (!version) return null;
  return (await transaction<InstalledModel | undefined>("models", "readonly", (store) => store.get(version))) || null;
}
