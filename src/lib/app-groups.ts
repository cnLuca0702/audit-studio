import type { AppId } from "@/components/AppRenderer";

export interface AppGroupConfig {
  name: string;
  appIds: AppId[];
}

export const ALL_APP_IDS: AppId[] = ["rewrite", "merge", "price", "city", "bidding"];

export const DEFAULT_APP_GROUPS: AppGroupConfig[] = [
  { name: "通用", appIds: ["rewrite", "merge"] },
  { name: "造价", appIds: ["price"] },
  { name: "研究", appIds: ["city"] },
  { name: "招投标", appIds: ["bidding"] },
];

/**
 * 校验并去重分组配置。
 * 未编入任何分组的应用不会被自动归入「其他」，也不会在侧边栏展示。
 */
export function sanitizeAppGroups(input: unknown): AppGroupConfig[] {
  if (!Array.isArray(input)) return [];

  const groups: AppGroupConfig[] = [];
  const used = new Set<AppId>();

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const name = String((item as AppGroupConfig).name ?? "").trim();
    if (!name) continue;

    const appIds = (Array.isArray((item as AppGroupConfig).appIds)
      ? (item as AppGroupConfig).appIds
      : []
    ).filter((id): id is AppId => ALL_APP_IDS.includes(id as AppId))
      .filter((id) => !used.has(id));

    appIds.forEach((id) => used.add(id));
    groups.push({ name, appIds });
  }

  return groups;
}

/** 移除旧版逻辑自动生成的「其他」分组（仅当存在多个分组时） */
export function stripLegacyAutoOtherGroup(groups: AppGroupConfig[]): AppGroupConfig[] {
  if (groups.length <= 1) return groups;
  const filtered = groups.filter((g) => g.name !== "其他");
  return filtered.length > 0 ? filtered : groups;
}

/** 持久化前的分组配置（不自动补「其他」） */
export function prepareStoredAppGroups(input: unknown): AppGroupConfig[] {
  return stripLegacyAutoOtherGroup(sanitizeAppGroups(input));
}

/** 读取配置；仅当从未保存过分组（input 为 null/undefined）时使用默认分组 */
export function resolveAppGroups(input: unknown): AppGroupConfig[] {
  if (input == null) {
    return cloneAppGroups(DEFAULT_APP_GROUPS);
  }
  return prepareStoredAppGroups(input);
}

/** 侧边栏仅展示至少包含一个应用的分组 */
export function getSidebarAppGroups(groups: AppGroupConfig[]): AppGroupConfig[] {
  return groups.filter((g) => g.appIds.length > 0);
}

export function cloneAppGroups(groups: AppGroupConfig[]): AppGroupConfig[] {
  return groups.map((g) => ({ name: g.name, appIds: [...g.appIds] }));
}

/** 设置页：尚未编入任何分组的应用 */
export function getUnassignedAppIds(groups: AppGroupConfig[]): AppId[] {
  const used = new Set(groups.flatMap((g) => g.appIds));
  return ALL_APP_IDS.filter((id) => !used.has(id));
}
