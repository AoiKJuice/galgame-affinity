import { BookmarkSimple, EyeSlash } from "@phosphor-icons/react";
import type { Recommendation } from "../model/types";
import { localizeTags } from "../lib/tag-localization";
import { Cover } from "./Cover";

export function RecommendationCard({
  recommendation,
  revealAdult,
  wished,
  developer,
  onOpen,
  onWish,
  onHide,
}: {
  recommendation: Recommendation;
  revealAdult: boolean;
  wished: boolean;
  developer?: string;
  onOpen: () => void;
  onWish: () => void;
  onHide: () => void;
}) {
  const { item } = recommendation;
  const tags = [developer || "厂商未知", item.adult ? "NSFW" : "SFW", ...localizeTags(recommendation.matchedTags)];
  return (
    <article className="recommendation-card">
      <button className="card-cover-button" type="button" onClick={onOpen} aria-label={`查看${item.title}详情`}><Cover item={item} revealAdult={revealAdult} /></button>
      <div className="recommendation-body">
        <div className="card-topline">
          <span>{item.year || "年份未知"}</span>
          {recommendation.affinity !== null ? <strong>{recommendation.affinity}</strong> : <strong className="explore-mark">探索</strong>}
        </div>
        <h3 title={item.title}><button type="button" onClick={onOpen}>{item.title}</button></h3>
        <div className="score-line">
          {item.rating ? <span>VNDB {item.rating.toFixed(2)}</span> : <span>VNDB 暂无评分</span>}
          {recommendation.support > 0 && <span>{recommendation.support} 位同好</span>}
        </div>
        <div className="tag-row" role="group" aria-label="匹配标签">
          {tags.map((tag) => <span key={tag}>{tag}</span>)}
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
