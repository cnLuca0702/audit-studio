"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Check,
  CheckCircle,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { AppId } from "@/components/AppRenderer";
import { getAppCatalogItem, getAllAppCatalogItems } from "@/lib/app-catalog";
import {
  DEFAULT_APP_GROUPS,
  getUnassignedAppIds,
  type AppGroupConfig,
} from "@/lib/app-groups";

interface AppGroupsSettingsTabProps {
  onSaved?: () => void;
}

type EditableAppGroup = AppGroupConfig & { _key: string };

function toEditableGroups(groups: AppGroupConfig[]): EditableAppGroup[] {
  return groups.map((g) => ({
    name: g.name,
    appIds: [...g.appIds],
    _key: crypto.randomUUID(),
  }));
}

function stripGroupKeys(groups: EditableAppGroup[]): AppGroupConfig[] {
  return groups.map(({ name, appIds }) => ({ name, appIds: [...appIds] }));
}

export function AppGroupsSettingsTab({ onSaved }: AppGroupsSettingsTabProps) {
  const [groups, setGroups] = useState<EditableAppGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addPickerGroup, setAddPickerGroup] = useState<number | null>(null);
  const [appNames, setAppNames] = useState<Record<string, string>>({});
  const [renamingApp, setRenamingApp] = useState<AppId | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/app-groups");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      if (!Array.isArray(data.groups)) throw new Error("invalid groups");
      setGroups(toEditableGroups(data.groups));
      setAppNames(
        data.appNames && typeof data.appNames === "object" ? data.appNames : {}
      );
    } catch {
      setGroups([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const unassigned = getUnassignedAppIds(groups);
  const allApps = getAllAppCatalogItems();

  const updateGroupName = (index: number, name: string) => {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, name } : g)));
    setSaved(false);
  };

  const updateAppName = (appId: AppId, name: string) => {
    setAppNames((prev) => ({ ...prev, [appId]: name }));
    setSaved(false);
  };

  const removeAppFromGroup = (groupIndex: number, appId: AppId) => {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === groupIndex ? { ...g, appIds: g.appIds.filter((id) => id !== appId) } : g
      )
    );
    setSaved(false);
  };

  const addAppToGroup = (groupIndex: number, appId: AppId) => {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIndex) {
          return { ...g, appIds: g.appIds.filter((id) => id !== appId) };
        }
        if (g.appIds.includes(appId)) return g;
        return { ...g, appIds: [...g.appIds, appId] };
      })
    );
    setAddPickerGroup(null);
    setSaved(false);
  };

  const addGroup = () => {
    setGroups((prev) => [...prev, { _key: crypto.randomUUID(), name: "新分组", appIds: [] }]);
    setSaved(false);
  };

  const removeGroup = (index: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  };

  const moveGroup = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    setGroups((prev) => {
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSaved(false);
  };

  const handleReset = () => {
    setGroups(toEditableGroups(DEFAULT_APP_GROUPS));
    setSaved(false);
  };

  const handleSave = async () => {
    const trimmed = stripGroupKeys(groups)
      .map((g) => ({ name: g.name.trim(), appIds: [...g.appIds] }))
      .filter((g) => g.name);

    if (trimmed.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/app-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groups: trimmed,
          appNames,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroups(toEditableGroups(data.groups));
      setAppNames(data.appNames || {});
      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-state app-groups-loading">
        <Loader2 size={18} className="spin" />
        <span>加载中...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="empty-state">
        <p>加载分组配置失败</p>
        <button type="button" className="btn-sm btn-outline" onClick={loadGroups}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="app-groups-section">
     <p className="section-desc">
       自定义应用模式侧边栏的分组与应用归属。每个应用只能属于一个分组；未分配的应用不会出现在侧边栏。
     </p>

      <div className="model-section-title-row">
        <h3 className="model-section-title" style={{ margin: 0 }}>
          分组列表
        </h3>
        <button type="button" className="btn-add-model" onClick={addGroup}>
          <Plus size={14} /> 添加分组
        </button>
      </div>

      <div className="app-groups-grid">
        {groups.map((group, index) => (
          <div key={group._key} className="app-group-card">
            <div className="app-group-card-head">
              <div className="app-group-card-title-row">
                <span className="app-group-order">{String(index + 1).padStart(2, "0")}</span>
                <input
                  className="app-group-name-input"
                  value={group.name}
                  onChange={(e) => updateGroupName(index, e.target.value)}
                  placeholder="分组名称"
                  aria-label="分组名称"
                />
              </div>
              <div className="model-saved-actions app-group-card-actions">
                <button
                  type="button"
                  className="model-action-btn"
                  title="上移"
                  disabled={index === 0}
                  onClick={() => moveGroup(index, -1)}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className="model-action-btn"
                  title="下移"
                  disabled={index === groups.length - 1}
                  onClick={() => moveGroup(index, 1)}
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  className="model-action-btn model-action-danger"
                  title="删除分组"
                  disabled={groups.length <= 1}
                  onClick={() => removeGroup(index)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="app-group-apps">
              {group.appIds.length === 0 ? (
                <div className="empty-state app-group-empty">暂无应用，请点击下方添加</div>
              ) : (
                group.appIds.map((appId) => {
                  const app = getAppCatalogItem(appId);
                  const displayName = appNames[appId]?.trim() || app.name;
                  return (
                    <div key={appId} className="model-saved-item app-group-app-item">
                      <div className="model-saved-item-left">
                        <div className="app-group-app-icon-wrap">{app.icon}</div>
                        <div className="model-saved-info">
                          <div className="model-saved-name-row">
                            {renamingApp === appId ? (
                              <input
                                className="app-group-name-input app-name-input"
                                value={appNames[appId] ?? ""}
                                onChange={(e) => updateAppName(appId, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") setRenamingApp(null);
                                  if (e.key === "Escape") setRenamingApp(null);
                                }}
                                onBlur={() => setRenamingApp(null)}
                                placeholder={app.name}
                                aria-label={`${app.name} 自定义名称`}
                                maxLength={30}
                                autoFocus
                              />
                            ) : (
                              <span className="model-saved-name">{displayName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="model-saved-actions">
                        <button
                          type="button"
                          className="model-action-btn"
                          title="改名"
                          onClick={() => setRenamingApp(appId)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="model-action-btn model-action-danger"
                          title="移出分组"
                          onClick={() => removeAppFromGroup(index, appId)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="app-group-add-row">
              {addPickerGroup === index ? (
                <div className="app-group-picker">
                  {(unassigned.length > 0 ? unassigned : allApps.map((a) => a.id))
                    .filter((id) => !group.appIds.includes(id))
                    .map((appId) => {
                      const app = getAppCatalogItem(appId);
                      const pickerName = appNames[appId]?.trim() || app.name;
                      return (
                        <button
                          key={appId}
                          type="button"
                          className="btn-sm btn-outline app-group-picker-item"
                          onClick={() => addAppToGroup(index, appId)}
                        >
                          <span className="app-group-picker-icon">{app.icon}</span>
                          {pickerName}
                        </button>
                      );
                    })}
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => setAddPickerGroup(null)}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-sm btn-outline"
                  onClick={() => setAddPickerGroup(index)}
                  disabled={allApps.every((a) => group.appIds.includes(a.id))}
                >
                  <Plus size={12} /> 添加应用
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {unassigned.length > 0 && (
        <div className="app-groups-hint">
          未分配应用：{unassigned.map((id) => (appNames[id]?.trim() || getAppCatalogItem(id).name)).join("、")}
        </div>
      )}

      <div className="app-groups-actions">
        <button type="button" className="prompt-load-default-btn" onClick={handleReset}>
          <RotateCcw size={12} /> 恢复默认
        </button>
        <button type="button" className="btn-sm btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 size={12} className="spin" />
          ) : saved ? (
            <CheckCircle size={12} />
          ) : (
            <Check size={12} />
          )}
          {saving ? "保存中..." : saved ? "已保存" : "保存"}
        </button>
      </div>
    </div>
  );
}
