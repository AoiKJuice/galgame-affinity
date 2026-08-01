import type { CatalogEntry, LibraryEntry, LibraryStatus } from "../model/types";

const STATUS_BY_VNDB_LABEL: Record<number, LibraryStatus> = {
  1: "playing",
  2: "finished",
  3: "stalled",
  4: "dropped",
  5: "wishlist",
  6: "blacklist",
  7: "finished",
};

const STATUS_BY_BANGUMI_TYPE: Record<number, LibraryStatus> = {
  1: "wishlist",
  2: "finished",
  3: "playing",
  4: "stalled",
  5: "dropped",
};

export interface ImportResult {
  mapped: LibraryEntry[];
  unmapped: Array<{ sourceId: number; title: string; score: number | null; status: LibraryStatus }>;
}

export async function importVndb(username: string, catalog: CatalogEntry[]): Promise<ImportResult> {
  const known = new Map(catalog.map((item) => [item.id, item]));
  const mapped: LibraryEntry[] = [];
  let page = 1;
  for (;;) {
    const response = await fetch("https://api.vndb.org/kana/ulist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: username.trim(),
        fields: "id,vote,labels,lastmod,vn.title",
        sort: "id",
        results: 100,
        page,
      }),
    });
    if (!response.ok) throw new Error(response.status === 404 ? "找不到该 VNDB 用户" : `VNDB 导入失败 (${response.status})`);
    const payload = await response.json() as { results?: Array<{ id: string; vote?: number | null; labels?: number[]; lastmod?: number; vn?: { title?: string } }>; more?: boolean };
    for (const row of payload.results || []) {
      const id = Number(row.id.replace(/^v/, ""));
      const item = known.get(id);
      if (!item) continue;
      const labels = row.labels || [];
      const status = labels.map((label) => STATUS_BY_VNDB_LABEL[label]).find(Boolean) || "wishlist";
      mapped.push({
        vndbId: id,
        title: item.title,
        score: row.vote && row.vote > 0 ? row.vote / 10 : null,
        status,
        source: "vndb",
        updatedAt: row.lastmod ? new Date(row.lastmod * 1000).toISOString() : new Date().toISOString(),
      });
    }
    if (!payload.more) break;
    page += 1;
    if (page > 1000) throw new Error("VNDB 收藏页数异常，已停止导入");
  }
  return { mapped, unmapped: [] };
}

export async function importBangumi(username: string, catalog: CatalogEntry[]): Promise<ImportResult> {
  const byBangumi = new Map(catalog.flatMap((item) => (item.bangumiIds || []).map((id) => [id, item] as const)));
  const mapped: LibraryEntry[] = [];
  const unmapped: ImportResult["unmapped"] = [];
  let offset = 0;
  for (;;) {
    const url = new URL(`https://api.bgm.tv/v0/users/${encodeURIComponent(username.trim())}/collections`);
    url.searchParams.set("subject_type", "4");
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(response.status === 404 ? "找不到该 Bangumi 用户" : `Bangumi 导入失败 (${response.status})`);
    const payload = await response.json() as { total?: number; data?: Array<{ subject_id: number; rate?: number; type?: number; updated_at?: string; subject?: { name?: string; name_cn?: string } }> };
    const rows = payload.data || [];
    for (const row of rows) {
      const item = byBangumi.get(row.subject_id);
      const status = STATUS_BY_BANGUMI_TYPE[row.type || 1] || "wishlist";
      const score = row.rate && row.rate > 0 ? row.rate : null;
      if (!item) {
        unmapped.push({ sourceId: row.subject_id, title: row.subject?.name_cn || row.subject?.name || `Bangumi #${row.subject_id}`, score, status });
        continue;
      }
      mapped.push({ vndbId: item.id, title: item.title, score, status, source: "bangumi", updatedAt: row.updated_at || new Date().toISOString() });
    }
    offset += rows.length;
    if (!rows.length || offset >= (payload.total || 0)) break;
  }
  return { mapped, unmapped };
}
