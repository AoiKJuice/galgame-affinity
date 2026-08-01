import React from "react";
import {
  Books,
  CaretDown,
  ChartDonut,
  Check,
  Database,
  GearSix,
  House,
  Infinity as InfinityIcon,
  MagnifyingGlass,
  Moon,
  Sparkle,
  Sun,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import type { CatalogEntry, Profile } from "../model/types";
import { useCatalogSearch } from "../lib/use-catalog-search";
import { Cover } from "./Cover";

export type Page = "dashboard" | "recommendations" | "library" | "insights" | "model" | "settings" | "detail";

const NAV: Array<{ id: Page; label: string; icon: typeof House }> = [
  { id: "dashboard", label: "概览", icon: House },
  { id: "recommendations", label: "推荐", icon: Sparkle },
  { id: "library", label: "作品库", icon: Books },
  { id: "insights", label: "审美分析", icon: ChartDonut },
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
  theme,
  onToggleTheme,
  children,
}: {
  page: Page;
  onPage: (page: Page) => void;
  profile: Profile | null;
  profiles: Profile[];
  onProfile: (id: string) => void;
  catalog: CatalogEntry[];
  onAdd: (item: CatalogEntry) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  children: React.ReactNode;
}) {
  const [query, setQuery] = React.useState("");
  const [profileMenuOpen, setProfileMenuOpen] = React.useState(false);
  const results = useCatalogSearch(catalog, query);
  return (
    <div className="app-shell">
      <aside className="side-nav">
        <button className="brand" type="button" onClick={() => onPage("dashboard")}>
          <span className="brand-mark" aria-hidden="true"><InfinityIcon size={42} weight="thin" /></span>
          <span className="brand-wordmark"><strong>GAL鉴赏</strong></span>
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
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索完整作品库并添加" aria-label="搜索完整作品库并添加" />
            {query && <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}><X /></button>}
            {results.length > 0 && (
              <div className="search-results">
                {results.map((item) => (
                  <button key={item.id} type="button" onClick={() => { onAdd(item); setQuery(""); }}>
                    <Cover item={item} compact />
                    <span><strong>{item.title}</strong><small>{item.year || "年份未知"} · VNDB #{item.id}</small></span>
                    <span className="search-add">添加</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={onToggleTheme} aria-label={theme === "light" ? "切换到深色主题" : "切换到浅色主题"}>
              {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <div className="profile-menu-wrap">
              <button className="profile-switcher" type="button" aria-expanded={profileMenuOpen} aria-label={`当前资料${profile?.name || "本地资料"}，切换资料`} onClick={() => setProfileMenuOpen((open) => !open)}>
                <UserCircle size={23} weight="duotone" />
                <span>{profile?.name || "本地资料"}</span>
                <CaretDown size={14} weight="bold" />
              </button>
              {profileMenuOpen && (
                <div className="profile-menu">
                  <strong className="profile-menu-title">切换资料</strong>
                  <div className="profile-menu-list">
                    {profiles.map((item) => {
                      const active = profile?.id === item.id;
                      return <button key={item.id} type="button" className={active ? "active" : ""} aria-pressed={active} onClick={() => { onProfile(item.id); setProfileMenuOpen(false); }}><span className="profile-menu-avatar">{(item.name || "本").slice(0, 1)}</span><strong>{item.name || "本地资料"}</strong>{active && <Check size={17} weight="bold" />}</button>;
                    })}
                  </div>
                  <button className="profile-menu-manage" type="button" onClick={() => { onPage("settings"); setProfileMenuOpen(false); }}>管理本地资料</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="移动导航">
        {NAV.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={page === item.id ? "current" : ""} type="button" onClick={() => onPage(item.id)}><Icon /><span>{item.label === "审美分析" ? "分析" : item.label}</span></button>;
        })}
        <button type="button" className={page === "settings" ? "current" : ""} onClick={() => onPage("settings")}><GearSix /><span>我的</span></button>
      </nav>
    </div>
  );
}
