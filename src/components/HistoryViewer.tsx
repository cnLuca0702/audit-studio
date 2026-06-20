"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Loader2,
  FileText,
  BarChart3,
  MapPin,
  Wand2,
  Merge,
  Gavel,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { CityReportView } from "./CityReportView";
import { BiddingReportView } from "./BiddingReportView";
import { parseReportSections, extractCity } from "@/lib/city-report";
import { parseBiddingResult } from "@/lib/bidding-report";
import type { HistoryItem } from "./AppHistoryList";

const APP_ICONS: Record<string, React.ReactNode> = {
  price: <BarChart3 size={16} />,
  city: <MapPin size={16} />,
  rewrite: <Wand2 size={16} />,
  merge: <Merge size={16} />,
  bidding: <Gavel size={16} />,
  agent: <FileText size={16} />,
};

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

interface HistoryViewerProps {
  item: HistoryItem;
  onBack: () => void;
}

/**
 * Renders the full content of a history item in the main interaction area
 * (right side), instead of expanding inline inside the narrow history sidebar.
 */
export function HistoryViewer({ item, onBack }: HistoryViewerProps) {
  const cityName = extractCity(item.appName);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setContent(null);
    fetch(`/api/app-history/${item.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setContent(data.content || data.summary || "");
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  return (
    <div className="history-viewer flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
      <div className={`history-viewer-header${item.appId === "city" ? " is-city" : ""}`}>
        <button className="history-viewer-back" onClick={onBack}>
          <ArrowLeft size={15} />
          <span>返回</span>
        </button>
        {item.appId === "city" ? (
          <div className="history-viewer-slim">
            <MapPin size={13} className="history-viewer-slim-icon" />
            <span className="history-viewer-slim-city">{cityName}</span>
            <span className="history-viewer-slim-sep">·</span>
            <span className="history-viewer-slim-time">{formatDateTime(item.timestamp)}</span>
          </div>
        ) : (
          <div className="history-viewer-title">
            <span className="history-viewer-icon">
              {APP_ICONS[item.appId || item.appType] || <FileText size={16} />}
            </span>
            <div className="history-viewer-meta">
              <div className="history-viewer-name">{item.appName}</div>
              <div className="history-viewer-time">
                {formatDateTime(item.timestamp)}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="history-viewer-body flex-1 overflow-y-auto">
        {loading && (
          <div className="history-viewer-state">
            <Loader2 size={18} className="spin" />
            <span>加载中...</span>
          </div>
        )}
        {error && <div className="history-viewer-state">内容加载失败</div>}
        {!loading && !error && !content && (
          <div className="history-viewer-state">暂无内容</div>
        )}
        {!loading && !error && content && item.appId === "city" && (
          <CityReportView
            city={cityName}
            report={parseReportSections(content, cityName, new Date(item.timestamp))}
            readOnly
          />
        )}
        {!loading && !error && content && item.appId === "bidding" && (
          <BiddingReportView result={parseBiddingResult(content)} />
        )}
        {!loading && !error && content && item.appId !== "city" && item.appId !== "bidding" && (
          <div className="history-viewer-content">
            <Markdown content={content} />
          </div>
        )}
      </div>
    </div>
  );
}
