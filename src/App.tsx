import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowLeft,
  BookmarkSimple,
  Check,
  CloudArrowDown,
  Database,
  DownloadSimple,
  EyeSlash,
  ChartLineUp,
  Compass,
  Moon,
  Plus,
  Sparkle,
  Sun,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { AppShell, type Page } from "./components/AppShell";
import { Cover } from "./components/Cover";
import { RatingControl } from "./components/RatingControl";
import { RecommendationCard } from "./components/RecommendationCard";
import { importBangumi, importVndb, type ImportResult } from "./lib/imports";
import { searchCatalogEntries } from "./lib/catalog-search";
import { useCatalogSearch } from "./lib/use-catalog-search";
import { fetchBangumiForItem, fetchVndbDetails, type BangumiSubject, type VndbDetail } from "./lib/catalog-api";
import { localizeTags } from "./lib/tag-localization";
import { useVndbDetails } from "./lib/use-vndb-details";
import { installModel, loadActivePackages, loadSearchCatalog, type InstallProgress } from "./lib/model-manager";
import {
  deleteProfile,
  getCollections,
  getPreference,
  listProfiles,
  listRatings,
  removeRating,
  saveCollections,
  saveProfile,
  saveRating,
  saveRatings,
  setPreference,
  type Collections,
} from "./lib/storage";
import type {
  CatalogEntry,
  LibraryEntry,
  ModelManifest,
  Profile,
  Recommendation,
  WorkerResponse,
} from "./model/types";

const DEMO_MODEL_MANIFEST = `${import.meta.env.BASE_URL}model/demo/manifest.json`;
const STANDARD_MODEL_MANIFEST = "https://raw.githubusercontent.com/AoiKJuice/galgame-affinity-models/main/standard/manifest.json";
const FULL_MODEL_MANIFEST = "https://raw.githubusercontent.com/AoiKJuice/galgame-affinity-models/main/full/manifest.json";

function randomId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function ModelGate({ onInstalled }: { onInstalled: () => Promise<void> }) {
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const install = async () => {
    setWorking(true);
    setError("");
    try {
      await installModel(DEMO_MODEL_MANIFEST, setProgress);
      await onInstalled();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "模型安装失败");
    } finally {
      setWorking(false);
    }
  };
  const percent = progress ? Math.round(progress.received / Math.max(progress.total, 1) * 100) : 0;
  return (
    <div className="gate-page">
      <div className="gate-mark"><Database weight="duotone" /></div>
      <h1>模型保存在你的浏览器</h1>
      <p>资料、评分与推荐计算不会上传。</p>
      <button className="primary-button" type="button" onClick={install} disabled={working}>
        <CloudArrowDown weight="bold" />{working ? `下载中 ${percent}%` : "安装演示模型"}
      </button>
      {progress && <progress value={progress.received} max={progress.total} aria-label="模型下载进度" />}
      {error && <div className="inline-error">{error}</div>}
    </div>
  );
}

function Onboarding({ catalog, onDone }: { catalog: CatalogEntry[]; onDone: (profile: Profile, ratings: LibraryEntry[]) => Promise<void> }) {
  const [name, setName] = useState("");
  const [source, setSource] = useState<"manual" | "vndb" | "bangumi">("manual");
  const [username, setUsername] = useState("");
  const [manual, setManual] = useState<LibraryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const results = useCatalogSearch(catalog, query, 12);
  const finish = async () => {
    setWorking(true);
    setError("");
    try {
      let ratings = manual;
      if (source === "vndb") ratings = (await importVndb(username, catalog)).mapped;
      if (source === "bangumi") ratings = (await importBangumi(username, catalog)).mapped;
      const now = new Date().toISOString();
      await onDone({ id: randomId(), name: name.trim() || "本地资料", createdAt: now, updatedAt: now }, ratings);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "建立资料失败");
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="onboarding-page">
      <section className="onboarding-panel">
        <h1>建立本地资料</h1>
        <label className="field"><span>资料名称（选填）</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="留空则使用“本地资料”" /></label>
        <div className="source-tabs" role="tablist" aria-label="评分来源">
          {(["manual", "vndb", "bangumi"] as const).map((value) => <button type="button" role="tab" aria-selected={source === value} className={source === value ? "active" : ""} onClick={() => setSource(value)} key={value}>{value === "manual" ? "手动评分" : value.toUpperCase()}</button>)}
        </div>
        {source === "manual" ? (
          <>
            <label className="field"><span>搜索作品</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入中文、日文或英文标题" /></label>
            <div className="manual-grid">
              {results.map((item) => {
                const entry = manual.find((value) => value.vndbId === item.id);
                return (
                  <div className="manual-item" key={item.id}>
                    <Cover item={item} />
                    <strong>{item.title}</strong>
                    {entry ? (
                      <RatingControl value={entry.score} label={item.title} onChange={(score) => setManual((current) => current.map((value) => value.vndbId === item.id ? { ...value, score } : value))} />
                    ) : (
                      <button type="button" className="secondary-button" onClick={() => setManual((current) => [...current, { vndbId: item.id, title: item.title, score: null, status: "wishlist", source: "manual", updatedAt: new Date().toISOString() }])}><Plus />添加</button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <label className="field"><span>{source === "vndb" ? "VNDB 用户名" : "Bangumi 用户名"}</span><input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        )}
        {error && <div className="inline-error">{error}</div>}
        <button className="primary-button" type="button" onClick={finish} disabled={working || (source !== "manual" && !username.trim())}>{working ? "正在导入" : "进入 GAL鉴赏"}</button>
      </section>
    </div>
  );
}

function AddDialog({ item, onClose, onSave }: { item: CatalogEntry; onClose: () => void; onSave: (entry: LibraryEntry) => void }) {
  const [score, setScore] = useState<number | null>(null);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="关闭"><X /></button>
        <div className="dialog-title-row"><Cover item={item} compact /><h2 id="add-title">{item.title}</h2></div>
        <RatingControl value={score} onChange={setScore} label={item.title} />
        <button className="primary-button" type="button" onClick={() => onSave({ vndbId: item.id, title: item.title, score, status: "finished", source: "manual", updatedAt: new Date().toISOString() })}><Check />添加作品</button>
      </section>
    </div>
  );
}

function RecommendationsPage({ recommendations, collections, revealAdult, onWish, onHide, onOpen, onRefresh, loading }: {
  recommendations: Recommendation[];
  collections: Collections;
  revealAdult: boolean;
  onWish: (id: number) => void;
  onHide: (id: number) => void;
  onOpen: (item: CatalogEntry) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [hideSequels, setHideSequels] = useState(true);
  const [hideDerivatives, setHideDerivatives] = useState(true);
  const details = useVndbDetails(recommendations.map((value) => value.item.id));
  const visible = recommendations.filter(({ item }) => {
    if (hideSequels && item.relations.some((relation) => relation.official && relation.type === "preq")) return false;
    if (hideDerivatives && item.relations.some((relation) => relation.official && ["orig", "par", "alt"].includes(relation.type))) return false;
    return true;
  });
  const explicit = visible.filter((item) => item.source === "explicit");
  const explore = visible.filter((item) => item.source === "explore");
  const card = (value: Recommendation) => <RecommendationCard key={value.item.id} recommendation={value} revealAdult={revealAdult} developer={details.get(value.item.id)?.developers[0]?.name} wished={collections.wishlist.includes(value.item.id)} onOpen={() => onOpen(value.item)} onWish={() => onWish(value.item.id)} onHide={() => onHide(value.item.id)} />;
  return (
    <div className="page recommendations-page">
      <header className="page-header"><div><h1>推荐</h1></div><button className="primary-button" type="button" onClick={onRefresh} disabled={loading}><ArrowClockwise />{loading ? "计算中" : "重新生成"}</button></header>
      <div className="recommendation-filters" aria-label="推荐筛选">
        <button type="button" className={`toggle-button ${hideSequels ? "active" : ""}`} aria-pressed={hideSequels} onClick={() => setHideSequels((value) => !value)}>隐藏续作</button>
        <button type="button" className={`toggle-button ${hideDerivatives ? "active" : ""}`} aria-pressed={hideDerivatives} onClick={() => setHideDerivatives((value) => !value)}>隐藏衍生作与后日谈</button>
      </div>
      {loading && recommendations.length === 0 ? <div className="recommendation-grid skeleton-grid">{Array.from({ length: 8 }, (_, index) => <div className="card-skeleton" key={index} />)}</div> : null}
      {!loading && recommendations.length === 0 ? <div className="empty-state"><Sparkle /><h2>评分还不够</h2><button className="secondary-button" type="button" onClick={onRefresh}>再次计算</button></div> : null}
      {explicit.length > 0 && <section><h2 className="section-title">为你推荐</h2><div className="recommendation-grid">{explicit.map(card)}</div></section>}
      {explore.length > 0 && <section><h2 className="section-title">探索</h2><div className="recommendation-grid">{explore.map(card)}</div></section>}
    </div>
  );
}

function LibraryPage({ ratings, catalogMap, collections, revealAdult, onChange, onRemove, onOpen }: {
  ratings: LibraryEntry[];
  catalogMap: Map<number, CatalogEntry>;
  collections: Collections;
  revealAdult: boolean;
  onChange: (entry: LibraryEntry) => void;
  onRemove: (id: number) => void;
  onOpen: (item: CatalogEntry) => void;
}) {
  const [tab, setTab] = useState<"ratings" | "wishlist" | "hidden">("ratings");
  const [query, setQuery] = useState("");
  const ids = tab === "wishlist" ? collections.wishlist : collections.hidden;
  const rows = tab === "ratings"
    ? ratings.filter((entry) => entry.title.toLowerCase().includes(query.toLowerCase()))
    : ids.map((id) => ({ vndbId: id, title: catalogMap.get(id)?.title || `v${id}`, score: null, status: tab === "wishlist" ? "wishlist" as const : "blacklist" as const, source: "manual" as const, updatedAt: "" })).filter((entry) => entry.title.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="page">
      <header className="page-header"><h1>作品库</h1><input className="page-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索作品库" /></header>
      <div className="source-tabs library-tabs">
        <button className={tab === "ratings" ? "active" : ""} type="button" onClick={() => setTab("ratings")}>我的作品 {ratings.length}</button>
        <button className={tab === "wishlist" ? "active" : ""} type="button" onClick={() => setTab("wishlist")}>想玩 {collections.wishlist.length}</button>
        <button className={tab === "hidden" ? "active" : ""} type="button" onClick={() => setTab("hidden")}>不感兴趣 {collections.hidden.length}</button>
      </div>
      <div className="library-grid">
        {rows.map((entry) => {
          const item = catalogMap.get(entry.vndbId);
          if (!item) return null;
          return (
            <article className="library-card" key={entry.vndbId}>
              <button className="card-cover-button" type="button" onClick={() => onOpen(item)} aria-label={`查看${item.title}详情`}><Cover item={item} revealAdult={revealAdult} /></button>
              <div className="library-card-body">
                <strong title={entry.title}><button className="card-title-button" type="button" onClick={() => onOpen(item)}>{entry.title}</button></strong>
                {tab === "ratings" && <RatingControl value={entry.score} label={entry.title} onChange={(score) => onChange({ ...entry, score, updatedAt: new Date().toISOString() })} />}
                <button className="library-remove" type="button" onClick={() => onRemove(entry.vndbId)} aria-label={`删除${entry.title}`}><Trash />移除</button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function cleanDescription(value: string): string {
  return value
    .replace(/\[url=[^\]]+\]([^[]+)\[\/url\]/gi, "$1")
    .replace(/\[\/?(?:b|i|u|s|quote|spoiler|raw)(?:=[^\]]+)?\]/gi, "")
    .replace(/\\n/g, "\n")
    .trim();
}

function DetailPage({ item, catalogMap, rating, recommendation, wished, hidden, onBack, onOpen, onScore, onWish, onHide }: {
  item: CatalogEntry;
  catalogMap: Map<number, CatalogEntry>;
  rating?: LibraryEntry;
  recommendation?: Recommendation;
  wished: boolean;
  hidden: boolean;
  onBack: () => void;
  onOpen: (item: CatalogEntry) => void;
  onScore: (score: number | null) => void;
  onWish: () => void;
  onHide: () => void;
}) {
  const [metadata, setMetadata] = useState<{ id: number; detail: VndbDetail | null; bangumi: BangumiSubject | null }>({ id: item.id, detail: null, bangumi: null });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const currentMetadata = metadata.id === item.id ? metadata : { id: item.id, detail: null, bangumi: null };
  const { detail, bangumi } = currentMetadata;
  const expanded = expandedId === item.id;

  useEffect(() => {
    let active = true;
    void fetchVndbDetails([item.id]).then((value) => {
      if (active) setMetadata((current) => ({ id: item.id, detail: value.get(item.id) || null, bangumi: current.id === item.id ? current.bangumi : null }));
    }).catch(() => undefined);
    void fetchBangumiForItem(item).then((value) => {
      if (active) setMetadata((current) => ({ id: item.id, detail: current.id === item.id ? current.detail : null, bangumi: value }));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [item]);

  const description = cleanDescription(bangumi?.summary || detail?.description || "");
  const producer = detail?.developers[0]?.name;
  const tags = [producer || "厂商未知", item.adult ? "NSFW" : "SFW", ...localizeTags((detail?.tags || []).sort((a, b) => b.rating - a.rating).filter((tag) => tag.spoiler === 0).map((tag) => tag.name), 12)];
  const relations = detail
    ? detail.relations.map((relation) => ({ ...relation, title: catalogMap.get(relation.id)?.title || relation.title }))
    : item.relations.map((relation) => ({ id: relation.target, title: catalogMap.get(relation.target)?.title || `v${relation.target}`, type: relation.type, official: relation.official }));
  const openRelation = (relation: { id: number; title: string }) => {
    onOpen(catalogMap.get(relation.id) || {
      id: relation.id,
      title: relation.title,
      ratingCount: 0,
      adult: false,
      allAgeAvailable: false,
      platforms: [],
      tags: [],
      relations: [],
    });
  };

  return (
    <div className="page detail-page">
      <button className="detail-back" type="button" onClick={onBack}><ArrowLeft />返回</button>
      <section className="detail-hero">
        <div className="detail-cover"><Cover item={{ ...item, coverUrl: bangumi?.images?.large || detail?.imageUrl || item.coverUrl }} revealAdult /></div>
        <div className="detail-main">
          <div className="detail-kicker">{item.year || detail?.released?.slice(0, 4) || "年份未知"}{producer ? ` · ${producer}` : ""}</div>
          <h1>{item.title}</h1>
          {(item.titleNative || detail?.alttitle) && <div className="detail-native">{item.titleNative || detail?.alttitle}</div>}
          <div className="detail-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          {description && <div className="detail-description-wrap"><p className={expanded ? "detail-description expanded" : "detail-description"}>{description}</p><button type="button" onClick={() => setExpandedId(expanded ? null : item.id)}>{expanded ? "收起" : "展开"}</button></div>}
          <div className="detail-actions">
            <button type="button" className={wished ? "active" : ""} aria-pressed={wished} onClick={onWish}><BookmarkSimple weight={wished ? "fill" : "regular"} />想玩</button>
            <button type="button" className={hidden ? "active danger" : ""} aria-pressed={hidden} onClick={onHide}><EyeSlash />不感兴趣</button>
          </div>
        </div>
        <aside className="detail-score-panel">
          {recommendation?.affinity != null && <div><span>亲和度</span><strong>{recommendation.affinity}</strong></div>}
          <div><span>VNDB</span><strong>{(detail?.rating ?? item.rating)?.toFixed(2) || "—"}</strong></div>
          <RatingControl value={rating?.score ?? null} label={item.title} onChange={onScore} />
        </aside>
      </section>
      {relations.length > 0 && <section className="detail-relations"><h2>关联作品</h2><div>{relations.filter((value) => value.official).slice(0, 12).map((relation) => <button type="button" key={`${relation.id}-${relation.type}`} onClick={() => openRelation(relation)}><strong>{relation.title}</strong><span>{relationLabel(relation.type)}</span></button>)}</div></section>}
    </div>
  );
}

const RELATION_LABELS: Record<string, string> = {
  seq: "续作",
  preq: "前作",
  set: "同一世界观",
  ser: "同系列",
  fan: "Fan Disc",
  side: "外传",
  alt: "另一版本",
  char: "共享角色",
  par: "母篇",
  orig: "原作",
};

function relationLabel(value: string): string {
  return RELATION_LABELS[value.toLowerCase()] || "相关作品";
}

function Dashboard({ profile, ratings, recommendations, catalogMap, revealAdult, onRecommend }: { profile: Profile; ratings: LibraryEntry[]; recommendations: Recommendation[]; catalogMap: Map<number, CatalogEntry>; revealAdult: boolean; onRecommend: () => void }) {
  const scored = ratings.filter((entry) => entry.score !== null);
  const mean = scored.length ? scored.reduce((sum, entry) => sum + (entry.score || 0), 0) / scored.length : 0;
  const std = scored.length ? Math.sqrt(scored.reduce((sum, entry) => sum + ((entry.score || 0) - mean) ** 2, 0) / scored.length) : 0;
  const histogram = Array.from({ length: 10 }, (_, index) => scored.filter((entry) => Math.round(entry.score || 0) === index + 1).length);
  const maximum = Math.max(1, ...histogram);
  const quality = scored.length >= 30 && std >= 0.75 ? "高" : scored.length >= 10 ? "中" : "低";
  return (
    <div className="page dashboard-page">
      <header className="dashboard-heading"><h1>{profile.name}</h1><button className="primary-button" type="button" onClick={onRecommend}><Sparkle weight="fill" />生成推荐</button></header>
      <section className="dashboard-lead">
        <div className="profile-quality"><div className="quality-orbit"><strong>{quality}</strong></div><h2>{quality === "高" ? "评分资料适合生成推荐" : quality === "中" ? "可以生成推荐" : "继续添加评分"}</h2></div>
        <div className="dashboard-metrics">
          <div><strong>{scored.length}</strong><span>有效评分</span></div>
          <div><strong>{std.toFixed(2)}</strong><span>评分区分度</span></div>
          <div><strong>{recommendations.length}</strong><span>当前推荐</span></div>
        </div>
      </section>
      {recommendations.length > 0 && <section className="dashboard-panel dashboard-recs"><h2>当前推荐</h2><div>{recommendations.slice(0, 3).map((value) => <article key={value.item.id}><Cover item={value.item} revealAdult={revealAdult} compact /><strong>{value.item.title}</strong>{value.affinity !== null && <span>{value.affinity}</span>}</article>)}</div></section>}
      <div className="dashboard-columns">
        <section className="dashboard-panel distribution"><div className="panel-heading"><h2>评分分布</h2><ChartLineUp weight="duotone" /></div><div className="bars">{histogram.map((count, index) => <div key={index}><span style={{ height: `${count ? Math.max(6, count / maximum * 100) : 0}%` }} /><b>{index + 1}</b></div>)}</div></section>
        <section className="dashboard-panel recent-ratings"><h2>最近评分</h2>{ratings.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5).map((entry) => <div key={entry.vndbId}><span>{catalogMap.get(entry.vndbId)?.title || entry.title}</span><strong>{entry.score ?? "-"}</strong></div>)}</section>
      </div>
    </div>
  );
}

function Insights({ ratings, catalogMap }: { ratings: LibraryEntry[]; catalogMap: Map<number, CatalogEntry> }) {
  const scored = ratings.filter((entry) => entry.score !== null);
  const mean = scored.length ? scored.reduce((sum, entry) => sum + (entry.score || 0), 0) / scored.length : 0;
  const std = scored.length ? Math.sqrt(scored.reduce((sum, entry) => sum + ((entry.score || 0) - mean) ** 2, 0) / scored.length) : 0;
  const histogram = Array.from({ length: 10 }, (_, index) => scored.filter((entry) => Math.round(entry.score || 0) === index + 1).length);
  const maximum = Math.max(1, ...histogram);
  const tags = new Map<string, number>();
  for (const entry of scored.filter((value) => (value.score || 0) >= 8)) {
    for (const tag of catalogMap.get(entry.vndbId)?.tags || []) tags.set(tag, (tags.get(tag) || 0) + 1);
  }
  const topTags = Array.from(tags).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const favoriteCount = scored.filter((entry) => (entry.score || 0) >= 9).length;
  return (
    <div className="page insights-page"><header className="page-header"><h1>审美分析</h1></header>
      <section className="insight-metrics">
        <div><strong>{mean.toFixed(2)}</strong><span>平均评分</span></div>
        <div><strong>{std.toFixed(2)}</strong><span>评分区分度</span></div>
        <div><strong>{favoriteCount}</strong><span>高分作品</span></div>
      </section>
      <div className="insights-grid">
        <section className="insight-panel insight-chart"><div className="panel-heading"><h2>评分分布</h2><ChartLineUp weight="duotone" /></div><div className="bars">{histogram.map((count, index) => <div key={index}><span style={{ height: `${count ? Math.max(6, count / maximum * 100) : 0}%` }} /><b>{index + 1}</b></div>)}</div></section>
        <section className="insight-panel taste-signal"><div className="panel-heading"><h2>评分倾向</h2><Compass weight="duotone" /></div><strong>{mean >= 8 ? "宽" : mean <= 6 ? "严" : "均衡"}</strong></section>
        <section className="insight-panel insight-favorites"><h2>高分作品</h2><div className="title-cloud">{scored.filter((entry) => (entry.score || 0) >= 9).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10).map((entry) => <span key={entry.vndbId}>{entry.title} <b>{entry.score}</b></span>)}</div></section>
        <section className="insight-panel insight-tags"><h2>偏好标签</h2><div className="tag-cloud">{topTags.map(([tag, count]) => <span key={tag}>{tag} {count}</span>)}</div></section>
      </div>
    </div>
  );
}

function ModelPage({ manifest, onInstall }: { manifest: ModelManifest | null; onInstall: (url: string, callback: (progress: InstallProgress) => void) => Promise<void> }) {
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const install = async (url: string) => {
    setWorking(true); setError("");
    try { await onInstall(url, setProgress); } catch (reason) { setError(reason instanceof Error ? reason.message : "安装失败"); } finally { setWorking(false); }
  };
  return (
    <div className="page"><header className="page-header"><h1>本地模型</h1></header>
      {manifest && <section className="model-current"><Database weight="duotone" /><div><strong>{manifest.tier === "demo" ? "演示模型" : manifest.tier === "standard" ? "手机标准模型" : "桌面完整模型"}</strong><span>{manifest.modelVersion}</span></div><Check weight="bold" /></section>}
      <div className="model-options">
        <button type="button" onClick={() => install(DEMO_MODEL_MANIFEST)} disabled={working}><DownloadSimple /><strong>演示模型</strong><span>快速体验</span></button>
        <button type="button" onClick={() => install(STANDARD_MODEL_MANIFEST)} disabled={working}><DownloadSimple /><strong>手机标准模型</strong><span>完整作品库</span></button>
        <button type="button" onClick={() => install(FULL_MODEL_MANIFEST)} disabled={working}><DownloadSimple /><strong>桌面完整模型</strong><span>完整精度</span></button>
      </div>
      {progress && <progress value={progress.received} max={progress.total} aria-label="模型安装进度" />}
      {error && <div className="inline-error">{error}</div>}
    </div>
  );
}

function SettingsPage({ profiles, activeProfile, theme, catalog, onTheme, onCreate, onActivate, onDelete, onImport }: {
  profiles: Profile[];
  activeProfile: Profile;
  theme: "light" | "dark";
  catalog: CatalogEntry[];
  onTheme: (theme: "light" | "dark") => void;
  onCreate: (name: string) => void;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onImport: (entries: LibraryEntry[]) => void;
}) {
  const [name, setName] = useState("");
  const [source, setSource] = useState<"vndb" | "bangumi">("vndb");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [unmapped, setUnmapped] = useState<ImportResult["unmapped"]>([]);
  const [mappingQueries, setMappingQueries] = useState<Record<number, string>>({});
  const runImport = async () => {
    setError("");
    try {
      const result = source === "vndb" ? await importVndb(username, catalog) : await importBangumi(username, catalog);
      onImport(result.mapped);
      setUnmapped(result.unmapped);
      setMappingQueries(Object.fromEntries(result.unmapped.map((item) => [item.sourceId, item.title])));
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "导入失败"); }
  };
  return (
    <div className="page"><header className="page-header"><h1>设置</h1></header>
      <section className="settings-section"><h2>主题</h2><div className="choice-row"><button className={theme === "light" ? "active" : ""} type="button" onClick={() => onTheme("light")}><Sun />浅色</button><button className={theme === "dark" ? "active" : ""} type="button" onClick={() => onTheme("dark")}><Moon />深色</button></div></section>
      <section className="settings-section"><h2>本地资料</h2><div className="profile-list">{profiles.map((profile) => <div key={profile.id}><button className={profile.id === activeProfile.id ? "profile-name active" : "profile-name"} type="button" onClick={() => onActivate(profile.id)}>{profile.name || "本地资料"}</button>{profile.id === activeProfile.id ? <span>当前</span> : null}<button className="icon-button" type="button" onClick={() => onDelete(profile.id)} disabled={profiles.length === 1}><Trash /></button></div>)}</div><div className="inline-form"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="资料名称（选填）" /><button className="secondary-button" type="button" onClick={() => { onCreate(name.trim()); setName(""); }}><Plus />新建</button></div></section>
      <section className="settings-section"><h2>导入评分</h2><div className="choice-row"><button className={source === "vndb" ? "active" : ""} type="button" onClick={() => setSource("vndb")}>VNDB</button><button className={source === "bangumi" ? "active" : ""} type="button" onClick={() => setSource("bangumi")}>Bangumi</button></div><div className="inline-form"><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名" /><button className="secondary-button" type="button" onClick={runImport} disabled={!username.trim()}><UploadSimple />导入</button></div>{error && <div className="inline-error">{error}</div>}</section>
      {unmapped.length > 0 && <section className="settings-section"><h2>待关联 {unmapped.length}</h2><div className="mapping-list">{unmapped.slice(0, 50).map((sourceItem) => {
        const query = mappingQueries[sourceItem.sourceId] || "";
        const matches = searchCatalogEntries(catalog, query, 4);
        return <article key={sourceItem.sourceId}><strong>{sourceItem.title}</strong><input aria-label={`搜索${sourceItem.title}对应作品`} value={query} onChange={(event) => setMappingQueries((current) => ({ ...current, [sourceItem.sourceId]: event.target.value }))} />{matches.length > 0 && <div className="mapping-results">{matches.map((item) => <button type="button" key={item.id} onClick={() => { onImport([{ vndbId: item.id, title: item.title, score: sourceItem.score, status: sourceItem.status, source: "bangumi", updatedAt: new Date().toISOString() }]); setUnmapped((current) => current.filter((value) => value.sourceId !== sourceItem.sourceId)); }}>{item.title}</button>)}</div>}</article>;
      })}</div></section>}
    </div>
  );
}

export default function App() {
  const [model, setModel] = useState<ModelManifest | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<LibraryEntry[]>([]);
  const [collections, setCollections] = useState<Collections>({ wishlist: [], hidden: [] });
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [page, setPage] = useState<Page>("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [addItem, setAddItem] = useState<CatalogEntry | null>(null);
  const [detailItem, setDetailItem] = useState<CatalogEntry | null>(null);
  const [detailReturnPage, setDetailReturnPage] = useState<Page>("recommendations");
  const [loading, setLoading] = useState(true);
  const [recommending, setRecommending] = useState(false);
  const [undo, setUndo] = useState<{ id: number; timer: number } | null>(null);
  const worker = useRef<Worker | null>(null);
  const recommendationRequest = useRef(0);
  const catalogMap = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const activeProfile = profiles.find((profile) => profile.id === profileId) || null;

  const loadModel = useCallback(async () => {
    const installed = await loadActivePackages();
    if (!installed) { setModel(null); setLoading(false); return; }
    const recommender = new Worker(new URL("./worker/recommender.worker.ts", import.meta.url), { type: "module" });
    worker.current?.terminate();
    worker.current = recommender;
    await new Promise<void>((resolve, reject) => {
      recommender.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === "ready") {
          setCatalog(event.data.catalog);
          if (installed.manifest.tier === "demo") {
            void loadSearchCatalog(STANDARD_MODEL_MANIFEST).then(setCatalog).catch(() => undefined);
          }
          resolve();
        }
        if (event.data.type === "error") reject(new Error(event.data.message));
      };
      recommender.postMessage({ type: "init", packages: installed.packages });
    });
    setModel(installed.manifest);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const [storedProfiles, storedTheme, storedProfile] = await Promise.all([
        listProfiles(),
        getPreference<"light" | "dark">("theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
        getPreference<string | null>("activeProfile", null),
      ]);
      setProfiles(storedProfiles);
      setProfileId(storedProfiles.some((profile) => profile.id === storedProfile) ? storedProfile : storedProfiles[0]?.id || null);
      setTheme(storedTheme);
      await loadModel();
    })();
    return () => worker.current?.terminate();
  }, [loadModel]);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    if (!profileId) return;
    void Promise.all([listRatings(profileId), getCollections(profileId)]).then(([storedRatings, storedCollections]) => { setRatings(storedRatings); setCollections(storedCollections); });
  }, [profileId]);

  const generateRecommendations = useCallback(async (hiddenOverride?: number[]) => {
    if (!worker.current || !activeProfile) return;
    const sequence = ++recommendationRequest.current;
    setRecommending(true);
    const requestId = randomId();
    try {
      const results = await new Promise<Recommendation[]>((resolve, reject) => {
        const current = worker.current as Worker;
        const handler = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.type === "recommendations" && event.data.requestId === requestId) { current.removeEventListener("message", handler); resolve(event.data.results); }
          if (event.data.type === "error") { current.removeEventListener("message", handler); reject(new Error(event.data.message)); }
        };
        current.addEventListener("message", handler);
        current.postMessage({ type: "recommend", requestId, ratings, hidden: hiddenOverride ?? collections.hidden, limit: 80 });
      });
      if (sequence === recommendationRequest.current) setRecommendations(results);
    } finally { if (sequence === recommendationRequest.current) setRecommending(false); }
  }, [activeProfile, ratings, collections.hidden]);

  const persistCollections = async (next: Collections) => {
    if (!profileId) return;
    setCollections(next);
    await saveCollections(profileId, next);
  };

  const hideRecommendation = async (id: number) => {
    if (undo) window.clearTimeout(undo.timer);
    const next = { ...collections, hidden: Array.from(new Set([...collections.hidden, id])), wishlist: collections.wishlist.filter((value) => value !== id) };
    setRecommendations((current) => current.filter((value) => value.item.id !== id));
    await persistCollections(next);
    const timer = window.setTimeout(() => setUndo(null), 5000);
    setUndo({ id, timer });
    window.setTimeout(() => void generateRecommendations(next.hidden), 260);
  };

  const undoHidden = async () => {
    if (!undo) return;
    window.clearTimeout(undo.timer);
    const next = { ...collections, hidden: collections.hidden.filter((id) => id !== undo.id) };
    await persistCollections(next);
    setUndo(null);
    await generateRecommendations(next.hidden);
  };

  const saveEntry = async (entry: LibraryEntry) => {
    if (!profileId) return;
    await saveRating(profileId, entry);
    setRatings((current) => [...current.filter((value) => value.vndbId !== entry.vndbId), entry]);
    setAddItem(null);
  };

  const removeEntry = async (id: number) => {
    if (!profileId) return;
    if (ratings.some((entry) => entry.vndbId === id)) { await removeRating(profileId, id); setRatings((current) => current.filter((entry) => entry.vndbId !== id)); }
    if (collections.hidden.includes(id) || collections.wishlist.includes(id)) await persistCollections({ hidden: collections.hidden.filter((value) => value !== id), wishlist: collections.wishlist.filter((value) => value !== id) });
  };

  const openDetail = (item: CatalogEntry) => {
    if (page !== "detail") setDetailReturnPage(page);
    setDetailItem(item);
    setPage("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleHiddenDetail = async (id: number) => {
    if (collections.hidden.includes(id)) {
      const next = { ...collections, hidden: collections.hidden.filter((value) => value !== id) };
      await persistCollections(next);
      await generateRecommendations(next.hidden);
      return;
    }
    await hideRecommendation(id);
  };

  if (loading) return <div className="app-loading"><span /></div>;
  if (!model) return <ModelGate onInstalled={loadModel} />;
  if (!activeProfile) return <Onboarding catalog={catalog} onDone={async (profile, imported) => { await saveProfile(profile); await saveRatings(profile.id, imported); setProfiles([profile]); setProfileId(profile.id); await setPreference("activeProfile", profile.id); }} />;

  return (
    <>
      <AppShell page={page} onPage={setPage} profile={activeProfile} profiles={profiles} onProfile={(id) => { setProfileId(id); void setPreference("activeProfile", id); }} catalog={catalog} onAdd={setAddItem} theme={theme} onToggleTheme={() => { const value = theme === "light" ? "dark" : "light"; setTheme(value); void setPreference("theme", value); }}>
        {page === "dashboard" && <Dashboard profile={activeProfile} ratings={ratings} recommendations={recommendations} catalogMap={catalogMap} revealAdult onRecommend={() => { setPage("recommendations"); void generateRecommendations(); }} />}
        {page === "recommendations" && <RecommendationsPage recommendations={recommendations} collections={collections} revealAdult onWish={(id) => void persistCollections({ ...collections, wishlist: collections.wishlist.includes(id) ? collections.wishlist.filter((value) => value !== id) : [...collections.wishlist, id] })} onHide={(id) => void hideRecommendation(id)} onOpen={openDetail} onRefresh={() => void generateRecommendations()} loading={recommending} />}
        {page === "library" && <LibraryPage ratings={ratings} catalogMap={catalogMap} collections={collections} revealAdult onChange={(entry) => void saveEntry(entry)} onRemove={(id) => void removeEntry(id)} onOpen={openDetail} />}
        {page === "insights" && <Insights ratings={ratings} catalogMap={catalogMap} />}
        {page === "model" && <ModelPage manifest={model} onInstall={async (url, callback) => { await installModel(url, callback); await loadModel(); setRecommendations([]); }} />}
        {page === "settings" && <SettingsPage profiles={profiles} activeProfile={activeProfile} theme={theme} catalog={catalog} onTheme={(value) => { setTheme(value); void setPreference("theme", value); }} onCreate={(name) => { const now = new Date().toISOString(); const profile = { id: randomId(), name: name || `本地资料 ${profiles.length + 1}`, createdAt: now, updatedAt: now }; void saveProfile(profile); setProfiles((current) => [...current, profile]); setProfileId(profile.id); void setPreference("activeProfile", profile.id); }} onActivate={(id) => { setProfileId(id); void setPreference("activeProfile", id); }} onDelete={(id) => { void deleteProfile(id); const next = profiles.filter((profile) => profile.id !== id); setProfiles(next); if (profileId === id) { const nextId = next[0]?.id || null; setProfileId(nextId); void setPreference("activeProfile", nextId); } }} onImport={(entries) => { void saveRatings(activeProfile.id, entries); setRatings((current) => [...current.filter((entry) => !entries.some((value) => value.vndbId === entry.vndbId)), ...entries]); }} />}
        {page === "detail" && detailItem && <DetailPage item={catalogMap.get(detailItem.id) || detailItem} catalogMap={catalogMap} rating={ratings.find((entry) => entry.vndbId === detailItem.id)} recommendation={recommendations.find((entry) => entry.item.id === detailItem.id)} wished={collections.wishlist.includes(detailItem.id)} hidden={collections.hidden.includes(detailItem.id)} onBack={() => setPage(detailReturnPage)} onOpen={openDetail} onScore={(score) => void saveEntry({ vndbId: detailItem.id, title: detailItem.title, score, status: "finished", source: "manual", updatedAt: new Date().toISOString() })} onWish={() => void persistCollections({ ...collections, wishlist: collections.wishlist.includes(detailItem.id) ? collections.wishlist.filter((value) => value !== detailItem.id) : [...collections.wishlist, detailItem.id] })} onHide={() => void toggleHiddenDetail(detailItem.id)} />}
      </AppShell>
      {addItem && <AddDialog item={addItem} onClose={() => setAddItem(null)} onSave={(entry) => void saveEntry(entry)} />}
      {undo && <div className="undo-toast" role="status"><span>已标记不感兴趣</span><button type="button" onClick={() => void undoHidden()}>撤回</button></div>}
    </>
  );
}
