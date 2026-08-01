import { useState } from "react";
import type { CatalogEntry } from "../model/types";

export function Cover({ item, compact = false }: { item: CatalogEntry; revealAdult?: boolean; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`cover ${compact ? "cover-compact" : ""}`}>
      {!failed && item.coverUrl ? (
        <img src={item.coverUrl} alt={item.title} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="cover-placeholder" aria-label={`${item.title}暂无封面`}>{item.title.slice(0, 1)}</div>
      )}
    </div>
  );
}
