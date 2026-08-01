import type { CatalogEntry } from "../model/types";

const VNDB_API = "https://api.vndb.org/kana/vn";
const detailCache = new Map<number, VndbDetail>();
const bangumiMatchCache = new Map<number, BangumiSubject | null>();

export interface VndbDetail {
  id: number;
  title: string;
  alttitle: string | null;
  aliases: string[];
  description: string | null;
  imageUrl: string | null;
  rating: number | null;
  ratingCount: number;
  released: string | null;
  lengthMinutes: number | null;
  languages: string[];
  platforms: string[];
  developers: Array<{ name: string; original: string | null }>;
  tags: Array<{ name: string; rating: number; spoiler: number }>;
  relations: Array<{ id: number; title: string; type: string; official: boolean }>;
  titles: Array<{ lang: string; title: string; latin: string | null; official: boolean; main: boolean }>;
}

export interface BangumiSubject {
  id?: number;
  name?: string;
  name_cn?: string;
  summary?: string;
  images?: { large?: string; common?: string; medium?: string };
}

interface BangumiSearchResponse {
  list?: BangumiSubject[];
}

interface RawVndb {
  id: string;
  title: string;
  alttitle?: string | null;
  aliases?: string[];
  description?: string | null;
  image?: { url?: string | null } | null;
  rating?: number | null;
  votecount?: number;
  released?: string | null;
  length_minutes?: number | null;
  languages?: string[];
  platforms?: string[];
  developers?: Array<{ name: string; original?: string | null }>;
  tags?: Array<{ name: string; rating: number; spoiler: number }>;
  relations?: Array<{ id: string; title: string; relation: string; relation_official: boolean }>;
  titles?: Array<{ lang: string; title: string; latin?: string | null; official: boolean; main: boolean }>;
}

const DETAIL_FIELDS = "title,alttitle,titles{lang,title,latin,official,main},aliases,description,image.url,rating,votecount,released,length_minutes,languages,platforms,developers{name,original},tags{name,rating,spoiler},relations{id,title,relation,relation_official}";

function numericId(value: string): number {
  return Number(value.replace(/^v/, ""));
}

function parseDetail(item: RawVndb): VndbDetail {
  return {
    id: numericId(item.id),
    title: item.title,
    alttitle: item.alttitle || null,
    aliases: item.aliases || [],
    description: item.description || null,
    imageUrl: item.image?.url || null,
    rating: item.rating == null ? null : item.rating / 10,
    ratingCount: item.votecount || 0,
    released: item.released || null,
    lengthMinutes: item.length_minutes || null,
    languages: item.languages || [],
    platforms: item.platforms || [],
    developers: (item.developers || []).map((value) => ({ name: value.name, original: value.original || null })),
    tags: item.tags || [],
    relations: (item.relations || []).map((value) => ({ id: numericId(value.id), title: value.title, type: value.relation, official: value.relation_official })),
    titles: (item.titles || []).map((value) => ({ ...value, latin: value.latin || null })),
  };
}

async function queryVndb(filters: unknown, fields = DETAIL_FIELDS, results = 100, sort?: string): Promise<RawVndb[]> {
  const response = await fetch(VNDB_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, fields, results, ...(sort ? { sort, reverse: true } : {}) }),
  });
  if (!response.ok) throw new Error(`VNDB 请求失败（${response.status}）`);
  const payload = await response.json() as { results?: RawVndb[] };
  return payload.results || [];
}

export async function fetchVndbDetails(ids: number[]): Promise<Map<number, VndbDetail>> {
  const unique = Array.from(new Set(ids)).filter(Number.isFinite);
  const missing = unique.filter((id) => !detailCache.has(id));
  for (let offset = 0; offset < missing.length; offset += 40) {
    const batch = missing.slice(offset, offset + 40);
    if (!batch.length) continue;
    const filters = batch.length === 1
      ? ["id", "=", `v${batch[0]}`]
      : ["or", ...batch.map((id) => ["id", "=", `v${id}`])];
    const rows = await queryVndb(filters);
    for (const row of rows) {
      const detail = parseDetail(row);
      detailCache.set(detail.id, detail);
    }
  }
  return new Map(unique.flatMap((id) => detailCache.has(id) ? [[id, detailCache.get(id) as VndbDetail]] : []));
}

export async function searchVndb(query: string, limit = 20): Promise<CatalogEntry[]> {
  const rows = await queryVndb(["search", "=", query], "title,alttitle,titles{lang,title,latin,official,main},aliases,image.url,rating,votecount,released,length_minutes,platforms", limit, "votecount");
  return rows.map((row) => {
    const detail = parseDetail(row);
    const chinese = detail.titles.find((title) => title.lang === "zh-Hans") || detail.titles.find((title) => title.lang === "zh-Hant");
    return {
      id: detail.id,
      title: chinese?.title || detail.title,
      titleNative: detail.alttitle,
      titleEnglish: detail.titles.find((title) => title.lang === "en")?.title || null,
      aliases: detail.aliases,
      coverUrl: detail.imageUrl,
      year: detail.released && /^\d{4}/.test(detail.released) ? Number(detail.released.slice(0, 4)) : null,
      rating: detail.rating,
      ratingCount: detail.ratingCount,
      lengthMinutes: detail.lengthMinutes,
      adult: false,
      allAgeAvailable: false,
      platforms: detail.platforms,
      tags: [],
      relations: [],
    };
  });
}

export async function fetchBangumiSubject(id: number): Promise<BangumiSubject | null> {
  const response = await fetch(`https://api.bgm.tv/v0/subjects/${id}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Bangumi 请求失败（${response.status}）`);
  return response.json() as Promise<BangumiSubject>;
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function matchScore(subject: BangumiSubject, names: string[]): number {
  const candidates = [subject.name_cn, subject.name].filter((value): value is string => Boolean(value)).map(normalizeTitle);
  const normalizedNames = names.filter(Boolean).map(normalizeTitle);
  let score = 0;
  for (const source of normalizedNames) {
    for (const candidate of candidates) {
      if (source === candidate) score = Math.max(score, 100);
      else if (source.length >= 5 && (candidate.includes(source) || source.includes(candidate))) score = Math.max(score, 70 - Math.abs(source.length - candidate.length));
    }
  }
  if (subject.name_cn && /[\u3400-\u9fff]/u.test(subject.summary || "")) score += 10;
  return score;
}

async function searchBangumiLegacy(keyword: string): Promise<BangumiSubject[]> {
  const response = await fetch(`https://api.bgm.tv/search/subject/${encodeURIComponent(keyword)}?type=4&responseGroup=large&max_results=12`);
  if (!response.ok) return [];
  const payload = await response.json() as BangumiSearchResponse;
  return payload.list || [];
}

export async function fetchBangumiForItem(item: CatalogEntry): Promise<BangumiSubject | null> {
  if (bangumiMatchCache.has(item.id)) return bangumiMatchCache.get(item.id) || null;

  for (const id of item.bangumiIds || []) {
    try {
      const subject = await fetchBangumiSubject(id);
      if (subject?.summary) {
        bangumiMatchCache.set(item.id, subject);
        return subject;
      }
    } catch {
      // Continue with title matching.
    }
  }

  const names = [item.titleNative || "", item.title, item.titleEnglish || "", ...(item.aliases || [])];
  const baseTitles = names.flatMap((name) => name
    .split(/[~～:：\-‐‑–—]/u)
    .map((value) => value.trim())
    .filter((value) => normalizeTitle(value).length >= 5 && [...value].some((character) => (character.codePointAt(0) || 0) > 127)));
  const queries = Array.from(new Set([...baseTitles, ...names.filter(Boolean)])).slice(0, 5);
  let best: BangumiSubject | null = null;
  let bestScore = 0;
  for (const query of queries) {
    try {
      const results = await searchBangumiLegacy(query);
      for (const subject of results) {
        const score = matchScore(subject, names);
        if (score > bestScore && subject.summary) {
          best = subject;
          bestScore = score;
        }
      }
      if (bestScore >= 100) break;
    } catch {
      // Try another known title.
    }
  }
  const result = bestScore >= 55 ? best : null;
  bangumiMatchCache.set(item.id, result);
  return result;
}

export async function resolveCover(item: CatalogEntry): Promise<string | null> {
  try {
    const detail = (await fetchVndbDetails([item.id])).get(item.id);
    if (detail?.imageUrl && detail.imageUrl !== item.coverUrl) return detail.imageUrl;
  } catch {
    // Continue to the mapped source.
  }
  for (const id of item.bangumiIds || []) {
    try {
      const subject = await fetchBangumiSubject(id);
      const image = subject?.images?.large || subject?.images?.common || subject?.images?.medium;
      if (image) return image.replace(/^http:/, "https:");
    } catch {
      // Try the next mapping.
    }
  }
  return null;
}
