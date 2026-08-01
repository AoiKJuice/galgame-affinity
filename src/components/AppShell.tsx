import React from "react";
import {
  Books,
  ChartDonut,
  Database,
  FlowerLotus,
  GearSix,
  House,
  List,
  MagnifyingGlass,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import type { CatalogEntry, Profile } from "../model/types";

export type Page = "dashboard" | "recommendations" | "library" | "insights" | "model" | "settings";

const NAV: Array<{ id: Page; label: string; icon: typeof House }> = [
  { id: "dashboard", label: "概览", icon: House },
  { id: "recommendations", label: "推荐", icon: Sparkle },
  { id: "library", label: "片库", icon: Books },
  { id: "insights", label: "审美", icon: ChartDonut },
  { id: "model", label: "模型", icon: Database },
];

export function AppShell({
  page,
  onPage,
  profile,
  profiles,
  onProfile,
  catalog,
  onAdd,
  children,
}: {
  page: Page;
  onPage: (page: Page) => void;
  profile: Profile | null;
  profiles: Profile[];
  onProfile: (id: string) => void;
  catalog: CatalogEntry[];
  onAdd: (item: CatalogEntry) => void;
  children: React.ReactNode;
}) {
  const [query, setQuery] = React.useState("");
  const results = query.trim().length >= 2
    ? catalog.filter((item) => `${item.title} ${item.titleNative || ""} ${item.titleEnglish || ""}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];
  return (
    <div className="app-shell">
      <aside className="side-nav">
        <button className="brand" type="button" onClick={() => onPage("dashboard")}>
          <FlowerLotus weight="duotone" /><span>游鉴</span>
        </button>
        <nav aria-label="主导航">
          {NAV.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={page === item.id ? "current" : ""} type="button" onClick={() => onPage(item.id)}><Icon /><span>{item.label}</span></button>;
          })}
        </nav>
        <button className={`side-settings ${page === "settings" ? "current" : ""}`} type="button" onClick={() => onPage("settings")}><GearSix /><span>设置</span></button>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="global-search">
            <MagnifyingGlass aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索全部 Galgame" aria-label="搜索全部 Galgame" />
            {query && <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}><X /></button>}
            {results.length > 0 && (
              <div className="search-results">
                {results.map((item) => (
                  <button key={item.id} type="button" onClick={() => { onAdd(item); setQuery(""); }}>
                    <span>{item.title}</span><strong>添加</strong>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="profile-switcher" role="group" aria-label="当前资料">
            <List />
            {profiles.map((item) => (
              <button key={item.id} type="button" className={profile?.id === item.id ? "active" : ""} onClick={() => onProfile(item.id)}>{item.name}</button>
            ))}
          </div>
        </header>
        <main>{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="移动导航">
        {NAV.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={page === item.id ? "current" : ""} type="button" onClick={() => onPage(item.id)}><Icon /><span>{item.label}</span></button>;
        })}
        <button type="button" className={page === "settings" ? "current" : ""} onClick={() => onPage("settings")}><GearSix /><span>我的</span></button>
      </nav>
    </div>
  );
}
