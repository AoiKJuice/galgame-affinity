import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RatingControl } from "./RatingControl";
import { RecommendationCard } from "./RecommendationCard";
import type { Recommendation } from "../model/types";

describe("RatingControl", () => {
  it("supports an unrated value and decimal slider input", () => {
    const onChange = vi.fn();
    render(<RatingControl value={null} onChange={onChange} label="测试作品" />);
    expect(screen.getByLabelText("测试作品")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("测试作品评分滑条"), { target: { value: "8.7" } });
    expect(onChange).toHaveBeenCalledWith(8.7);
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
      tags: ["剧情", "悬疑", "恋爱", "校园"],
      relations: [],
      bangumiIds: [],
      steamIds: [],
    },
    affinity: 84,
    confidence: "medium",
    support: 12,
    score: 1.2,
    matchedTags: ["剧情", "悬疑", "恋爱", "校园"],
    source: "explicit",
  };

  it("masks adult covers and displays at most three matched tags", () => {
    render(<RecommendationCard recommendation={recommendation} revealAdult={false} wished={false} onWish={vi.fn()} onHide={vi.fn()} />);
    expect(screen.getByText("18+")).toBeInTheDocument();
    expect(screen.getByText("剧情")).toBeInTheDocument();
    expect(screen.queryByText("校园")).not.toBeInTheDocument();
  });
});
