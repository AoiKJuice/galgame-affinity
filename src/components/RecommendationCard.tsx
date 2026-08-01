import { BookmarkSimple, EyeSlash } from "@phosphor-icons/react";
import type { Recommendation } from "../model/types";
import { Cover } from "./Cover";

export function RecommendationCard({
  recommendation,
  revealAdult,
  wished,
  onWish,
  onHide,
}: {
  recommendation: Recommendation;
  revealAdult: boolean;
  wished: boolean;
  onWish: () => void;
  onHide: () => void;
}) {
  const { item } = recommendation;
  return (
    <article className="recommendation-card">
      <Cover item={item} revealAdult={revealAdult} />
      <div className="recommendation-body">
        <div className="card-topline">
          <span>{item.year || "年份未知"}</span>
          {recommendation.affinity !== null ? <strong>{recommendation.affinity}</strong> : <strong className="explore-mark">探索</strong>}
        </div>
        <h3 title={item.title}>{item.title}</h3>
        <div className="score-line">
          {item.rating ? <span>VNDB {item.rating.toFixed(2)}</span> : <span>VNDB 暂无评分</span>}
          {recommendation.support > 0 && <span>{recommendation.support} 位同好</span>}
        </div>
        <div className="tag-row" role="group" aria-label="匹配标签">
          {recommendation.matchedTags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="card-actions">
          <button type="button" className={wished ? "active" : ""} onClick={onWish} aria-pressed={wished}>
            <BookmarkSimple weight={wished ? "fill" : "regular"} />想玩
          </button>
          <button type="button" onClick={onHide}><EyeSlash />不感兴趣</button>
        </div>
      </div>
    </article>
  );
}
