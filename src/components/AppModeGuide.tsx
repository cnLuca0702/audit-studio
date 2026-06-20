"use client";

import { useLayoutEffect, useRef } from "react";

/** 竖版示意 — 应用模式：侧栏选应用 + 固化审计技能 */
function IllustrationAppMode() {
  return (
    <svg viewBox="0 0 88 192" className="app-guide-illus" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect x="4" y="4" width="80" height="184" rx="10" fill="#fff" stroke="#e0e0e0" />
      <rect x="4" y="4" width="80" height="20" rx="10" fill="#e8e8e8" />
      <rect x="4" y="16" width="80" height="8" fill="#e8e8e8" />
      <rect x="10" y="10" width="18" height="8" rx="3" fill="#fff" stroke="#d0d0d0" />
      <rect x="32" y="11" width="16" height="6" rx="2" fill="#ddd" opacity="0.8" />
      <rect x="52" y="11" width="16" height="6" rx="2" fill="#ddd" opacity="0.5" />
      <rect x="10" y="28" width="22" height="152" rx="4" fill="#ebebeb" />
      <rect x="14" y="36" width="14" height="5" rx="1.5" fill="#3b82f6" />
      <rect x="14" y="46" width="14" height="4" rx="1" fill="#d8d8d8" />
      <rect x="14" y="54" width="14" height="4" rx="1" fill="#d8d8d8" />
      <rect x="14" y="62" width="14" height="4" rx="1" fill="#c8dafb" />
      <rect x="14" y="70" width="14" height="4" rx="1" fill="#d8d8d8" />
      <rect x="14" y="78" width="14" height="4" rx="1" fill="#d8d8d8" />
      <rect x="36" y="28" width="44" height="152" rx="4" fill="#fafafa" stroke="#e8e8e8" />
      <rect x="42" y="38" width="24" height="5" rx="1.5" fill="#333" opacity="0.12" />
      <rect x="42" y="50" width="32" height="3" rx="1" fill="#e0e0e0" />
      <rect x="42" y="58" width="28" height="3" rx="1" fill="#e8e8e8" />
      <rect x="42" y="66" width="30" height="3" rx="1" fill="#e8e8e8" />
      <rect x="42" y="78" width="14" height="16" rx="3" fill="#eff6ff" stroke="#93c5fd" />
      <rect x="60" y="78" width="14" height="16" rx="3" fill="#f0fdf4" stroke="#86efac" />
      <rect x="42" y="100" width="32" height="14" rx="3" fill="#eff6ff" stroke="#bfdbfe" />
      <path d="M48 107h8M52 103v8" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <rect x="42" y="122" width="32" height="6" rx="3" fill="#3b82f6" opacity="0.15" />
      <path d="M28 168h-8" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M22 168l-3-2.5v5z" fill="#3b82f6" />
    </svg>
  );
}

/** 竖版示意 — 智能模式：自由对话 */
function IllustrationAgentMode() {
  return (
    <svg viewBox="0 0 88 192" className="app-guide-illus" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect x="4" y="4" width="80" height="184" rx="10" fill="#fff" stroke="#e0e0e0" />
      <rect x="4" y="4" width="80" height="20" rx="10" fill="#e8e8e8" />
      <rect x="4" y="16" width="80" height="8" fill="#e8e8e8" />
      <rect x="10" y="11" width="16" height="6" rx="2" fill="#ddd" opacity="0.5" />
      <rect x="32" y="10" width="18" height="8" rx="3" fill="#fff" stroke="#d0d0d0" />
      <rect x="54" y="11" width="16" height="6" rx="2" fill="#ddd" opacity="0.5" />
      <rect x="12" y="32" width="38" height="22" rx="6" fill="#f0f0f0" />
      <rect x="18" y="40" width="22" height="2.5" rx="1" fill="#ccc" />
      <rect x="18" y="46" width="16" height="2.5" rx="1" fill="#ddd" />
      <rect x="38" y="62" width="40" height="28" rx="6" fill="#eff6ff" stroke="#bfdbfe" />
      <rect x="44" y="70" width="26" height="2.5" rx="1" fill="#93c5fd" />
      <rect x="44" y="76" width="20" height="2.5" rx="1" fill="#dbeafe" />
      <rect x="44" y="82" width="24" height="2.5" rx="1" fill="#dbeafe" />
      <rect x="12" y="98" width="34" height="18" rx="6" fill="#f0f0f0" />
      <rect x="18" y="106" width="20" height="2.5" rx="1" fill="#ccc" />
      <rect x="10" y="128" width="68" height="8" rx="2" fill="#fafafa" stroke="#e8e8e8" strokeDasharray="2 2" />
      <rect x="10" y="140" width="44" height="8" rx="2" fill="#fafafa" stroke="#e8e8e8" />
      <rect x="10" y="154" width="68" height="22" rx="8" fill="#fff" stroke="#e0e0e0" />
      <rect x="16" y="164" width="40" height="3" rx="1" fill="#e8e8e8" />
      <circle cx="68" cy="165" r="7" fill="#333" />
      <path d="M65 165h6M68 162v6" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
      <circle cx="44" cy="118" r="8" fill="#3b82f6" opacity="0.12" />
      <path d="M44 113v10M39 118h10" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** 竖版示意 — 开发模式：自研技能 */
function IllustrationDevMode() {
  return (
    <svg viewBox="0 0 88 192" className="app-guide-illus" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect x="4" y="4" width="80" height="184" rx="10" fill="#fff" stroke="#e0e0e0" />
      <rect x="4" y="4" width="80" height="20" rx="10" fill="#e8e8e8" />
      <rect x="4" y="16" width="80" height="8" fill="#e8e8e8" />
      <rect x="10" y="11" width="16" height="6" rx="2" fill="#ddd" opacity="0.5" />
      <rect x="32" y="11" width="16" height="6" rx="2" fill="#ddd" opacity="0.5" />
      <rect x="54" y="10" width="18" height="8" rx="3" fill="#fff" stroke="#d0d0d0" />
      <rect x="10" y="28" width="68" height="148" rx="4" fill="#f5f5f5" stroke="#e8e8e8" />
      <rect x="16" y="36" width="20" height="4" rx="1" fill="#3b82f6" opacity="0.7" />
      <rect x="40" y="36" width="28" height="4" rx="1" fill="#e0e0e0" />
      <rect x="16" y="48" width="32" height="3" rx="1" fill="#d8d8d8" />
      <rect x="16" y="56" width="56" height="40" rx="3" fill="#fff" stroke="#e0e0e0" />
      <rect x="20" y="62" width="16" height="2" rx="0.5" fill="#999" />
      <rect x="38" y="62" width="20" height="2" rx="0.5" fill="#3b82f6" opacity="0.6" />
      <rect x="20" y="68" width="24" height="2" rx="0.5" fill="#bbb" />
      <rect x="20" y="74" width="18" height="2" rx="0.5" fill="#ccc" />
      <rect x="20" y="80" width="30" height="2" rx="0.5" fill="#ccc" />
      <rect x="20" y="86" width="22" height="2" rx="0.5" fill="#3b82f6" opacity="0.4" />
      <circle cx="24" cy="108" r="4" fill="#3b82f6" opacity="0.2" stroke="#3b82f6" />
      <line x1="28" y1="108" x2="40" y2="108" stroke="#3b82f6" strokeWidth="1" opacity="0.4" />
      <circle cx="44" cy="108" r="4" fill="#3b82f6" opacity="0.35" stroke="#3b82f6" />
      <line x1="48" y1="108" x2="60" y2="108" stroke="#3b82f6" strokeWidth="1" opacity="0.4" />
      <circle cx="64" cy="108" r="4" fill="#3b82f6" stroke="#3b82f6" />
      <rect x="16" y="118" width="56" height="24" rx="3" fill="#fff" stroke="#e0e0e0" />
      <path d="M28 130l4 4 8-10" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="42" y="128" width="24" height="2" rx="1" fill="#ddd" />
      <rect x="42" y="134" width="18" height="2" rx="1" fill="#e8e8e8" />
      <rect x="16" y="150" width="56" height="18" rx="4" fill="#333" />
      <rect x="24" y="157" width="24" height="3" rx="1" fill="#fff" opacity="0.9" />
    </svg>
  );
}

const STEPS = [
  {
    step: "01",
    mode: "应用模式",
    tag: "新手起步",
    descLines: [
      "从左侧直接使用定制好的审计应用，",
      "按程序指引，轻松完成审计工作。",
    ],
    Illustration: IllustrationAppMode,
  },
  {
    step: "02",
    mode: "智能模式",
    tag: "自由发挥",
    descLines: [
      "与 AI 自由对话，上传文件、切换模型",
      "与工作目录，灵活处理各类审计事务。",
    ],
    Illustration: IllustrationAgentMode,
  },
  {
    step: "03",
    mode: "开发模式",
    tag: "火力全开",
    descLines: [
      "进入开发平台，自定义审计技能",
      "与工作流，扩展并部署专属能力。",
    ],
    Illustration: IllustrationDevMode,
  },
] as const;

function getTopSidebarAppEl(): HTMLElement | null {
  const scroll = document.querySelector("[data-sidebar-apps-scroll]");
  if (!scroll) return null;

  const apps = scroll.querySelectorAll<HTMLElement>("[data-sidebar-app]");
  if (apps.length === 0) return null;

  let topEl: HTMLElement | null = null;
  let topY = Infinity;
  apps.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0 && rect.top < topY) {
      topY = rect.top;
      topEl = el;
    }
  });
  return topEl;
}

function alignGuideWithTopSidebarApp(stepsEl: HTMLDivElement | null) {
  if (!stepsEl) return;
  if (window.matchMedia("(max-width: 720px)").matches) {
    stepsEl.style.transform = "";
    return;
  }

  stepsEl.style.transform = "none";

  const anchor = getTopSidebarAppEl();
  const hint = stepsEl.querySelector(".app-mode-guide-hint");
  if (!anchor || !hint) {
    stepsEl.style.transform = "";
    return;
  }

  const anchorRect = anchor.getBoundingClientRect();
  const hintRect = hint.getBoundingClientRect();
  if (anchorRect.height === 0 || hintRect.height === 0) {
    stepsEl.style.transform = "";
    return;
  }

  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  const hintCenterY = hintRect.top + hintRect.height / 2;
  stepsEl.style.transform = `translateY(${anchorCenterY - hintCenterY}px)`;
}

export function AppModeGuide() {
  const stepsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const stepsEl = stepsRef.current;
    if (!stepsEl) return;

    const realign = () => alignGuideWithTopSidebarApp(stepsEl);

    realign();

    window.addEventListener("resize", realign);
    const sidebarScroll = document.querySelector("[data-sidebar-apps-scroll]");
    sidebarScroll?.addEventListener("scroll", realign, { passive: true });

    const ro = new ResizeObserver(realign);
    ro.observe(stepsEl);
    if (sidebarScroll) ro.observe(sidebarScroll);

    const mo = new MutationObserver(realign);
    if (sidebarScroll) {
      mo.observe(sidebarScroll, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener("resize", realign);
      sidebarScroll?.removeEventListener("scroll", realign);
      ro.disconnect();
      mo.disconnect();
      stepsEl.style.transform = "";
    };
  }, []);

  return (
    <div className="app-mode-guide">
      <div className="app-mode-guide-body">
        <div ref={stepsRef} className="app-mode-guide-steps">
          <aside className="app-mode-guide-hint" role="note">
            <span className="app-mode-guide-hint-label">
              <span className="app-mode-guide-hint-label-arrow" aria-hidden>←</span>
              <span className="app-mode-guide-hint-label-text">START</span>
            </span>
            <span className="app-mode-guide-hint-text">左侧选应用开始</span>
          </aside>

          {STEPS.map((item) => (
            <article key={item.step} className="app-mode-guide-step">
              <div className="app-mode-guide-step-head">
                <span className="app-mode-guide-step-num">{item.step}</span>
                <span className="app-mode-guide-step-tag">{item.tag}</span>
              </div>
              <div className="app-guide-illus-wrap">
                <item.Illustration />
              </div>
              <h3 className="app-mode-guide-step-mode">{item.mode}</h3>
              <p className="app-mode-guide-step-desc">
                {item.descLines.map((line) => (
                  <span key={line} className="app-mode-guide-step-desc-line">
                    {line}
                  </span>
                ))}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
