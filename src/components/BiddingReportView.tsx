"use client";

import { RUNTIME_STYLE } from "./bidding-report-styles";
import type {
  BiddingReviewResult,
  ReviewOpinion,
  RiskLevel,
  Section,
  Sensitivity,
} from "@/lib/bidding-report";

const RISK_CLASS: Record<RiskLevel, string> = {
  high: "risk-high",
  medium: "risk-medium",
  low: "risk-low",
};
const RISK_LABEL: Record<RiskLevel, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

interface Props {
  result: BiddingReviewResult;
}

export function BiddingReportView({ result }: Props) {
  const { cover, sections } = result;
  const metaLines: [string, string | undefined][] = [
    ["招标编号", cover.meta.tenderNo],
    ["招 标 人", cover.meta.tenderer],
    ["招标代理", cover.meta.agency],
    ["文件版本", cover.meta.version],
    ["报告生成日期", cover.meta.generatedDate],
  ];
  const visibleMeta = metaLines.filter(([, v]) => v);

  return (
    <div className="bidding-report-host">
      <style dangerouslySetInnerHTML={{ __html: RUNTIME_STYLE }} />
      <div className="bidding-report">
        <div className="page-wrapper">
          {/* Cover */}
          <div className="cover">
            <div className="cover-label">{cover.label}</div>
            <h1>
              {cover.title.split("\n").map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </h1>
            <div className="subtitle">{cover.subtitle}</div>
            <div className="cover-meta">
              {visibleMeta.map(([label, value], i) => (
                <div key={i}>
                  {label}：{value}
                </div>
              ))}
            </div>
          </div>

          {/* TOC */}
          <div className="toc">
            <h2>目 录</h2>
            <ul className="toc-list">
              {sections.map((s) => (
                <li key={s.numIndex}>
                  <span className="toc-title">{s.title}</span>
                  <span className="toc-dots"></span>
                </li>
              ))}
            </ul>
          </div>

          {/* Content */}
          <div className="content">
            {sections.map((s) => (
              <SectionBlock key={s.numIndex} section={s} />
            ))}
          </div>

          <div className="footer">
            招标文件合规性审查报告 &mdash; {cover.subtitle || cover.title} &mdash;{" "}
            {cover.meta.generatedDate}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: Section }) {
  return (
    <div className="section">
      <div className="section-header">
        <span className="section-num">{section.num}</span>
        <span className="section-title">{section.title}</span>
      </div>

      {section.infoTable && section.infoTable.length > 0 && (
        <table className="data-table">
          <tbody>
            {section.infoTable.map((kv, i) => (
              <tr key={i}>
                <th>{kv.label}</th>
                <td>{kv.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {section.intro &&
        section.intro
          .split(/\n{2,}/)
          .map((p, i) => <p key={`intro-${i}`}>{p.trim()}</p>)}

      {section.paragraphs &&
        section.paragraphs.map((p, i) => <p key={`para-${i}`}>{p}</p>)}

      {section.sensitivity && <SensitivityBlock sens={section.sensitivity} />}

      {section.opinions && section.opinions.length > 0 && (
        <>
          <div className="sub-header">审查意见</div>
          {section.opinions.map((o, i) => (
            <OpinionBlock key={i} opinion={o} />
          ))}
        </>
      )}
    </div>
  );
}

function OpinionBlock({ opinion }: { opinion: ReviewOpinion }) {
  return (
    <div className={RISK_CLASS[opinion.risk]}>
      <div className="risk-label">{RISK_LABEL[opinion.risk]}</div>
      <div className="opinion-title">{opinion.title}</div>
      <p>{opinion.description}</p>
      {(opinion.sourceRef || opinion.violatedLaw) && (
        <div className="source-ref">
          {opinion.sourceRef && (
            <>
              <strong>原文索引：</strong>
              {opinion.sourceRef}
            </>
          )}
          {opinion.sourceRef && opinion.violatedLaw && <br />}
          {opinion.violatedLaw && (
            <>
              <strong>涉嫌违反：</strong>
              {opinion.violatedLaw}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SensitivityBlock({ sens }: { sens: Sensitivity }) {
  if (!sens.rows.length && !sens.intro) return null;
  return (
    <div className="sensitivity-box">
      <div className="sens-title">报价敏感度分析：每1分对应的报价浮动值</div>
      {sens.intro && <p style={{ textIndent: 0 }}>{sens.intro}</p>}
      {sens.rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>情景</th>
              <th>投标人数量</th>
              <th>假设报价区间</th>
              <th>基准价（估算）</th>
              <th>1%对应金额</th>
              <th>高1分扣对应</th>
              <th>低1分扣对应</th>
            </tr>
          </thead>
          <tbody>
            {sens.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.scenario}</td>
                <td>{r.bidders}</td>
                <td>{r.priceRange}</td>
                <td>{r.baseline}</td>
                <td>{r.perPoint}</td>
                <td className="highlight-val">{r.highDeduct}</td>
                <td className="highlight-val">{r.lowDeduct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sens.formulaNotes.map((n, i) => (
        <p key={`f-${i}`} style={{ textIndent: 0 }}>
          {n}
        </p>
      ))}
      {sens.findings.length > 0 && (
        <p style={{ textIndent: 0 }}>
          <strong>关键发现：</strong>
        </p>
      )}
      {sens.findings.map((f, i) => (
        <p key={`fd-${i}`} style={{ textIndent: 0 }}>
          {i + 1}. {f}
        </p>
      ))}
    </div>
  );
}
