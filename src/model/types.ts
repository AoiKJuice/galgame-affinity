export type LibraryStatus = "playing" | "finished" | "stalled" | "dropped" | "wishlist" | "blacklist";

export interface CatalogEntry {
  id: number;
  title: string;
  titleNative?: string | null;
  titleEnglish?: string | null;
  coverUrl?: string | null;
  year?: number | null;
  rating?: number | null;
  ratingCount: number;
  lengthMinutes?: number | null;
  lengthCategory?: number | null;
  adult: boolean;
  allAgeAvailable: boolean;
  platforms: string[];
  tags: string[];
  relations: Array<{ target: number; type: string; official: boolean }>;
  bangumiIds?: number[];
  steamIds?: number[];
}

export interface LibraryEntry {
  vndbId: number;
  title: string;
  score: number | null;
  status: LibraryStatus;
  source: "manual" | "vndb" | "bangumi";
  updatedAt: string;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recommendation {
  item: CatalogEntry;
  affinity: number | null;
  confidence: "high" | "medium" | "low" | "explore";
  support: number;
  score: number;
  matchedTags: string[];
  source: "explicit" | "explore";
}

export interface ModelShard {
  url: string;
  size: number;
  sha256: string;
}

export interface ModelPackage {
  id: "catalog" | "explicit-knn" | "explicit-mf" | "implicit-recall" | "content-graph" | "content-tags";
  format: "json" | "binary";
  compression: "none" | "gzip";
  uncompressedSize: number;
  compressedSize: number;
  sha256: string;
  shards: ModelShard[];
}

export interface ModelManifest {
  schemaVersion: number;
  modelVersion: string;
  tier: "demo" | "standard" | "full";
  createdAt: string;
  packages: ModelPackage[];
  reports?: Record<string, unknown>;
}

export interface InstalledModel {
  manifest: ModelManifest;
  installedAt: string;
}

export interface WorkerPackage {
  id: ModelPackage["id"];
  format: ModelPackage["format"];
  data: ArrayBuffer;
}

export type WorkerRequest =
  | { type: "init"; packages: WorkerPackage[] }
  | { type: "recommend"; requestId: string; ratings: LibraryEntry[]; hidden: number[]; limit: number };

export type WorkerResponse =
  | { type: "ready"; catalog: CatalogEntry[] }
  | { type: "recommendations"; requestId: string; results: Recommendation[] }
  | { type: "error"; requestId?: string; message: string };
