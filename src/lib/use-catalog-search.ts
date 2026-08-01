import { useEffect, useMemo, useState } from "react";
import type { CatalogEntry } from "../model/types";
import { searchVndb } from "./catalog-api";
import { searchCatalogEntries } from "./catalog-search";

export function useCatalogSearch(catalog: CatalogEntry[], query: string, limit = 20): CatalogEntry[] {
  const [remoteState, setRemoteState] = useState<{ query: string; results: CatalogEntry[] }>({ query: "", results: [] });
  const local = useMemo(() => searchCatalogEntries(catalog, query, limit), [catalog, query, limit]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchVndb(value, limit).then((results) => {
        if (!controller.signal.aborted) setRemoteState({ query: value, results });
      }).catch(() => {
        if (!controller.signal.aborted) setRemoteState({ query: value, results: [] });
      });
    }, 280);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, limit]);

  return useMemo(() => {
    if (query.trim().length < 2) return [];
    const remote = remoteState.query === query.trim() ? remoteState.results : [];
    const catalogMap = new Map(catalog.map((item) => [item.id, item]));
    const merged = new Map<number, CatalogEntry>();
    for (const item of [...local, ...remote]) {
      const known = catalogMap.get(item.id);
      const value = known ? { ...item, ...known, aliases: Array.from(new Set([...(known.aliases || []), ...(item.aliases || [])])) } : item;
      if (!merged.has(value.id)) merged.set(value.id, value);
    }
    return Array.from(merged.values())
      .sort((left, right) => right.ratingCount - left.ratingCount || (right.rating || 0) - (left.rating || 0) || left.id - right.id)
      .slice(0, limit);
  }, [catalog, local, remoteState, query, limit]);
}
