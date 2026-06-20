"use client";

import { CityResearch } from "./CityResearch";
import { PriceAnalyzer } from "./PriceAnalyzer";
import { DocRewrite } from "./DocRewrite";
import { DocMerge } from "./DocMerge";
import { BiddingReview } from "./BiddingReview";

export type AppId = "city" | "price" | "rewrite" | "merge" | "bidding";

interface AppRendererProps {
  appId: AppId | null;
}

const APP_CONFIG: Record<AppId, { name: string; icon: string }> = {
  price: { name: "材价调查", icon: "📊" },
  city: { name: "城市研究", icon: "📍" },
  rewrite: { name: "文档改写", icon: "✏️" },
  merge: { name: "文档合并", icon: "📄" },
  bidding: { name: "招标文件审查", icon: "⚖️" },
};

export function getAppConfig(appId: AppId) {
  return APP_CONFIG[appId];
}

export function getAllApps() {
  return Object.entries(APP_CONFIG).map(([id, config]) => ({
    id: id as AppId,
    ...config,
  }));
}

export function AppRenderer({ appId }: AppRendererProps) {
  if (!appId) return null;

  switch (appId) {
    case "city":
      return <CityResearch />;
    case "price":
      return <PriceAnalyzer />;
    case "rewrite":
      return <DocRewrite />;
    case "merge":
      return <DocMerge />;
    case "bidding":
      return <BiddingReview />;
    default:
      return null;
  }
}
