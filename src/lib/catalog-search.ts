import type { CatalogEntry } from "../model/types";

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function searchCatalogEntries(catalog: CatalogEntry[], query: string, limit = 20): CatalogEntry[] {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (normalizedQuery.length < 2) return [];
  const idMatch = /^v?(\d+)$/.exec(normalizedQuery);
  return catalog
    .filter((item) => {
      if (idMatch && item.id === Number(idMatch[1])) return true;
      return normalizeSearchText(`${item.title} ${item.titleNative || ""} ${item.titleEnglish || ""} ${(item.aliases || []).join(" ")}`).includes(normalizedQuery);
    })
    .sort((left, right) => right.ratingCount - left.ratingCount || (right.rating || 0) - (left.rating || 0) || left.id - right.id)
    .slice(0, limit);
}
