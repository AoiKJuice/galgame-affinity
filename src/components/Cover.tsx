import { useState } from "react";
import type { CatalogEntry } from "../model/types";

export function Cover({ item, revealAdult, compact = false }: { item: CatalogEntry; revealAdult: boolean; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const masked = item.adult && !revealAdult;
  return (
    <div className={`cover ${compact ? "cover-compact" : ""} ${masked ? "cover-masked" : ""}`}>
      {!failed && item.coverUrl ? (
        <img src={item.coverUrl} alt={masked ? "成人内容封面已隐藏" : item.title} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="cover-placeholder" aria-label={`${item.title}暂无封面`}>{item.title.slice(0, 1)}</div>
      )}
      {masked && <span className="adult-mask">18+</span>}
    </div>
  );
}

