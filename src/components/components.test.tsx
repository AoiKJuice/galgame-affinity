import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RatingControl } from "./RatingControl";
import { RecommendationCard } from "./RecommendationCard";
import { searchCatalogEntries } from "../lib/catalog-search";
import type { CatalogEntry, Recommendation } from "../model/types";

describe("RatingControl", () => {
  it("supports an unrated value and integer slider input", () => {
    const onChange = vi.fn();
    render(<RatingControl value={null} onChange={onChange} label="测试作品" />);
    expect(screen.getByLabelText("测试作品")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("测试作品评分滑条"), { target: { value: "9" } });
    expect(onChange).toHaveBeenCalledWith(9);
  });
});

describe("searchCatalogEntries", () => {
  const entry = (id: number, title: string, ratingCount: number, rating: number): CatalogEntry => ({
    id, title, ratingCount, rating, adult: false, allAgeAvailable: true, platforms: [], tags: [], relations: [],
  });

  it("normalizes title punctuation and sorts matches by popularity", () => {
    const results = searchCatalogEntries([
      entry(2, "Fate/stay night", 200, 9),
      entry(1, "Fate stay night", 900, 7),
      entry(3, "Fate/hollow ataraxia", 400, 8),
    ], "fate-stay night");
    expect(results.map((item) => item.id)).toEqual([1, 2]);
  });
});

describe("RecommendationCard", () => {
  const recommendation: Recommendation = {
    item: {
      id: 1,
      title: "测试作品",
      coverUrl: null,
      year: 2026,
      rating: 8.23,
      ratingCount: 200,
      adult: true,
      allAgeAvailable: false,
      platforms: ["win"],
      tags: ["Drama", "Mystery", "Romance", "School"],
      relations: [],
      bangumiIds: [],
      steamIds: [],
    },
    affinity: 84,
    confidence: "medium",
    support: 12,
    score: 1.2,
    matchedTags: ["Drama", "Mystery", "Romance", "School"],
    source: "explicit",
  };

  it("shows the developer, age class and localized matched tags", () => {
    render(<RecommendationCard recommendation={recommendation} revealAdult={false} wished={false} developer="Palette" onOpen={vi.fn()} onWish={vi.fn()} onHide={vi.fn()} />);
    expect(screen.queryByText("18+")).not.toBeInTheDocument();
    expect(screen.getByText("Palette")).toBeInTheDocument();
    expect(screen.getByText("NSFW")).toBeInTheDocument();
    expect(screen.getByText("悬疑")).toBeInTheDocument();
    expect(screen.getByText("校园")).toBeInTheDocument();
  });
});
