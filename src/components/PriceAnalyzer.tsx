"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Search, Loader2, AlertTriangle, ArrowLeft,
  ChevronRight, RotateCcw, ExternalLink, X, Download,
} from "lucide-react";
import { useAppHistory } from "@/hooks/useAppHistory";

// ── Types ─────────────────────────────────────────────────────────────

interface SkuItem {
  skuName: string;
  price: number;
  itemTitle: string;
  itemId: number;
  sellerName: string;
  itemDetailUrl: string;
}

type Phase = "idle" | "phase0" | "phase1" | "phase2" | "phase3";

// ── Constants ─────────────────────────────────────────────────────────

const BATCH_SIZE = 10;
const MAX_PHASE0_ITERATIONS = 3;
const PRICE_RANGE_LOW = 0.3;
const PRICE_RANGE_HIGH = 1.5;

// ── Helpers ───────────────────────────────────────────────────────────

const priceStr = (p: number) =>
  p >= 10000 ? `¥${(p / 10000).toFixed(2)}万` : `¥${p.toFixed(2)}`;

const priceDiffStr = (diff: number) =>
  diff >= 0 ? `+¥${diff.toFixed(2)}` : `-¥${Math.abs(diff).toFixed(2)}`;

function extractParams(text: string): Record<string, string> {
  const patterns: { type: string; regex: RegExp }[] = [
    { type: "功率", regex: /(\d+\.?\d*)\s*[WwКw][Ww]?\b/ },
    { type: "电压", regex: /(\d+\.?\d*)\s*[Vv]\b/ },
    { type: "口径", regex: /DN(\d+)/ },
    { type: "流量", regex: /(\d+\.?\d*)\s*[Ll]\/[Hh]/ },
    { type: "扬程", regex: /(\d+\.?\d*)\s*[Mm]\b(?!³|²|m)/ },
    { type: "型号", regex: /[A-Z]{2,4}[- ]?\d{1,4}/ },
    { type: "材质", regex: /(不锈钢|铸铁|铝合金|PVC|PP|碳钢)/ },
    { type: "转速", regex: /(\d+)\s*[Rr][Pp][Mm]/ },
    { type: "压力", regex: /(\d+\.?\d*)\s*[Mm][Pp][Aa]/ },
    { type: "防护等级", regex: /IP(\d{2})/ },
  ];
  const params: Record<string, string> = {};
  for (const { type, regex } of patterns) {
    const match = text.match(regex);
    if (match) params[type] = match[0];
  }
  return params;
}

// ── Component ─────────────────────────────────────────────────────────

export function PriceAnalyzer() {
  const { saveToHistory } = useAppHistory();
  // ── Shared state ────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("idle");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("");
  const [targetPrice, setTargetPrice] = useState<number | null>(null);
  const [targetPriceInput, setTargetPriceInput] = useState("");
  const [confirmedCategory, setConfirmedCategory] = useState("");
  const [negatedItemIds, setNegatedItemIds] = useState<Set<number>>(new Set());

  // ── Phase 0 state ──────────────────────────────────────────────
  const [searchSkus, setSearchSkus] = useState<SkuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [phase0BatchIdx, setPhase0BatchIdx] = useState(0);
  const [phase0Iteration, setPhase0Iteration] = useState(0);
  const [phase0Warning, setPhase0Warning] = useState<string | null>(null);
  const [newDescInput, setNewDescInput] = useState("");
  const [showNewDescInput, setShowNewDescInput] = useState(false);

  // ── Phase 1 state ──────────────────────────────────────────────
  const [allSkus, setAllSkus] = useState<SkuItem[]>([]);
  const [phase1BatchIdx, setPhase1BatchIdx] = useState(0);
  const [phase0Items, setPhase0Items] = useState<any[]>([]);
  const [collectModifiers, setCollectModifiers] = useState<string[]>([]);
  const [selectingSku, setSelectingSku] = useState<SkuItem | null>(null);

  // ── Phase 2 state ──────────────────────────────────────────────
  const [targetSku, setTargetSku] = useState<SkuItem | null>(null);
  const [similarSkus, setSimilarSkus] = useState<SkuItem[]>([]);
  const [paramProfile, setParamProfile] = useState<Record<string, string>>({});
  const [phase2BatchIdx, setPhase2BatchIdx] = useState(0);

  // ── Phase 3 state ──────────────────────────────────────────────
  const [reportData, setReportData] = useState<{
    markdown: string;
    filename: string;
  } | null>(null);

  // ── Computed ────────────────────────────────────────────────────

  // Save to history when report is complete
  useEffect(() => {
    if (reportData && phase === "phase3") {
      saveToHistory("price", "材价调查报告", reportData.markdown);
    }
  }, [reportData, phase]);

  const priceLow = targetPrice ? targetPrice * PRICE_RANGE_LOW : null;
  const priceHigh = targetPrice ? targetPrice * PRICE_RANGE_HIGH : null;

  const currentBatchSkus = useMemo(() => {
    const start = phase1BatchIdx * BATCH_SIZE;
    return allSkus.slice(start, start + BATCH_SIZE);
  }, [allSkus, phase1BatchIdx]);

  const totalBatches = Math.ceil(allSkus.length / BATCH_SIZE);

  const currentPhase2Batch = useMemo(() => {
    const start = phase2BatchIdx * BATCH_SIZE;
    return similarSkus.slice(start, start + BATCH_SIZE);
  }, [similarSkus, phase2BatchIdx]);

  const totalPhase2Batches = Math.ceil(similarSkus.length / BATCH_SIZE);

  // ── API call helper ─────────────────────────────────────────────

  const apiCall = async (body: any) => {
    const res = await fetch("/api/price-analyzer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  };

  // ── Phase 0: Search ─────────────────────────────────────────────

  const handleSearch = async (searchCategory?: string) => {
    const cat = searchCategory || category.trim();
    if (!cat) return;

    setLoading(true);
    setLoadingMsg(`正在搜索「${cat}」相关产品...`);
    setError(null);
    setShowNewDescInput(false);

    try {
      const data = await apiCall({
        action: "search",
        category: cat,
        targetPrice: targetPrice || undefined,
        negatedItemIds: [...negatedItemIds],
      });

      setSearchSkus(data.skus || []);
      setSearchQuery(data.query || cat);
      setPhase0BatchIdx(0);
      setPhase0Warning(data.warning || null);
      setPhase("phase0");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhase0None = () => {
    // Add all current batch items to negated list
    const currentBatch = searchSkus.slice(
      phase0BatchIdx * BATCH_SIZE,
      (phase0BatchIdx + 1) * BATCH_SIZE
    );
    const newNegated = new Set(negatedItemIds);
    currentBatch.forEach((sku) => newNegated.add(sku.itemId));
    setNegatedItemIds(newNegated);

    const newIteration = phase0Iteration + 1;
    setPhase0Iteration(newIteration);

    if (newIteration >= MAX_PHASE0_ITERATIONS) {
      // Max iterations, proceed with original category
      setConfirmedCategory(category.trim());
      handleCollect(category.trim(), newNegated);
    } else {
      setShowNewDescInput(true);
    }
  };

  const handlePhase0NewDesc = async () => {
    if (!newDescInput.trim()) return;
    setCategory(newDescInput.trim());
    await handleSearch(newDescInput.trim());
    setNewDescInput("");
    setShowNewDescInput(false);
  };

  const handleConfirmPhase0 = (confirmed: string) => {
    if (!confirmed.trim()) return;
    setConfirmedCategory(confirmed.trim());
    handleCollect(confirmed.trim());
  };

  // ── Phase 1: Collect ────────────────────────────────────────────

  const handleCollect = async (cat: string, negIds?: Set<number>) => {
    setLoading(true);
    setLoadingMsg(`正在采集「${cat}」的 SKU 数据（3 轮搜索）...`);
    setError(null);

    try {
      const data = await apiCall({
        action: "collect",
        confirmedCategory: cat,
        targetPrice: targetPrice || undefined,
        negatedItemIds: [...(negIds || negatedItemIds)],
        phase0Items: [],
      });

      setAllSkus(data.skus || []);
      setPhase1BatchIdx(0);
      setCollectModifiers(data.modifiers || []);
      setPhase("phase1");
    } catch (err: any) {
      setError(err.message);
      setPhase("phase0");
    } finally {
      setLoading(false);
    }
  };

  // ── Phase 1: Select SKU ─────────────────────────────────────────

  const handleSelectSku = (sku: SkuItem) => {
    setSelectingSku(sku);
  };

  const handleConfirmSku = () => {
    if (!selectingSku) return;
    setTargetSku(selectingSku);
    setSelectingSku(null);
    handleSimilar(selectingSku);
  };

  // ── Phase 2: Similar ────────────────────────────────────────────

  const handleSimilar = async (sku: SkuItem) => {
    setLoading(true);
    setLoadingMsg("正在寻找不同供应商的同类 SKU...");
    setError(null);

    try {
      const data = await apiCall({
        action: "similar",
        targetSku: sku,
        confirmedCategory,
        targetPrice: targetPrice || undefined,
        negatedItemIds: [...negatedItemIds],
      });

      setSimilarSkus(data.skus || []);
      setParamProfile(data.paramProfile || {});
      setPhase2BatchIdx(0);
      setPhase("phase2");
    } catch (err: any) {
      setError(err.message);
      setPhase("phase1");
    } finally {
      setLoading(false);
    }
  };

  // ── Phase 3: Report ─────────────────────────────────────────────

  const handleExport = async () => {
    if (!targetSku) return;
    setLoading(true);
    setLoadingMsg("正在生成询价报告...");
    setError(null);

    try {
      const data = await apiCall({
        action: "report",
        confirmedCategory,
        targetPrice: targetPrice || undefined,
        targetSku,
        similarSkus,
        paramProfile,
      });

      setReportData({ markdown: data.markdown, filename: data.filename });
      setPhase("phase3");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!reportData) return;
    const blob = new Blob([reportData.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = reportData.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Reset ───────────────────────────────────────────────────────

  const handleReset = () => {
    setPhase("idle");
    setLoading(false);
    setError(null);
    setCategory("");
    setTargetPrice(null);
    setTargetPriceInput("");
    setConfirmedCategory("");
    setNegatedItemIds(new Set());
    setSearchSkus([]);
    setSearchQuery("");
    setPhase0BatchIdx(0);
    setPhase0Iteration(0);
    setPhase0Warning(null);
    setNewDescInput("");
    setShowNewDescInput(false);
    setAllSkus([]);
    setPhase1BatchIdx(0);
    setPhase0Items([]);
    setCollectModifiers([]);
    setSelectingSku(null);
    setTargetSku(null);
    setSimilarSkus([]);
    setParamProfile({});
    setPhase2BatchIdx(0);
    setReportData(null);
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="price-analyzer">
      {/* Header */}
      <div className="app-page-header price-header">
        <h2 className="app-page-title price-title">材价调查</h2>
        <p className="app-page-subtitle price-subtitle">
          输入品类和目标价格，通过 1688 平台采集 SKU 数据，找到最匹配的产品和同类供应商
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="price-error">
          <AlertTriangle size={16} />
          <p>{error}</p>
          <button className="pa-error-close" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Phase indicator */}
      {phase !== "idle" && (
        <div className="pa-phase-bar">
          <div className={`pa-phase-step ${["phase0", "phase1", "phase2", "phase3"].includes(phase) ? "active" : ""}`}>
            <span className="pa-phase-num">1</span>
            <span>品类确认</span>
          </div>
          <div className="pa-phase-line" />
          <div className={`pa-phase-step ${["phase1", "phase2", "phase3"].includes(phase) ? "active" : ""}`}>
            <span className="pa-phase-num">2</span>
            <span>SKU 选择</span>
          </div>
          <div className="pa-phase-line" />
          <div className={`pa-phase-step ${["phase2", "phase3"].includes(phase) ? "active" : ""}`}>
            <span className="pa-phase-num">3</span>
            <span>同类发现</span>
          </div>
          <div className="pa-phase-line" />
          <div className={`pa-phase-step ${phase === "phase3" ? "active" : ""}`}>
            <span className="pa-phase-num">4</span>
            <span>导出报告</span>
          </div>
        </div>
      )}

      {/* ── Loading overlay ───────────────────────────────────────── */}
      {loading && (
        <div className="price-loading">
          <Loader2 size={32} className="spin" />
          <p>{loadingMsg}</p>
        </div>
      )}

      {/* ── Phase: idle ───────────────────────────────────────────── */}
      {phase === "idle" && !loading && (
        <div className="price-search">
          <div className="price-search-wrapper">
            <Search size={18} className="price-search-icon" />
            <input
              type="text"
              className="price-search-input"
              placeholder="输入品类名称，如：鱼缸水泵、消防水泵、花岗岩"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
          </div>
          <div className="pa-target-price-row">
            <label className="pa-target-price-label">
              目标采购价格（可选）：
            </label>
            <div className="pa-target-price-input-wrap">
              <span className="pa-price-prefix">¥</span>
              <input
                type="number"
                className="pa-target-price-input"
                placeholder="每件大概多少钱"
                value={targetPriceInput}
                onChange={(e) => {
                  setTargetPriceInput(e.target.value);
                  const val = parseFloat(e.target.value);
                  setTargetPrice(isNaN(val) || val <= 0 ? null : val);
                }}
                min="0"
                step="any"
              />
            </div>
            {targetPrice && priceLow !== null && priceHigh !== null && (
              <span className="pa-price-range-hint">
                筛选范围：¥{priceLow.toFixed(2)} ~ ¥{priceHigh.toFixed(2)}
              </span>
            )}
          </div>
          <button
            className="price-search-btn pa-search-submit"
            onClick={() => handleSearch()}
            disabled={!category.trim()}
          >
            开始调查
          </button>
        </div>
      )}

      {/* ── Phase 0: Confirm Category ────────────────────────────── */}
      {phase === "phase0" && !loading && (
        <div className="pa-phase-panel">
          <div className="pa-data-area">
            <div className="pa-data-header">
              <div className="pa-data-header-left">
                <h3>
                  「{searchQuery}」搜索结果 — {searchSkus.length} 个有效 SKU
                </h3>
                {targetPrice && (
                  <span className="pa-price-badge">
                    目标价：¥{targetPrice.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="pa-data-header-center">
                <div className="pa-re-search-group">
                  <input
                    type="text"
                    className="pa-re-search-input"
                    placeholder="重新输入品类名称"
                    value={confirmedCategory}
                    onChange={(e) => setConfirmedCategory(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      confirmedCategory.trim() &&
                      handleSearch(confirmedCategory.trim())
                    }
                  />
                  <button
                    className={`pa-re-search-btn ${confirmedCategory.trim() ? "pa-re-search-btn-active" : ""}`}
                    onClick={() =>
                      confirmedCategory.trim() &&
                      handleSearch(confirmedCategory.trim())
                    }
                    disabled={!confirmedCategory.trim()}
                  >
                    确认重新搜索
                  </button>
                </div>
              </div>
              <div className="pa-data-header-right">
                <button className="pa-btn-secondary" onClick={() => setPhase("idle")}>
                  <ArrowLeft size={16} /> 重新搜索
                </button>
                <button
                  className="price-search-btn"
                  onClick={() => handleConfirmPhase0(confirmedCategory || category)}
                >
                  确认品类 →
                </button>
              </div>
            </div>

            {phase0Warning && (
              <div className="pa-warning">
                <AlertTriangle size={16} />
                <span>{phase0Warning}</span>
              </div>
            )}

            {searchSkus.length === 0 ? (
              <div className="pa-empty">
                <p>
                  当前{targetPrice ? "价格范围内" : ""}未找到产品。
                  {targetPrice ? "建议调整目标价格。" : "请尝试其他品类。"}
                </p>
              </div>
            ) : (
              <>
                <div className="pa-sku-table-wrap">
                <table className="pa-sku-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>商品名称</th>
                      <th>SKU 名称</th>
                      <th>价格</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchSkus
                      .slice(
                        phase0BatchIdx * BATCH_SIZE,
                        (phase0BatchIdx + 1) * BATCH_SIZE
                      )
                      .map((sku, i) => (
                        <tr key={i}>
                          <td className="pa-sku-idx">
                            {phase0BatchIdx * BATCH_SIZE + i + 1}
                          </td>
                          <td className="pa-sku-title">{sku.itemTitle}</td>
                          <td className="pa-sku-name">{sku.skuName}</td>
                          <td className="pa-sku-price">{priceStr(sku.price)}</td>
                          <td className="pa-sku-link">
                            {sku.itemDetailUrl && (
                              <a
                                href={sku.itemDetailUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              </>
            )}

            {/* Batch navigation for Phase 0 */}
            {searchSkus.length > BATCH_SIZE && (
              <div className="pa-batch-nav">
                <button
                  className="pa-btn-icon"
                  disabled={phase0BatchIdx === 0}
                  onClick={() => setPhase0BatchIdx(Math.max(0, phase0BatchIdx - 1))}
                >
                  <ChevronRight size={16} className="pa-rotate-180" />
                </button>
                <span className="pa-batch-info">
                  第 {phase0BatchIdx * BATCH_SIZE + 1} ~{" "}
                  {Math.min((phase0BatchIdx + 1) * BATCH_SIZE, searchSkus.length)} 个，共{" "}
                  {searchSkus.length} 个
                </span>
                <button
                  className="pa-btn-icon"
                  disabled={
                    (phase0BatchIdx + 1) * BATCH_SIZE >= searchSkus.length
                  }
                  onClick={() => setPhase0BatchIdx(phase0BatchIdx + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Control bar */}
          <div className="pa-control-bar">
            {showNewDescInput && (
              <div className="pa-new-desc-row">
                <input
                  type="text"
                  className="price-search-input"
                  placeholder="请描述您要查找的具体产品..."
                  value={newDescInput}
                  onChange={(e) => setNewDescInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePhase0NewDesc()}
                  autoFocus
                />
                <button
                  className="price-search-btn"
                  onClick={handlePhase0NewDesc}
                  disabled={!newDescInput.trim()}
                >
                  搜索 <ChevronRight size={16} />
                </button>
              </div>
            )}

            {!showNewDescInput && searchSkus.length > 0 && (
              <div className="pa-confirm-row">
                <button
                  className="pa-btn-outline pa-btn-full"
                  onClick={handlePhase0None}
                >
                  都不是，换一批
                  {phase0Iteration < MAX_PHASE0_ITERATIONS - 1
                    ? ""
                    : "（最后一次机会）"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Phase 1: SKU Selection ───────────────────────────────── */}
      {phase === "phase1" && !loading && (
        <div className="pa-phase-panel">
          <div className="pa-data-area">
            <div className="pa-data-header">
              <h3>
                {confirmedCategory} — 第 {phase1BatchIdx + 1} 批 SKU
                {targetPrice
                  ? `（按目标价 ¥${targetPrice.toFixed(2)} 接近度排序）`
                  : "（按价格排序）"}
              </h3>
            </div>

            {/* Batch progress */}
            <div className="pa-batch-progress">
              <span>
                采集到 {allSkus.length} 个有效 SKU | 当前展示第{" "}
                {phase1BatchIdx * BATCH_SIZE + 1} ~{" "}
                {Math.min((phase1BatchIdx + 1) * BATCH_SIZE, allSkus.length)} 个
              </span>
              {allSkus.length > 0 && (
                <span>
                  价格区间：¥
                  {Math.min(...allSkus.map((s) => s.price)).toFixed(2)} ~ ¥
                  {Math.max(...allSkus.map((s) => s.price)).toFixed(2)}
                </span>
              )}
            </div>

            {collectModifiers.length > 0 && (
              <div className="pa-modifiers">
                <span className="pa-modifiers-label">搜索维度：</span>
                {collectModifiers.map((m) => (
                  <span key={m} className="pa-modifier-tag">
                    {m}
                  </span>
                ))}
              </div>
            )}

            {allSkus.length === 0 ? (
              <div className="pa-empty">
                <p>未找到有效 SKU。建议调整目标价格或放宽品类范围。</p>
              </div>
            ) : (
              <div className="pa-sku-table-wrap">
                <table className="pa-sku-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>商品名称</th>
                      <th>SKU 名称</th>
                      <th>价格</th>
                      {targetPrice && <th>价差</th>}
                      <th>卖家</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentBatchSkus.map((sku, i) => {
                      const globalIdx = phase1BatchIdx * BATCH_SIZE + i;
                      const diff = targetPrice ? sku.price - targetPrice : 0;
                      return (
                        <tr
                          key={i}
                          className="pa-sku-selectable"
                          onClick={() => handleSelectSku(sku)}
                        >
                          <td className="pa-sku-idx">{globalIdx + 1}</td>
                          <td className="pa-sku-title">{sku.itemTitle}</td>
                          <td className="pa-sku-name">{sku.skuName}</td>
                          <td className="pa-sku-price">{priceStr(sku.price)}</td>
                          {targetPrice && (
                            <td
                              className={`pa-sku-diff ${
                                diff < 0 ? "pa-diff-neg" : "pa-diff-pos"
                              }`}
                            >
                              {priceDiffStr(diff)}
                            </td>
                          )}
                          <td className="pa-sku-seller">{sku.sellerName}</td>
                          <td className="pa-sku-link">
                            {sku.itemDetailUrl && (
                              <a
                                href={sku.itemDetailUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Batch navigation */}
            {allSkus.length > BATCH_SIZE && (
              <div className="pa-batch-nav">
                <button
                  className="pa-btn-secondary"
                  disabled={phase1BatchIdx === 0}
                  onClick={() => setPhase1BatchIdx(Math.max(0, phase1BatchIdx - 1))}
                >
                  <ChevronRight size={16} className="pa-rotate-180" /> 上一批
                </button>
                <span className="pa-batch-info">
                  第 {phase1BatchIdx + 1} / {totalBatches} 批
                </span>
                <button
                  className="pa-btn-secondary"
                  disabled={phase1BatchIdx >= totalBatches - 1}
                  onClick={() => setPhase1BatchIdx(phase1BatchIdx + 1)}
                >
                  下一批 <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Control bar */}
          <div className="pa-control-bar">
            <div className="pa-control-bar-top">
              <button className="pa-btn-secondary" onClick={() => setPhase("phase0")}>
                <ArrowLeft size={16} /> 返回品类确认
              </button>
            </div>
            <p className="pa-hint">
              点击表格中的 SKU 行进行选择，或输入「更多」查看下一批。
            </p>
          </div>
        </div>
      )}

      {/* ── SKU Selection Confirmation Dialog ────────────────────── */}
      {selectingSku && (
        <div className="pa-dialog-overlay" onClick={() => setSelectingSku(null)}>
          <div className="pa-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="pa-dialog-header">
              <h3>确认选择此 SKU？</h3>
              <button className="pa-btn-icon" onClick={() => setSelectingSku(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="pa-dialog-body">
              <div className="pa-dialog-field">
                <span className="pa-dialog-label">SKU 名称</span>
                <span className="pa-dialog-value">{selectingSku.skuName}</span>
              </div>
              <div className="pa-dialog-field">
                <span className="pa-dialog-label">价格</span>
                <span className="pa-dialog-value pa-dialog-price">
                  {priceStr(selectingSku.price)}
                </span>
              </div>
              {targetPrice && (
                <div className="pa-dialog-field">
                  <span className="pa-dialog-label">与目标价差</span>
                  <span className="pa-dialog-value">
                    {priceDiffStr(selectingSku.price - targetPrice)}
                  </span>
                </div>
              )}
              <div className="pa-dialog-field">
                <span className="pa-dialog-label">商品名称</span>
                <span className="pa-dialog-value">{selectingSku.itemTitle}</span>
              </div>
              <div className="pa-dialog-field">
                <span className="pa-dialog-label">供应商</span>
                <span className="pa-dialog-value">{selectingSku.sellerName}</span>
              </div>
              {selectingSku.itemDetailUrl && (
                <div className="pa-dialog-field">
                  <span className="pa-dialog-label">链接</span>
                  <a
                    href={selectingSku.itemDetailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pa-dialog-link"
                  >
                    <ExternalLink size={14} /> 查看商品详情
                  </a>
                </div>
              )}
            </div>
            <div className="pa-dialog-footer">
              <button
                className="pa-btn-secondary"
                onClick={() => setSelectingSku(null)}
              >
                取消
              </button>
              <button className="price-search-btn" onClick={handleConfirmSku}>
                确认选择 <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Phase 2: Similar SKUs ────────────────────────────────── */}
      {phase === "phase2" && !loading && targetSku && (
        <div className="pa-phase-panel">
          <div className="pa-data-area">
            <div className="pa-data-header">
              <h3>与「{targetSku.skuName}」同类的 SKU</h3>
            </div>

            {/* Target SKU info */}
            <div className="pa-target-info">
              <div className="pa-target-info-row">
                <span className="pa-target-info-label">目标 SKU：</span>
                <span className="pa-target-info-value">{targetSku.skuName}</span>
                <span className="pa-target-info-price">
                  {priceStr(targetSku.price)}
                </span>
              </div>
              {Object.keys(paramProfile).length > 0 && (
                <div className="pa-param-profile">
                  <span className="pa-param-label">参数画像：</span>
                  {Object.entries(paramProfile).map(([k, v]) => (
                    <span key={k} className="pa-param-tag">
                      {k}: {v}
                    </span>
                  ))}
                </div>
              )}
              {targetPrice && (
                <div className="pa-target-info-row">
                  <span className="pa-target-info-label">目标价格：</span>
                  <span>¥{targetPrice.toFixed(2)}</span>
                </div>
              )}
            </div>

            {similarSkus.length === 0 ? (
              <div className="pa-empty">
                <p>未找到不同供应商的同类 SKU。</p>
              </div>
            ) : (
              <>
                <div className="pa-sku-table-wrap">
                  <table className="pa-sku-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>商品名称</th>
                        <th>SKU 名称</th>
                        <th>价格</th>
                        <th>供应商</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPhase2Batch.map((sku, i) => (
                        <tr key={i}>
                          <td className="pa-sku-idx">
                            {phase2BatchIdx * BATCH_SIZE + i + 1}
                          </td>
                          <td className="pa-sku-title">{sku.itemTitle}</td>
                          <td className="pa-sku-name">{sku.skuName}</td>
                          <td className="pa-sku-price">{priceStr(sku.price)}</td>
                          <td className="pa-sku-seller">{sku.sellerName}</td>
                          <td className="pa-sku-link">
                            {sku.itemDetailUrl && (
                              <a
                                href={sku.itemDetailUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="pa-similar-count">
                  共找到 {similarSkus.length} 个不同供应商的同类 SKU。
                </p>

                {/* Batch navigation */}
                {similarSkus.length > BATCH_SIZE && (
                  <div className="pa-batch-nav">
                    <button
                      className="pa-btn-secondary"
                      disabled={phase2BatchIdx === 0}
                      onClick={() =>
                        setPhase2BatchIdx(Math.max(0, phase2BatchIdx - 1))
                      }
                    >
                      <ChevronRight size={16} className="pa-rotate-180" /> 上一批
                    </button>
                    <span className="pa-batch-info">
                      第 {phase2BatchIdx + 1} / {totalPhase2Batches} 批
                    </span>
                    <button
                      className="pa-btn-secondary"
                      disabled={phase2BatchIdx >= totalPhase2Batches - 1}
                      onClick={() => setPhase2BatchIdx(phase2BatchIdx + 1)}
                    >
                      下一批 <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Control bar */}
          <div className="pa-control-bar">
            <div className="pa-control-bar-top">
              <button
                className="pa-btn-secondary"
                onClick={() => setPhase("phase1")}
              >
                <ArrowLeft size={16} /> 返回 SKU 选择
              </button>
              <button className="price-search-btn" onClick={handleExport}>
                <Download size={16} /> 导出询价报告
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Phase 3: Report ──────────────────────────────────────── */}
      {phase === "phase3" && !loading && reportData && (
        <div className="pa-phase-panel pa-result-panel">
          <div className="pa-data-area">
            <div className="pa-data-header">
              <h3>{confirmedCategory} 询价报告</h3>
            </div>

            <div className="pa-report-content">
              <pre className="pa-report-pre">{reportData.markdown}</pre>
            </div>
          </div>

          {/* Control bar */}
          <div className="pa-control-bar">
            <div className="pa-control-bar-top">
              <button className="pa-btn-secondary" onClick={handleReset}>
                <RotateCcw size={16} /> 重新调查
              </button>
              <button className="price-search-btn" onClick={handleDownload}>
                <Download size={16} /> 下载报告（{reportData.filename}）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
