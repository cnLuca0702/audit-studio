#!/usr/bin/env python3
"""DOCX 修订包级验证（仅 Python 标准库）。

用法:
  python3 scripts/validate_docx_revisions.py FILE.docx --before before.txt --after after.txt [--op-id ID]

对实际生成的包独立执行：
1. 解析 word/document.xml 的 w:ins / w:del（文字级）与段落标记修订（w:pPr/w:rPr/w:ins|del）；
2. 按修订 ID 执行“接受本次修订”与“拒绝本次修订”（含段落标记合并规则），
   段落文本以 "\\n" 连接，结果必须分别精确等于 after / before；
3. 分项检查：修订 ID 唯一性、自定义属性（操作 UUID/修订 ID 清单/作者/时间）、
   ZIP 完整性、内容类型、关系目标存在、样式（微软雅黑 12pt / 1.5 倍行距）、
   页面（A4 / 2.54cm 边距）、无编号与表格。

说明：这是 OOXML 包级验证，不等于 Word/WPS 渲染验证；
本应用不保留原始 DOCX 的复杂结构（表格/编号/既有修订），该项按“不支持”报告。
"""
import argparse
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"
VT_NS = "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"


def wq(tag: str) -> str:
    return f"{{{W}}}{tag}"


class Run:
    def __init__(self, text: str, wrap: str):
        self.text = text  # w:t 或 w:delText 的拼接
        self.wrap = wrap  # None | "ins" | "del"


class Para:
    def __init__(self):
        self.runs: list[Run] = []
        self.mark: tuple[str, str] | None = None  # ("ins"|"del", id)


def parse_paragraphs(document_xml: bytes):
    root = ET.fromstring(document_xml)
    body = root.find(wq("body"))
    paras: list[Para] = []
    if body is None:
        return paras, root
    for p in body.findall(wq("p")):
        para = Para()
        ppr = p.find(wq("pPr"))
        if ppr is not None:
            rpr = ppr.find(wq("rPr"))
            if rpr is not None:
                for kind in ("ins", "del"):
                    node = rpr.find(wq(kind))
                    if node is not None:
                        para.mark = (kind, node.get(wq("id"), ""))
                        break
        def walk(parent, wrap):
            for child in parent:
                tag = child.tag
                if tag == wq("ins"):
                    walk(child, "ins")
                elif tag == wq("del"):
                    walk(child, "del")
                elif tag == wq("r"):
                    text = "".join(
                        (t.text or "") for t in child if t.tag in (wq("t"), wq("delText"))
                    )
                    if text:
                        para.runs.append(Run(text, wrap))
                # 其他（bookmark 等）忽略
        walk(p, None)
        paras.append(para)
    return paras, root


def apply_revision(paras: list[Para], accept: bool) -> str:
    """accept=True/False 语义：True=接受插入并落实删除；False=拒绝插入并恢复删除。
    段落标记：接受删除的边界（合并），拒绝插入的边界（合并）；反之保留。"""
    out_texts: list[str] = []
    pending: list[str] = []  # 因边界修订被合并到下一段的文本

    def run_text(run: Run) -> str:
        if run.wrap == "ins":
            return run.text if accept else ""
        if run.wrap == "del":
            return run.text if not accept else ""
        return run.text

    for para in paras:
        text = "".join(run_text(r) for r in para.runs)
        if para.mark is None:
            out_texts.append("".join(pending) + text)
            pending = []
            continue
        kind, _id = para.mark
        drop_boundary = (kind == "del" and accept) or (kind == "ins" and not accept)
        if drop_boundary:
            # 边界被移除：本段文本并入下一段
            pending.append(text)
        else:
            out_texts.append("".join(pending) + text)
            pending = []
    if pending:
        # 文档末尾被合并的边界：仅当携带文本时保留（拒绝末尾插入的
        # 段落标记后不残留多余空段）
        tail = "".join(pending)
        if tail:
            out_texts.append(tail)
    return "\n".join(out_texts)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--before", required=True)
    ap.add_argument("--after", required=True)
    ap.add_argument("--op-id", default=None)
    args = ap.parse_args()

    before = open(args.before, encoding="utf-8").read().replace("\r\n", "\n").replace("\r", "\n")
    after = open(args.after, encoding="utf-8").read().replace("\r\n", "\n").replace("\r", "\n")

    checks: list[tuple[str, bool, str]] = []

    with zipfile.ZipFile(args.file) as z:
        bad = z.testzip()
        checks.append(("ZIP 完整性", bad is None, f"first bad={bad}"))
        names = set(z.namelist())
        document = z.read("word/document.xml")
        styles = z.read("word/styles.xml")
        rels = z.read("word/_rels/document.xml.rels")
        content_types = z.read("[Content_Types].xml").decode("utf-8")
        custom = z.read("docProps/custom.xml") if "docProps/custom.xml" in names else None

        # 关系目标存在
        rel_root = ET.fromstring(rels)
        missing_targets = []
        for rel in rel_root.findall(f"{{{REL_NS}}}Relationship"):
            if rel.get("TargetMode") == "External":
                continue
            target = rel.get("Target", "")
            if target.startswith("/"):
                path = target.lstrip("/")
            else:
                path = "word/" + target
            if path not in names:
                missing_targets.append(target)
        checks.append(("内部关系目标存在", not missing_targets, ",".join(missing_targets)))

        # 内容类型覆盖
        ct_root = ET.fromstring(content_types.encode("utf-8"))
        defaults = {d.get("Extension", "").lower() for d in ct_root.findall(f"{{{CT_NS}}}Default")}
        checks.append(("内容类型含 xml/rels", {"xml", "rels"}.issubset(defaults), ",".join(sorted(defaults))))
        checks.append(("内容类型声明 custom.xml", "docProps/custom.xml" in content_types, ""))

    paras, root = parse_paragraphs(document)

    # ── 核心往返：接受 = after，拒绝 = before ──
    accepted = apply_revision(paras, accept=True)
    rejected = apply_revision(paras, accept=False)
    checks.append(("接受全部修订 === after", accepted == after, f"len={len(accepted)}/{len(after)}"))
    checks.append(("拒绝全部修订 === before", rejected == before, f"len={len(rejected)}/{len(before)}"))
    if accepted != after:
        # 输出首个差异位置便于定位
        i = next((k for k in range(min(len(accepted), len(after))) if accepted[k] != after[k]), min(len(accepted), len(after)))
        checks.append(("  accept 差异定位", False, f"at {i}: {accepted[max(0,i-20):i+20]!r} vs {after[max(0,i-20):i+20]!r}"))
    if rejected != before:
        i = next((k for k in range(min(len(rejected), len(before))) if rejected[k] != before[k]), min(len(rejected), len(before)))
        checks.append(("  reject 差异定位", False, f"at {i}: {rejected[max(0,i-20):i+20]!r} vs {before[max(0,i-20):i+20]!r}"))

    # ── 修订 ID 唯一性与清单 ──
    all_ids: list[str] = []
    for kind in ("ins", "del"):
        for node in root.iter(wq(kind)):
            all_ids.append(node.get(wq("id"), ""))
    dup = {i for i in all_ids if all_ids.count(i) > 1}
    checks.append(("修订 w:id 唯一", not dup and all(i for i in all_ids), f"count={len(all_ids)} dup={sorted(dup)}"))
    checks.append(("修订 w:id 为整数", all(re.fullmatch(r"\d+", i) for i in all_ids), ""))

    # 自定义属性
    if custom is None:
        checks.append(("自定义属性存在", False, "docProps/custom.xml 缺失"))
    else:
        cp = ET.fromstring(custom)
        props = {}
        for prop in cp.findall(f"{{{CP_NS}}}property"):
            name = prop.get("name", "")
            val = prop.find(f"{{{VT_NS}}}lpwstr")
            props[name] = val.text if val is not None else ""
        if args.op_id:
            checks.append(("操作 UUID 记录", props.get("rewriteOperationId") == args.op_id, props.get("rewriteOperationId", "")))
        declared = props.get("revisionIds", "")
        declared_set = {i for i in declared.split(",") if i}
        checks.append(("修订 ID 清单与文档一致", declared_set == set(all_ids), f"declared={len(declared_set)} actual={len(set(all_ids))}"))
        checks.append(("操作元数据齐全", all(k in props for k in ("rewriteOperationKind", "rewriteOperationAt", "rewriteOperationSummary", "revisionAuthor")), ",".join(sorted(props))))

    # 版式：页面与默认样式
    sect = root.find(f".//{wq('body')}/{wq('sectPr')}")
    if sect is None:
        checks.append(("页面设置存在", False, ""))
    else:
        pgsz = sect.find(wq("pgSz"))
        pgmar = sect.find(wq("pgMar"))
        ok_size = pgsz is not None and pgsz.get(wq("w")) == "11906" and pgsz.get(wq("h")) == "16838"
        ok_mar = pgmar is not None and all(pgmar.get(wq(k)) == "1440" for k in ("top", "right", "bottom", "left"))
        checks.append(("A4 页面 + 2.54cm 边距", ok_size and ok_mar, ""))

    styles_root = ET.fromstring(styles)
    rfonts = styles_root.find(f".//{wq('docDefaults')}/{wq('rPrDefault')}/{wq('rPr')}/{wq('rFonts')}")
    sz = styles_root.find(f".//{wq('docDefaults')}/{wq('rPrDefault')}/{wq('rPr')}/{wq('sz')}")
    spacing = styles_root.find(f".//{wq('docDefaults')}/{wq('pPrDefault')}/{wq('pPr')}/{wq('spacing')}")
    font_ok = rfonts is not None and "Microsoft YaHei" in (rfonts.get(wq("ascii")) or "") + (rfonts.get(wq("eastAsia")) or "")
    size_ok = sz is not None and sz.get(wq("val")) == "24"
    line_ok = spacing is not None and spacing.get(wq("line")) == "360"
    checks.append(("默认字体微软雅黑 12pt", font_ok and size_ok, ""))
    checks.append(("默认 1.5 倍行距", line_ok, ""))

    # 范围检查：不出现编号/表格（本应用仅支持纯文本排版）
    has_tbl = root.find(f".//{wq('tbl')}") is not None
    has_numpr = root.find(f".//{wq('numPr')}") is not None
    checks.append(("无表格（纯文本排版）", not has_tbl, ""))
    checks.append(("无自动编号（纯文本排版）", not has_numpr, ""))

    ok_count = sum(1 for _, ok, _ in checks if ok)
    print(f"===== DOCX 修订包验证：{ok_count}/{len(checks)} 通过 =====")
    for name, ok, detail in checks:
        mark = "PASS" if ok else "FAIL"
        print(f"{mark}  {name}" + (f" — {detail}" if detail else ""))
    print("范围声明: 原始上传文档的复杂结构（表格/编号/既有修订/原排版）不在保留范围内——不支持，未验证。")
    print("说明: 本验证为 OOXML 包级检查，不等同于 Word/WPS 实际渲染验证。")
    return 0 if ok_count == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
