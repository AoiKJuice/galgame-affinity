import { useEffect, useState } from "react";
import type { CatalogEntry } from "../model/types";
import { resolveCover } from "../lib/catalog-api";

export function Cover({ item, compact = false }: { item: CatalogEntry; revealAdult?: boolean; compact?: boolean }) {
  const itemKey = `${item.id}:${item.coverUrl || ""}`;
  const [coverState, setCoverState] = useState({ key: itemKey, source: item.coverUrl || null, failed: false, resolved: false });
  const current = coverState.key === itemKey ? coverState : { key: itemKey, source: item.coverUrl || null, failed: false, resolved: false };

  useEffect(() => {
    if (!item.coverUrl) {
      void resolveCover(item).then((value) => {
        setCoverState({ key: itemKey, source: value, failed: !value, resolved: true });
      });
    }
  }, [item, itemKey]);

  const handleError = () => {
    if (current.resolved) {
      setCoverState({ ...current, failed: true });
      return;
    }
    void resolveCover(item).then((value) => {
      setCoverState({ key: itemKey, source: value, failed: !value || value === current.source, resolved: true });
    });
  };
  return (
    <div className={`cover ${compact ? "cover-compact" : ""}`}>
      {!current.failed && current.source ? (
        <img src={current.source} alt={item.title} loading="lazy" onError={handleError} />
      ) : (
        <div className="cover-placeholder" aria-label={`${item.title}暂无封面`}>{item.title.slice(0, 1)}</div>
      )}
    </div>
  );
}
