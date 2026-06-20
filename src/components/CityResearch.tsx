"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2, MapPin, Clock, FileText, ChevronDown, Copy, Download, Check } from "lucide-react";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { saveAs } from "file-saver";
import { Markdown } from "./Markdown";
import { CityReportView } from "./CityReportView";
import {
  parseReportSections,
  buildFullTemplateHTML,
  serializeToMarkdown,
  type ParsedReport,
} from "@/lib/city-report";
import { useAppHistory } from "@/hooks/useAppHistory";

interface ResearchStats {
  chapters: number;
  estimatedLength: string;
  depth: string;
}

interface ResearchData {
  city: string;
  stats: ResearchStats;
}

export function CityResearch() {
  const { saveToHistory } = useAppHistory();
  const [cityName, setCityName] = useState("");
  const [searchDepth, setSearchDepth] = useState<"quick" | "standard" | "deep">("standard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<string>("");
  const [phaseMessage, setPhaseMessage] = useState<string>("");
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [currentCategory, setCurrentCategory] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [data, setData] = useState<ResearchData | null>(null);
  const [streamingReport, setStreamingReport] = useState<string>("");
  const [finalReport, setFinalReport] = useState<string>("");
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [copied, setCopied] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Timer
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }

    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [loading]);

  const handleResearch = async () => {
    if (!cityName.trim() || loading) return;

    setLoading(true);
    setError(null);
    setData(null);
    setPhase("collecting");
    setPhaseMessage("正在初始化...");
    setProgressMessage("");
    setCurrentCategory("");
    setProgress(0);
    setStreamingReport("");
    setFinalReport("");
    setReport(null);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const params = new URLSearchParams({
      city: cityName.trim(),
      searchDepth,
    });

    const es = new EventSource(`/api/city-research?${params}`);
    eventSourceRef.current = es;

    es.addEventListener("phase", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setPhase(data.phase);
      setPhaseMessage(data.message);
    });

    es.addEventListener("data", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setData(data);
    });

    es.addEventListener("progress", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setProgressMessage(data.message);
      setCurrentCategory(data.category);
      setProgress(data.progress);
    });

    es.addEventListener("text", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setStreamingReport((prev) => prev + data.content);
    });

    es.addEventListener("done", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setFinalReport(data.report || "");
      setStreamingReport("");
      if (data.report) {
        setReport(parseReportSections(data.report, cityName.trim(), new Date()));
      }
      setLoading(false);
      setPhase("done");
      es.close();
    });

    es.addEventListener("fail", (e: MessageEvent) => {
      if (e.data) {
        try {
          const data = JSON.parse(e.data);
          setError(data.error);
        } catch {
          setError("Research failed");
        }
      }
    });

    es.addEventListener("warning", (e: MessageEvent) => {
      if (e.data) {
        try {
          const data = JSON.parse(e.data);
          // Show warning as a dismissible info message, not an error
          setError(data.message || null);
          // Auto-dismiss after 8 seconds
          setTimeout(() => setError((prev) => (prev === data.message ? null : prev)), 8000);
        } catch {
          // ignore
        }
      }
    });

    es.onerror = () => {
      setError("连接中断，请重试");
      setLoading(false);
      es.close();
    };

    // Timeout based on search depth
    const timeout = searchDepth === "quick" ? 180_000 : searchDepth === "standard" ? 300_000 : 600_000;
    setTimeout(() => {
      if (eventSourceRef.current === es) {
        es.close();
        setLoading(false);
        if (!finalReport && !streamingReport) {
          setError("分析超时，请重试或选择更浅的搜索深度");
        }
      }
    }, timeout);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Save to history when report is complete
  useEffect(() => {
    if (finalReport && cityName) {
      saveToHistory("city", `城市研究: ${cityName}`, finalReport);
    }
  }, [finalReport, cityName]);

  const displayReport = finalReport || streamingReport;

  function markdownToPlainText(md: string): string {
    return md
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "")
      .replace(/#{1,6}\s+/g, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
      .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ""))
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/^\s*>\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-=_]{3,}\s*$/gm, "")
      .replace(/\|/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function parseReportToDocx(report: string): Document {
    const lines = report.split("\n");
    const children: Paragraph[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].replace(/\*\*(.+?)\*\*/g, "$1").trim();
        const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
          4: HeadingLevel.HEADING_4,
          5: HeadingLevel.HEADING_5,
          6: HeadingLevel.HEADING_6,
        };
        children.push(new Paragraph({ heading: headingMap[level], children: [new TextRun({ text, bold: true })] }));
        i++;
        continue;
      }
      if (line.trim() === "") {
        i++;
        continue;
      }
      // Collect consecutive non-heading, non-empty lines into one paragraph
      let para = "";
      while (i < lines.length && lines[i].trim() !== "" && !lines[i].match(/^#{1,6}\s+/)) {
        para += (para ? "\n" : "") + lines[i];
        i++;
      }
      const cleaned = para
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
        .replace(/~~(.+?)~~/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      children.push(new Paragraph({ children: [new TextRun({ text: cleaned })] }));
    }
    return new Document({ sections: [{ children }] });
  }

  async function handleCopy() {
    const md = report ? serializeToMarkdown(report) : displayReport;
    const text = markdownToPlainText(md);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownloadDocx() {
    const md = report ? serializeToMarkdown(report) : displayReport;
    const cleaned = md.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
    const doc = parseReportToDocx(cleaned);
    const blob = await Packer.toBlob(doc);
    const cityLabel = data?.city || cityName || "城市";
    saveAs(blob, `${cityLabel}研究报告.docx`);
  }

  function handleDownloadHTML() {
    if (!report) return;
    const html = buildFullTemplateHTML(report);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const cityLabel = data?.city || cityName || "城市";
    saveAs(blob, `${cityLabel}研究报告.html`);
  }

  const isComplete = !!finalReport;

  return (
    <div className="city-research">
      <div className="app-page-header city-header">
        <h2 className="app-page-title city-title">城市深度研究</h2>
        <p className="app-page-subtitle city-subtitle">
          输入城市名称，生成专业的 9 章结构化调研报告
        </p>
      </div>

      <div className="city-search">
        <div className="city-search-wrapper">
          <MapPin size={18} className="city-search-icon" />
          <input
            type="text"
            className="city-search-input"
            placeholder="输入城市名称，如：银川金凤区、杭州西湖区、深圳南山区等"
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleResearch()}
            disabled={loading}
          />
          <button
            className="city-search-btn"
            onClick={handleResearch}
            disabled={loading || !cityName.trim()}
          >
            {loading ? (
              <Loader2 size={16} className="spin" />
            ) : (
              "开始调研"
            )}
          </button>
        </div>

        <div className="depth-selector">
          <label className="depth-label">调研深度：</label>
          <div className="depth-options">
            <button
              className={`depth-btn ${searchDepth === "quick" ? "active" : ""}`}
              onClick={() => setSearchDepth("quick")}
              disabled={loading}
            >
              快速
              <span className="depth-time">30-60秒</span>
            </button>
            <button
              className={`depth-btn ${searchDepth === "standard" ? "active" : ""}`}
              onClick={() => setSearchDepth("standard")}
              disabled={loading}
            >
              标准
              <span className="depth-time">2-3分钟</span>
            </button>
            <button
              className={`depth-btn ${searchDepth === "deep" ? "active" : ""}`}
              onClick={() => setSearchDepth("deep")}
              disabled={loading}
            >
              深度
              <span className="depth-time">5-10分钟</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="city-error">
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="city-loading">
          <div className="loading-icon">
            <Loader2 size={32} className="spin" />
          </div>
          <div className="loading-content">
            <div className="loading-title">
              {phase === "collecting" && "正在收集数据"}
              {phase === "analyzing" && "正在生成报告"}
              {!phase && "正在调研"}
            </div>
            <div className="loading-stage">
              {phaseMessage || "初始化中..."}
            </div>
            {progressMessage && (
              <div className="loading-category">{progressMessage}</div>
            )}
            {progress > 0 && (
              <div className="loading-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="progress-text">{progress}%</span>
              </div>
            )}
            <div className="loading-elapsed">
              已运行 {elapsed} 秒
              {elapsed > 60 && phase === "analyzing" && " （报告生成通常需要 2-5 分钟）"}
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="city-results">
          <div className="city-summary">
            <div className="summary-card">
              <FileText size={20} />
              <div>
                <div className="summary-label">报告章节</div>
                <div className="summary-value">{data.stats.chapters} 章</div>
              </div>
            </div>
            <div className="summary-card">
              <Clock size={20} />
              <div>
                <div className="summary-label">预计篇幅</div>
                <div className="summary-value">{data.stats.estimatedLength}</div>
              </div>
            </div>
            <div className="summary-card">
              <Search size={20} />
              <div>
                <div className="summary-label">调研城市</div>
                <div className="summary-value">{data.city}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {displayReport && (
        <div className="report-section">
          <div className="report-header">
            <FileText size={18} />
            <h3>城市研究报告</h3>
            {streamingReport && !finalReport && (
              <span className="report-streaming-badge">生成中...</span>
            )}
            {isComplete && (
              <div className="report-actions">
                <button className="report-action-btn" onClick={handleCopy} title="复制为纯文本">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "已复制" : "复制"}
                </button>
                <button className="report-action-btn" onClick={handleDownloadHTML} title="下载 HTML 报告" disabled={!report}>
                  <Download size={14} />
                  下载 HTML
                </button>
                <button className="report-action-btn" onClick={handleDownloadDocx} title="下载 Word 文档">
                  <Download size={14} />
                  下载 docx
                </button>
              </div>
            )}
          </div>

          <div className="report-content">
            {report ? (
              <CityReportView city={data?.city || cityName} report={report} onChange={setReport} />
            ) : (
              <Markdown content={displayReport.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim()} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
