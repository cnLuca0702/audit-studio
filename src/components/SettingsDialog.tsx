"use client";

import { useState, useEffect } from "react";
import {
  X, Plus, Trash2, Check, Loader2, TestTube, ExternalLink,
  Globe, CheckCircle, XCircle, Circle, Brain, FileText,
  RotateCcw, Zap, Search,
  Pencil, Eye, EyeOff, ChevronDown, Key, LayoutGrid,
} from "lucide-react";
import { getProviderLabel, getProviderLogo } from "@/lib/provider-labels";
import { apiJson } from "@/lib/api";
import { ProviderLogo } from "./ProviderLogo";
import { AppGroupsSettingsTab } from "./AppGroupsSettingsTab";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onModelsChanged?: () => void;
  onAppGroupsChanged?: () => void;
}

interface BillingPlan {
  value: string;
  label: string;
  baseUrl?: string;
}

interface ProviderConfig {
  id: string;
  name: string;
  type: string;
  baseUrl?: string;
  authUrl?: string;
  logo?: string;
  billingPlans?: BillingPlan[];
}

interface ModelEntry {
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
}

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const THINKING_LEVELS: { value: ThinkingLevel; label: string; desc: string }[] = [
  { value: "off", label: "关闭", desc: "不使用思考" },
  { value: "minimal", label: "最低", desc: "最基础的思考" },
  { value: "low", label: "低", desc: "轻度思考" },
  { value: "medium", label: "中", desc: "默认思考深度" },
  { value: "high", label: "高", desc: "深度思考" },
  { value: "xhigh", label: "极高", desc: "最大思考深度" },
];

type SettingsTab = "models" | "prompt" | "tokens" | "search" | "appGroups";

const SIDEBAR_ITEMS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "models", label: "模型列表", icon: <Globe size={16} /> },
  { id: "prompt", label: "系统提示词", icon: <FileText size={16} /> },
  { id: "tokens", label: "参数配置", icon: <Zap size={16} /> },
  { id: "search", label: "搜索配置", icon: <Search size={16} /> },
  { id: "appGroups", label: "应用分组", icon: <LayoutGrid size={16} /> },
];

const SIDEBAR_TITLES: Record<SettingsTab, string> = {
  models: "模型列表",
  prompt: "系统提示词",
  tokens: "参数配置",
  search: "搜索配置",
  appGroups: "应用分组",
};

const INPUT_TOKEN_OPTIONS = [32, 64, 128, 256];
const OUTPUT_TOKEN_OPTIONS = [8, 16, 32, 64];

export function SettingsDialog({ open, onClose, onModelsChanged, onAppGroupsChanged }: SettingsDialogProps) {
  const [sidebarTab, setSidebarTab] = useState<SettingsTab>("models");
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [allProviders, setAllProviders] = useState<ProviderConfig[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<any[]>([]);
  const [modelsConfig, setModelsConfig] = useState<Record<string, any>>({});
  const [defaultProvider, setDefaultProvider] = useState("");
  const [defaultModelId, setDefaultModelId] = useState("");
  const [defaultThinkingLevel, setDefaultThinkingLevel] = useState("");

  // System prompt state
  const [systemPrompt, setSystemPrompt] = useState("");
  const [systemPromptMode, setSystemPromptMode] = useState<"" | "replace" | "append">("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  const [loadingDefaultPrompt, setLoadingDefaultPrompt] = useState(false);

  // Token parameter state
  const [tokenMaxTokens, setTokenMaxTokens] = useState(16384);
  const [tokenContextWindow, setTokenContextWindow] = useState(128000);
  const [tokenReasoning, setTokenReasoning] = useState(false);
  const [savingTokens, setSavingTokens] = useState(false);
  const [tokensSaved, setTokensSaved] = useState(false);

  // Search config state
  const [searchApiProvider, setSearchApiProvider] = useState("");
  const [searchApiKey, setSearchApiKey] = useState("");
  const [searchKeyEditing, setSearchKeyEditing] = useState(false);
  const [searchKeyDraft, setSearchKeyDraft] = useState("");
  const [searchValidating, setSearchValidating] = useState(false);
  const [searchValidateResult, setSearchValidateResult] = useState<{
    ok: boolean;
    latency?: number;
    error?: string;
  } | null>(null);
  const [searchSaving, setSearchSaving] = useState(false);
  const [searchSaved, setSearchSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Provider editing state
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<{
    ok: boolean;
    latency?: number;
    error?: string;
  } | null>(null);

  // Model picker state
  const [pickerProvider, setPickerProvider] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelEntry[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [savingModels, setSavingModels] = useState(false);

  // Model enable/disable & inline edit state
  const [editingModelKey, setEditingModelKey] = useState<string | null>(null);
  const [editMaxTokens, setEditMaxTokens] = useState(0);
  const [editContextWindow, setEditContextWindow] = useState(0);
  const [editReasoning, setEditReasoning] = useState(false);
  const [savingModelEdit, setSavingModelEdit] = useState(false);
  const [collapsedProviderGroups, setCollapsedProviderGroups] = useState<Set<string>>(new Set());

  // Test state
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency?: number; error?: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    loadData();
    setEditingProvider(null);
    setApiKeyInput("");
    setValidateResult(null);
    setPickerProvider(null);
    setAvailableModels([]);
    setSelectedModels(new Set());
    setAddModelOpen(false);
    setSettingsError(null);
  }, [open]);

  const handleSettingsError = (err: unknown) => {
    setSettingsError(err instanceof Error ? err.message : "保存失败");
  };

  const loadData = async () => {
    try {
      const [allRes, configRes, modelsRes, defaultRes] = await Promise.all([
        fetch("/api/auth/all-providers").then((r) => r.json()),
        fetch("/api/auth/providers").then((r) => r.json()),
        fetch("/api/models-config").then((r) => r.json()),
        fetch("/api/models-config/default").then((r) => r.json()),
      ]);
      setAllProviders(allRes.providers ?? []);
      setConfiguredProviders(configRes.providers ?? []);
      setModelsConfig(modelsRes);
      setDefaultProvider(defaultRes.defaultProvider ?? "");
      setDefaultModelId(defaultRes.defaultModel ?? "");
      setDefaultThinkingLevel(defaultRes.defaultThinkingLevel ?? "");
      setSystemPrompt(defaultRes.systemPrompt ?? "");
      setSystemPromptMode((defaultRes.systemPromptMode as "" | "replace" | "append") ?? "");
      setSearchApiProvider(defaultRes.searchApiProvider ?? "");
      setSearchApiKey(defaultRes.searchApiKey ?? "");

      const defProvider = defaultRes.defaultProvider;
      const defModel = defaultRes.defaultModel;
      if (defProvider && defModel && modelsRes.providers?.[defProvider]) {
        const modelEntry = (modelsRes.providers[defProvider].models ?? []).find(
          (m: any) => m.id === defModel
        );
        if (modelEntry) {
          setTokenMaxTokens(modelEntry.maxTokens ?? 16384);
          setTokenContextWindow(modelEntry.contextWindow ?? 128000);
          setTokenReasoning(modelEntry.reasoning ?? false);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleValidateKey = async (providerId: string) => {
    if (!apiKeyInput.trim()) return;
    setValidating(true);
    setValidateResult(null);
    setAvailableModels([]);
    setSelectedModels(new Set());

    try {
      const provider = allProviders.find((p) => p.id === providerId);
      const res = await fetch("/api/auth/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          apiKey: apiKeyInput.trim(),
          baseUrl: provider?.baseUrl,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setValidateResult({ ok: true, latency: data.latency });
        setAvailableModels(data.models ?? []);
        setPickerProvider(providerId);
        const existingModels = modelsConfig.providers?.[providerId]?.models ?? [];
        const existingIds = new Set<string>(existingModels.map((m: any) => m.id as string));
        setSelectedModels(existingIds);
      } else {
        setValidateResult({ ok: false, error: data.error });
      }
    } catch (err: any) {
      setValidateResult({ ok: false, error: err.message });
    } finally {
      setValidating(false);
    }
  };

  const handleSaveModels = async () => {
    if (!pickerProvider) return;
    setSavingModels(true);
    setSettingsError(null);

    try {
      await apiJson(`/api/auth/api-key/${pickerProvider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: apiKeyInput.trim() }),
      });

      const modelsToSave = availableModels
        .filter((m) => selectedModels.has(m.id))
        .map((m) => ({
          id: m.id,
          name: m.name,
          ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
          ...(m.maxTokens ? { maxTokens: m.maxTokens } : {}),
          ...(m.reasoning ? { reasoning: m.reasoning } : {}),
        }));

      const provider = allProviders.find((p) => p.id === pickerProvider);
      await apiJson("/api/models-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: pickerProvider,
          apiKey: apiKeyInput.trim(),
          baseUrl: provider?.baseUrl,
          models: modelsToSave,
        }),
      });

      setPickerProvider(null);
      setEditingProvider(null);
      setApiKeyInput("");
      setValidateResult(null);
      setAvailableModels([]);
      setSelectedModels(new Set());
      await loadData();
    } catch (err) {
      handleSettingsError(err);
    } finally {
      setSavingModels(false);
    }
  };

  const handleRemoveProvider = async (providerId: string) => {
    setSettingsError(null);
    try {
      await fetch(`/api/auth/logout/${providerId}`);
      await apiJson("/api/models-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, models: [] }),
      });
      await loadData();
    } catch (err) {
      handleSettingsError(err);
    }
  };

  const handleRemoveModel = async (providerId: string, modelId: string) => {
    setSettingsError(null);
    try {
      await apiJson("/api/models-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, removeModels: [modelId] }),
      });
      await loadData();
    } catch (err) {
      handleSettingsError(err);
    }
  };

  const handleSetDefault = async (provider: string, modelId: string) => {
    setSettingsError(null);
    try {
      await apiJson("/api/models-config/default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultProvider: provider, defaultModel: modelId }),
      });
      setDefaultProvider(provider);
      setDefaultModelId(modelId);
      onModelsChanged?.();
    } catch (err) {
      handleSettingsError(err);
    }
  };

  const handleSetDefaultThinkingLevel = async (level: string) => {
    setSettingsError(null);
    try {
      await apiJson("/api/models-config/default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultThinkingLevel: level }),
      });
      setDefaultThinkingLevel(level);
    } catch (err) {
      handleSettingsError(err);
    }
  };

  const handleUpdateThinkingLevelMap = async (providerId: string, modelId: string, map: Record<string, string | null>) => {
    setSettingsError(null);
    try {
      const providerConfig = modelsConfig.providers?.[providerId];
      if (!providerConfig) return;
      const models = (providerConfig.models ?? []).map((m: any) =>
        m.id === modelId ? { ...m, thinkingLevelMap: map } : m
      );
      await apiJson("/api/models-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, models }),
      });
      await loadData();
    } catch (err) {
      handleSettingsError(err);
    }
  };

  const handleTestConnection = async (providerId: string, modelId: string) => {
    setTesting(`${providerId}/${modelId}`);
    setTestResult(null);
    try {
      const res = await fetch("/api/models-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, modelId }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTimeout(() => setTesting(null), 3000);
    }
  };

  const handleSaveSystemPrompt = async () => {
    setSavingPrompt(true);
    setPromptSaved(false);
    setSettingsError(null);
    try {
      await apiJson("/api/models-config/default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt, systemPromptMode }),
      });
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 3000);
    } catch (err) {
      handleSettingsError(err);
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleLoadDefaultPrompt = async () => {
    setLoadingDefaultPrompt(true);
    try {
      const res = await fetch("/api/default-system-prompt");
      if (res.ok) {
        const data = await res.json();
        setSystemPrompt(data.prompt || "");
      }
    } catch {
      // ignore
    } finally {
      setLoadingDefaultPrompt(false);
    }
  };

  const handleSaveTokenParams = async () => {
    if (!defaultProvider || !defaultModelId) return;
    setSavingTokens(true);
    setTokensSaved(false);
    setSettingsError(null);
    try {
      const providerConfig = modelsConfig.providers?.[defaultProvider];
      if (!providerConfig) return;
      const models = (providerConfig.models ?? []).map((m: any) =>
        m.id === defaultModelId
          ? { ...m, maxTokens: tokenMaxTokens, contextWindow: tokenContextWindow, reasoning: tokenReasoning }
          : m
      );
      await apiJson("/api/models-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: defaultProvider, models }),
      });
      setTokensSaved(true);
      setTimeout(() => setTokensSaved(false), 3000);
      await loadData();
    } catch (err) {
      handleSettingsError(err);
    } finally {
      setSavingTokens(false);
    }
  };

  const handleValidateSearchKey = async () => {
    if (!searchKeyDraft.trim() || !searchApiProvider) return;
    setSearchValidating(true);
    setSearchValidateResult(null);

    const start = Date.now();
    try {
      let ok = false;
      if (searchApiProvider === "serpapi") {
        const res = await fetch(
          `https://serpapi.com/search?engine=google&q=test&api_key=${encodeURIComponent(searchKeyDraft.trim())}`,
          { signal: AbortSignal.timeout(15_000) }
        );
        ok = res.ok;
        if (!ok) {
          const errText = await res.text().catch(() => "");
          if (res.status === 401 || res.status === 403) {
            setSearchValidateResult({ ok: false, error: "API Key 无效" });
          } else {
            setSearchValidateResult({ ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` });
          }
          setSearchValidating(false);
          return;
        }
      } else if (searchApiProvider === "brave") {
        const res = await fetch("https://api.search.brave.com/res/v1/web/search?q=test&count=1", {
          headers: { "Accept": "application/json", "X-Subscription-Token": searchKeyDraft.trim() },
          signal: AbortSignal.timeout(15_000),
        });
        ok = res.ok;
        if (!ok) {
          if (res.status === 401 || res.status === 403) {
            setSearchValidateResult({ ok: false, error: "API Key 无效" });
          } else {
            setSearchValidateResult({ ok: false, error: `HTTP ${res.status}` });
          }
          setSearchValidating(false);
          return;
        }
      } else if (searchApiProvider === "tavily") {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: searchKeyDraft.trim(), query: "test", max_results: 1 }),
          signal: AbortSignal.timeout(15_000),
        });
        ok = res.ok;
        if (!ok) {
          if (res.status === 401 || res.status === 403) {
            setSearchValidateResult({ ok: false, error: "API Key 无效" });
          } else {
            setSearchValidateResult({ ok: false, error: `HTTP ${res.status}` });
          }
          setSearchValidating(false);
          return;
        }
      } else if (searchApiProvider === "bing") {
        const res = await fetch("https://api.bing.microsoft.com/v7.0/search?q=test&count=1", {
          headers: { "Ocp-Apim-Subscription-Key": searchKeyDraft.trim() },
          signal: AbortSignal.timeout(15_000),
        });
        ok = res.ok;
        if (!ok) {
          if (res.status === 401 || res.status === 403) {
            setSearchValidateResult({ ok: false, error: "API Key 无效" });
          } else {
            setSearchValidateResult({ ok: false, error: `HTTP ${res.status}` });
          }
          setSearchValidating(false);
          return;
        }
      }
      setSearchValidateResult({ ok: true, latency: Date.now() - start });
    } catch (err: any) {
      setSearchValidateResult({ ok: false, error: err?.message ?? String(err) });
    } finally {
      setSearchValidating(false);
    }
  };

  const handleSaveSearchConfig = async () => {
    if (!searchApiProvider || !searchKeyDraft.trim()) return;
    setSearchSaving(true);
    setSearchSaved(false);
    setSettingsError(null);
    try {
      await apiJson("/api/models-config/default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchApiProvider, searchApiKey: searchKeyDraft.trim() }),
      });
      setSearchApiKey(searchKeyDraft.trim());
      setSearchKeyEditing(false);
      setSearchKeyDraft("");
      setSearchValidateResult(null);
      setSearchSaved(true);
      setTimeout(() => setSearchSaved(false), 3000);
      await loadData();
    } catch (err) {
      handleSettingsError(err);
    } finally {
      setSearchSaving(false);
    }
  };

  const getAllConfiguredModels = () => {
    const result: Array<ModelEntry & { provider: string }> = [];
    const providers = modelsConfig.providers ?? {};
    for (const [providerId, config] of Object.entries(providers) as [string, any][]) {
      for (const model of config.models ?? []) {
        result.push({ ...model, provider: providerId });
      }
    }
    return result;
  };

  const toggleModelSelection = (modelId: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const handleSaveModelEdit = async (providerId: string, modelId: string) => {
    setSavingModelEdit(true);
    setSettingsError(null);
    try {
      const providerConfig = modelsConfig.providers?.[providerId];
      if (!providerConfig) return;
      const models = (providerConfig.models ?? []).map((m: any) =>
        m.id === modelId
          ? { ...m, maxTokens: editMaxTokens, contextWindow: editContextWindow, reasoning: editReasoning }
          : m
      );
      await apiJson("/api/models-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, models }),
      });
      setEditingModelKey(null);
      await loadData();
    } catch (err) {
      handleSettingsError(err);
    } finally {
      setSavingModelEdit(false);
    }
  };

  if (!open) return null;

  const isConfigured = (providerId: string) =>
    configuredProviders.some((p: any) => p.id === providerId);

  const allModels = getAllConfiguredModels();

  const modelsByProvider = allModels.reduce<Record<string, typeof allModels>>((acc, model) => {
    (acc[model.provider] ??= []).push(model);
    return acc;
  }, {});

  const toggleProviderGroup = (providerId: string) => {
    setCollapsedProviderGroups((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  const renderSavedModelItem = (model: (typeof allModels)[number]) => {
    const key = `${model.provider}/${model.id}`;
    const isDefault = defaultProvider === model.provider && defaultModelId === model.id;
    const isEditing = editingModelKey === key;

    return (
      <div key={key} className="model-saved-item">
        <div className="model-saved-item-left">
          <button
            className={`model-radio-btn ${isDefault ? "selected" : ""}`}
            onClick={() => handleSetDefault(model.provider, model.id)}
            title={isDefault ? "当前默认模型" : "设为默认模型"}
          >
            <span className="model-radio-dot" />
          </button>
          <div className="model-saved-info">
            <div className="model-saved-name-row">
              <span className="model-saved-name">{model.name}</span>
              {isDefault && <span className="model-default-badge">当前</span>}
            </div>
            <div className="model-saved-meta">
              {model.contextWindow && (
                <span className="model-meta-tag">{Math.round(model.contextWindow / 1024)}K 上下文</span>
              )}
              {model.maxTokens && (
                <span className="model-meta-tag">{Math.round(model.maxTokens / 1024)}K 输出</span>
              )}
              {model.reasoning && <span className="model-meta-tag reasoning">推理</span>}
            </div>
          </div>
        </div>
        <div className="model-saved-actions">
          <button
            className="model-action-btn"
            title="编辑参数"
            onClick={() => {
              if (isEditing) {
                setEditingModelKey(null);
              } else {
                setEditingModelKey(key);
                setEditMaxTokens(model.maxTokens ?? 8192);
                setEditContextWindow(model.contextWindow ?? 128000);
                setEditReasoning(model.reasoning ?? false);
              }
            }}
          >
            <Pencil size={14} />
          </button>
          <button
            className="model-action-btn model-action-danger"
            title="删除"
            onClick={() => handleRemoveModel(model.provider, model.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
        {isEditing && (
          <div className="model-inline-edit">
            <div className="model-inline-edit-row">
              <label>上下文窗口</label>
              <input type="number" value={editContextWindow} onChange={(e) => setEditContextWindow(Number(e.target.value))} min={4096} step={1024} />
            </div>
            <div className="model-inline-edit-row">
              <label>最大输出 Tokens</label>
              <input type="number" value={editMaxTokens} onChange={(e) => setEditMaxTokens(Number(e.target.value))} min={1024} step={1024} />
            </div>
            <div className="model-inline-edit-row">
              <label>推理模式</label>
              <button className={`token-switch ${editReasoning ? "active" : ""}`} onClick={() => setEditReasoning(!editReasoning)}>
                <span className="token-switch-thumb" />
              </button>
            </div>
            <div className="model-inline-edit-actions">
              <button className="btn-sm" onClick={() => setEditingModelKey(null)}>取消</button>
              <button className="btn-sm btn-primary" onClick={() => handleSaveModelEdit(model.provider, model.id)} disabled={savingModelEdit}>
                {savingModelEdit ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                {savingModelEdit ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ===== Render: Models List Tab =====
  const renderModelsListTab = () => (
    <div className="models-list-page">
      {/* Saved models section */}
      <div className="model-section-title-row">
        <h3 className="model-section-title" style={{ margin: 0 }}>已保存模型</h3>
        <button className="btn-add-model" onClick={() => setAddModelOpen(true)}>
          <Plus size={14} /> 添加模型
        </button>
      </div>
      <div className="model-saved-list">
        {Object.entries(modelsByProvider).map(([providerId, providerModels]) => {
          const collapsed = collapsedProviderGroups.has(providerId);
          return (
            <div key={providerId} className="model-provider-group">
              <button
                type="button"
                className="model-provider-group-header"
                onClick={() => toggleProviderGroup(providerId)}
                aria-expanded={!collapsed}
              >
                <ChevronDown
                  size={14}
                  className={`model-provider-group-chevron ${collapsed ? "collapsed" : ""}`}
                />
                <ProviderLogo logo={getProviderLogo(providerId)} size={16} />
                <span className="model-provider-group-label">{getProviderLabel(providerId)}</span>
                <span className="model-provider-group-count">{providerModels.length}</span>
              </button>
              {!collapsed && (
                <div className="model-provider-group-body">
                  {providerModels.map((model) => renderSavedModelItem(model))}
                </div>
              )}
            </div>
          );
        })}
        {allModels.length === 0 && (
          <div className="empty-state">
            暂无可用模型，请点击上方「添加模型」按钮配置 API Key 并选择模型
          </div>
        )}
      </div>
    </div>
  );


  // ===== Render: Prompt Tab =====
  const renderPromptTab = () => (
    <div className="prompt-section">
      <p className="section-desc">自定义 Agent 的系统提示词，控制 Agent 的角色和行为方式。</p>
      <div className="prompt-mode-selector">
        <div className="prompt-mode-label">提示词模式</div>
        <div className="prompt-mode-buttons">
          {(["", "replace", "append"] as const).map((mode) => (
            <button key={mode || "off"} className={`prompt-mode-btn ${systemPromptMode === mode ? "active" : ""}`} onClick={() => setSystemPromptMode(mode)}>
              {mode === "" ? "禁用" : mode === "replace" ? "替换" : "追加"}
            </button>
          ))}
        </div>
      </div>
      <div className="prompt-mode-help">
        {systemPromptMode === "" && <p>使用 SDK 内置的默认系统提示词（编程助手角色）。</p>}
        {systemPromptMode === "replace" && <p>完全替换默认的系统提示词。工具说明、技能、项目上下文等仍会自动添加。</p>}
        {systemPromptMode === "append" && <p>在默认系统提示词之后追加自定义指令，保留原有的编程助手能力。</p>}
      </div>
      {systemPromptMode !== "" && (
        <div className="prompt-editor">
          <div className="prompt-textarea-header">
            <label className="prompt-textarea-label">{systemPromptMode === "replace" ? "自定义系统提示词" : "追加的指令"}</label>
            {systemPromptMode === "replace" && (
              <div className="prompt-header-actions">
                <button className="prompt-load-default-btn" onClick={handleLoadDefaultPrompt} disabled={loadingDefaultPrompt} title="加载 SDK 默认提示词">
                  {loadingDefaultPrompt ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />}
                  {loadingDefaultPrompt ? "加载中..." : "加载默认提示词"}
                </button>
                <button className="btn-sm btn-primary" onClick={handleSaveSystemPrompt} disabled={savingPrompt}>
                  {savingPrompt ? <Loader2 size={12} className="spin" /> : promptSaved ? <CheckCircle size={12} /> : <Check size={12} />}
                  {savingPrompt ? "保存中..." : promptSaved ? "已保存" : "保存"}
                </button>
              </div>
            )}
          </div>
          <textarea className="prompt-textarea" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder={systemPromptMode === "replace" ? "你是一个专业的咨询助手，请用中文回答问题..." : "## 项目特殊指令\n- 始终使用中文回复\n- 保持专业态度"} rows={12} />
          <div className="prompt-textarea-footer"><span className="prompt-char-count">{systemPrompt.length} 字符</span></div>
        </div>
      )}
      {systemPromptMode === "append" && (
        <div className="prompt-actions">
          <button className="btn-sm btn-primary" onClick={handleSaveSystemPrompt} disabled={savingPrompt}>
            {savingPrompt ? <Loader2 size={12} className="spin" /> : promptSaved ? <CheckCircle size={12} /> : <Check size={12} />}
            {savingPrompt ? "保存中..." : promptSaved ? "已保存" : "保存"}
          </button>
        </div>
      )}
      {systemPromptMode !== "" && systemPrompt && (
        <div className="prompt-preview">
          <div className="prompt-preview-label">当前生效的提示词预览</div>
          <pre className="prompt-preview-text">{systemPrompt}</pre>
        </div>
      )}
    </div>
  );

  // ===== Render: Tokens Tab =====
  const renderTokensTab = () => (
    <div className="tokens-section">
      <p className="section-desc">配置当前默认模型的 token 参数，影响模型的输出长度和上下文能力。</p>
      {!defaultModelId ? (
        <div className="empty-state">请先在「模型列表」中设置默认模型</div>
      ) : (
        <>
          <div className="token-current-model">
            <span className="token-current-model-label">当前默认模型</span>
            <span className="token-current-model-name">{defaultModelId}</span>
          </div>
          <div className="token-param-group">
            <div className="token-param-label">最大输出 Tokens<span className="token-param-hint">模型单次回复的最大 token 数量</span></div>
            <input type="number" className="token-param-input" value={tokenMaxTokens} onChange={(e) => setTokenMaxTokens(Number(e.target.value))} min={1024} max={200000} step={1024} />
          </div>
          <div className="token-param-group">
            <div className="token-param-label">上下文窗口<span className="token-param-hint">模型可处理的最大上下文长度（输入 + 输出）</span></div>
            <input type="number" className="token-param-input" value={tokenContextWindow} onChange={(e) => setTokenContextWindow(Number(e.target.value))} min={4096} max={1000000} step={1024} />
          </div>
          <div className="token-param-group">
            <div className="token-param-label">推理模式<span className="token-param-hint">启用后模型会进行深度思考，输出质量更高但速度较慢</span></div>
            <button className={`token-switch ${tokenReasoning ? "active" : ""}`} onClick={() => setTokenReasoning(!tokenReasoning)}>
              <span className="token-switch-thumb" />
            </button>
          </div>
          <div className="prompt-actions">
            <button className="btn-sm btn-primary" onClick={handleSaveTokenParams} disabled={savingTokens}>
              {savingTokens ? <Loader2 size={12} className="spin" /> : tokensSaved ? <CheckCircle size={12} /> : <Check size={12} />}
              {savingTokens ? "保存中..." : tokensSaved ? "已保存" : "保存"}
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ===== Render: Search Tab =====
  const renderSearchTab = () => (
    <div className="search-section">
      <p className="section-desc">配置搜索 API Key，为城市调研报告提供实时数据支持。未配置时报告将基于模型知识生成。</p>
      <div className="search-provider-select">
        <h4 className="search-subtitle">搜索服务商</h4>
        <div className="search-provider-cards">
          {[
            { id: "tavily", name: "Tavily", desc: "AI 原生搜索，国内可用，结果质量高", tier: "1000次/月免费" },
            { id: "serpapi", name: "SerpAPI", desc: "Google 搜索结果，覆盖面最广", tier: "100次/月免费" },
            { id: "bing", name: "Bing Search", desc: "微软必应搜索，国内可访问", tier: "1000次/月免费" },
            { id: "brave", name: "Brave Search", desc: "独立搜索引擎，隐私友好", tier: "2000次/月免费" },
          ].map((p) => (
            <button key={p.id} className={`search-provider-card ${searchApiProvider === p.id ? "active" : ""}`} onClick={() => { setSearchApiProvider(p.id); setSearchValidateResult(null); }}>
              <div className="search-provider-name">{p.name}</div>
              <div className="search-provider-desc">{p.desc}</div>
              <div className="search-provider-tier">{p.tier}</div>
            </button>
          ))}
        </div>
      </div>
      {searchApiProvider && (
        <div className="search-key-section">
          <div className="search-key-header">
            <h4 className="search-subtitle">API Key</h4>
            <a className="btn-sm btn-link" href={searchApiProvider === "serpapi" ? "https://serpapi.com/manage-api-key" : searchApiProvider === "tavily" ? "https://app.tavily.com/home" : searchApiProvider === "bing" ? "https://www.microsoft.com/en-us/bing/apis/bing-web-search-api" : "https://api.search.brave.com/app/keys"} target="_blank" rel="noopener">
              <ExternalLink size={12} /> 获取 Key
            </a>
          </div>
          {searchKeyEditing ? (
            <div className="search-key-input-row">
              <input type="password" className="api-key-input" placeholder="输入 API Key..." value={searchKeyDraft} onChange={(e) => { setSearchKeyDraft(e.target.value); setSearchValidateResult(null); }} onKeyDown={(e) => e.key === "Enter" && handleValidateSearchKey()} autoFocus />
              <button className="btn-sm btn-primary" onClick={handleValidateSearchKey} disabled={searchValidating || !searchKeyDraft.trim()}>
                {searchValidating ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                {searchValidating ? "验证中..." : "验证"}
              </button>
              {searchApiKey && (
                <button className="btn-sm" onClick={() => { setSearchKeyEditing(false); setSearchKeyDraft(""); setSearchValidateResult(null); }}><X size={12} /></button>
              )}
            </div>
          ) : searchApiKey ? (
            <div className="search-key-display">
              <span className="search-key-masked">••••••••</span>
              <button className="btn-sm btn-outline" onClick={() => { setSearchKeyEditing(true); setSearchKeyDraft(""); setSearchValidateResult(null); }}>修改</button>
            </div>
          ) : (
            <div className="search-key-empty">
              <span className="search-key-placeholder">尚未配置 API Key</span>
              <button className="btn-sm btn-outline" onClick={() => { setSearchKeyEditing(true); setSearchKeyDraft(""); setSearchValidateResult(null); }}>添加</button>
            </div>
          )}
          {searchValidateResult && (
            <div className={`validate-result ${searchValidateResult.ok ? "success" : "error"}`}>
              {searchValidateResult.ok ? <span><CheckCircle size={14} /> Key 有效 ({searchValidateResult.latency}ms)</span> : <span><XCircle size={14} /> {searchValidateResult.error}</span>}
            </div>
          )}
          {searchKeyEditing && searchValidateResult?.ok && (
            <div className="search-save-row">
              <button className="btn-sm btn-primary" onClick={handleSaveSearchConfig} disabled={searchSaving}>
                {searchSaving ? <Loader2 size={12} className="spin" /> : searchSaved ? <CheckCircle size={12} /> : <Check size={12} />}
                {searchSaving ? "保存中..." : searchSaved ? "已保存" : "保存配置"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderSidebarContent = () => {
    let content: React.ReactNode = null;
    if (sidebarTab === "models") content = renderModelsListTab();
    else if (sidebarTab === "prompt") content = renderPromptTab();
    else if (sidebarTab === "tokens") content = renderTokensTab();
    else if (sidebarTab === "search") content = renderSearchTab();
    else if (sidebarTab === "appGroups") {
      content = <AppGroupsSettingsTab onSaved={onAppGroupsChanged} />;
    }

    return (
      <>
        <div className="settings-main-header">
          <h2 className="settings-main-title">{SIDEBAR_TITLES[sidebarTab]}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="settings-main-content">{content}</div>
      </>
    );
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Left Sidebar */}
        <div className="settings-sidebar">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`settings-sidebar-item ${sidebarTab === item.id ? "active" : ""}`}
              onClick={() => setSidebarTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        {/* Right Content */}
        <div className="settings-main">
          {settingsError && (
            <div className="settings-error-banner" role="alert">
              {settingsError}
            </div>
          )}
          {renderSidebarContent()}
        </div>
      </div>
      {/* Add Model Dialog */}
      {addModelOpen && (
        <AddModelDialog
          allProviders={allProviders}
          onClose={() => setAddModelOpen(false)}
          onSaved={() => { setAddModelOpen(false); setSettingsError(null); loadData(); }}
          onError={handleSettingsError}
        />
      )}
    </div>
  );
}

// ===== Add Model Dialog Component =====
function AddModelDialog({ allProviders, onClose, onSaved, onError }: {
  allProviders: ProviderConfig[];
  onClose: () => void;
  onSaved: () => void;
  onError?: (err: unknown) => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState("");
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);

  // Validation & model fetching state
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<{
    ok: boolean;
    latency?: number;
    error?: string;
    models?: { id: string; name: string }[];
  } | null>(null);
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // Advanced config (custom provider only — manual input)
  const [toolCall, setToolCall] = useState(true);
  const [imageInput, setImageInput] = useState(false);
  const [reasoningMode, setReasoningMode] = useState(false);
  const [customProtocol, setCustomProtocol] = useState(false);
  const [inputTokens, setInputTokens] = useState(128000);
  const [outputTokens, setOutputTokens] = useState(8192);
  const [customModelName, setCustomModelName] = useState("");

  // Billing plan
  const [billingPlan, setBillingPlan] = useState<string>("");
  const [billingDropdownOpen, setBillingDropdownOpen] = useState(false);

  const isCustom = selectedProvider === "custom";

  // Get current provider config
  const currentProvider = allProviders.find((p) => p.id === selectedProvider);
  const availableBillingPlans = currentProvider?.billingPlans ?? [];
  const requiresBillingPlan = availableBillingPlans.length > 0;
  const billingPlanLabel = billingPlan
    ? availableBillingPlans.find((p) => p.value === billingPlan)?.label || "不选择"
    : "不选择";
  const canValidate = !!selectedProvider && !!apiKey.trim() && (!requiresBillingPlan || billingPlan !== "");

  // Get effective baseUrl based on billing plan
  const getEffectiveBaseUrl = () => {
    if (isCustom) return apiEndpoint;
    if (currentProvider?.billingPlans && billingPlan) {
      const plan = currentProvider.billingPlans.find((p) => p.value === billingPlan);
      if (plan?.baseUrl) return plan.baseUrl;
    }
    return currentProvider?.baseUrl || "";
  };

  // Reset validation when provider/key changes
  const handleProviderChange = (id: string) => {
    setSelectedProvider(id);
    setProviderDropdownOpen(false);
    setValidateResult(null);
    setAvailableModels([]);
    setSelectedModelIds(new Set());
    setModelDropdownOpen(false);
    setBillingPlan("");
    setBillingDropdownOpen(false);
  };

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    setValidateResult(null);
    setAvailableModels([]);
    setSelectedModelIds(new Set());
    setModelDropdownOpen(false);
  };

  // Validate connection & fetch models
  const handleValidate = async () => {
    if (!apiKey.trim()) return;
    setValidating(true);
    setValidateResult(null);
    setAvailableModels([]);
    setSelectedModelIds(new Set());

    try {
      if (isCustom) {
        // For custom provider, validate against the custom endpoint
        const endpoint = apiEndpoint.trim().replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "");
        const res = await fetch(`${endpoint}/models`, {
          headers: { "Authorization": `Bearer ${apiKey.trim()}` },
          signal: AbortSignal.timeout(15_000),
        });
        const start = Date.now();
        if (res.ok) {
          const data = await res.json();
          const models = (data.data ?? data).map((m: any) => ({
            id: m.id,
            name: m.id,
          }));
          setValidateResult({ ok: true, latency: Date.now() - start, models });
          setAvailableModels(models);
        } else {
          setValidateResult({ ok: false, error: `HTTP ${res.status}: ${await res.text().catch(() => "")}` });
        }
      } else {
        // For known providers, use existing validate API
        const res = await fetch("/api/auth/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: selectedProvider,
            apiKey: apiKey.trim(),
            baseUrl: getEffectiveBaseUrl(),
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setValidateResult({ ok: true, latency: data.latency, models: data.models ?? [] });
          setAvailableModels(data.models ?? []);
        } else {
          setValidateResult({ ok: false, error: data.error });
        }
      }
    } catch (err: any) {
      setValidateResult({ ok: false, error: err.message });
    } finally {
      setValidating(false);
    }
  };

  const toggleModelSelect = (modelId: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedProvider || !apiKey.trim()) return;

    // For custom provider with manual model name
    if (isCustom && availableModels.length === 0 && !customModelName.trim()) return;
    // For known provider or custom with fetched models
    if (!isCustom && selectedModelIds.size === 0) return;
    if (isCustom && availableModels.length > 0 && selectedModelIds.size === 0) return;

    try {
      if (isCustom) {
        const models: any[] = [];
        if (availableModels.length > 0) {
          // Use fetched models
          for (const mid of selectedModelIds) {
            const m = availableModels.find((a) => a.id === mid);
            if (m) models.push({ id: m.id, name: m.name, contextWindow: inputTokens, maxTokens: outputTokens, reasoning: reasoningMode, billingPlan: billingPlan || undefined });
          }
        } else {
          // Manual input
          models.push({ id: customModelName.trim(), name: customModelName.trim(), contextWindow: inputTokens, maxTokens: outputTokens, reasoning: reasoningMode, billingPlan: billingPlan || undefined });
        }
        await apiJson("/api/models-config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "custom",
            baseUrl: apiEndpoint.trim(),
            apiKey: apiKey.trim(),
            models,
          }),
        });
      } else {
        await apiJson(`/api/auth/api-key/${selectedProvider}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: apiKey.trim() }),
        });
        const models = Array.from(selectedModelIds).map((mid) => {
          const m = availableModels.find((a) => a.id === mid);
          return m ? { id: m.id, name: m.name, billingPlan: billingPlan || undefined } : { id: mid, name: mid, billingPlan: billingPlan || undefined };
        });
        await apiJson("/api/models-config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: selectedProvider,
            apiKey: apiKey.trim(),
            baseUrl: getEffectiveBaseUrl(),
            models,
          }),
        });
      }
      onSaved();
    } catch (err) {
      onError?.(err);
    }
  };

  const hasModels = availableModels.length > 0;
  const canSave = isCustom
    ? (hasModels ? selectedModelIds.size > 0 : !!customModelName.trim())
    : selectedModelIds.size > 0;

  return (
    <div className="add-model-overlay" onClick={onClose}>
      <div className="add-model-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="add-model-header">
          <div className="add-model-title-row">
            <h2 className="add-model-title">添加模型</h2>
            <span className="add-model-badge">仅支持 OpenAI 兼容协议 API</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="add-model-body">
          {/* Provider Select */}
          <div className="add-model-field">
            <label className="add-model-label">提供商</label>
            <div className="add-model-select-wrapper">
              <button className="add-model-select" onClick={() => { setProviderDropdownOpen(!providerDropdownOpen); setModelDropdownOpen(false); setBillingDropdownOpen(false); }}>
                <span className="add-model-select-value">
                  {selectedProvider && !isCustom && currentProvider?.logo && (
                    <ProviderLogo logo={currentProvider.logo} />
                  )}
                  {selectedProvider
                    ? (isCustom ? "自定义 / Custom" : currentProvider?.name || selectedProvider)
                    : "选择提供商"}
                </span>
                <ChevronDown size={14} />
              </button>
              {providerDropdownOpen && (
                <div className="add-model-dropdown">
                  <button className="add-model-dropdown-item" onClick={() => handleProviderChange("custom")}>
                    ⊕ 自定义 / Custom
                  </button>
                  {allProviders.filter((p) => p.billingPlans && p.billingPlans.length > 0).map((p) => (
                    <button key={p.id} className="add-model-dropdown-item add-model-dropdown-item-special" onClick={() => handleProviderChange(p.id)}>
                      <ProviderLogo logo={p.logo} />
                      {p.name}
                    </button>
                  ))}
                  {allProviders.filter((p) => !p.billingPlans || p.billingPlans.length === 0).map((p) => (
                    <button key={p.id} className="add-model-dropdown-item" onClick={() => handleProviderChange(p.id)}>
                      <ProviderLogo logo={p.logo} />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* API Endpoint (custom only) */}
          {isCustom && (
            <div className="add-model-field">
              <label className="add-model-label">接口地址</label>
              <input className="add-model-input" placeholder="https://api.example.com/v1/chat/completions" value={apiEndpoint} onChange={(e) => { setApiEndpoint(e.target.value); setValidateResult(null); setAvailableModels([]); setSelectedModelIds(new Set()); }} />
            </div>
          )}

          {/* Billing Plan — always visible; options depend on selected provider */}
          <div className="add-model-field">
            <label className="add-model-label">计费方式</label>
            <div className="add-model-select-wrapper">
              <button
                type="button"
                className={`add-model-select ${!selectedProvider ? "add-model-select-disabled" : ""}`}
                disabled={!selectedProvider}
                onClick={() => {
                  if (!selectedProvider) return;
                  setBillingDropdownOpen(!billingDropdownOpen);
                  setProviderDropdownOpen(false);
                  setModelDropdownOpen(false);
                }}
              >
                <span className={`add-model-select-value ${!selectedProvider ? "add-model-select-placeholder" : ""}`}>
                  {selectedProvider ? billingPlanLabel : "请先选择提供商"}
                </span>
                <ChevronDown size={14} />
              </button>
              {billingDropdownOpen && selectedProvider && (
                <div className="add-model-dropdown">
                  <button
                    type="button"
                    className={`add-model-dropdown-item ${billingPlan === "" ? "selected" : ""}`}
                    onClick={() => { setBillingPlan(""); setBillingDropdownOpen(false); setValidateResult(null); setAvailableModels([]); setSelectedModelIds(new Set()); }}
                  >
                    不选择
                  </button>
                  {availableBillingPlans.map((plan) => (
                    <button
                      key={plan.value}
                      type="button"
                      className={`add-model-dropdown-item ${billingPlan === plan.value ? "selected" : ""}`}
                      onClick={() => { setBillingPlan(plan.value); setBillingDropdownOpen(false); setValidateResult(null); setAvailableModels([]); setSelectedModelIds(new Set()); }}
                    >
                      {plan.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* API Key + Validate Button */}
          <div className="add-model-field">
            <label className="add-model-label">API KEY</label>
            <div className="add-model-input-with-btn">
              <div className="add-model-input-with-icon">
                <input className="add-model-input" type={showApiKey ? "text" : "password"} placeholder="输入你的 API Key" value={apiKey} onChange={(e) => handleApiKeyChange(e.target.value)} />
                <button className="add-model-eye-btn" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                className={`add-model-validate-btn ${validateResult?.ok ? "success" : ""}`}
                onClick={handleValidate}
                disabled={validating || !canValidate}
              >
                {validating ? (
                  <>验证中...</>
                ) : validateResult?.ok ? (
                  <>已连接 ({validateResult.latency}ms)</>
                ) : (
                  <><TestTube size={12} /> 验证连接</>
                )}
              </button>
            </div>
            {validateResult && !validateResult.ok && (
              <div className="add-model-validate-error">
                <XCircle size={14} /> {validateResult.error}
              </div>
            )}
          </div>

          {/* Model Name Selection */}
          <div className="add-model-field">
            <label className="add-model-label">模型名称</label>
            {hasModels ? (
              // Multi-select dropdown when models fetched
              <div className="add-model-select-wrapper">
                <button className="add-model-select" onClick={() => setModelDropdownOpen(!modelDropdownOpen)}>
                  <span className="add-model-select-value">
                    {selectedModelIds.size > 0
                      ? `${selectedModelIds.size} 个模型已选择`
                      : "选择模型（可多选）"}
                  </span>
                  <ChevronDown size={14} />
                </button>
                {modelDropdownOpen && (
                  <div className="add-model-dropdown add-model-dropdown-models">
                    {availableModels.map((m) => {
                      const isSelected = selectedModelIds.has(m.id);
                      return (
                        <button
                          key={m.id}
                          className={`add-model-dropdown-item add-model-dropdown-item-check ${isSelected ? "selected" : ""}`}
                          onClick={() => toggleModelSelect(m.id)}
                        >
                          <span className="add-model-dropdown-check">
                            {isSelected ? <CheckCircle size={14} className="check-on" /> : <Circle size={14} className="check-off" />}
                          </span>
                          <span className="add-model-dropdown-name">{m.name}</span>
                          <span className="add-model-dropdown-id">{m.id}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : isCustom && validateResult?.ok ? (
              // Custom provider validated but no models returned — manual input
              <input className="add-model-input" placeholder="输入模型参数值，例如 gpt-4o 或 openai/gpt-4o" value={customModelName} onChange={(e) => setCustomModelName(e.target.value)} />
            ) : (
              // Not yet validated — disabled state
              <div className="add-model-select add-model-select-disabled">
                <span className="add-model-select-value add-model-select-placeholder">
                  {selectedProvider ? "请先验证 API Key 获取可用模型列表" : "请先选择提供商并验证"}
                </span>
                <ChevronDown size={14} />
              </div>
            )}
          </div>

          {/* Advanced Config (custom only) */}
          {isCustom && (
            <div className="add-model-advanced">
              <h4 className="add-model-advanced-title">高级配置</h4>
              <div className="add-model-checkboxes">
                <label className="add-model-checkbox">
                  <input type="checkbox" checked={toolCall} onChange={(e) => setToolCall(e.target.checked)} />
                  <span className="add-model-checkbox-mark">{toolCall && <Check size={10} />}</span>
                  <span>工具调用</span>
                </label>
                <label className="add-model-checkbox">
                  <input type="checkbox" checked={imageInput} onChange={(e) => setImageInput(e.target.checked)} />
                  <span className="add-model-checkbox-mark">{imageInput && <Check size={10} />}</span>
                  <span>图片输入</span>
                </label>
                <label className="add-model-checkbox">
                  <input type="checkbox" checked={reasoningMode} onChange={(e) => setReasoningMode(e.target.checked)} />
                  <span className="add-model-checkbox-mark">{reasoningMode && <Check size={10} />}</span>
                  <span>推理模式</span>
                </label>
                <label className="add-model-checkbox">
                  <input type="checkbox" checked={customProtocol} onChange={(e) => setCustomProtocol(e.target.checked)} />
                  <span className="add-model-checkbox-mark">{customProtocol && <Check size={10} />}</span>
                  <span>自定义协议</span>
                </label>
              </div>

              <div className="add-model-token-row">
                <div className="add-model-token-col">
                  <label className="add-model-token-label">输入</label>
                  <input className="add-model-input add-model-token-input" type="number" value={inputTokens} onChange={(e) => setInputTokens(Number(e.target.value))} placeholder="使用提供商默认值" />
                  <div className="add-model-token-options">
                    {INPUT_TOKEN_OPTIONS.map((v) => (
                      <button key={v} className={`add-model-token-chip ${inputTokens === v * 1024 ? "active" : ""}`} onClick={() => setInputTokens(v * 1024)}>{v}K</button>
                    ))}
                  </div>
                </div>
                <div className="add-model-token-col">
                  <label className="add-model-token-label">输出</label>
                  <input className="add-model-input add-model-token-input" type="number" value={outputTokens} onChange={(e) => setOutputTokens(Number(e.target.value))} placeholder="使用提供商默认值" />
                  <div className="add-model-token-options">
                    {OUTPUT_TOKEN_OPTIONS.map((v) => (
                      <button key={v} className={`add-model-token-chip ${outputTokens === v * 1024 ? "active" : ""}`} onClick={() => setOutputTokens(v * 1024)}>{v}K</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="add-model-footer">
          <button className="add-model-btn-cancel" onClick={onClose}>取消</button>
          <button className="add-model-btn-save" onClick={handleSave} disabled={!selectedProvider || !apiKey.trim() || !canSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
