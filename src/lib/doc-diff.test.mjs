/**
 * doc-diff 纯函数测试：node --test src/lib/doc-diff.test.mjs
 * 覆盖：无损重建、块/token 位置平铺、代理对安全、重复文本偏移、
 * 段落对齐、拆分/合并、低相似降级与超大输入有界性。
 * 说明：使用 .mjs 以便 node 直接 import ./doc-diff.ts（类型剥离），
 * 同时不进入 Next 项目的 tsconfig 检查范围。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDiffDocument,
  reconstructOld,
  reconstructNew,
  normalizeLineEndings,
  clampToCodePoints,
  DIFF_TOKEN_LIMIT,
} from "./doc-diff.ts";

function assertInvariants(oldRaw, newRaw) {
  const oldText = normalizeLineEndings(oldRaw);
  const newText = normalizeLineEndings(newRaw);
  const doc = buildDiffDocument(oldText, newText);
  assert.equal(reconstructOld(doc), oldText, "旧文可无损重建");
  assert.equal(reconstructNew(doc), newText, "新文可无损重建");

  // 块范围依序平铺两侧文本
  let oldPos = 0;
  let newPos = 0;
  for (const b of doc.blocks) {
    assert.equal(b.oldStart, oldPos, `块 ${b.id} 旧文起点连续`);
    assert.equal(b.newStart, newPos, `块 ${b.id} 新文起点连续`);
    assert.ok(b.oldEnd >= b.oldStart, `块 ${b.id} 旧文范围合法`);
    assert.ok(b.newEnd >= b.newStart, `块 ${b.id} 新文范围合法`);
    // token 在块内平铺对应侧
    let po = b.oldStart;
    let pn = b.newStart;
    for (const t of b.tokens) {
      if (t.type === "equal" || t.type === "delete") {
        assert.equal(t.oldStart, po, `token 旧文起点连续（${t.text}）`);
        assert.equal(t.oldEnd, po + t.text.length, "token 旧文长度一致");
        po = t.oldEnd;
      }
      if (t.type === "equal" || t.type === "insert") {
        assert.equal(t.newStart, pn, `token 新文起点连续（${t.text}）`);
        assert.equal(t.newEnd, pn + t.text.length, "token 新文长度一致");
        pn = t.newEnd;
      }
      // 代理对不被拆开
      const first = t.text.charCodeAt(0);
      const last = t.text.charCodeAt(t.text.length - 1);
      assert.ok(!(first >= 0xdc00 && first <= 0xdfff), "token 不以低位代理开头");
      assert.ok(!(last >= 0xd800 && last <= 0xdbff), "token 不以高位代理结尾");
    }
    assert.equal(po, b.oldEnd, `块 ${b.id} token 平铺旧文范围`);
    assert.equal(pn, b.newEnd, `块 ${b.id} token 平铺新文范围`);
    oldPos = b.oldEnd;
    newPos = b.newEnd;
  }
  assert.equal(oldPos, oldText.length, "块平铺覆盖全部旧文");
  assert.equal(newPos, newText.length, "块平铺覆盖全部新文");
  return doc;
}

test("完全一致：单 equal 块且无变化", () => {
  const doc = assertInvariants("第一段内容。\n第二段内容。", "第一段内容。\n第二段内容。");
  assert.equal(doc.blocks.length, 1);
  assert.deepEqual(doc.changeBlockIds, []);
});

test("空文本对空文本", () => {
  const doc = assertInvariants("", "");
  assert.equal(doc.blocks.length, 0);
});

test("仅新增：整块 insert 且旧文游标为 0", () => {
  const doc = assertInvariants("", "新增的整段文字。\n第二段。");
  assert.equal(doc.blocks.length, 1);
  assert.equal(doc.blocks[0].type, "insert");
  assert.equal(doc.blocks[0].oldStart, 0);
  assert.equal(doc.blocks[0].oldEnd, 0);
});

test("仅删除：整块 delete", () => {
  const doc = assertInvariants("将被整体删除的段落。", "");
  assert.equal(doc.blocks.length, 1);
  assert.equal(doc.blocks[0].type, "delete");
  assert.equal(doc.blocks[0].newStart, 0);
  assert.equal(doc.blocks[0].newEnd, 0);
});

test("中文短词替换：del/ins 各覆盖正确偏移", () => {
  const oldText = "本项目费用合计为壹佰万元整，审计期间为六十天。";
  const newText = "本项目费用合计为贰佰万元整，审计期间为六十天。";
  const doc = assertInvariants(oldText, newText);
  const block = doc.blocks.find((b) => b.type === "replace");
  assert.ok(block, "存在替换块");
  const delText = block.tokens.filter((t) => t.type === "delete").map((t) => t.text).join("");
  const insText = block.tokens.filter((t) => t.type === "insert").map((t) => t.text).join("");
  assert.ok(delText.includes("壹"), "删除侧包含旧词");
  assert.ok(insText.includes("贰"), "新增侧包含新词");
  for (const t of block.tokens) {
    if (t.type === "delete") assert.equal(oldText.slice(t.oldStart, t.oldEnd), t.text);
    if (t.type === "insert") assert.equal(newText.slice(t.newStart, t.newEnd), t.text);
  }
});

test("数字金额与百分比", () => {
  assertInvariants(
    "合同金额 1,200,000 元，占预算 35.6%，工期 90 天。",
    "合同金额 1,350,000 元，占预算 41.2%，工期 90 天。"
  );
});

test("标点与空格修改", () => {
  assertInvariants("第一部分:概况。 第二部分:范围;", "第一部分：概况。第二部分：范围；");
});

test("重复词句：只命中后一处出现", () => {
  const oldText = "审计报告已经完成。审计报告已经完成。审计报告已经归档。";
  const newText = "审计报告已经完成。审计报告已经完成。审计报告已经整理归档。";
  const doc = assertInvariants(oldText, newText);
  const block = doc.blocks.find((b) => b.type === "replace");
  const ins = block.tokens.find((t) => t.type === "insert");
  // 第三个“审计报告”之前的内容保持不变，插入必须发生在其后
  const thirdOccur = newText.indexOf("审计报告", newText.indexOf("审计报告") + 1);
  assert.ok(ins.newStart >= thirdOccur, "新增 token 偏移指向后一次出现");
  assert.equal(newText.slice(ins.newStart, ins.newEnd), ins.text);
});

test("重复段落不按文本值错配", () => {
  const para = "本条为重复段落，内容完全一致。\n";
  const oldText = para + para + "结尾段。";
  const newText = "开头新段落。\n" + para + para + "结尾段。";
  const doc = assertInvariants(oldText, newText);
  // 前方插入一段后，两个重复段落应作为 equal 锚点保留
  const types = doc.blocks.map((b) => b.type);
  assert.equal(types[0], "insert");
  assert.ok(types.filter((t) => t === "equal").length >= 2, "重复段落仍为锚点");
});

test("前方插入一段后后续对齐", () => {
  const oldText = "甲段内容。\n乙段内容。\n丙段内容。";
  const newText = "全新插入的第一段。\n甲段内容。\n乙段内容。\n丙段内容。";
  const doc = assertInvariants(oldText, newText);
  assert.equal(doc.blocks[0].type, "insert");
  const rest = doc.blocks.slice(1);
  assert.ok(rest.every((b) => b.type === "equal"), "插入之后各段保持 equal");
});

test("段落拆分：一段拆成两段", () => {
  const oldText = "引言部分。总体思路与实施路径说明。";
  const newText = "引言部分。\n总体思路与实施路径说明。";
  const doc = assertInvariants(oldText, newText);
  // 拆分表现为：配对段（或锚点差异）+ 新增段落标记，不再强制单块
  const changed = doc.blocks.filter((b) => b.type !== "equal");
  assert.ok(changed.length >= 1 && changed.length <= 3, `变化块数 ${changed.length} 应在 1..3`);
  const insBlocks = doc.blocks.filter((b) => b.type === "insert");
  assert.ok(insBlocks.length === 1, "存在一个新增段（段落标记插入）");
});

test("段落合并：两段合成一段", () => {
  const oldText = "质量控制在事前。\n质量控制在事中与事后。";
  const newText = "质量控制在事前。质量控制在事中与事后。";
  const doc = assertInvariants(oldText, newText);
  const changed = doc.blocks.filter((b) => b.type !== "equal");
  assert.ok(changed.length >= 1 && changed.length <= 3, `变化块数 ${changed.length} 应在 1..3`);
  const delBlocks = doc.blocks.filter((b) => b.type === "delete");
  assert.ok(delBlocks.length === 1, "存在一个删除段（段落标记删除）");
});

test("整段重写：低相似度段落保留整段增删", () => {
  const oldText = "本季度重点推进制度建设与流程优化工作。";
  const newText = "昨日天空晴朗，适合户外运动与郊游活动安排。";
  const doc = assertInvariants(oldText, newText);
  const delBlocks = doc.blocks.filter((b) => b.type === "delete");
  const insBlocks = doc.blocks.filter((b) => b.type === "insert");
  assert.equal(delBlocks.length, 1, "低相似度旧段整段删除");
  assert.equal(insBlocks.length, 1, "低相似度新段整段新增");
  assert.equal(delBlocks[0].coarse, true);
  assert.equal(insBlocks[0].coarse, true);
});

test("CRLF 与 CR 统一为 LF", () => {
  assert.equal(normalizeLineEndings("a\r\nb\rc\nd"), "a\nb\nc\nd");
  const doc = buildDiffDocument("第一行\r\n第二行\r", "第一行\n第二行\n");
  assert.deepEqual(doc.changeBlockIds, [], "仅换行符差异视为一致");
});

test("首尾空行与多换行", () => {
  assertInvariants("\n\n正文。\n\n", "正文。\n");
  assertInvariants("正文。\n\n\n附注。", "正文。\n附注。");
});

test("编号差异真实呈现（不抹平）", () => {
  const oldText = "1. 总体要求\n2. 实施步骤";
  const newText = "一、总体要求\n二、实施步骤";
  const doc = assertInvariants(oldText, newText);
  const allDel = doc.blocks.flatMap((b) => b.tokens).filter((t) => t.type === "delete").map((t) => t.text).join("");
  const allIns = doc.blocks.flatMap((b) => b.tokens).filter((t) => t.type === "insert").map((t) => t.text).join("");
  assert.ok(allDel.includes("1") && allDel.includes("2"), "旧编号呈现在删除侧");
  assert.ok(allIns.includes("一") && allIns.includes("二"), "新编号呈现在新增侧");
});

test("英文与混合文本", () => {
  assertInvariants(
    "The audit covered 12 departments and 3 subsidiaries.",
    "The audit covered 15 departments and 3 branch offices."
  );
});

test("字素/代理对边界（emoji）", () => {
  const oldText = "结论：通过审计 👍 待整改项 2 项。";
  const newText = "结论：通过审计 🎉 待整改项 0 项。";
  assertInvariants(oldText, newText);
});

test("clampToCodePoints 不拆代理对", () => {
  const s = "a👍b";
  // “👍” 占 index 1-2；在 2 处切开应回退到 1
  assert.deepEqual(clampToCodePoints(s, 2, 4), { start: 1, end: 4 });
  assert.deepEqual(clampToCodePoints(s, 0, 2), { start: 0, end: 3 });
  assert.deepEqual(clampToCodePoints(s, 0, 3), { start: 0, end: 3 });
});

test("超大单段触发有界降级且可重建", () => {
  const piece = "本段为压力测试内容，包含重复语句与常用词汇。";
  const oldText = piece.repeat(900);
  const newText = piece.repeat(899) + "结尾被完全改写为另一段毫不相干的文字内容用于触发低相似度路径。";
  const doc = assertInvariants(oldText, newText);
  const tokenized = doc.blocks.filter((b) => b.type === "replace" && !b.coarse);
  assert.ok(
    tokenized.every((b) => b.tokens.length <= DIFF_TOKEN_LIMIT * 2 + 8),
    "词级块 token 数有界"
  );
});

test("约 5 万字长文（大量重复段落）在时限内完成", () => {
  const para = "第五十条 采购人应当加强对政府采购活动的监督检查，发现违法违规行为及时处理并报告。\n";
  const oldText = para.repeat(560); // ~50k 字符
  const newText = "新增说明段落。\n" + para.repeat(559) + "修改后的末段内容，用于产生差异。\n";
  const t0 = Date.now();
  const doc = assertInvariants(oldText, newText);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 5000, `长文计算耗时 ${elapsed}ms 应小于 5s`);
  assert.ok(doc.blocks.length > 500);
});

// ═══════════════ 第二轮：分层 diff 深化 ═══════════════
import {
  initRewriteDocState,
  createPendingOp,
  acceptOp,
  rejectOp,
  SseReducer,
} from "./doc-rewrite-operation.ts";
import { DIFF_BUDGETS } from "./doc-diff.ts";

test("近似段落配对：连续多段改写按单调配对，不再整 gap 合并", () => {
  const oldText = "本项目费用合计为壹佰万元整，包含全部实施内容。\n项目实施总工期为九十个日历天，分三期推进。\n质量验收目标为合格等级并一次性通过。\n结尾段不变。";
  const newText = "本项目费用合计为贰佰万元整，包含全部实施内容。\n项目实施总工期为一百二十个日历天，分三期推进。\n质量验收目标为优良等级并一次性通过。\n结尾段不变。";
  const doc = assertInvariants(oldText, newText);
  // 三段近似改写应各自成对（replace 块），而不是一个整块
  const replaces = doc.blocks.filter((b) => b.type === "replace");
  assert.ok(replaces.length >= 3, `替换块数 ${replaces.length} >= 3`);
  // 每个替换块都是 1 旧行 ↔ 1 新行
  for (const b of replaces) {
    const oldSide = b.tokens.filter((t) => t.type === "equal" || t.type === "delete").map((t) => t.text).join("");
    const newSide = b.tokens.filter((t) => t.type === "equal" || t.type === "insert").map((t) => t.text).join("");
    assert.equal(oldSide.split("\n").filter(Boolean).length, 1, "替换块旧行数为 1");
    assert.equal(newSide.split("\n").filter(Boolean).length, 1, "替换块新行数为 1");
  }
});

test("短行大幅改写：低于配对阈值保留整段增删", () => {
  const doc = assertInvariants("工期九十天。", "工期一百二十天。");
  assert.ok(doc.blocks.some((b) => b.type === "delete"), "短行整段删除");
  assert.ok(doc.blocks.some((b) => b.type === "insert"), "短行整段新增");
});

test("前方近似插段：后续近似段不级联错位", () => {
  const tail = "后续第一段保持一致的内容。\n后续第二段也保持一致。";
  const oldText = `开头段原始表述。\n${tail}`;
  const newText = `插入的全新引导段落，与任何旧段都无相似度。\n开头段原始的表述。\n${tail}`;
  const doc = assertInvariants(oldText, newText);
  // 两个完全一致的尾段必须保持 equal 锚点
  const eqBlocks = doc.blocks.filter((b) => b.type === "equal");
  assert.ok(eqBlocks.length >= 2, "一致尾段保持锚点");
  assert.equal(doc.blocks[doc.blocks.length - 1].type, "equal");
});

test("句子锚点：同段多句仅一句变化时其余句保持 equal token", () => {
  const s1 = "第一句保持不变。";
  const s2 = "第二句保持不变。";
  const s4 = "第四句保持不变。";
  const oldText = `${s1}${s2}第三句原表述。${s4}`;
  const newText = `${s1}${s2}第三句全新表述且更长。${s4}`;
  const doc = assertInvariants(oldText, newText);
  const eqJoin = doc.blocks.flatMap((b) => b.tokens).filter((t) => t.type === "equal").map((t) => t.text).join("");
  assert.ok(eqJoin.includes(s1) && eqJoin.includes(s2) && eqJoin.includes(s4), "未变句子保留 equal token");
});

test("重复句：偏移命中正确出现", () => {
  const oldText = "说明段。重复句甲。说明段。重复句甲。说明段。";
  const newText = "说明段。重复句甲。说明段。重复句乙。说明段。";
  const doc = assertInvariants(oldText, newText);
  const ins = doc.blocks.flatMap((b) => b.tokens).find((t) => t.type === "insert" && t.text.includes("乙"));
  assert.ok(ins, "存在新增 token");
  const second = newText.indexOf("重复句", newText.indexOf("重复句") + 1);
  assert.ok(ins.newStart >= second, "新增偏移命中第二处");
  assert.equal(newText.slice(ins.newStart, ins.newEnd), ins.text);
});

test("空行与尾换行差异（新增/删除空段）", () => {
  const doc1 = assertInvariants("甲段。\n\n乙段。", "甲段。\n乙段。");
  assert.ok(doc1.blocks.some((b) => b.type === "delete"), "删除空段出现 delete 块");
  const doc2 = assertInvariants("甲段。\n乙段。", "甲段。\n\n乙段。");
  assert.ok(doc2.blocks.some((b) => b.type === "insert"), "新增空段出现 insert 块");
  const doc3 = assertInvariants("结尾无换行", "结尾无换行\n");
  assert.ok(doc3.blocks.some((b) => b.type !== "equal"), "尾换行差异可见");
});

test("编号文字差异真实呈现", () => {
  const oldText = "第一条 总则\n第二条 适用范围";
  const newText = "第1条 总则\n第2条 适用范围";
  const doc = assertInvariants(oldText, newText);
  const dels = doc.blocks.flatMap((b) => b.tokens).filter((t) => t.type === "delete").map((t) => t.text).join("");
  const inss = doc.blocks.flatMap((b) => b.tokens).filter((t) => t.type === "insert").map((t) => t.text).join("");
  assert.ok(dels.includes("一") && dels.includes("二"), "中文编号在删除侧");
  assert.ok(inss.includes("1") && inss.includes("2"), "数字编号在新增侧");
});

test("低相似段落保留整段增删（近似配对不误配）", () => {
  const oldText = "本季度重点推进制度建设工作。";
  const newText = "昨日午后天气晴朗宜出行。";
  const doc = assertInvariants(oldText, newText);
  assert.ok(doc.blocks.some((b) => b.type === "delete" && b.coarse), "整段删除");
  assert.ok(doc.blocks.some((b) => b.type === "insert" && b.coarse), "整段新增");
});

test("预算：句子数超限的配对段整段 del+ins", () => {
  const mk = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}第${i}句内容各不相同。`).join("");
  const oldText = mk(DIFF_BUDGETS.maxSentencesPerPair + 5, "旧");
  const newText = mk(DIFF_BUDGETS.maxSentencesPerPair + 5, "新");
  const doc = assertInvariants(oldText, newText);
  // 超预算 → 整段 del+ins（coarse 块）；词级 token 数不超出预算
  const coarse = doc.blocks.find((b) => b.coarse);
  assert.ok(coarse, "存在 coarse 回退块");
  const coarseDel = coarse.tokens.filter((t) => t.type === "delete").map((t) => t.text).join("");
  const coarseIns = coarse.tokens.filter((t) => t.type === "insert").map((t) => t.text).join("");
  assert.ok(coarseDel.includes("旧第0句") && coarseIns.includes("新第0句"), "整段文本精确保留");
  const wordTokens = doc.blocks.filter((b) => !b.coarse && b.type === "replace").reduce((n, b) => n + b.tokens.length, 0);
  assert.ok(wordTokens <= (DIFF_BUDGETS.maxWordsPerSegment * 2 + 16) * 4, `词级 token 有界: ${wordTokens}`);
});

test("预算：gap 行数超限时整块 coarse 且文本无损", () => {
  const line = (i) => `第${i}行内容各不相同，彼此无相似度，用于撑大区间。`;
  const oldText = Array.from({ length: DIFF_BUDGETS.maxGapLines + 10 }, (_, i) => line(i)).join("\n");
  const newText = Array.from({ length: DIFF_BUDGETS.maxGapLines + 10 }, (_, i) => `全新${i}` + line(i)).join("\n");
  const t0 = Date.now();
  const doc = assertInvariants(oldText, newText);
  assert.ok(Date.now() - t0 < 5000, "超限 gap 快速回退");
  assert.ok(doc.blocks.filter((b) => b.coarse).length >= 1, "存在 coarse 块");
});

test("emoji 与混合内容（分层路径）", () => {
  assertInvariants(
    "结论 👍 通过。金额 1,200 元。",
    "结论 🎉 通过。金额 1,350 元。"
  );
});

// ═══════════════ 操作状态 ═══════════════

test("操作状态：创建/接受/拒绝与过期 ID", () => {
  let s = initRewriteDocState("A");
  const r1 = createPendingOp(s, { kind: "full", before: "A", after: "B", range: null, summary: "第一轮", id: "op-1", createdAt: 1 });
  assert.ok(r1, "创建成功");
  s = r1.state;
  assert.equal(s.pending.id, "op-1");
  // 有待审核时不能再创建
  assert.equal(createPendingOp(s, { kind: "full", before: "B", after: "C", range: null, summary: "", id: "op-2" }), null);
  // 无变化不可创建
  assert.equal(createPendingOp(initRewriteDocState("A"), { kind: "full", before: "A", after: "A", range: null, summary: "" }), null);
  // 过期/重复 ID 无效
  assert.equal(acceptOp(s, "op-x"), s, "错误 ID 接受无效");
  assert.equal(rejectOp(s, "op-x"), s, "错误 ID 拒绝无效");
  // 接受 op-1 → confirmed=B
  const s2 = acceptOp(s, "op-1");
  assert.equal(s2.confirmed, "B");
  assert.equal(s2.pending, null);
  assert.equal(s2.acceptedOps, 1);
  // 再次接受同 ID 无效
  assert.equal(acceptOp(s2, "op-1"), s2);
  // 接受 A 后生成 B，拒绝 B 恢复 A
  const r2 = createPendingOp(s2, { kind: "partial", before: "B", after: "C", range: { start: 0, end: 1 }, summary: "改", id: "op-3" });
  const s3 = rejectOp(r2.state, "op-3");
  assert.equal(s3.confirmed, "B", "拒绝后恢复 before");
  assert.equal(s3.processedOps, 2);
});

// ═══════════════ SSE 归约器 ═══════════════

test("SSE：连续/分片/事件中切断/无尾换行", () => {
  const raw = 'data: {"content":"第一"}\n\ndata: {"content":"片"}\n\ndata: [DONE]\n\n';
  // 整体喂入
  const a = new SseReducer();
  a.push(raw);
  a.finish(true);
  assert.equal(a.content, "第一片");
  assert.equal(a.cleanFinish, true);
  // 逐字符喂入（任意分片边界）
  const b = new SseReducer();
  for (const ch of raw) b.push(ch);
  b.finish(true);
  assert.equal(b.content, "第一片");
  assert.equal(b.cleanFinish, true);
  // 无尾换行的最后一事件
  const c = new SseReducer();
  c.push('data: {"content":"尾"}\n\ndata: [DONE]');
  c.finish(true);
  assert.equal(c.content, "尾");
  assert.equal(c.sawDone, true);
  assert.equal(c.cleanFinish, true);
});

test("SSE：错误/警告/异常截断不构成干净完成", () => {
  const e1 = new SseReducer();
  e1.push('data: {"error":"模型错误"}\n\ndata: [DONE]\n\n');
  e1.finish(true);
  assert.equal(e1.cleanFinish, false);
  assert.equal(e1.error, "模型错误");

  const e2 = new SseReducer();
  e2.push('data: {"content":"部分"}\n\ndata: {"warning":"输出达到 token 上限"}\n\ndata: [DONE]\n\n');
  e2.finish(true);
  assert.equal(e2.cleanFinish, false);
  assert.equal(e2.content, "部分");

  const e3 = new SseReducer();
  e3.push('data: {"content":"部分"}\n\n');
  e3.finish(false); // 客户端读取异常（上游 EOF 未给出终止标记的兜底）
  assert.equal(e3.cleanFinish, false);
  assert.equal(e3.truncated, true);

  // 未收到 [DONE] 即使读取正常结束也不算干净完成
  const e4 = new SseReducer();
  e4.push('data: {"content":"无终止"}\n\n');
  e4.finish(true);
  assert.equal(e4.sawDone, false);
  assert.equal(e4.cleanFinish, false);
});
