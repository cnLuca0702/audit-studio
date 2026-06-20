"use client";

import { BarChart3, MapPin, Wand2, Merge, Gavel } from "lucide-react";
import type { AppId } from "@/components/AppRenderer";

export interface AppCatalogItem {
  id: AppId;
  name: string;
  icon: React.ReactNode;
}

export const APP_CATALOG: Record<AppId, Omit<AppCatalogItem, "id">> = {
  rewrite: { name: "文档改写", icon: <Wand2 size={16} className="text-purple-500" /> },
  merge: { name: "文档合并", icon: <Merge size={16} className="text-orange-500" /> },
  price: { name: "材价调查", icon: <BarChart3 size={16} className="text-blue-500" /> },
  city: { name: "城市研究", icon: <MapPin size={16} className="text-green-500" /> },
  bidding: { name: "招标文件审查", icon: <Gavel size={16} className="text-red-600" /> },
};

export function getAppCatalogItem(id: AppId): AppCatalogItem {
  const item = APP_CATALOG[id];
  return { id, ...item };
}

export function getAllAppCatalogItems(): AppCatalogItem[] {
  return (Object.keys(APP_CATALOG) as AppId[]).map(getAppCatalogItem);
}
