/**
 * Bidding review report template styles, two flavours (mirrors city-report-styles):
 *
 * - STANDALONE_STYLE: the original A4 template CSS from
 *   public/招标文件审查报告-廉政教育基地.html (verbatim, with @page, *{}, @media print).
 *   Used when exporting a self-contained HTML file.
 *
 * - RUNTIME_STYLE: the same rules scoped under `.bidding-report` so they can be
 *   injected inline without polluting the rest of the app.
 */

export const STANDALONE_STYLE = `
@page { size: A4; margin: 2.5cm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Source Han Serif SC", "Noto Serif CJK SC", "SimSun", "Times New Roman", serif;
  color: #1a1a1a;
  background: #f5f4f0;
  line-height: 1.9;
  font-size: 15px;
  -webkit-font-smoothing: antialiased;
}
.page-wrapper { max-width: 860px; margin: 0 auto; background: #fff; min-height: 100vh; }
.cover { padding: 100px 60px 70px; border-bottom: 3px double #2c2c2c; text-align: center; }
.cover-label { font-size: 12px; letter-spacing: 6px; text-transform: uppercase; color: #666; margin-bottom: 36px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; }
.cover h1 { font-size: 28px; font-weight: 700; letter-spacing: 2px; color: #111; line-height: 1.5; margin-bottom: 14px; }
.cover .subtitle { font-size: 15px; color: #555; letter-spacing: 1.5px; margin-bottom: 50px; }
.cover-meta { font-size: 13px; color: #888; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; line-height: 2.2; }
.toc { padding: 50px 60px; border-bottom: 1px solid #ddd; }
.toc h2 { font-size: 16px; letter-spacing: 4px; color: #333; margin-bottom: 24px; font-weight: 600; }
.toc-list { list-style: none; counter-reset: toc-counter; }
.toc-list li { counter-increment: toc-counter; padding: 7px 0; border-bottom: 1px dotted #ccc; font-size: 14px; color: #333; display: flex; justify-content: space-between; align-items: baseline; }
.toc-list li::before { content: counter(toc-counter, cjk-ideographic) "、"; margin-right: 8px; color: #666; font-weight: 600; min-width: 32px; }
.toc-list li .toc-title { flex: 1; }
.toc-list li .toc-dots { flex: 1; border-bottom: 1px dotted #bbb; margin: 0 8px; min-width: 24px; align-self: center; margin-bottom: 4px; }
.content { padding: 50px 60px; }
.section { margin-bottom: 48px; }
.section-header { display: flex; align-items: baseline; margin-bottom: 20px; padding-bottom: 8px; border-bottom: 2px solid #2c2c2c; }
.section-num { font-size: 24px; font-weight: 700; color: #2c2c2c; margin-right: 14px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; line-height: 1; }
.section-title { font-size: 17px; font-weight: 600; color: #1a1a1a; letter-spacing: 1px; }
.section p { text-indent: 2em; margin-bottom: 14px; text-align: justify; color: #222; }
.sub-header { font-size: 15px; font-weight: 600; color: #333; margin: 22px 0 12px; padding-left: 12px; border-left: 3px solid #2c2c2c; }
.data-table { width: 100%; border-collapse: collapse; margin: 14px 0 20px; font-size: 14px; }
.data-table th, .data-table td { border: 1px solid #ccc; padding: 7px 11px; text-align: left; vertical-align: top; }
.data-table th { background: #f7f6f2; font-weight: 600; color: #333; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; font-size: 13px; width: 130px; }
.data-table td { color: #222; }
.risk-high { background: #fce8e8; border: 2px solid #c62828; border-left: 7px solid #c62828; padding: 18px 22px; margin: 18px 0; font-size: 14px; color: #1a0808; line-height: 1.9; }
.risk-high .risk-label { display: inline-block; font-size: 12px; font-weight: 700; color: #fff; background: #c62828; padding: 3px 12px; letter-spacing: 2px; margin-bottom: 10px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; }
.risk-medium { background: #fef3cd; border: 2px solid #d4a017; border-left: 7px solid #d4a017; padding: 18px 22px; margin: 18px 0; font-size: 14px; color: #1a1400; line-height: 1.9; }
.risk-medium .risk-label { display: inline-block; font-size: 12px; font-weight: 700; color: #fff; background: #d4a017; padding: 3px 12px; letter-spacing: 2px; margin-bottom: 10px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; }
.risk-low { background: #faf9f5; border: 1px solid #c9c3b5; border-left: 4px solid #8b8060; padding: 14px 18px; margin: 14px 0; font-size: 14px; color: #2a2418; line-height: 1.8; }
.risk-low .risk-label { display: inline-block; font-size: 12px; font-weight: 600; color: #666; background: #e8e5dc; padding: 2px 10px; letter-spacing: 2px; margin-bottom: 6px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; }
.opinion-title { font-weight: 700; margin-bottom: 4px; font-size: 14px; }
.source-ref { margin-top: 12px; padding: 10px 14px; background: rgba(0,0,0,0.04); border-left: 3px solid rgba(0,0,0,0.2); font-size: 13px; color: #555; line-height: 1.7; font-style: italic; }
.source-ref strong { font-style: normal; color: #333; font-size: 12px; letter-spacing: 1px; }
.sensitivity-box { background: #eef2f7; border: 2px solid #3a6ea5; padding: 22px 26px; margin: 22px 0; font-size: 14px; color: #0d1b2a; line-height: 1.9; }
.sensitivity-box .sens-title { font-size: 16px; font-weight: 700; color: #1a3a5c; margin-bottom: 12px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; letter-spacing: 1px; }
.sensitivity-box table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
.sensitivity-box th, .sensitivity-box td { border: 1px solid #8aa8c7; padding: 6px 10px; text-align: center; }
.sensitivity-box th { background: #d5e3f0; font-weight: 600; color: #1a3a5c; }
.sensitivity-box .highlight-val { font-weight: 700; color: #c62828; }
.footer { padding: 28px 60px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #aaa; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; letter-spacing: 1px; }
@media print {
  body { background: #fff; }
  .page-wrapper { max-width: none; }
  .section { page-break-inside: avoid; }
  .risk-high, .risk-medium, .risk-low, .sensitivity-box { break-inside: avoid; }
}
@media (max-width: 600px) {
  .cover, .toc, .content { padding: 28px 22px; }
  .cover h1 { font-size: 21px; }
}
`;

export const RUNTIME_STYLE = `
.bidding-report * { margin: 0; padding: 0; box-sizing: border-box; }
.bidding-report {
  font-family: "Source Han Serif SC", "Noto Serif CJK SC", "SimSun", "Times New Roman", serif;
  color: #1a1a1a;
  line-height: 1.9;
  font-size: 15px;
  -webkit-font-smoothing: antialiased;
  background: #f5f4f0;
  padding: 24px 16px;
}
.bidding-report .page-wrapper { max-width: 860px; margin: 0 auto; background: #fff; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
.bidding-report .cover { padding: 80px 60px 60px; border-bottom: 3px double #2c2c2c; text-align: center; }
.bidding-report .cover-label { font-size: 12px; letter-spacing: 6px; text-transform: uppercase; color: #666; margin-bottom: 36px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; }
.bidding-report .cover h1 { font-size: 28px; font-weight: 700; letter-spacing: 2px; color: #111; line-height: 1.5; margin-bottom: 14px; }
.bidding-report .cover .subtitle { font-size: 15px; color: #555; letter-spacing: 1.5px; margin-bottom: 50px; }
.bidding-report .cover-meta { font-size: 13px; color: #888; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; line-height: 2.2; }
.bidding-report .toc { padding: 50px 60px; border-bottom: 1px solid #ddd; }
.bidding-report .toc h2 { font-size: 16px; letter-spacing: 4px; color: #333; margin-bottom: 24px; font-weight: 600; }
.bidding-report .toc-list { list-style: none; counter-reset: toc-counter; }
.bidding-report .toc-list li { counter-increment: toc-counter; padding: 7px 0; border-bottom: 1px dotted #ccc; font-size: 14px; color: #333; display: flex; justify-content: space-between; align-items: baseline; }
.bidding-report .toc-list li::before { content: counter(toc-counter, cjk-ideographic) "、"; margin-right: 8px; color: #666; font-weight: 600; min-width: 32px; }
.bidding-report .toc-list li .toc-title { flex: 1; }
.bidding-report .toc-list li .toc-dots { flex: 1; border-bottom: 1px dotted #bbb; margin: 0 8px; min-width: 24px; align-self: center; margin-bottom: 4px; }
.bidding-report .content { padding: 50px 60px; }
.bidding-report .section { margin-bottom: 48px; }
.bidding-report .section-header { display: flex; align-items: baseline; margin-bottom: 20px; padding-bottom: 8px; border-bottom: 2px solid #2c2c2c; }
.bidding-report .section-num { font-size: 24px; font-weight: 700; color: #2c2c2c; margin-right: 14px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; line-height: 1; }
.bidding-report .section-title { font-size: 17px; font-weight: 600; color: #1a1a1a; letter-spacing: 1px; }
.bidding-report .section p { text-indent: 2em; margin-bottom: 14px; text-align: justify; color: #222; }
.bidding-report .sub-header { font-size: 15px; font-weight: 600; color: #333; margin: 22px 0 12px; padding-left: 12px; border-left: 3px solid #2c2c2c; }
.bidding-report .data-table { width: 100%; border-collapse: collapse; margin: 14px 0 20px; font-size: 14px; }
.bidding-report .data-table th, .bidding-report .data-table td { border: 1px solid #ccc; padding: 7px 11px; text-align: left; vertical-align: top; }
.bidding-report .data-table th { background: #f7f6f2; font-weight: 600; color: #333; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; font-size: 13px; width: 130px; }
.bidding-report .data-table td { color: #222; }
.bidding-report .risk-high { background: #fce8e8; border: 2px solid #c62828; border-left: 7px solid #c62828; padding: 18px 22px; margin: 18px 0; font-size: 14px; color: #1a0808; line-height: 1.9; }
.bidding-report .risk-high .risk-label { display: inline-block; font-size: 12px; font-weight: 700; color: #fff; background: #c62828; padding: 3px 12px; letter-spacing: 2px; margin-bottom: 10px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; }
.bidding-report .risk-medium { background: #fef3cd; border: 2px solid #d4a017; border-left: 7px solid #d4a017; padding: 18px 22px; margin: 18px 0; font-size: 14px; color: #1a1400; line-height: 1.9; }
.bidding-report .risk-medium .risk-label { display: inline-block; font-size: 12px; font-weight: 700; color: #fff; background: #d4a017; padding: 3px 12px; letter-spacing: 2px; margin-bottom: 10px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; }
.bidding-report .risk-low { background: #faf9f5; border: 1px solid #c9c3b5; border-left: 4px solid #8b8060; padding: 14px 18px; margin: 14px 0; font-size: 14px; color: #2a2418; line-height: 1.8; }
.bidding-report .risk-low .risk-label { display: inline-block; font-size: 12px; font-weight: 600; color: #666; background: #e8e5dc; padding: 2px 10px; letter-spacing: 2px; margin-bottom: 6px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; }
.bidding-report .opinion-title { font-weight: 700; margin-bottom: 4px; font-size: 14px; }
.bidding-report .source-ref { margin-top: 12px; padding: 10px 14px; background: rgba(0,0,0,0.04); border-left: 3px solid rgba(0,0,0,0.2); font-size: 13px; color: #555; line-height: 1.7; font-style: italic; }
.bidding-report .source-ref strong { font-style: normal; color: #333; font-size: 12px; letter-spacing: 1px; }
.bidding-report .sensitivity-box { background: #eef2f7; border: 2px solid #3a6ea5; padding: 22px 26px; margin: 22px 0; font-size: 14px; color: #0d1b2a; line-height: 1.9; }
.bidding-report .sensitivity-box .sens-title { font-size: 16px; font-weight: 700; color: #1a3a5c; margin-bottom: 12px; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; letter-spacing: 1px; }
.bidding-report .sensitivity-box table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
.bidding-report .sensitivity-box th, .bidding-report .sensitivity-box td { border: 1px solid #8aa8c7; padding: 6px 10px; text-align: center; }
.bidding-report .sensitivity-box th { background: #d5e3f0; font-weight: 600; color: #1a3a5c; }
.bidding-report .sensitivity-box .highlight-val { font-weight: 700; color: #c62828; }
.bidding-report .footer { padding: 28px 60px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #aaa; font-family: "Source Han Sans SC","Noto Sans CJK SC",sans-serif; letter-spacing: 1px; }
@media (max-width: 600px) {
  .bidding-report .cover, .bidding-report .toc, .bidding-report .content { padding: 28px 22px; }
  .bidding-report .cover h1 { font-size: 21px; }
}
`;
