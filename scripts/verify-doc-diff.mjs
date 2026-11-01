/**
 * 文档改写第二轮浏览器验收（Playwright）。
 *
 * 运行前置：
 *   node scripts/mock-llm-server.mjs          # 127.0.0.1:19999
 *   HOME=/tmp/docdiff-home npx next dev -p 8289  # 隔离实例（模型指向 mock 上游）
 * 运行：node scripts/verify-doc-diff.mjs
 *
 * - 全部使用真实应用路由（stream/download-docx/analyze-style/历史写入到隔离 HOME），
 *   模型上游为本地 mock，不消耗真实模型额度、不污染用户数据；
 * - 覆盖：待审核接受/拒绝、逐轮操作归属、局部改写（重复第二处）、撤销、
 *   无变化/异常 EOF/token 截断/HTTP 错误/停止与迟到结果不产生待审修订、
 *   真实修订 DOCX 下载与清稿下载、双栏/单栏、折叠与导航、选区边界、窄屏。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:8289";
const UPSTREAM = process.env.UPSTREAM_URL || "http://127.0.0.1:19999";
const SHOT_DIR = process.env.SHOT_DIR || "/tmp/doc-diff-shots";
const DL_DIR = path.join(SHOT_DIR, "downloads");
fs.mkdirSync(DL_DIR, { recursive: true });

// ── 测试文档（含重复短语、重复段、近似改写段、纯增/纯删段、低相似段、连续未变段） ──
const OLD_DOC = [
  "一、项目概况",
  "本项目为信息化系统建设项目，实施地点位于北京市海淀区。",
  "本项目为信息化系统建设项目，总预算为1280万元，实施周期为180天。",
  "本项目为信息化系统建设项目，总预算为1280万元，实施周期为180天。",
  "审计报告已完成归档；审计报告已提交审核；审计报告已公布。",
  "第一章术语定义与解释说明。",
  "第二章项目背景与建设目标。",
  "第三章总体架构与技术路线。",
  "第四章实施计划与里程碑安排。",
  "质量控制在事前；质量控制在事中与事后。",
  "第五章验收标准与质保责任。",
  "风险提示与应对措施由双方另行商定。",
  "以上条款自签署之日起生效。",
  "原有附注章节内容保留备查。",
  "本合同一式两份，双方各执一份。",
].join("\n");

// mock 上游 normal 模式输出的 NEW_DOC（见 mock-llm-server.mjs DOC_FIXTURE，须保持一致）
const NEW_DOC = [
  "一、项目总体概况",
  "本项目为信息化系统建设项目，实施地点位于北京市海淀区。",
  "本项目为信息化系统建设项目，总预算为1350万元，实施周期为120天。",
  "本项目为信息化系统建设项目，总预算为1350万元，实施周期为120天。",
  "审计报告已完成归档；审计报告已提交审核；审计报告后续将适时公布。",
  "第一章术语定义与解释说明。",
  "第二章项目背景与建设目标。",
  "第三章总体架构与技术路线。",
  "第四章实施计划与里程碑安排。",
  "质量控制在事前、事中与事后全过程。",
  "第五章验收标准与质保责任。",
  "沟通机制与例会安排按周度执行推进。",
  "以上条款自签署之日起生效。",
  "本合同一式两份，双方各执一份。",
  "本方案最终解释权归项目组所有。",
].join("\n");

const PARTIAL_BEFORE = "审计报告已完成归档；审计报告已提交审核；审计报告后续将适时公布。";
const PARTIAL_AFTER = PARTIAL_BEFORE.replace("审计报告已提交审核", "评审报告已提交审核");
const NEW_DOC_AFTER_PARTIAL = NEW_DOC.replace(PARTIAL_BEFORE, PARTIAL_AFTER);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

async function setMode(mode, hangMs) {
  await fetch(`${UPSTREAM}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, ...(hangMs ? { hangMs } : {}) }),
  });
}

/** 在 diff 视图中选中第 occurrence 处 phrase */
async function selectPhrase(page, phrase, occurrence = 1) {
  return page.evaluate(
    ({ phrase, occurrence }) => {
      const root = document.querySelector("[data-doc-diff-root]");
      if (!root) return { ok: false, why: "no-root" };
      const els = [...root.querySelectorAll("[data-new-start]")];
      let count = 0;
      for (const el of els) {
        const text = el.textContent || "";
        let from = 0;
        for (;;) {
          const idx = text.indexOf(phrase, from);
          if (idx === -1) break;
          count++;
          if (count === occurrence) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(el.firstChild, idx);
            range.setEnd(el.firstChild, idx + phrase.length);
            sel.removeAllRanges();
            sel.addRange(range);
            el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
            return { ok: true, total: count };
          }
          from = idx + 1;
        }
      }
      return { ok: false, why: `found=${count}` };
    },
    { phrase, occurrence }
  );
}

async function readClipboard(page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

async function startFullRewrite(page) {
  const again = page.locator(".doc-rewrite-rewrite-again-btn");
  if ((await again.count()) > 0) {
    await again.first().click();
    return;
  }
  const modify = page.locator("button", { hasText: "修改并重新改写" });
  if ((await modify.count()) > 0) {
    await modify.first().click();
    await page.waitForTimeout(200);
  }
  await page.locator(".doc-rewrite-primary-btn", { hasText: "开始改写" }).click();
}

async function runStyleAndDocFlow(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('[data-sidebar-app="rewrite"]').first().click();
  await page.locator(".doc-rewrite-select-btn").click();
  await page.locator(".doc-rewrite-select-item.doc-rewrite-select-add").click(); // 新增风格
  await page.locator(".doc-rewrite-mode-tab", { hasText: "粘贴文本" }).nth(0).click();
  await page.locator(".doc-rewrite-paste textarea").first().fill(
    "本参考文档用于分析文字风格，内容保持正式、简洁的书面表达。项目实施过程中应当严格控制质量，确保各项交付成果满足合同约定与相关规范要求，并按期完成验收工作。"
  );
  await page.locator(".doc-rewrite-confirm-btn").click();
  await page.locator(".doc-rewrite-primary-btn", { hasText: "分析文字风格" }).click();
  await page.locator(".doc-rewrite-profile-content").waitFor({ timeout: 15000 });
  await page.locator(".doc-rewrite-primary-btn", { hasText: "下一步" }).click();
  await page.locator(".doc-rewrite-mode-tab", { hasText: "粘贴文本" }).click();
  await page.locator(".doc-rewrite-paste textarea").fill(OLD_DOC);
  await page.locator(".doc-rewrite-confirm-btn").click();
}

async function main() {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), args:["--no-sandbox"]});
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`);
  });

  try {
    await setMode("normal");
    await runStyleAndDocFlow(page);

    // ═══ 1. 首轮整篇改写 → 待审核 ═══
    await page.locator(".doc-rewrite-primary-btn", { hasText: "开始改写" }).click();
    await page.locator(".doc-rewrite-review-bar").waitFor({ timeout: 30000 });
    check("改写完成进入待审核状态", true);
    await page.screenshot({ path: path.join(SHOT_DIR, "01-pending-review.png") });

    check("审核条显示整篇改写", (await page.locator(".doc-rewrite-review-meta").innerText()).includes("整篇改写"));
    check("接受/拒绝按钮可用",
      (await page.locator(".doc-rewrite-review-accept").isEnabled()) &&
      (await page.locator(".doc-rewrite-review-reject").isEnabled()));
    check("返回修改被禁用（先处理待审核）", await page.locator(".doc-rewrite-result-title .icon-btn").isDisabled());
    const headText = await page.locator(".doc-rewrite-diff-row-head").innerText();
    check("待审核视图标签为本次改写前/后", headText.includes("本次改写前") && headText.includes("本次改写后"), headText.replace(/\n/g, "|"));

    // 占位块与计数
    const placeholders = await page.locator(".doc-rewrite-diff-placeholder").count();
    check("纯增/纯删块显示占位", placeholders >= 2, `placeholders=${placeholders}`);
    const counter = (await page.locator("[data-testid=\"diff-counter\"]").innerText()).trim();
    check("变化计数显示", /变化/.test(counter), counter);

    // 待审核时选择文本 → 提示先处理
    const selPending = await selectPhrase(page, "审计报告", 1);
    check("待审核时构造选区", selPending.ok);
    await page.waitForTimeout(250);
    check("待审核时不出现改写工具栏", (await page.locator(".doc-rewrite-partial-toolbar").count()) === 0);
    const pendingHint = await page.locator(".doc-rewrite-diff-hintbar").innerText().catch(() => "");
    check("提示先接受或拒绝", pendingHint.includes("接受或拒绝"), `"${pendingHint}"`);
    await page.evaluate(() => window.getSelection().removeAllRanges());

    // ═══ 2. 下载本次修订 DOCX（真实接口） ═══
    const dlRev1 = page.waitForEvent("download", { timeout: 30000 });
    await page.locator(".doc-rewrite-result-actions button", { hasText: "下载本次修订" }).click();
    const rev1 = await dlRev1;
    await rev1.saveAs(path.join(DL_DIR, "revision-full.docx"));
    fs.writeFileSync(path.join(DL_DIR, "revision-full-before.txt"), OLD_DOC, "utf-8");
    fs.writeFileSync(path.join(DL_DIR, "revision-full-after.txt"), NEW_DOC, "utf-8");
    check("真实下载修订 DOCX（整篇）", rev1.suggestedFilename().startsWith("revision-"), rev1.suggestedFilename());

    // ═══ 3. 拒绝首轮 → 回到配置区，不污染正文 ═══
    await page.locator(".doc-rewrite-review-reject").click();
    await page.waitForTimeout(300);
    check("拒绝后待审核消失", (await page.locator(".doc-rewrite-review-bar").count()) === 0);
    check("拒绝后回到配置区", (await page.locator(".doc-rewrite-config, .doc-rewrite-collapsed-bar").count()) >= 1);
    await page.screenshot({ path: path.join(SHOT_DIR, "02-rejected-back-to-config.png") });

    // ═══ 4. 再次改写 → 接受 ═══
    await startFullRewrite(page);
    await page.locator(".doc-rewrite-review-bar").waitFor({ timeout: 30000 });
    // 视图切换与导航（在待审核视图上）
    await page.locator(".doc-rewrite-diff-tbtn", { hasText: "下一处" }).click();
    const counter2 = (await page.locator("[data-testid=\"diff-counter\"]").innerText()).trim();
    check("导航更新计数", counter !== counter2, `${counter} -> ${counter2}`);
    await page.locator(".doc-rewrite-diff-tbtn", { hasText: "单栏修订" }).click();
    await page.waitForTimeout(200);
    const counterInline = (await page.locator("[data-testid=\"diff-counter\"]").innerText()).trim();
    check("切换视图保留当前变化块", counterInline === counter2, `${counter2} vs ${counterInline}`);
    await page.locator(".doc-rewrite-diff-tbtn", { hasText: "双栏对比" }).click();

    // 折叠
    await page.locator(".doc-rewrite-diff-tbtn", { hasText: "仅显示变化" }).click();
    await page.waitForTimeout(200);
    const collapseRows = await page.locator(".doc-rewrite-diff-collapse").count();
    check("仅显示变化产生折叠行", collapseRows >= 1, `rows=${collapseRows}`);
    await page.locator(".doc-rewrite-diff-tbtn", { hasText: "仅显示变化" }).click(); // 关闭

    // 接受
    await page.locator(".doc-rewrite-review-accept").click();
    await page.waitForTimeout(500);
    check("接受后进入累计对比视图", (await page.locator(".doc-rewrite-diff-note").count()) === 1);
    const headText2 = await page.locator(".doc-rewrite-diff-row-head").innerText();
    check("累计对比标签为最初原文/当前正文", headText2.includes("最初原文") && headText2.includes("当前正文"), headText2.replace(/\n/g, "|"));
    await page.screenshot({ path: path.join(SHOT_DIR, "03-accepted-cumulative.png") });
    await page.locator(".doc-rewrite-result-actions button", { hasText: "复制" }).click();
    await page.waitForTimeout(300);
    check("接受后正文为改写后全文", (await readClipboard(page)) === NEW_DOC);
    check("撤销可用（1 次）", await page.locator(".doc-rewrite-result-actions button", { hasText: "撤销" }).isEnabled());

    // ═══ 5. 局部改写：重复词句第二处 → 待审核 → 接受 ═══
    const selRes = await selectPhrase(page, "审计报告", 2);
    check("定位重复词句第二处片段", selRes.ok, JSON.stringify(selRes));
    await page.locator(".doc-rewrite-partial-toolbar").waitFor({ timeout: 4000 });
    await page.locator(".doc-rewrite-partial-toolbar button", { hasText: "改写" }).click();
    const selectedShown = (await page.locator(".doc-rewrite-inline-rewrite-selected").innerText()).trim();
    check("局部改写面板显示精确选区", selectedShown === "审计报告", `"${selectedShown}"`);
    await page.locator(".doc-rewrite-inline-rewrite-input").fill("改为评审报告");
    await page.locator(".doc-rewrite-inline-rewrite-actions .doc-rewrite-confirm-btn").click();
    await page.locator(".doc-rewrite-review-bar").waitFor({ timeout: 30000 });
    check("局部改写进入待审核", (await page.locator(".doc-rewrite-review-meta").innerText()).includes("局部改写"));

    // 下载局部修订 DOCX（含文字级修订）
    const dlRev2 = page.waitForEvent("download", { timeout: 30000 });
    await page.locator(".doc-rewrite-result-actions button", { hasText: "下载本次修订" }).click();
    const rev2 = await dlRev2;
    await rev2.saveAs(path.join(DL_DIR, "revision-partial.docx"));
    fs.writeFileSync(path.join(DL_DIR, "revision-partial-before.txt"), NEW_DOC, "utf-8");
    fs.writeFileSync(path.join(DL_DIR, "revision-partial-after.txt"), NEW_DOC_AFTER_PARTIAL, "utf-8");
    check("真实下载修订 DOCX（局部）", rev2.suggestedFilename().startsWith("revision-"), rev2.suggestedFilename());

    await page.locator(".doc-rewrite-review-accept").click();
    await page.waitForTimeout(400);
    await page.locator(".doc-rewrite-result-actions button", { hasText: "复制" }).click();
    await page.waitForTimeout(300);
    check("重复文本只替换第二处出现", (await readClipboard(page)) === NEW_DOC_AFTER_PARTIAL);

    // ═══ 6. 撤销局部改写 ═══
    await page.locator(".doc-rewrite-result-actions button", { hasText: "撤销" }).first().click();
    await page.waitForTimeout(400);
    await page.locator(".doc-rewrite-result-actions button", { hasText: "复制" }).click();
    await page.waitForTimeout(300);
    check("撤销恢复上一已确认正文", (await readClipboard(page)) === NEW_DOC);

    // ═══ 7. 无变化：不产生待审修订 ═══
    await setMode("nochange");
    await startFullRewrite(page);
    await page.locator(".doc-rewrite-error", { hasText: "一致" }).waitFor({ timeout: 30000 });
    check("无变化提示且无待审核", (await page.locator(".doc-rewrite-review-bar").count()) === 0);
    await page.locator(".doc-rewrite-result-actions button", { hasText: "复制" }).click();
    await page.waitForTimeout(300);
    check("无变化不污染正文", (await readClipboard(page)) === NEW_DOC);

    // ═══ 8. 上游异常 EOF（真实路由）→ 无待审核 ═══
    await setMode("eof-abrupt");
    await startFullRewrite(page);
    await page.locator(".doc-rewrite-error", { hasText: "异常终止" }).waitFor({ timeout: 30000 });
    check("异常 EOF 提示且无待审核", (await page.locator(".doc-rewrite-review-bar").count()) === 0);
    check("异常 EOF 后累计对比仍在", (await page.locator(".doc-rewrite-diff-toolbar").count()) === 1);
    await page.screenshot({ path: path.join(SHOT_DIR, "04-eof-abrupt.png") });

    // ═══ 9. token 截断 → 无待审核 ═══
    await setMode("length");
    await startFullRewrite(page);
    await page.locator(".doc-rewrite-error", { hasText: "token" }).waitFor({ timeout: 30000 });
    check("截断警告且无待审核", (await page.locator(".doc-rewrite-review-bar").count()) === 0);

    // ═══ 10. HTTP 错误 → 无待审核 ═══
    await setMode("error");
    await startFullRewrite(page);
    await page.locator(".doc-rewrite-error", { hasText: "HTTP 500" }).waitFor({ timeout: 30000 });
    check("上游错误提示且无待审核", (await page.locator(".doc-rewrite-review-bar").count()) === 0);

    // ═══ 11. 停止与迟到结果 ═══
    await setMode("hang", 4000);
    await startFullRewrite(page);
    await page.locator(".doc-rewrite-result-title", { hasText: "正在改写" }).waitFor({ timeout: 8000 });
    await page.locator("button[title=\"停止改写\"]").click();
    await page.waitForTimeout(4500); // 等迟到响应窗口过去
    check("停止后无待审核（迟到结果被丢弃）", (await page.locator(".doc-rewrite-review-bar").count()) === 0);
    check("停止后正文未变", (await (async () => {
      await page.locator(".doc-rewrite-result-actions button", { hasText: "复制" }).click();
      await page.waitForTimeout(300);
      return readClipboard(page);
    })()) === NEW_DOC);
    await page.screenshot({ path: path.join(SHOT_DIR, "05-stopped.png") });

    // ═══ 12. 清稿下载（真实接口） ═══
    await setMode("normal");
    const dlClean = page.waitForEvent("download", { timeout: 30000 });
    await page.locator(".doc-rewrite-result-actions button", { hasText: "下载 docx" }).click();
    const clean = await dlClean;
    await clean.saveAs(path.join(DL_DIR, "clean.docx"));
    check("真实下载清稿 DOCX", clean.suggestedFilename().includes("rewritten-document"), clean.suggestedFilename());

    // ═══ 13. 选区边界：旧文侧 / 仅删除内容 / 跨折叠间隙 ═══
    await page.locator(".doc-rewrite-diff-tbtn", { hasText: "仅显示变化" }).click();
    await page.waitForTimeout(200);
    const foldedSel = await page.evaluate(() => {
      const root = document.querySelector("[data-doc-diff-root]");
      const marked = [...root.querySelectorAll("[data-new-start]")].filter((el) =>
        (el.textContent || "").startsWith("第一章术语定义与解释说明")
      );
      const far = [...root.querySelectorAll("[data-new-start]")].filter((el) =>
        (el.textContent || "").includes("质量控制在事前")
      );
      if (!marked[0] || !far[0]) return { ok: false };
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStartBefore(marked[0]);
      range.setEndAfter(far[0]);
      sel.removeAllRanges();
      sel.addRange(range);
      root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      return { ok: true };
    });
    await page.waitForTimeout(250);
    check("跨折叠间隙不出现工具栏", foldedSel.ok && (await page.locator(".doc-rewrite-partial-toolbar").count()) === 0);
    const foldHint = await page.locator(".doc-rewrite-diff-hintbar").innerText().catch(() => "");
    check("提示先展开折叠内容", foldHint.includes("折叠") || foldHint.includes("展开"), `"${foldHint}"`);
    await page.locator(".doc-rewrite-diff-tbtn", { hasText: "仅显示变化" }).click();

    await page.waitForTimeout(200);
    const oldSide = await page.evaluate(() => {
      const cell = document.querySelector('[data-diff-side="old"]');
      const el = cell.querySelector("del, span");
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      return true;
    });
    await page.waitForTimeout(250);
    check("旧文侧选区不出现工具栏", oldSide && (await page.locator(".doc-rewrite-partial-toolbar").count()) === 0);
    const oldHint = await page.locator(".doc-rewrite-diff-hintbar").innerText().catch(() => "");
    check("提示仅支持新文侧", oldHint.includes("新文本") || oldHint.includes("当前正文"), `"${oldHint}"`);
    await page.evaluate(() => window.getSelection().removeAllRanges());

    // ═══ 13b. 仅删除内容：不出现工具栏并提示 ═══
    await page.locator(".doc-rewrite-diff-tbtn", { hasText: "单栏修订" }).click();
    await page.waitForTimeout(200);
    const delOnly = await page.evaluate(() => {
      const root = document.querySelector("[data-doc-diff-root]");
      const dels = [...root.querySelectorAll("del.doc-rewrite-diff-del")].filter(
        (el) => el.textContent.includes("风险提示") || el.textContent.includes("原有附注")
      );
      if (!dels[0]) return false;
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(dels[0]);
      sel.removeAllRanges();
      sel.addRange(range);
      dels[0].dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      return true;
    });
    await page.waitForTimeout(250);
    check("仅选删除内容不出现工具栏", delOnly && (await page.locator(".doc-rewrite-partial-toolbar").count()) === 0);
    const delHint = await page.locator(".doc-rewrite-diff-hintbar").innerText().catch(() => "");
    check("提示删除内容不属于新文本", delHint.includes("删除线"), `"${delHint}"`);

    // ═══ 13c. 跨高亮节点 + 反向选区 ═══
    const crossInfo = await page.evaluate(() => {
      const root = document.querySelector("[data-doc-diff-root]");
      const locate = (phrase, occ) => {
        const els = [...root.querySelectorAll("[data-new-start]")];
        let count = 0;
        for (const el of els) {
          const t = el.textContent || "";
          let from = 0;
          for (;;) {
            const i = t.indexOf(phrase, from);
            if (i === -1) break;
            count++;
            if (count === occ) return { el, idx: i };
            from = i + 1;
          }
        }
        return null;
      };
      const A = locate("审计报告", 3);
      const B = locate("后续将适时", 1);
      if (!A || !B) return { ok: false };
      const sel = window.getSelection();
      // 反向拖选：焦点在前、锚点在后；起点取第三处“审计报告”的后两字
      sel.setBaseAndExtent(B.el.firstChild, 3, A.el.firstChild, A.idx + 2);
      B.el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      return { ok: true, selected: sel.toString() };
    });
    await page.locator(".doc-rewrite-partial-toolbar").waitFor({ timeout: 4000 });
    await page.locator(".doc-rewrite-partial-toolbar button", { hasText: "改写" }).click();
    const crossShown = (await page.locator(".doc-rewrite-inline-rewrite-selected").innerText().catch(() => null));
    check("跨节点反向选区映射为连续新文", crossInfo.ok && crossShown === "报告后续将", `selected="${crossInfo?.selected}" shown="${crossShown}"`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.locator(".doc-rewrite-diff-tbtn", { hasText: "双栏对比" }).click();
    await page.waitForTimeout(200);

    // ═══ 14. 视图偏好持久化 ═══
    await page.locator(".doc-rewrite-diff-tbtn", { hasText: "单栏修订" }).click();
    await page.waitForTimeout(300);
    const stored = await page.evaluate(() => localStorage.getItem("doc-rewrite-diff-view"));
    check("视图偏好写入 localStorage", stored === "inline", `got=${stored}`);

    // ═══ 15. 窄屏（切回双栏验证对齐块布局） ═══
    await page.locator(".doc-rewrite-diff-tbtn", { hasText: "双栏对比" }).click();
    await page.waitForTimeout(300);
    for (const w of [375, 768]) {
      await page.setViewportSize({ width: w, height: 820 });
      await page.waitForTimeout(300);
      const info = await page.evaluate(() => {
        const row = document.querySelector(".doc-rewrite-diff-row:not(.doc-rewrite-diff-row-head)");
        const cols = getComputedStyle(row).gridTemplateColumns.split(" ").filter(Boolean).length;
        const scroll = document.querySelector(".doc-rewrite-diff-scroll");
        const overflow = scroll ? scroll.scrollWidth - scroll.clientWidth : -1;
        const cells = row.querySelectorAll(":scope > .doc-rewrite-diff-cell");
        const stacked = cells.length === 2 && cells[0].getBoundingClientRect().bottom <= cells[1].getBoundingClientRect().top + 1;
        return { cols, overflow, stacked };
      });
      check(`${w}px 下同块上下排列`, info.cols === 1 && info.stacked, JSON.stringify(info));
      check(`${w}px 本功能容器无溢出`, info.overflow <= 1, `overflow=${info.overflow}px`);
      if (w === 375) await page.screenshot({ path: path.join(SHOT_DIR, "06-narrow-375.png") });
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // ═══ 16. 其他入口冒烟 ═══
    await page.locator('[data-sidebar-app="merge"]').first().click();
    await page.waitForTimeout(600);
    check("文档合并入口正常", (await page.locator(".doc-merge-container").count()) === 1);

    // ═══ 17. 控制台错误 ═══
    const noise = /favicon|React DevTools|Download the React|404|net::ERR|playwright|\.map/;
    const unexpected = consoleErrors.filter((e) => !noise.test(e));
    check("无意外控制台/页面错误", unexpected.length === 0, unexpected.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 浏览器验收：${results.length - failed.length}/${results.length} 通过 =====`);
  console.log(`下载文件目录：${DL_DIR}`);
  if (failed.length) {
    console.log("FAILED:");
    failed.forEach((f) => console.log(`  - ${f.name} ${f.detail}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exitCode = 2;
});
