#!/usr/bin/env python3
"""医療と社会のレファレンス のビルド（1本）。

使い方
  python3 build.py import   docs/ と source/ から data/*.json を作り直す
  python3 build.py          data/*.json から次の2つを作る
                              dist/index.html                 レファレンス本体（公開するのはこれだけ）
                              build/kyotsu-gakushu-web.html   共通学習ツールWeb版（単元のJSONから作り直したもの）
  python3 build.py check    上の2つを作り、Web版が source/ と1バイトも違わないことを確かめる

データの正本
  data/units.json    12単元・用語集・制約カード・問いなど（共通学習ツールWeb版のデータ。型は変えない）
  data/shelves.json  7棚と棚をまたぐ暦（docs/shelves/ の書き出しから作る。文は書き換えない）

外部のライブラリは使わない（Python 3 の標準だけ）。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DOCS = ROOT / "docs"
SHELF_DIR = DOCS / "shelves"
SOURCE_HTML = ROOT / "source" / "kyotsu-gakushu-web_v0.html"
DATA = ROOT / "data"
SRC = ROOT / "src"
DIST = ROOT / "dist"
BUILD = ROOT / "build"

APP_DATA_OPEN = '<script type="application/json" id="app-data">'

# ---------------------------------------------------------------------------
# 設計書から取る決まり（docs/design_v0.md）。ここに書くのは設計書にある値だけ
# ---------------------------------------------------------------------------
# 段（表紙の三段）。設計書「7つの棚の地図」とSTART_PROMPT「三段：これから＝棚6・7／制度と現場＝棚4・5／土台＝棚1・2・3」
BANDS = [
    {"id": "korekara", "name": "これから", "desc": "これから何が変わるか", "shelves": [6, 7]},
    {"id": "seido", "name": "制度と現場", "desc": "制度と、それが動く現場", "shelves": [4, 5]},
    {"id": "dodai", "name": "土台", "desc": "どの棚にも効く前提", "shelves": [1, 2, 3]},
]
# 12単元の持ち主の棚。設計書「棚ごとの中身」の降り先の列（単元を棚2・3・4に割り当てる）
UNIT_HOME = {2: [2, 6, 10], 3: [1, 7, 8, 9, 11, 12], 4: [3, 4, 5]}
# 新しく書く3単元。設計書「新規の3単元（医療と社会、病院経営の読み方、2040年の地域医療構想）」
NEW_UNITS = {1: "医療と社会", 5: "病院経営の読み方", 6: "2040年の地域医療構想"}
# 自分の現場の3欄。設計書「一目で分かる画面」とSTART_PROMPT
SITES = [
    {"id": "hosp", "name": "鏡野町国保病院"},
    {"id": "tomi", "name": "富診療所"},
    {"id": "clinic", "name": "継承クリニック"},
]
APP = {
    "name": "地域医療支援統合アプリ",
    "url": "https://claude.ai/artifact/MYSiYXX18B8yogk8eei1to",
    # 2026-11-11 に統合アプリ（v4.0-dev90）を読んだ結果。基礎編の項目へ直接飛ぶURL（#…）は見つからなかった
    "deep_link": False,
}
KYOTSU_URL = "https://claude.ai/artifact/NdFbeHqhDDxbqrWejV1X4K"


# ---------------------------------------------------------------------------
# Markdown（Claude Docs の書き出し）を、文を変えずに塊へ分ける
# ---------------------------------------------------------------------------
def split_row(line):
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def parse_blocks(lines):
    """段落・箇条書き・番号つき・表に分ける。文はそのまま残す。"""
    blocks, i = [], 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        if ln.lstrip().startswith("|"):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            cols, body = rows[0], [r for r in rows[1:] if not all(re.fullmatch(r":?-{3,}:?", c) for c in r)]
            blocks.append({"kind": "table", "columns": cols, "rows": body})
            continue
        if re.match(r"^- ", ln):
            items = []
            while i < len(lines) and re.match(r"^- ", lines[i]):
                items.append(lines[i][2:].strip())
                i += 1
            blocks.append({"kind": "bullets", "items": items})
            continue
        if re.match(r"^\d+\. ", ln):
            items = []
            while i < len(lines) and re.match(r"^\d+\. ", lines[i]):
                items.append(re.sub(r"^\d+\. ", "", lines[i]).strip())
                i += 1
            blocks.append({"kind": "numbered", "items": items})
            continue
        blocks.append({"kind": "para", "text": ln.strip()})
        i += 1
    return blocks


HEAD_RE = re.compile(r"^\*\*(.+?)\*\*(.*)$")


def parse_sections(lines):
    """「**見出し**」で始まる行ごとに分ける。見出しの後ろの文（：… や（…））は note に残す。"""
    secs, cur = [], None
    for ln in lines:
        m = HEAD_RE.match(ln)
        if m:
            note = m.group(2)
            text = ""
            if note.startswith("："):
                text, note = note[1:].strip(), ""
            cur = {"title": m.group(1), "note": note.strip(), "text": text, "lines": []}
            secs.append(cur)
        else:
            if cur is None:
                cur = {"title": "", "note": "", "text": "", "lines": []}
                secs.append(cur)
            cur["lines"].append(ln)
    for s in secs:
        s["blocks"] = parse_blocks(s.pop("lines"))
    return secs


def first_table(blocks):
    for b in blocks:
        if b["kind"] == "table":
            return b
    return None


def split_sections_by_h2(text):
    """# 見出し と ## 見出し で分ける。"""
    lines = text.split("\n")
    title, parts, cur = "", [], {"h2": None, "lines": []}
    for ln in lines:
        if ln.startswith("# ") and not title:
            title = ln[2:].strip()
            continue
        if ln.startswith("## "):
            parts.append(cur)
            cur = {"h2": ln[3:].strip(), "lines": []}
            continue
        cur["lines"].append(ln)
    parts.append(cur)
    return title, parts


def parse_date(s):
    m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", s)
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else ""


def split_top_level(s, sep="、"):
    """括弧の外の区切りだけで分ける。"""
    out, depth, buf = [], 0, ""
    for ch in s:
        if ch in "（(「":
            depth += 1
        elif ch in "）)」":
            depth -= 1
        if ch == sep and depth == 0:
            out.append(buf)
            buf = ""
        else:
            buf += ch
    out.append(buf)
    return [x.strip() for x in out if x.strip()]


def parse_down(text):
    """降り先の文から、単元の番号・統合アプリの項目名・新規単元を拾う（文は別に原文のまま残す）。"""
    units, app, extra, new_units = [], [], [], []
    for part in split_top_level(text, "。"):
        if part.startswith("共通学習ツール"):
            body = part[len("共通学習ツール"):].strip()
            for item in split_top_level(body):
                m = re.match(r"^(?:単元)?(\d{1,2})(?!\d)", item)
                if m:
                    units.append(int(m.group(1)))
                elif item.startswith("制約カード"):
                    extra.append("cards")
                elif item.startswith("用語集"):
                    extra.append("terms")
                else:
                    m2 = re.match(r"^新規単元「(.+?)」", item)
                    if m2:
                        new_units.append(m2.group(1))
        elif part.startswith("統合アプリ"):
            body = part[len("統合アプリ"):].strip()
            for item in split_top_level(body):
                name = re.sub(r"（.*$", "", item).strip()
                app.append({"name": name, "text": item})
        for m in re.finditer(r"新規単元「(.+?)」", part):
            if m.group(1) not in new_units:
                new_units.append(m.group(1))
    return units, app, extra, new_units


def figure_plans():
    """設計書「棚ごとの中身」の表から、一枚図で見せるもの・降り先の列を取る。"""
    text = (DOCS / "design_v0.md").read_text(encoding="utf-8")
    sec = text.split("## 棚ごとの中身", 1)[1].split("\n## ", 1)[0]
    rows = [split_row(l) for l in sec.split("\n") if l.startswith("| ") and not l.startswith("| ---")]
    out = {}
    for r in rows[1:]:
        m = re.match(r"^(\d) ", r[0])
        if m:
            out[int(m.group(1))] = {"plan": r[1], "design_down": r[2], "design_add": r[3]}
    return out


def import_shelf(path, plans):
    text = path.read_text(encoding="utf-8")
    title, parts = split_sections_by_h2(text)
    m = re.match(r"^棚(\d)\s+(.+)$", title)
    no, name = int(m.group(1)), m.group(2)
    main = parse_sections(parts[0]["lines"])
    tail = []  # ## の節のあとに来る 降り先・照合資料（棚4）
    topics = []
    for p in parts[1:]:
        secs = parse_sections(p["lines"])
        keep = [s for s in secs if s["title"] not in ("降り先", "この棚の照合に使った資料")]
        tail += [s for s in secs if s["title"] in ("降り先", "この棚の照合に使った資料")]
        topic = {"title": p["h2"], "summary": "", "blocks": []}
        for s in keep:
            if s["title"] == "一言で":
                topic["summary"] = s["text"]
                topic["blocks"] += s["blocks"]
            else:
                if s["title"]:
                    topic["blocks"].append({"kind": "head", "text": s["title"], "note": s["note"]})
                topic["blocks"] += s["blocks"]
        topics.append(topic)
    secs = main + tail
    by = {}
    order = []
    for s in secs:
        key = s["title"]
        order.append(key)
        by.setdefault(key, s)

    status_text = by["状態"]["text"]
    status = "照合済み" if status_text.startswith("照合済み") else ("仮" if status_text.startswith("仮") else "未作成")

    # 暦の節。棚4には「暦」がなく、「計画と報酬の周期」の表がその役をしている（文は変えず、暦の位置に見出しごと置く）
    cal_title = "暦" if "暦" in by else "計画と報酬の周期"
    # 全体像：「全体像」で始まる節から暦の前まで（棚7のU.E.N.O.Planの要点を含む）
    overview, on = [], False
    for s in secs:
        if s["title"].startswith("全体像"):
            on = True
        if s["title"] in (cal_title, "会議・交渉で使う"):
            on = False
        if on:
            overview.append({"title": s["title"], "note": s["note"], "text": s["text"], "blocks": s["blocks"]})

    cal = by[cal_title]
    nums = by["押さえる数字（枠）"]
    checks = []
    for b in by["自分の現場で確かめること"]["blocks"]:
        if b["kind"] == "numbered":
            for it in b["items"]:
                what, _, where = it.rpartition("：")
                checks.append({"what": what or it, "where": where if what else ""})
    neg = [it for b in by["会議・交渉で使う"]["blocks"] if b["kind"] == "bullets" for it in b["items"]]
    mis = [it for b in by["よくある誤解"]["blocks"] if b["kind"] == "numbered" for it in b["items"]]
    down = by["降り先"]["text"]
    units, app, extra, new_units = parse_down(down)
    if no in NEW_UNITS and NEW_UNITS[no] not in new_units:
        new_units.append(NEW_UNITS[no])
    band = next(b["id"] for b in BANDS if no in b["shelves"])
    plan = plans.get(no, {})
    return {
        "id": f"s{no}",
        "no": no,
        "band": band,
        "name": name,
        "summary": by["一言で"]["text"],
        "figure": {"status": "未作成", "svg": None, "claim": None, "plan": plan.get("plan", "")},
        "overview": overview,
        "numbers": {"columns": first_table(nums["blocks"])["columns"], "rows": first_table(nums["blocks"])["rows"],
                    "after": [b for b in nums["blocks"] if b["kind"] != "table"]},
        "calendar": {"title": cal_title, "note": cal["note"], "columns": first_table(cal["blocks"])["columns"],
                     "rows": first_table(cal["blocks"])["rows"],
                     "after": [b for b in cal["blocks"] if b["kind"] != "table"]},
        "negotiation": neg,
        "misconceptions": mis,
        "local_checks": checks,
        "topics": topics,
        "units": units,
        "home_units": UNIT_HOME.get(no, []),
        "extra_links": extra,
        "new_units": [{"name": n, "status": "未作成"} for n in new_units],
        "app_links": app,
        "down_text": down,
        "sources_text": by["この棚の照合に使った資料"]["text"],
        "status": status,
        "status_text": status_text,
        "checked_at": parse_date(status_text),
        "file": path.name,
    }


def import_guide(path):
    text = path.read_text(encoding="utf-8")
    title, parts = split_sections_by_h2(text)
    out = {"title": title, "sections": []}
    for p in parts:
        if p["h2"] is None:
            continue
        secs = parse_sections(p["lines"])
        blocks = []
        for s in secs:
            if s["title"]:
                blocks.append({"kind": "head", "text": s["title"], "note": s["note"], "inline": s["text"]})
            blocks += s["blocks"]
        out["sections"].append({"title": p["h2"], "blocks": blocks})
    # 暦の2表を取り出す
    cal = next(s for s in out["sections"] if s["title"] == "棚をまたぐ暦")
    tables = [b for b in cal["blocks"] if b["kind"] == "table"]
    heads = [b for b in cal["blocks"] if b["kind"] == "head"]
    out["calendar"] = {
        "lead": [b["text"] for b in cal["blocks"] if b["kind"] == "para"],
        "year": {"title": heads[0]["text"], "note": heads[0]["note"], **{k: tables[0][k] for k in ("columns", "rows")}},
        "multi": {"title": heads[1]["text"], "note": heads[1]["note"], **{k: tables[1][k] for k in ("columns", "rows")}},
    }
    return out


def cmd_import():
    DATA.mkdir(exist_ok=True)
    plans = figure_plans()
    shelves = [import_shelf(p, plans) for p in sorted(SHELF_DIR.glob("0[1-7]_*.md"))]
    guide = import_guide(next(SHELF_DIR.glob("00_*.md")))
    out = {
        "meta": {
            "title": "医療と社会のレファレンス",
            "version": "v0",
            "content_doc": guide["title"],
            "content_doc_url": "https://claude.ai/artifact/R1Tr4rSb8dhdC2UPVapqtT",
            "design_doc_url": "https://claude.ai/artifact/ULuxZk4ovuyuQL3HyLXtn3",
            "kyotsu_url": KYOTSU_URL,
            "imported_from": "docs/shelves/（2026-11-11の書き出し）",
        },
        "bands": BANDS,
        "sites": SITES,
        "app": APP,
        "statuses": [
            {"id": "未作成", "desc": "まだ書いていない"},
            {"id": "仮", "desc": "AIの下書き。一次資料と未照合"},
            {"id": "照合済み", "desc": "一次資料で確かめた（日付つき）"},
            {"id": "確認済み", "desc": "現場の人にも確かめた（日付と立場つき）"},
        ],
        "guide": guide,
        "shelves": shelves,
    }
    (DATA / "shelves.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    html = SOURCE_HTML.read_text(encoding="utf-8")
    start = html.index(APP_DATA_OPEN) + len(APP_DATA_OPEN)
    end = html.index("</script>", start)
    units = json.loads(html[start:end])
    (DATA / "units.json").write_text(json.dumps(units, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"data/shelves.json：棚{len(shelves)}つ　data/units.json：単元{len(units['units'])}")


# ---------------------------------------------------------------------------
# ビルド
# ---------------------------------------------------------------------------
def script_json(obj):
    """<script type=application/json> に入れても閉じタグにならないようにする。"""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def build_kyotsu(units):
    """単元のJSONから共通学習ツールWeb版を作る。表示の部分は source/ のものを使う。"""
    html = SOURCE_HTML.read_text(encoding="utf-8")
    start = html.index(APP_DATA_OPEN) + len(APP_DATA_OPEN)
    end = html.index("</script>", start)
    BUILD.mkdir(exist_ok=True)
    out = html[:start] + json.dumps(units, ensure_ascii=False) + html[end:]
    (BUILD / "kyotsu-gakushu-web.html").write_text(out, encoding="utf-8")
    return out


def build_ref(units, shelves):
    tpl = (SRC / "index.template.html").read_text(encoding="utf-8")
    css = (SRC / "app.css").read_text(encoding="utf-8")
    js = (SRC / "app.js").read_text(encoding="utf-8")
    for bad in ("http://", "https://"):
        # 外への通信を起こすのはリンクだけにする（CSSとJSにURLを書かない）
        assert bad not in css, "app.css にURLがある"
    out = (tpl.replace("/*__CSS__*/", css)
              .replace("__UNITS_JSON__", script_json(units))
              .replace("__SHELVES_JSON__", script_json(shelves))
              .replace("/*__JS__*/", js))
    DIST.mkdir(exist_ok=True)
    (DIST / "index.html").write_text(out, encoding="utf-8")
    return out


def cmd_build(check=False):
    units = json.loads((DATA / "units.json").read_text(encoding="utf-8"))
    shelves = json.loads((DATA / "shelves.json").read_text(encoding="utf-8"))
    ref = build_ref(units, shelves)
    k = build_kyotsu(units)
    print(f"dist/index.html {len(ref.encode('utf-8')):,} バイト")
    print(f"build/kyotsu-gakushu-web.html {len(k.encode('utf-8')):,} バイト")
    if check:
        same = k == SOURCE_HTML.read_text(encoding="utf-8")
        print("共通学習ツールWeb版を data/units.json から作り直した結果：", "source/ と同じ" if same else "source/ と違う")
        if not same:
            sys.exit(1)


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "build"
    if arg == "import":
        cmd_import()
    elif arg == "check":
        cmd_build(check=True)
    else:
        cmd_build()
