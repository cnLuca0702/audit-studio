"use client";

import { stripMarkdown } from "@/lib/strip-markdown";
import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useAppHistory } from "@/hooks/useAppHistory";
import { DocRewriteDiff, type DiffViewMode } from "./DocRewriteDiff";
import { resolveNewTextSelection } from "@/lib/doc-diff-selection";
import { buildDiffDocument, normalizeLineEndings } from "@/lib/doc-diff";
import {
  initRewriteDocState,
  createPendingOp,
  acceptOp,
  rejectOp,
  streamRewrite,
  type RewriteDocState,
} from "@/lib/doc-rewrite-operation";
import {
  Sparkles,
  Save,
  Loader2,
  Wand2,
  ChevronDown,
  ChevronUp,
  X,
  BookmarkPlus,
  Plus,
  Upload,
  ClipboardPaste,
  ArrowLeft,
  FileText,
  Copy,
  Download,
  Check,
  RotateCcw,
} from "lucide-react";

interface StyleProfile {
  id: string;
  name: string;
  profile: string;
  createdAt: number;
}

type Step = "style" | "rewrite";
type InputMode = "upload" | "paste";

// 视图偏好的最小外部存储：localStorage + 订阅通知。
// SSR/水合期间返回默认 split，挂载后同步到已保存偏好，避免水合不一致。
const DIFF_VIEW_STORAGE_KEY = "doc-rewrite-diff-view";
const diffViewListeners = new Set<() => void>();
function subscribeDiffView(notify: () => void) {
  diffViewListeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    diffViewListeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}
function getDiffViewSnapshot(): DiffViewMode {
  try {
    return window.localStorage.getItem(DIFF_VIEW_STORAGE_KEY) === "inline"
      ? "inline"
      : "split";
  } catch {
    return "split";
  }
}
function getDiffViewServerSnapshot(): DiffViewMode {
  return "split";
}

export function DocRewrite() {
  const { saveToHistory } = useAppHistory();
  const [step, setStep] = useState<Step>("style");

  // Step 1: Style
  const [refText, setRefText] = useState("");
  const [refFileName, setRefFileName] = useState<string | null>(null);
  const [refInputMode, setRefInputMode] = useState<InputMode>("upload");
  const [pastedRefText, setPastedRefText] = useState("");
  const [styleProfile, setStyleProfile] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [showProfileList, setShowProfileList] = useState(false);
  const [profileDropdownPos, setProfileDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "bottom" | "top";
  } | null>(null);
  const profileBtnRef = useRef<HTMLButtonElement | null>(null);
  const [showNewStylePanel, setShowNewStylePanel] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Step 2: Rewrite
  const [docText, setDocText] = useState("");
  const [docFileName, setDocFileName] = useState<string | null>(null);
  const [docInputMode, setDocInputMode] = useState<InputMode>("upload");
  const [pastedDocText, setPastedDocText] = useState("");
  const [requirements, setRequirements] = useState("");
  // 生成状态（整篇/局部共用）：流式预览为模型原始输出，成功后只清理一次
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [streamPreview, setStreamPreview] = useState("");
  const genAbortRef = useRef<AbortController | null>(null);
  // 请求版本：停止/重开后递增，迟到的异步结果按版本丢弃
  const genVersionRef = useRef(0);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // 操作状态：已确认正文 + 至多一个待审核操作（见 doc-rewrite-operation.ts）
  const [docState, setDocState] = useState<RewriteDocState>(() =>
    initRewriteDocState("")
  );
  // 撤销栈：接受操作前的完整快照（confirmed + acceptedOps）
  const [undoStack, setUndoStack] = useState<
    { confirmed: string; acceptedOps: number }[]
  >([]);

  // Partial rewrite state
  const [partialSelectedText, setPartialSelectedText] = useState("");
  const [partialSelectionRange, setPartialSelectionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{
    top: number;
    left: number;
    below: boolean;
  } | null>(null);
  const [partialInstruction, setPartialInstruction] = useState("");
  const [showPartialToolbar, setShowPartialToolbar] = useState(false);
  const [showPartialRewritePanel, setShowPartialRewritePanel] = useState(false);
  const partialInputRef = useRef<HTMLTextAreaElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);

  // Auto-resize the partial-rewrite textarea to fit its content.
  const adjustPartialInput = useCallback(() => {
    const el = partialInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 280) + "px";
  }, []);

  // 差异视图偏好：只存显示偏好（split / inline），存储不可用不阻断
  const diffView = useSyncExternalStore(
    subscribeDiffView,
    getDiffViewSnapshot,
    getDiffViewServerSnapshot
  );
  const handleDiffViewChange = useCallback((v: DiffViewMode) => {
    try {
      window.localStorage.setItem(DIFF_VIEW_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
    diffViewListeners.forEach((l) => l());
  }, []);

  // 局部改写选区无法映射时的提示（折叠/旧文侧），短暂显示后自动消失
  const [partialHint, setPartialHint] = useState<string | null>(null);
  const partialHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPartialHint = useCallback((msg: string) => {
    setPartialHint(msg);
    if (partialHintTimerRef.current) clearTimeout(partialHintTimerRef.current);
    partialHintTimerRef.current = setTimeout(() => setPartialHint(null), 3200);
  }, []);
  useEffect(() => {
    return () => {
      if (partialHintTimerRef.current) clearTimeout(partialHintTimerRef.current);
    };
  }, []);

  const clearPartialSelection = useCallback(() => {
    setShowPartialToolbar(false);
    setPartialHint(null);
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
  }, []);

  // 输入基线：不做 Markdown 清理，仅规范换行。
  // 已确认正文/待审操作均保存规范化 LF 文本，作为 diff、选区、复制、下载的唯一来源。
  const baseText = useMemo(() => normalizeLineEndings(docText), [docText]);
  // 当前展示正文：待审核时为“本次改写后”，否则为已确认正文
  const displayBody = docState.pending ? docState.pending.after : docState.confirmed;
  // 结果区是否激活（有待审核或已接受过至少一次操作）
  const resultActive = docState.pending !== null || docState.acceptedOps > 0;
  // 待审核：比较本次改写前/后；确认后：最初原文 vs 当前正文（累计对比，仅供参考）
  const diffDoc = useMemo(() => {
    if (isGenerating) return null;
    if (docState.pending) {
      return buildDiffDocument(docState.pending.before, docState.pending.after);
    }
    if (resultActive && displayBody) {
      return buildDiffDocument(baseText, displayBody);
    }
    return null;
  }, [isGenerating, docState, resultActive, displayBody, baseText]);

  // Load profiles on mount
  useEffect(() => {
    fetchProfiles();
  }, []);

  // Dismiss partial toolbar on outside click or Escape
  useEffect(() => {
    function handleDocMouseDown(e: MouseEvent) {
      if (!showPartialToolbar) return;
      const target = e.target as HTMLElement;
      if (target.closest(".doc-rewrite-partial-toolbar")) return;
      if (rightPanelRef.current?.contains(target)) return;
      setShowPartialToolbar(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && showPartialToolbar) {
        setShowPartialToolbar(false);
        setPartialHint(null);
        window.getSelection()?.removeAllRanges();
      }
    }
    document.addEventListener("mousedown", handleDocMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleDocMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showPartialToolbar]);

  // Keep the partial-rewrite textarea sized to its content whenever the panel
  // opens or the instruction text changes (including being cleared).
  useLayoutEffect(() => {
    adjustPartialInput();
  }, [adjustPartialInput, showPartialRewritePanel, partialInstruction]);

  // Compute portal dropdown position based on trigger button rect + viewport.
  const recalcProfileDropdown = useCallback(() => {
    const btn = profileBtnRef.current;
    if (!btn) {
      setProfileDropdownPos(null);
      return;
    }
    const rect = btn.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    // Prefer below; flip up only when below is too small and above is larger.
    const placement: "bottom" | "top" =
      spaceBelow >= 180 || spaceBelow >= spaceAbove ? "bottom" : "top";
    const maxHeight = Math.max(
      120,
      Math.floor(placement === "bottom" ? spaceBelow : spaceAbove)
    );
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
    setProfileDropdownPos({
      top: placement === "bottom" ? rect.bottom + gap : Math.max(8, rect.top - gap - maxHeight),
      left,
      width: rect.width,
      maxHeight,
      placement,
    });
  }, []);

  // (Re)compute position whenever the dropdown opens or the list changes.
  useLayoutEffect(() => {
    if (!showProfileList) {
      setProfileDropdownPos(null);
      return;
    }
    recalcProfileDropdown();
  }, [showProfileList, profiles, recalcProfileDropdown]);

  // Close on outside click, Escape, scroll, and resize while open.
  useEffect(() => {
    if (!showProfileList) return;
    const onDocMouseDown = (e: MouseEvent) => {
 const target = e.target as Node;
 if (profileBtnRef.current?.contains(target)) return;
 if ((target as Element).closest?.(".doc-rewrite-profile-portal")) return;
 setShowProfileList(false);
 };
 const onKey = (e: KeyboardEvent) => {
 if (e.key === "Escape") setShowProfileList(false);
 };
 const onScrollOrResize = () => setShowProfileList(false);
 document.addEventListener("mousedown", onDocMouseDown);
 document.addEventListener("keydown", onKey);
 window.addEventListener("resize", onScrollOrResize);
 // Any scroll (window or nested containers) should close to avoid stale position.
 window.addEventListener("scroll", onScrollOrResize, true);
 return () => {
 document.removeEventListener("mousedown", onDocMouseDown);
 document.removeEventListener("keydown", onKey);
 window.removeEventListener("resize", onScrollOrResize);
 window.removeEventListener("scroll", onScrollOrResize, true);
 };
  }, [showProfileList]);

  async function fetchProfiles() {
    try {
      const res = await fetch("/api/doc-rewrite/profiles");
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || []);
      }
    } catch {
      /* ignore */
    }
  }

  /** 替换输入文档：重置已确认正文与操作状态（有待审核/生成中时入口已禁用） */
  const applyInputDoc = useCallback((text: string, fileName: string | null) => {
    setDocText(text);
    setDocFileName(fileName);
    setDocState(initRewriteDocState(normalizeLineEndings(text)));
    setUndoStack([]);
    setGenError(null);
    setStreamPreview("");
    clearPartialSelection();
  }, [clearPartialSelection]);

  async function handleFileUpload(file: File, target: "ref" | "doc") {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/doc-rewrite/extract-text", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "文件解析失败");
      if (target === "ref") {
        setRefText(data.text);
        setRefFileName(file.name);
        setStyleProfile("");
        setSelectedProfileId(null);
        setAnalyzeError(null);
      } else {
        applyInputDoc(data.text, file.name);
      }
    } catch (err: any) {
      alert(err.message || "文件解析失败");
    }
  }

  async function handleAnalyzeStyle() {
    setAnalyzing(true);
    setStyleProfile("");
    setSelectedProfileId(null);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/doc-rewrite/analyze-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: refText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "分析失败");
      setStyleProfile(data.profile);
    } catch (err: any) {
      setAnalyzeError(err.message || "风格分析失败");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleSelectProfile(profile: StyleProfile) {
    setSelectedProfileId(profile.id);
    setStyleProfile(profile.profile);
    setShowProfileList(false);
    setAnalyzeError(null);
  }

  // Reset everything style-related so the "new style" panel starts clean,
  // even if the user previously picked a saved profile.
  function startNewStyle() {
    setSelectedProfileId(null);
    setStyleProfile("");
    setRefText("");
    setRefFileName(null);
    setPastedRefText("");
    setAnalyzeError(null);
    setShowProfileList(false);
    setShowNewStylePanel(true);
  }

  async function handleSaveProfile() {
    if (!profileName.trim() || !styleProfile.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/doc-rewrite/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profileName.trim(), profile: styleProfile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setProfiles((prev) => [...prev, data]);
      setShowSaveDialog(false);
      setProfileName("");
    } catch (err: any) {
      alert(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProfile(id: string) {
    try {
      const res = await fetch(`/api/doc-rewrite/profiles/${id}`, { method: "DELETE" });
      if (res.ok) {
        setProfiles((prev) => prev.filter((p) => p.id !== id));
        if (selectedProfileId === id) {
          setSelectedProfileId(null);
          setStyleProfile("");
        }
      }
    } catch {
      /* ignore */
    }
  }

  /** 接受本次改写：仅按当前操作 ID 提交 after，写入撤销栈与应用历史 */
  const handleAccept = useCallback(() => {
    const op = docState.pending;
    if (!op || isGenerating) return;
    setUndoStack((u) => [...u, { confirmed: op.before, acceptedOps: docState.acceptedOps }]);
    const next = acceptOp(docState, op.id);
    setDocState(next);
    setGenError(null);
    clearPartialSelection();
    // 仅在明确接受后写入应用历史（中断草稿不再被当作完成结果保存）
    void saveToHistory("rewrite", "文档改写", next.confirmed);
  }, [docState, isGenerating, clearPartialSelection, saveToHistory]);

  /** 拒绝本次改写：精确恢复 before，confirmed 不变 */
  const handleReject = useCallback(() => {
    const op = docState.pending;
    if (!op || isGenerating) return;
    setDocState((s) => rejectOp(s, op.id));
    setGenError(null);
    clearPartialSelection();
  }, [docState.pending, isGenerating, clearPartialSelection]);

  /** 撤销上一次已接受的改写：恢复完整快照；待审核/生成中不可用 */
  const handleUndo = useCallback(() => {
    if (docState.pending || isGenerating || undoStack.length === 0) return;
    const snap = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setDocState((s) => ({
      ...s,
      confirmed: snap.confirmed,
      pending: null,
      acceptedOps: snap.acceptedOps,
    }));
    setGenError(null);
    clearPartialSelection();
  }, [docState.pending, isGenerating, undoStack, clearPartialSelection]);

  async function handleRewrite() {
    if (!styleProfile.trim() || !docText.trim() || isGenerating || docState.pending) return;
    const version = ++genVersionRef.current;
    const controller = new AbortController();
    genAbortRef.current = controller;
    const before = docState.confirmed;
    setIsGenerating(true);
    setGenError(null);
    setStreamPreview("");
    setConfigCollapsed(true);
    clearPartialSelection();

    try {
      // 请求保持既有行为（发送输入原文）；操作的 before 是发起前的当前已确认正文
      const reducer = await streamRewrite(
        "/api/doc-rewrite/stream",
        { styleProfile, requirements, documentText: docText },
        controller.signal,
        (full) => {
          if (genVersionRef.current === version) setStreamPreview(full);
        }
      );
      if (genVersionRef.current !== version) return; // 停止后迟到的结果丢弃
      if (!reducer.cleanFinish) {
        setGenError(
          reducer.error ?? reducer.warning ?? "改写未正常完成，结果未保留"
        );
        return;
      }
      if (!reducer.content.trim()) {
        setGenError("模型未返回有效内容");
        return;
      }
      // 模型输出只清理一次
      const after = normalizeLineEndings(stripMarkdown(reducer.content));
      if (after === before) {
        setGenError("模型输出与当前正文一致，未产生修改");
        return;
      }
      const created = createPendingOp(docState, {
        kind: "full",
        before,
        after,
        range: null,
        summary: requirements.trim() || "整篇改写",
      });
      if (!created) {
        setGenError("当前有待审核改写，请先接受或拒绝后再重新改写");
        return;
      }
      setDocState(created.state);
    } catch (err: any) {
      if (genVersionRef.current !== version) return;
      if (err?.name !== "AbortError") {
        setGenError(err?.message || "改写出错");
      }
    } finally {
      if (genVersionRef.current === version) {
        setIsGenerating(false);
        genAbortRef.current = null;
        setStreamPreview("");
      } else if (genAbortRef.current === controller) {
        genAbortRef.current = null;
      }
    }
  }

  function handleStopRewrite() {
    genVersionRef.current += 1; // 使迟到回调失效
    genAbortRef.current?.abort();
    // 版本已递增，请求自身的 finally 不再复位状态，这里显式清理
    setIsGenerating(false);
    genAbortRef.current = null;
    setStreamPreview("");
  }

  // mouseup 时把 DOM 选区解析为新文绝对偏移（见 doc-diff-selection）：
  // 支持跨多个高亮节点、重复词句、反向拖选；按 data-new-* 累计，不使用 indexOf。
  function handleTextMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    if (isGenerating) return;
    if (docState.pending) {
      setShowPartialToolbar(false);
      showPartialHint("请先接受或拒绝本次改写，再进行局部改写");
      return;
    }

    const root = e.currentTarget;
    const res = resolveNewTextSelection(root, displayBody);
    if (!res.ok) {
      setShowPartialToolbar(false);
      if (res.selected.trim()) {
        if (res.reason === "crosses-folded") {
          showPartialHint("选区包含已折叠的内容，请先展开后再选择");
        } else if (res.reason === "old-side") {
          showPartialHint(
            docState.pending
              ? "请只选择右侧“本次改写后”文本（左侧不支持局部改写）"
              : "请只选择右侧“当前正文”文本（左侧原文不支持局部改写）"
          );
        } else if (res.reason === "no-new-text") {
          showPartialHint("请选择新文本（删除线内容不属于新文本）");
        }
      } else {
        setPartialHint(null);
      }
      return;
    }

    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!range) {
      setShowPartialToolbar(false);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      setShowPartialToolbar(false);
      return;
    }
    const below = rect.top < 140;

    const toolbarWidth = 320;
    let left = rect.left + rect.width / 2 - toolbarWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8));
    const top = below ? rect.bottom + 8 : rect.top - 8;

    setPartialSelectedText(res.text);
    setPartialSelectionRange({ start: res.start, end: res.end });
    setToolbarPosition({ top, left, below });
    setPartialInstruction("");
    setGenError(null);
    setPartialHint(null);
    setShowPartialToolbar(true);
  }

  async function handlePartialRewrite() {
    if (!partialInstruction.trim() || !partialSelectionRange || isGenerating || docState.pending) return;

    const version = ++genVersionRef.current;
    const controller = new AbortController();
    genAbortRef.current = controller;
    const before = docState.confirmed;
    const { start, end } = partialSelectionRange;
    setIsGenerating(true);
    setGenError(null);

    try {
      const reducer = await streamRewrite(
        "/api/doc-rewrite/stream",
        {
          styleProfile,
          requirements: partialInstruction.trim(),
          documentText: partialSelectedText,
        },
        controller.signal
      );
      if (genVersionRef.current !== version) return;
      if (!reducer.cleanFinish) {
        setGenError(reducer.error ?? reducer.warning ?? "局部改写未正常完成，结果未保留");
        return;
      }
      if (!reducer.content.trim()) {
        setGenError("模型未返回有效内容");
        return;
      }
      // 局部输出只清理替换片段；拼接后的全文不再重复 stripMarkdown
      const fragment = normalizeLineEndings(stripMarkdown(reducer.content).trim());
      const after = before.slice(0, start) + fragment + before.slice(end);
      if (after === before) {
        setGenError("局部改写结果与原文相同，未产生修改");
        return;
      }
      const created = createPendingOp(docState, {
        kind: "partial",
        before,
        after,
        range: { start, end },
        summary: partialInstruction.trim(),
      });
      if (!created) {
        setGenError("当前有待审核改写，请先接受或拒绝");
        return;
      }
      setDocState(created.state);
      setShowPartialRewritePanel(false);
      setPartialInstruction("");
    } catch (err: any) {
      if (genVersionRef.current !== version) return;
      if (err?.name !== "AbortError") {
        setGenError(err?.message || "局部改写出错");
      }
    } finally {
      if (genVersionRef.current === version) {
        setIsGenerating(false);
        genAbortRef.current = null;
      } else if (genAbortRef.current === controller) {
        genAbortRef.current = null;
      }
      setShowPartialToolbar(false);
      window.getSelection()?.removeAllRanges();
    }
  }

  async function handleCopy() {
    if (!displayBody) return;
    await navigator.clipboard.writeText(displayBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownloadDocx() {
    if (!displayBody) return;
    try {
      const res = await fetch("/api/doc-rewrite/download-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: displayBody, filename: "rewritten-document" }),
      });
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rewritten-document.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "下载失败");
    }
  }

  /** 下载当前待审核操作的真实修订 DOCX（下载不等于接受） */
  async function handleDownloadRevisionDocx() {
    const op = docState.pending;
    if (!op || isGenerating) return;
    try {
      const res = await fetch("/api/doc-rewrite/download-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "revision",
          before: op.before,
          after: op.after,
          operation: {
            id: op.id,
            kind: op.kind,
            createdAt: op.createdAt,
            summary: op.summary,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string })?.error || "下载失败");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `revision-${op.id.slice(0, 8)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "下载修订失败";
      setGenError(message);
    }
  }

  // The "当前正文/预览" panel is reused in two layouts: right slot (generating
  // preview mode) and left slot (partial-rewrite mode), so extract it once.
  // 面板显示与 diff/选区共用的规范化正文（displayBody）；生成中显示原始流式预览。
  const rewrittenPanel = (
    <div className="doc-rewrite-result-panel">
      <div className="doc-rewrite-result-panel-header doc-rewrite-result-panel-header-with-action">
        <span>{isGenerating ? "生成预览" : "当前正文"}</span>
        {!isGenerating && !docState.pending && resultActive && (
          <div className="doc-rewrite-header-actions">
            <button
              className={`doc-rewrite-undo-btn ${undoStack.length === 0 ? "doc-rewrite-undo-disabled" : ""}`}
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title={
                undoStack.length > 0
                  ? `撤销上一次已接受的改写（剩余 ${undoStack.length} 次）`
                  : "无可撤销的已接受改写"
              }
            >
              <RotateCcw size={12} />
              撤销{undoStack.length > 0 ? ` (${undoStack.length})` : ""}
            </button>
            <button
              className="doc-rewrite-rewrite-again-btn"
              onClick={handleRewrite}
              title="重新改写"
            >
              <RotateCcw size={12} />
              重新改写
            </button>
          </div>
        )}
      </div>
      <div
        ref={rightPanelRef}
        className="doc-rewrite-result-panel-content"
        onMouseUp={handleTextMouseUp}
        onScroll={() => { if (showPartialToolbar) setShowPartialToolbar(false); }}
        data-doc-diff-root
        data-new-start={0}
        data-new-end={displayBody.length}
      >
        {isGenerating ? (streamPreview || "等待输出...") : displayBody}
      </div>
    </div>
  );

  return (
    <div className="doc-rewrite">
      {/* Header */}
      <div className="app-page-header">
        <h2 className="app-page-title">文档改写</h2>
        <p className="app-page-subtitle">
          上传参考文档分析文字风格，再对目标文档进行智能改写
        </p>
      </div>

      <div className="doc-rewrite-toolbar">
        {step === "rewrite" && (
          <button
            className="icon-btn doc-rewrite-toolbar-back"
            onClick={() => setStep("style")}
            title="返回风格设置"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="doc-rewrite-steps">
          <div className={`doc-rewrite-step ${step === "style" ? "active" : ""}`}>
            <Sparkles size={12} />
            <span>1. 文档风格选择</span>
          </div>
          <div className={`doc-rewrite-step ${step === "rewrite" ? "active" : ""}`}>
            <Wand2 size={12} />
            <span>2. 选择改写文档</span>
          </div>
        </div>
      </div>

     {/* Step 1: Style */}
     {step === "style" && (
       <div className="doc-rewrite-body">
        <div className="doc-rewrite-form">
            <div className="doc-rewrite-section">
              <label className="doc-rewrite-label">选择已保存的风格</label>
              <div className="doc-rewrite-select">
                <button
                  ref={profileBtnRef}
                  className="doc-rewrite-select-btn"
                  onClick={() => setShowProfileList(!showProfileList)}
                >
                  <span>
                    {selectedProfileId
                      ? profiles.find((p) => p.id === selectedProfileId)?.name || "已选择"
                      : "点击选择..."}
                  </span>
                  {showProfileList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>

            {/* New style panel: reference upload + analyze (hidden by default) */}
            {showNewStylePanel && (
              <>
                <div className="doc-rewrite-section">
                  <label className="doc-rewrite-label">参考文档（用于分析文字风格）</label>
                  <div className="doc-rewrite-mode-tabs">
                    <button
                      className={`doc-rewrite-mode-tab ${refInputMode === "upload" ? "active" : ""}`}
                      onClick={() => setRefInputMode("upload")}
                    >
                      <Upload size={12} />
                      上传文件
                    </button>
                    <button
                      className={`doc-rewrite-mode-tab ${refInputMode === "paste" ? "active" : ""}`}
                      onClick={() => setRefInputMode("paste")}
                    >
                      <ClipboardPaste size={12} />
                      粘贴文本
                    </button>
                  </div>

                  {refInputMode === "upload" ? (
                    <div
                      className="doc-rewrite-upload"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) handleFileUpload(file, "ref");
                      }}
                    >
                      {refFileName ? (
                        <div className="doc-rewrite-file-loaded">
                          <FileText size={14} />
                          <span>{refFileName}</span>
                          <button
                            className="icon-btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRefText("");
                              setRefFileName(null);
                              setStyleProfile("");
                              setSelectedProfileId(null);
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload size={20} />
                          <span>点击或拖拽上传文件</span>
                          <span className="doc-rewrite-upload-hint">
                            支持 TXT、MD、DOCX、PDF、Excel
                          </span>
                        </>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.md,.docx,.pdf,.xlsx,.xls"
                        className="hidden-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, "ref");
                          e.target.value = "";
                        }}
                      />
                    </div>
                  ) : (
                    <div className="doc-rewrite-paste">
                      <textarea
                        className="doc-rewrite-textarea"
                        value={pastedRefText}
                        onChange={(e) => setPastedRefText(e.target.value)}
                        placeholder="在此粘贴参考文档的文本内容..."
                        rows={6}
                      />
                      {pastedRefText && (
                        <button
                          className="doc-rewrite-confirm-btn"
                          onClick={() => {
                            setRefText(pastedRefText);
                            setRefFileName(null);
                            setStyleProfile("");
                            setSelectedProfileId(null);
                          }}
                        >
                          确认文本
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Analyze button */}
                {refText && !styleProfile && (
                  <button
                    className="doc-rewrite-primary-btn"
                    onClick={handleAnalyzeStyle}
                    disabled={analyzing}
                  >
                    {analyzing ? (
                      <>
                        <Loader2 size={14} className="spin" />
                        正在分析风格...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        分析文字风格
                      </>
                    )}
                  </button>
                )}

                {analyzeError && <div className="doc-rewrite-error">{analyzeError}</div>}
              </>
            )}

            {/* Style profile display */}
            {styleProfile && (
              <div className="doc-rewrite-section">
                <div className="doc-rewrite-profile-header">
                  <label className="doc-rewrite-label">风格分析结果</label>
                </div>
                <div className="doc-rewrite-profile-content">{styleProfile}</div>

                {showSaveDialog && (
                  <div className="doc-rewrite-save-dialog">
                    <input
                      type="text"
                      className="doc-rewrite-save-input"
                      placeholder="输入风格名称..."
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveProfile();
                      }}
                      autoFocus
                    />
                    <button
                      className="doc-rewrite-confirm-btn"
                      onClick={handleSaveProfile}
                      disabled={saving || !profileName.trim()}
                    >
                      {saving ? <Loader2 size={12} className="spin" /> : <Save size={12} />}
                      保存
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setShowSaveDialog(false);
                        setProfileName("");
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <div className="doc-rewrite-profile-actions">
                  {!selectedProfileId && (
                    <button
                      className="doc-rewrite-save-btn"
                      onClick={() => setShowSaveDialog(true)}
                    >
                     <BookmarkPlus size={12} />
                      保存风格（可选）
                   </button>
                  )}
                  <button
                    className="doc-rewrite-primary-btn"
                    onClick={() => setStep("rewrite")}
                  >
                    下一步：上传文档并改写
                    <ChevronDown size={14} className="rotate-minus-90" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Rewrite */}
      {step === "rewrite" && (
        <div className="doc-rewrite-body doc-rewrite-rewrite-body">
          {/* Config area: only show when NOT generating and NO active result */}
          {!isGenerating && !resultActive && (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {/* Collapsed config bar */}
              {configCollapsed ? (
                <div className="doc-rewrite-collapsed-bar">
                  <Sparkles size={14} />
                  <span className="doc-rewrite-collapsed-style">
                    风格:{" "}
                    {selectedProfileId
                      ? profiles.find((p) => p.id === selectedProfileId)?.name
                      : "自定义"}
                  </span>
                  <span className="doc-rewrite-collapsed-file">
                    {docFileName || "已加载文档"}
                  </span>
                  <button
                    className="doc-rewrite-confirm-btn"
                    onClick={() => setConfigCollapsed(false)}
                  >
                    修改并重新改写
                    <Wand2 size={12} />
                  </button>
                </div>
              ) : (
                <div className="doc-rewrite-config">
              <div className="doc-rewrite-form">
                {/* Current style */}
                <div className="doc-rewrite-style-summary">
                  <Sparkles size={14} />
                  <span>
                    当前风格:{" "}
                    {selectedProfileId
                      ? profiles.find((p) => p.id === selectedProfileId)?.name
                      : "自定义（来自参考文档分析）"}
                  </span>
                  <button
                    className="doc-rewrite-reselect-btn"
                    onClick={() => setStep("style")}
                  >
                    重新选择
                  </button>
                </div>

                {/* Document to rewrite */}
                <div className="doc-rewrite-section">
                  <label className="doc-rewrite-label">需要改写的文档</label>
                  <div className="doc-rewrite-mode-tabs">
                    <button
                      className={`doc-rewrite-mode-tab ${docInputMode === "upload" ? "active" : ""}`}
                      onClick={() => setDocInputMode("upload")}
                    >
                      <Upload size={12} />
                      上传文件
                    </button>
                    <button
                      className={`doc-rewrite-mode-tab ${docInputMode === "paste" ? "active" : ""}`}
                      onClick={() => setDocInputMode("paste")}
                    >
                      <ClipboardPaste size={12} />
                      粘贴文本
                    </button>
                  </div>

                  {docInputMode === "upload" ? (
                    <div
                      className="doc-rewrite-upload"
                      onClick={() => docFileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) handleFileUpload(file, "doc");
                      }}
                    >
                      {docFileName ? (
                        <div className="doc-rewrite-file-loaded">
                          <FileText size={14} />
                          <span>{docFileName}</span>
                          <button
                            className="icon-btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              applyInputDoc("", null);
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload size={20} />
                          <span>点击或拖拽上传文件</span>
                          <span className="doc-rewrite-upload-hint">
                            支持 TXT、MD、DOCX、PDF、Excel
                          </span>
                        </>
                      )}
                      <input
                        ref={docFileInputRef}
                        type="file"
                        accept=".txt,.md,.docx,.pdf,.xlsx,.xls"
                        className="hidden-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, "doc");
                          e.target.value = "";
                        }}
                      />
                    </div>
                  ) : (
                    <div className="doc-rewrite-paste">
                      <textarea
                        className="doc-rewrite-textarea"
                        value={pastedDocText}
                        onChange={(e) => setPastedDocText(e.target.value)}
                        placeholder="在此粘贴需要改写的文档内容..."
                        rows={6}
                      />
                      {pastedDocText && (
                        <button
                          className="doc-rewrite-confirm-btn"
                          onClick={() => {
                            applyInputDoc(pastedDocText, null);
                          }}
                        >
                          确认文本
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Requirements */}
                <div className="doc-rewrite-section">
                  <label className="doc-rewrite-label">额外要求（可选）</label>
                  <textarea
                    className="doc-rewrite-textarea doc-rewrite-textarea-sm"
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    placeholder="例如：保持专业术语不变、增加段落之间的过渡、语气更正式等..."
                    rows={3}
                  />
                </div>

                {/* Rewrite button */}
                <button
                  className="doc-rewrite-primary-btn"
                  onClick={isGenerating ? handleStopRewrite : handleRewrite}
                  disabled={!styleProfile.trim() || !docText.trim()}
                >
                  {isGenerating ? (
                    <>
                      <X size={14} />
                      停止改写
                    </>
                  ) : (
                    <>
                      <Wand2 size={14} />
                      开始改写
                    </>
                  )}
                  </button>
              </div>
              </div>
            )}
            </div>
          )}

          {genError && !resultActive && !isGenerating && !showPartialRewritePanel && (
            <div className="doc-rewrite-error">{genError}</div>
          )}

          {/* Result panel: 待审核操作、已接受结果或生成中 */}
          {(resultActive || isGenerating) && (
            <div className="doc-rewrite-result">
              <div className="doc-rewrite-result-header">
                <div className="doc-rewrite-result-title">
                  <button
                    className="icon-btn"
                    onClick={() => {
                      if (isGenerating || docState.pending) return;
                      setDocState(initRewriteDocState(baseText));
                      setUndoStack([]);
                      setConfigCollapsed(false);
                      setGenError(null);
                      setStreamPreview("");
                      setShowPartialRewritePanel(false);
                      clearPartialSelection();
                    }}
                    disabled={isGenerating || docState.pending !== null}
                    title={docState.pending ? "请先接受或拒绝本次改写" : "返回修改"}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  {isGenerating && <Loader2 size={14} className="spin" />}
                  <span>
                    {isGenerating
                      ? "正在改写..."
                      : docState.pending
                        ? "待审核改写"
                        : "改写结果"}
                  </span>
                  {isGenerating && (
                    <button
                      className="doc-rewrite-stop-btn"
                      onClick={handleStopRewrite}
                      title="停止改写"
                    >
                      <X size={13} />
                      停止
                    </button>
                  )}
                </div>
                {!isGenerating && (
                  <div className="doc-rewrite-result-actions">
                    {docState.pending ? (
                      <>
                        <button
                          className="doc-rewrite-review-accept"
                          onClick={handleAccept}
                          title="接受本次改写（提交改写后全文）"
                        >
                          <Check size={14} />
                          接受本次改写
                        </button>
                        <button
                          className="doc-rewrite-review-reject"
                          onClick={handleReject}
                          title="拒绝本次改写（恢复改写前全文）"
                        >
                          <X size={14} />
                          拒绝本次改写
                        </button>
                        <button
                          className="report-action-btn"
                          onClick={handleDownloadRevisionDocx}
                          title="下载本次修订 DOCX（真实修订标记；下载不等于接受）"
                        >
                          <Download size={14} />
                          下载本次修订
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={`doc-rewrite-undo-btn ${undoStack.length === 0 ? "doc-rewrite-undo-disabled" : ""}`}
                          onClick={handleUndo}
                          disabled={undoStack.length === 0}
                          title={
                            undoStack.length > 0
                              ? `撤销上一次已接受的改写（剩余 ${undoStack.length} 次）`
                              : "无可撤销的已接受改写"
                          }
                        >
                          <RotateCcw size={14} />
                          撤销{undoStack.length > 0 ? ` (${undoStack.length})` : ""}
                        </button>
                        <button
                          className="doc-rewrite-rewrite-again-btn"
                          onClick={handleRewrite}
                          title="重新改写"
                        >
                          <RotateCcw size={14} />
                          重新改写
                        </button>
                      </>
                    )}
                    <button className="report-action-btn" onClick={handleCopy}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? "已复制" : "复制"}
                    </button>
                    <button className="report-action-btn" onClick={handleDownloadDocx}>
                      <Download size={14} />
                      下载 docx
                    </button>
                  </div>
                )}
              </div>
              {/* 待审核操作提示条：本次前后对比 + 范围声明 */}
              {docState.pending && !isGenerating && (
                <div className="doc-rewrite-review-bar">
                  <span className="doc-rewrite-review-meta">
                    {docState.pending.kind === "partial" ? "局部改写" : "整篇改写"}
                    {docState.pending.range
                      ? `（第 ${docState.pending.range.start + 1}–${docState.pending.range.end} 字）`
                      : ""}
                    {" · "}
                    {new Date(docState.pending.createdAt).toLocaleTimeString()}
                    {" · "}
                    {docState.pending.summary.slice(0, 60)}
                  </span>
                  <span className="doc-rewrite-review-note">
                    下方为“本次改写前 / 本次改写后”对比；接受前不会修改正文。下载修订不等于接受。
                  </span>
                </div>
              )}
              {/* 生成中的过渡状态：纯文本预览，不把未生成尾部当删除 */}
              {isGenerating && streamPreview && (
                <div className="doc-rewrite-diff-pending">正在生成，完成后显示待审核对比</div>
              )}
              {genError && resultActive && !isGenerating && !showPartialRewritePanel && (
                <div className="doc-rewrite-error">{genError}</div>
              )}
              {partialHint && <div className="doc-rewrite-diff-hintbar">{partialHint}</div>}
              {diffDoc && !showPartialRewritePanel && !isGenerating ? (
                <DocRewriteDiff
                  diffDoc={diffDoc}
                  view={diffView}
                  onViewChange={handleDiffViewChange}
                  onMouseUp={handleTextMouseUp}
                  onScroll={() => { if (showPartialToolbar) setShowPartialToolbar(false); }}
                  onSelectionInvalidated={clearPartialSelection}
                  leftLabel={docState.pending ? "本次改写前" : "最初原文"}
                  rightLabel={docState.pending ? "本次改写后" : "当前正文"}
                  note={
                    docState.pending
                      ? undefined
                      : "累计对比（最初原文 vs 当前正文），仅供参考，不代表单次修订范围"
                  }
                />
              ) : (
                <div className="doc-rewrite-result-panels">
                {showPartialRewritePanel ? (
                  <>
                    {/* Rewrite mode: 当前正文 shifts left, instruction panel on right */}
                    {rewrittenPanel}
                    <div className="doc-rewrite-inline-rewrite">
                    <div className="doc-rewrite-inline-rewrite-header">
                      <Wand2 size={12} />
                      <span>局部改写选中文本</span>
                    </div>
                    {/* Full selected text, fully shown (red border, yellow tint) */}
                    <div className="doc-rewrite-inline-rewrite-selected">
                      {partialSelectedText}
                    </div>
                    <textarea
                      ref={partialInputRef}
                      className="doc-rewrite-inline-rewrite-input"
                      placeholder="输入改写指令，如：更正式、更简洁…（Ctrl+Enter 提交）"
                      value={partialInstruction}
                      onChange={(e) => {
                        setPartialInstruction(e.target.value);
                        adjustPartialInput();
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          (e.ctrlKey || e.metaKey) &&
                          partialInstruction.trim() &&
                          !isGenerating
                        ) {
                          e.preventDefault();
                          handlePartialRewrite();
                        }
                        if (e.key === "Escape" && !isGenerating) {
                          setShowPartialRewritePanel(false);
                        }
                      }}
                      rows={3}
                      autoFocus
                      disabled={isGenerating}
                    />
                    {genError && showPartialRewritePanel && (
                      <div className="doc-rewrite-error">{genError}</div>
                    )}
                    <div className="doc-rewrite-inline-rewrite-actions">
                      <button
                        className="doc-rewrite-confirm-btn"
                        onClick={handlePartialRewrite}
                        disabled={!partialInstruction.trim() || isGenerating}
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 size={12} className="spin" />
                            改写中...
                          </>
                        ) : (
                          <>
                            <Wand2 size={12} />
                       改写
                   </>
                 )}
                    </button>
                    <span className="doc-rewrite-actions-gap" />
                    <button
                      className="doc-rewrite-cancel-btn"
                      onClick={() => {
                        setShowPartialRewritePanel(false);
                        setPartialInstruction("");
                        setGenError(null);
                      }}
                      disabled={isGenerating}
                    >
                      <X size={12} />
                      取消
                    </button>
                  </div>
                </div>
                </>
              ) : (
                 /* 生成中过渡：原文 (left) | 流式预览 (right) */
                 <>
                    <div className="doc-rewrite-result-panel">
                      <div className="doc-rewrite-result-panel-header">原文</div>
                      <div className="doc-rewrite-result-panel-content">{docText}</div>
                    </div>
                    {rewrittenPanel}
                </>
              )}
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating partial-rewrite toolbar */}
      {showPartialToolbar && toolbarPosition && !isGenerating && !docState.pending && (
        <div
          className="doc-rewrite-partial-toolbar"
          style={{
            position: "fixed",
            top: `${toolbarPosition.top}px`,
            left: `${toolbarPosition.left}px`,
            transform: toolbarPosition.below ? "none" : "translateY(-100%)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="doc-rewrite-partial-toolbar-actions">
            <button
              className="report-action-btn"
              onClick={() => {
                navigator.clipboard.writeText(partialSelectedText);
                setShowPartialToolbar(false);
                window.getSelection()?.removeAllRanges();
              }}
              title="复制选中文本"
            >
              <Copy size={13} />
              复制
            </button>
            <button
              className="report-action-btn"
              onClick={() => {
                setShowPartialToolbar(false);
                setShowPartialRewritePanel(true);
              }}
              title="局部改写选中文本"
            >
              <Wand2 size={13} />
              改写
            </button>
          </div>
        </div>
     )}
      {showProfileList && profileDropdownPos && typeof document !== "undefined"
        ? createPortal(
            <div
              className="doc-rewrite-profile-portal doc-rewrite-select-dropdown is-portal"
              style={{
                position: "fixed",
                top: profileDropdownPos.top,
                left: profileDropdownPos.left,
                width: profileDropdownPos.width,
                maxHeight: profileDropdownPos.maxHeight,
                zIndex: 1000,
              }}
              role="listbox"
            >
              {profiles.length === 0 ? (
                <div className="doc-rewrite-select-empty">暂无保存的风格</div>
              ) : (
                profiles.map((p) => (
                  <div
                    key={p.id}
                    className={`doc-rewrite-select-item ${selectedProfileId === p.id ? "active" : ""}`}
                    onClick={() => handleSelectProfile(p)}
                  >
                    <span>{p.name}</span>
                    <button
                      className="icon-btn-sm danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProfile(p.id);
                      }}
                      title="删除"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
              {/* Footer: create a new style via reference upload */}
              <div
                className="doc-rewrite-select-item doc-rewrite-select-add"
                onClick={startNewStyle}
              >
                <Plus size={12} />
                <span>新增风格</span>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
