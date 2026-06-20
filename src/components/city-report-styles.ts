/**
 * City research report template styles, in two flavours.
 *
 * - STANDALONE_STYLE: the original A4 template CSS verbatim (with @page,
 *   *{margin:0}, @media print). Used when exporting a self-contained HTML
 *   file that should look exactly like resource/Report_CityResearch.html.
 *
 * - RUNTIME_STYLE: the same styles scoped under a `.city-report` container
 *   so they can be injected inline inside the app without polluting the rest
 *   of the UI. @page and global resets are adapted to the container.
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
.page-wrapper {
  max-width: 820px;
  margin: 0 auto;
  background: #fff;
  min-height: 100vh;
}
/* 封面 */
.cover {
  padding: 120px 60px 80px;
  border-bottom: 3px double #2c2c2c;
  text-align: center;
}
.cover-label {
  font-size: 12px;
  letter-spacing: 6px;
  text-transform: uppercase;
  color: #666;
  margin-bottom: 40px;
  font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
}
.cover h1 {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #111;
  line-height: 1.5;
  margin-bottom: 16px;
}
.cover .subtitle {
  font-size: 15px;
  color: #555;
  letter-spacing: 2px;
  margin-bottom: 60px;
}
.cover-meta {
  font-size: 13px;
  color: #888;
  font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
  line-height: 2.2;
}
/* 目录 */
.toc {
  padding: 60px;
  border-bottom: 1px solid #ddd;
}
.toc h2 {
  font-size: 16px;
  letter-spacing: 4px;
  color: #333;
  margin-bottom: 30px;
  font-weight: 600;
}
.toc-list {
  list-style: none;
  counter-reset: toc-counter;
}
.toc-list li {
  counter-increment: toc-counter;
  padding: 8px 0;
  border-bottom: 1px dotted #ccc;
  font-size: 14px;
  color: #333;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.toc-list li::before {
  content: counter(toc-counter) ".";
  margin-right: 12px;
  color: #666;
  font-weight: 600;
  min-width: 24px;
}
.toc-list li .toc-title { flex: 1; }
.toc-list li .toc-dots {
  flex: 1;
  border-bottom: 1px dotted #bbb;
  margin: 0 8px;
  min-width: 30px;
  align-self: center;
  margin-bottom: 4px;
}
/* 正文 */
.content { padding: 60px; }
.section { margin-bottom: 50px; }
.section-header {
  display: flex;
  align-items: baseline;
  margin-bottom: 24px;
  padding-bottom: 10px;
  border-bottom: 2px solid #2c2c2c;
}
.section-num {
  font-size: 28px;
  font-weight: 700;
  color: #2c2c2c;
  margin-right: 16px;
  font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
  line-height: 1;
}
.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  letter-spacing: 1px;
}
.section p {
  text-indent: 2em;
  margin-bottom: 16px;
  text-align: justify;
  color: #222;
}
/* 页脚 */
.footer {
  padding: 30px 60px;
  border-top: 1px solid #ddd;
  text-align: center;
  font-size: 11px;
  color: #aaa;
  font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
  letter-spacing: 1px;
}
@media print {
  body { background: #fff; }
  .page-wrapper { max-width: none; }
  .section { page-break-inside: avoid; }
}
@media (max-width: 600px) {
  .cover, .toc, .content { padding: 30px 24px; }
  .cover h1 { font-size: 22px; }
}
`;

export const RUNTIME_STYLE = `
.city-report * { margin: 0; padding: 0; box-sizing: border-box; }
.city-report {
  font-family: "Source Han Serif SC", "Noto Serif CJK SC", "SimSun", "Times New Roman", serif;
  color: #1a1a1a;
  line-height: 1.9;
  font-size: 15px;
  -webkit-font-smoothing: antialiased;
  background: #f5f4f0;
  padding: 24px 16px;
}
.city-report .page-wrapper {
  max-width: 820px;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08);
}
/* 封面 */
.city-report .cover {
  padding: 80px 60px 60px;
  border-bottom: 3px double #2c2c2c;
  text-align: center;
}
.city-report .cover-label {
  font-size: 12px;
  letter-spacing: 6px;
  text-transform: uppercase;
  color: #666;
  margin-bottom: 40px;
  font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
}
.city-report .cover h1 {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #111;
  line-height: 1.5;
  margin-bottom: 16px;
}
.city-report .cover .subtitle {
  font-size: 15px;
  color: #555;
  letter-spacing: 2px;
  margin-bottom: 60px;
}
.city-report .cover-meta {
  font-size: 13px;
  color: #888;
  font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
  line-height: 2.2;
}
/* 目录 */
.city-report .toc {
  padding: 60px;
  border-bottom: 1px solid #ddd;
}
.city-report .toc h2 {
  font-size: 16px;
  letter-spacing: 4px;
  color: #333;
  margin-bottom: 30px;
  font-weight: 600;
}
.city-report .toc-list {
  list-style: none;
  counter-reset: toc-counter;
}
.city-report .toc-list li {
  counter-increment: toc-counter;
  padding: 8px 0;
  border-bottom: 1px dotted #ccc;
  font-size: 14px;
  color: #333;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.city-report .toc-list li::before {
  content: counter(toc-counter) ".";
  margin-right: 12px;
  color: #666;
  font-weight: 600;
  min-width: 24px;
}
.city-report .toc-list li .toc-title { flex: 1; }
.city-report .toc-list li .toc-dots {
  flex: 1;
  border-bottom: 1px dotted #bbb;
  margin: 0 8px;
  min-width: 30px;
  align-self: center;
  margin-bottom: 4px;
}
/* 正文 */
.city-report .content { padding: 60px; }
.city-report .section { margin-bottom: 50px; }
.city-report .section-header {
  display: flex;
  align-items: baseline;
  margin-bottom: 24px;
  padding-bottom: 10px;
  border-bottom: 2px solid #2c2c2c;
}
.city-report .section-num {
  font-size: 28px;
  font-weight: 700;
  color: #2c2c2c;
  margin-right: 16px;
  font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
  line-height: 1;
}
.city-report .section-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  letter-spacing: 1px;
}
.city-report .section p {
  text-indent: 2em;
  margin-bottom: 16px;
  text-align: justify;
  color: #222;
  position: relative;
}
/* editable paragraph affordances (only meaningful in edit mode).
   The edit button lives OUTSIDE <p> (in a wrapper) so <p> keeps a single
   text node and selection offsets stay stable. */
.city-report .cr-para-wrap { position: relative; }
.city-report .cr-para-wrap:hover > p.cr-para {
  background: rgba(255, 248, 220, 0.5);
  box-shadow: 0 0 0 4px rgba(255, 248, 220, 0.5);
}
.city-report .cr-edit-btn {
  position: absolute;
  right: 6px;
  top: 4px;
  font-size: 11px;
  color: #888;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
}
.city-report .cr-para-wrap:hover .cr-edit-btn { opacity: 1; }
/* 页脚 */
.city-report .footer {
  padding: 30px 60px;
  border-top: 1px solid #ddd;
  text-align: center;
  font-size: 11px;
  color: #aaa;
  font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
  letter-spacing: 1px;
}
@media (max-width: 600px) {
  .city-report .cover, .city-report .toc, .city-report .content { padding: 30px 24px; }
  .city-report .cover h1 { font-size: 22px; }
}
`;
