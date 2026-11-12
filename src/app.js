"use strict";
/* 医療と社会のレファレンス v0
   データ：units-data（共通学習ツールWeb版のJSON、型はそのまま）と shelves-data（7棚）。
   単元・用語・問い・制約カードの表示は共通学習ツールWeb版（source/kyotsu-gakushu-web_v0.html）の関数を移して使う。
   外への通信はしない。保存は localStorage だけ。 */
const D = JSON.parse(document.getElementById("units-data").textContent);
const S = JSON.parse(document.getElementById("shelves-data").textContent);
const UNITS = Object.fromEntries(D.units.map(u => [u.unit, u]));
const CARDS = Object.fromEntries((D.cards || []).map(c => [c.id, c]));
const SHELVES = Object.fromEntries(S.shelves.map(s => [s.no, s]));
const SHELF_ORDER = S.shelves.map(s => s.no);
const BAND_OF = {};
S.bands.forEach(b => b.shelves.forEach(n => { BAND_OF[n] = b; }));
const HOME_SHELF = {};
S.shelves.forEach(s => (s.home_units || []).forEach(n => { HOME_SHELF[n] = s.no; }));
const DOWN_FROM = {};
S.shelves.forEach(s => (s.units || []).forEach(n => { (DOWN_FROM[n] = DOWN_FROM[n] || []).push(s.no); }));
const UNIT_ORDER = S.shelves.flatMap(s => s.home_units || []);
const main = document.getElementById("main");
const ST_CLASS = { "未作成": "st-none", "仮": "st-draft", "照合済み": "st-verified", "確認済み": "st-confirmed" };
const MK_TYPES = [["imp", "★ 重要"], ["save", "📌 保存"], ["weak", "🔁 苦手"], ["done", "✅ 復習した"]];

/* ---------- 端末内の保存。使えない環境でも画面は動く ---------- */
const PREFIX = "iryoshakai:";
const store = {
  get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  works() { try { localStorage.setItem(PREFIX + "_", "1"); localStorage.removeItem(PREFIX + "_"); return true; } catch (e) { return false; } },
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const jpDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? `${m[1]}年${+m[2]}月${+m[3]}日` : (s || ""); };
function noteOpen(id) {
  const o = store.get("opens", {});
  const a = o[id] || [];
  const t = today();
  if (a[a.length - 1] !== t) { a.push(t); o[id] = a; store.set("opens", o); }
}
const opensOf = id => (store.get("opens", {})[id] || []);

/* ---------- 文字の整形 ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const extLink = (u, t) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}<span class="sr">（新しいタブで開く）</span></a>`;
function marker(label) {
  if (label === "要入力") return '<span class="tag todo">要入力</span>';
  return `<span class="tag need">${label}</span>`;
}
function inline(s) {
  let o = esc(s);
  o = o.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  o = o.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => extLink(u, t));
  o = o.replace(/単元(\d{1,2})(?!\d)/g, (m, n) => UNITS[n] ? `<a href="#u${n}">単元${n}</a>` : m);
  o = o.replace(/棚([1-7])(?![\d０-９])/g, (m, n) => `<a href="#s${n}">棚${n}</a>`);
  o = o.replace(/【(.+?)】/g, (m, t) => marker(t));
  return o;
}
const plain = s => String(s ?? "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
function tableHtml(cols, rows, opt) {
  opt = opt || {};
  const cell = opt.cell || ((c) => inline(c));
  return `<div class="tbl-wrap"${opt.label ? ` role="region" aria-label="${esc(opt.label)}"` : ""}><table${opt.cls ? ` class="${opt.cls}"` : ""}><thead><tr>${cols.map(c => `<th scope="col"${/出典/.test(c) ? ' class="src"' : ""}>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r, i) => `<tr${opt.rowCls ? opt.rowCls(r, i) : ""}>${r.map((c, j) => `<td${/^(時期|月|年度)$/.test(cols[j]) ? ' class="when"' : ""}${/出典/.test(cols[j]) ? ' class="src"' : ""}>${cell(c, i, j)}${j === 0 && opt.first ? opt.first(r, i) : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function blocksHtml(blocks) {
  return (blocks || []).map(b => {
    if (b.kind === "para") return `<p class="para">${inline(b.text)}</p>`;
    if (b.kind === "bullets") return `<ul class="bul">${b.items.map(i => `<li>${inline(i)}</li>`).join("")}</ul>`;
    if (b.kind === "numbered") return `<ol class="bul">${b.items.map(i => `<li>${inline(i)}</li>`).join("")}</ol>`;
    if (b.kind === "table") return tableHtml(b.columns, b.rows);
    if (b.kind === "head") return `<h3 class="sub-h">${esc(b.text)}${b.note ? `<span class="muted small">${esc(b.note)}</span>` : ""}</h3>${b.inline ? `<p class="para">${inline(b.inline)}</p>` : ""}`;
    return "";
  }).join("");
}
const statusTag = (st, date) => `<span class="tag ${ST_CLASS[st] || "st-none"}">${esc(st)}${date ? " " + esc(jpDate(date)) : ""}</span>`;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("コピーしました"); }
  catch (e) { toast("自動でコピーできません。下の欄の文字を選んでコピーしてください"); }
}

/* ---------- 学習の印（統合アプリのマイノートと同じ4種。キーは「場所|番号」） ---------- */
const marks = () => store.get("marks", {});
function marksHtml(id, n, title) {
  const st = marks()[id + "|" + n] || {};
  return `<span class="marks" role="group" aria-label="${esc(title)}の印" data-mid="${esc(id)}" data-mn="${esc(n)}" data-mt="${esc(title)}">${MK_TYPES.map(([k, l]) => `<button type="button" class="mk ${k}" data-mk="${k}" aria-pressed="${!!st[k]}">${l}${k === "done" && st.done ? " " + esc(String(st.done).slice(5)) : ""}</button>`).join("")}</span>`;
}
function bindMarks(root) {
  root.querySelectorAll(".marks .mk").forEach(b => b.addEventListener("click", () => {
    const g = b.parentElement, key = g.dataset.mid + "|" + g.dataset.mn, k = b.dataset.mk;
    const all = marks();
    const st = all[key] || {};
    if (k === "done") st.done = st.done ? "" : today(); else st[k] = !st[k];
    st.h = g.dataset.mt; st.t = Date.now(); st.href = location.hash || "#home";
    if (!st.imp && !st.save && !st.weak && !st.done) delete all[key]; else all[key] = st;
    store.set("marks", all);
    b.setAttribute("aria-pressed", String(k === "done" ? !!st.done : !!st[k]));
    if (k === "done") b.textContent = "✅ 復習した" + (st.done ? " " + st.done.slice(5) : "");
    sideCount();
  }));
}

/* ---------- 左メニューと上の帯 ---------- */
function sideHtml() {
  const bands = S.bands.map(b => `<p class="band">${esc(b.name)}</p>${b.shelves.map(n => `<a href="#s${n}" data-nav="s${n}"><span class="no">${n}</span><span>${esc(SHELVES[n].name)}</span></a>`).join("")}`).join("");
  return `<a href="#home" data-nav="home"><span>表紙（7棚の地図）</span></a>
    <p class="grp">7つの棚</p>${bands}
    <p class="grp">棚をまたぐ</p>
    <a href="#cal" data-nav="cal"><span>暦（1年と複数年）</span></a>
    <a href="#about" data-nav="about"><span>使い方と照合の記録</span></a>
    <p class="grp">深掘り</p>
    <a href="#units" data-nav="units"><span>単元（12）</span></a>
    <a href="#terms" data-nav="terms"><span>用語集</span></a>
    <a href="#questions" data-nav="questions"><span>問いから</span></a>
    <a href="#cards" data-nav="cards"><span>制約カード</span></a>
    <p class="grp">自分の記録</p>
    <a href="#note" data-nav="note"><span>マイノート</span><span class="cnt" id="note-cnt"></span></a>
    <p class="grp">外へ</p>
    <a href="${esc(S.app.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(S.app.name)} ↗</span><span class="sr">（新しいタブで開く）</span></a>`;
}
function sideCount() {
  const n = Object.keys(marks()).length;
  const c = document.getElementById("note-cnt");
  if (c) c.textContent = n ? `印 ${n}` : "";
}
function setNav(key, crumb) {
  document.querySelectorAll("[data-nav]").forEach(a => {
    if (a.dataset.nav === key) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.getElementById("crumb").innerHTML = crumb || "";
}
const side = document.getElementById("side"), menuBtn = document.getElementById("menu-btn");
function closeMenu(focusBtn) {
  if (!side.classList.contains("open")) return;
  side.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false");
  if (focusBtn) menuBtn.focus();
}
menuBtn.addEventListener("click", () => {
  const open = !side.classList.contains("open");
  side.classList.toggle("open", open); menuBtn.setAttribute("aria-expanded", String(open));
  if (open) { const a = side.querySelector("a"); if (a) a.focus(); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(true); });
side.addEventListener("click", e => { if (e.target.closest("a")) closeMenu(false); });

/* ---------- 暦：今月・今年度の印 ---------- */
function monthHit(label, m) {
  const r = /(\d{1,2})月?(?:〜(\d{1,2}))?月/.exec(label);
  if (!r) return false;
  const a = +r[1], b = r[2] ? +r[2] : a;
  return a <= b ? (m >= a && m <= b) : (m >= a || m <= b);
}
const fiscalYear = () => { const d = new Date(); return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1; };
function yearCalHtml() {
  const y = S.guide.calendar.year, m = new Date().getMonth() + 1;
  return tableHtml(y.columns, y.rows, {
    label: y.title,
    rowCls: r => monthHit(r[0], m) ? ' class="is-now"' : "",
    first: r => monthHit(r[0], m) ? ' <span class="tag now">今月</span>' : "",
  });
}
function multiCalHtml() {
  const y = S.guide.calendar.multi, fy = fiscalYear();
  const hit = r => (r[0].match(/\d{4}/g) || []).map(Number).includes(fy);
  return tableHtml(y.columns, y.rows, {
    label: y.title,
    rowCls: r => hit(r) ? ' class="is-now"' : "",
    first: r => hit(r) ? ' <span class="tag now">今年度</span>' : "",
  });
}

/* ---------- 表紙 ---------- */
function viewHome() {
  setNav("home", "表紙");
  const m = new Date().getMonth() + 1;
  const y = S.guide.calendar.year;
  const nowRow = y.rows.find(r => monthHit(r[0], m));
  const nowText = nowRow ? y.columns.slice(1).map((c, i) => `${esc(c)}：${inline(nowRow[i + 1])}`).join("　") : "";
  const tile = n => {
    const s = SHELVES[n];
    const o = opensOf(s.id);
    return `<a class="tile" href="#s${n}">
      <span class="t-no">棚${n}</span>
      <span class="t-name">${esc(s.name)}</span>
      <span class="t-sum">${esc(plain(s.summary))}</span>
      <span class="tags">${statusTag(s.status, s.checked_at)}${statusTag(s.figure.status).replace(">未作成<", ">一枚図：未作成<")}${(s.new_units || []).map(u => `<span class="tag st-none">新規単元：${esc(u.status)}</span>`).join("")}</span>
      <span class="t-seen">${o.length ? `最後に開いた日：${esc(jpDate(o[o.length - 1]))}` : "最後に開いた日：まだ開いていない"}</span>
    </a>`;
  };
  main.innerHTML = `
    <section class="cover-head" aria-labelledby="h-cover">
      <h1 id="h-cover">医療と社会のレファレンス</h1>
      <p class="lead">7つの棚を一画面で見渡し、棚ごとに「一枚図・数字・暦」で全体をつかみ、深掘りは既にある単元へ1タップで降りる、個人用のレファレンス。</p>
      ${nowRow ? `<div class="now-box"><p><span class="tag now">今月</span> <b>${esc(nowRow[0])}</b>（${esc(y.title)}${esc(y.note)}）</p><p>${nowText}</p><p class="small"><a href="#cal">棚をまたぐ暦を開く</a></p></div>` : ""}
    </section>
    <section class="map" aria-labelledby="h-map">
      <h2 class="sec-h" id="h-map">7つの棚の地図</h2>
      ${S.bands.map(b => `<div class="band ${b.id}" role="group" aria-label="${esc(b.name)}">
        <div class="band-h"><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></div>
        <div class="tiles" style="--n:${b.shelves.length}">${b.shelves.map(tile).join("")}</div>
      </div>`).join("")}
      <p class="small muted">下から読む。土台の3棚はどの棚にも効き、上の2棚は「これから何が変わるか」を扱う。</p>
      <div class="legend" aria-label="状態の札の見方">${S.statuses.map(x => `<span>${statusTag(x.id)}${esc(x.desc)}</span>`).join("")}</div>
    </section>`;
}

/* ---------- 棚ページ ---------- */
function numCell(text, key, item, col) {
  const parts = String(text).split("【要入力】");
  if (parts.length === 1) return inline(text);
  const nums = store.get("nums", {});
  return parts.map((p, i) => {
    let h = inline(p);
    if (i < parts.length - 1) {
      const k = `${key}:${i}`;
      h += `<input class="num-in" data-num="${esc(k)}" value="${esc(nums[k] ? nums[k].v : "")}" placeholder="要入力" aria-label="${esc(plain(item))}の${esc(col)}（自分で入力。この端末にだけ残る）">`;
    }
    return h;
  }).join("");
}
function bindNums(root) {
  root.querySelectorAll("[data-num]").forEach(el => el.addEventListener("input", () => {
    const nums = store.get("nums", {});
    if (el.value.trim()) nums[el.dataset.num] = { v: el.value, d: today() }; else delete nums[el.dataset.num];
    store.set("nums", nums);
  }));
}
function localHtml(s) {
  const loc = store.get("local", {});
  const works = store.works();
  return `<div class="checks">${s.local_checks.map((c, i) => `<div class="check">
      <p class="what">${i + 1}. ${inline(c.what)}</p>
      ${c.where ? `<p class="where">どこで分かるか：${inline(c.where)}</p>` : ""}
      <div class="sites">${S.sites.map(site => {
        const k = `${s.id}:${i}:${site.id}`, v = loc[k] || {};
        return `<div class="site"><label for="lc-${k}">${esc(site.name)}</label>
          <textarea id="lc-${k}" data-local="${esc(k)}" rows="2">${esc(v.v || "")}</textarea>
          <p class="saved" id="lcs-${k}">${v.d ? `記入 ${esc(v.d)}` : ""}</p></div>`;
      }).join("")}</div>
    </div>`).join("")}</div>
    <p class="small muted">${works ? "答えは自分で書く（AIでは埋めない）。書いた内容はこの端末の中だけに残り、送信しない。端末間はマイノートの書き出しと読み込みで移す。" : "この環境では保存できません。書いた内容は閉じると消えます。"}</p>`;
}
function bindLocal(root) {
  root.querySelectorAll("[data-local]").forEach(t => t.addEventListener("input", () => {
    const loc = store.get("local", {});
    const k = t.dataset.local;
    if (t.value.trim()) loc[k] = { v: t.value, d: today() }; else delete loc[k];
    store.set("local", loc);
    const p = document.getElementById("lcs-" + k);
    if (p) p.textContent = loc[k] ? `記入 ${loc[k].d}` : "";
  }));
}
function downHtml(s) {
  const cards = [];
  (s.units || []).forEach(n => {
    const u = UNITS[n];
    cards.push(`<a class="down" href="#u${n}"><span class="k">共通学習ツールの単元</span><b>単元${n} ${esc(u ? u.title : "")}</b></a>`);
  });
  (s.extra_links || []).forEach(x => {
    if (x === "cards") cards.push(`<a class="down" href="#cards"><span class="k">共通学習ツール</span><b>制約カード（${(D.cards || []).length}枚）</b></a>`);
    if (x === "terms") cards.push(`<a class="down" href="#terms"><span class="k">共通学習ツール</span><b>用語集</b></a>`);
  });
  (s.new_units || []).forEach(u => cards.push(`<div class="down none"><span class="k">新しく書く単元</span><b>「${esc(u.name)}」</b><span>${statusTag(u.status)}</span></div>`));
  (s.app_links || []).forEach(a => cards.push(`<a class="down" href="${esc(S.app.url)}" target="_blank" rel="noopener noreferrer"><span class="k">${esc(S.app.name)}（新しいタブ）</span><b>統合アプリの『${esc(a.name)}』を開く ↗</b>${a.text !== a.name ? `<span class="small">${esc(a.text)}</span>` : ""}<span class="small muted">項目へ直接は飛べません。開いたら左メニューか検索で『${esc(a.name)}』を選ぶ</span></a>`));
  return `<div class="downs">${cards.join("")}</div><p class="small muted">原文：${inline(s.down_text)}</p>`;
}
function misHtml(list) {
  return `<ol class="myth">${list.map(x => {
    const i = x.indexOf("→");
    if (i < 0) return `<li><span>${inline(x)}</span></li>`;
    return `<li><span class="m">${inline(x.slice(0, i).trim())}</span><span class="f">${inline(x.slice(i + 1).trim())}</span></li>`;
  }).join("")}</ol>`;
}
function shelfSecs(s) {
  const secs = [["sum", "一言で"], ["fig", "一枚図"], ["num", "押さえる数字"], ["ov", "全体像"], ["cal", "暦"], ["neg", "会議・交渉で使う"], ["mis", "よくある誤解"], ["local", "自分の現場で確かめること"]];
  (s.topics || []).forEach((t, i) => secs.push([`t${i}`, t.title]));
  secs.push(["down", "降り先"], ["src", "この棚の照合に使った資料"]);
  return secs;
}
function secHead(s, id, title, tag, extra) {
  return `<${tag || "h2"} class="sec-h" id="h-${id}">${esc(title)}${extra || ""}${marksHtml(s.id, id, `棚${s.no} ${s.name}：${title}`)}</${tag || "h2"}>`;
}
function viewShelf(no, sec) {
  const s = SHELVES[no];
  if (!s) { viewHome(); return; }
  noteOpen(s.id);
  const b = BAND_OF[no];
  setNav(`s${no}`, `<a href="#home">表紙</a> › 棚${no} ${esc(s.name)}`);
  const o = opensOf(s.id);
  const ov = s.overview.map((x, i) => {
    const sub = i === 0 ? (x.title.split("：")[1] || "") : x.title;
    return `${sub ? `<h3 class="sub-h">${esc(sub)}</h3>` : ""}${x.text ? `<p class="para">${inline(x.text)}</p>` : ""}${blocksHtml(x.blocks)}`;
  }).join("");
  const numKey = `${s.id}`;
  const numTbl = tableHtml(s.numbers.columns, s.numbers.rows, {
    cls: "num-tbl", label: `棚${no}の押さえる数字`,
    cell: (c, i, j) => numCell(c, `${numKey}:${i}:${j}`, s.numbers.rows[i][0], s.numbers.columns[j]),
  });
  const cal = s.calendar;
  const prev = SHELF_ORDER[SHELF_ORDER.indexOf(no) - 1], next = SHELF_ORDER[SHELF_ORDER.indexOf(no) + 1];
  main.innerHTML = `
  <article class="shelf" aria-labelledby="h-shelf">
    <header class="shelf-head">
      <h1 id="h-shelf"><span class="eyebrow">棚${no}・${esc(b ? b.name : "")}</span><span>${esc(s.name)}</span></h1>
      <div class="meta"><span class="tags">${statusTag(s.status, s.checked_at)}<span class="tag st-none">一枚図：${esc(s.figure.status)}</span>${(s.new_units || []).map(u => `<span class="tag st-none">新規単元「${esc(u.name)}」：${esc(u.status)}</span>`).join("")}</span>
        ${marksHtml(s.id, 0, `棚${no} ${s.name}`)}
        <span class="small muted">開いた日 ${o.length}日（今日を含む）</span>
        <details class="more small"><summary>この棚の状態の説明</summary><p class="status-note">${inline(s.status_text)}</p></details></div>
    </header>
    <div class="top-half">
      <section class="sec" id="sec-sum" aria-labelledby="h-sum">${secHead(s, "sum", "一言で")}<p class="summary">${inline(s.summary)}</p></section>
      <section class="sec" id="sec-fig" aria-labelledby="h-fig">${secHead(s, "fig", "一枚図")}
        <div class="fig-none"><p><span class="tag st-none">一枚図：未作成</span></p>${s.figure.plan ? `<p class="plan">この図で見せる予定のもの（設計書）：${inline(s.figure.plan)}</p>` : ""}</div></section>
      <section class="sec wide" id="sec-num" aria-labelledby="h-num">${secHead(s, "num", "押さえる数字", "h2", '<span class="small muted" style="font-weight:400">「要入力」の枠は自分で調べて書く（この端末の中だけに残る）</span>')}
        ${numTbl}${blocksHtml(s.numbers.after)}</section>
    </div>
    <section class="sec" id="sec-ov" aria-labelledby="h-ov">${secHead(s, "ov", "全体像")}${ov}</section>
    <section class="sec" id="sec-cal" aria-labelledby="h-cal">${secHead(s, "cal", "暦", "h2", cal.note ? `<span class="muted small">${esc(cal.note)}</span>` : "")}
      ${cal.title !== "暦" ? `<h3 class="sub-h">${esc(cal.title)}</h3>` : ""}
      ${tableHtml(cal.columns, cal.rows, { label: `棚${no}の${cal.title}`, cell: (c, i, j) => cal.columns[j] === "区分" ? `<span class="tag basis">${inline(c)}</span>` : inline(c) })}
      ${blocksHtml(cal.after)}
      <p class="small"><a href="#cal">棚をまたぐ暦（1年と複数年）を見る</a></p></section>
    <section class="sec" id="sec-neg" aria-labelledby="h-neg">${secHead(s, "neg", "会議・交渉で使う")}<ul class="bul">${s.negotiation.map(x => `<li>${inline(x)}</li>`).join("")}</ul></section>
    <section class="sec" id="sec-mis" aria-labelledby="h-mis">${secHead(s, "mis", "よくある誤解")}${misHtml(s.misconceptions)}</section>
    <section class="sec" id="sec-local" aria-labelledby="h-local">${secHead(s, "local", "自分の現場で確かめること")}${localHtml(s)}</section>
    ${(s.topics || []).map((t, i) => `<section class="sec" id="sec-t${i}" aria-labelledby="h-t${i}">${secHead(s, `t${i}`, t.title)}
      ${t.summary ? `<p class="para"><strong>一言で</strong>：${inline(t.summary)}</p>` : ""}${blocksHtml(t.blocks)}</section>`).join("")}
    <section class="sec" id="sec-down" aria-labelledby="h-down">${secHead(s, "down", "降り先")}${downHtml(s)}</section>
    <section class="sec" id="sec-src" aria-labelledby="h-src">${secHead(s, "src", "この棚の照合に使った資料")}<p class="para">${inline(s.sources_text)}</p></section>
    <nav class="pager" aria-label="前後の棚">${prev ? `<a class="btn" href="#s${prev}">前：棚${prev} ${esc(SHELVES[prev].name)}</a>` : "<span></span>"}${next ? `<a class="btn solid" href="#s${next}">次：棚${next} ${esc(SHELVES[next].name)}</a>` : ""}</nav>
  </article>`;
  bindMarks(main); bindNums(main); bindLocal(main);
  if (sec) jump("sec-" + sec);
}

/* ---------- 棚をまたぐ暦・使い方 ---------- */
function viewCal() {
  setNav("cal", "暦（棚をまたぐ）");
  const c = S.guide.calendar;
  main.innerHTML = `
    <section class="sec"><h1 class="sec-h" style="border-top:0;padding-top:0">棚をまたぐ暦</h1>
      ${c.lead.map(p => `<p class="para">${inline(p)}</p>`).join("")}
      ${marksHtml("cal", 0, "棚をまたぐ暦")}</section>
    <section class="sec" id="sec-year" aria-labelledby="h-year"><h2 class="sec-h" id="h-year">${esc(c.year.title)}<span class="muted small">${esc(c.year.note)}</span></h2>${yearCalHtml()}</section>
    <section class="sec" id="sec-multi" aria-labelledby="h-multi"><h2 class="sec-h" id="h-multi">${esc(c.multi.title)}<span class="muted small">年度は4月始まり。今年度＝${fiscalYear()}年度</span></h2>${multiCalHtml()}</section>
    <section class="sec" aria-labelledby="h-shelfcal"><h2 class="sec-h" id="h-shelfcal">棚ごとの暦</h2>
      <div class="downs">${S.shelves.map(s => `<a class="down" href="#s${s.no}:cal"><span class="k">棚${s.no}</span><b>${esc(s.name)}の${esc(s.calendar.title)}</b></a>`).join("")}</div></section>`;
  bindMarks(main);
}
function viewAbout() {
  setNav("about", "使い方と照合の記録");
  main.innerHTML = `<section class="sec"><h1 class="sec-h" style="border-top:0;padding-top:0">使い方と照合の記録</h1>
      <p class="muted small">「${esc(S.meta.content_doc)}」の使い方・照合の記録・出典を、そのまま載せています。</p></section>
    ${S.guide.sections.filter(x => x.title !== "棚をまたぐ暦").map((x, i) => `<section class="sec" aria-labelledby="h-g${i}"><h2 class="sec-h" id="h-g${i}">${esc(x.title)}</h2>${blocksHtml(x.blocks)}</section>`).join("")}
    <section class="sec" aria-labelledby="h-st"><h2 class="sec-h" id="h-st">状態の札</h2>
      ${tableHtml(["札", "意味"], S.statuses.map(x => [x.id, x.desc]), { cell: (c, i, j) => j === 0 ? statusTag(c) : esc(c) })}</section>
    <section class="sec" aria-labelledby="h-priv"><h2 class="sec-h" id="h-priv">このページの約束</h2>
      <ul class="bul"><li>このページは外と通信しません。外へ出るのは、押したときに開くリンクだけです。</li>
      <li>「自分の現場」の答え、数字の記入、学習の印、開いた日は、この端末の中（ブラウザーの保存領域）だけに残ります。端末間はマイノートの書き出しと読み込みで移します。</li>
      <li>患者の情報は書かないでください。</li></ul></section>`;
}

/* ---------- 単元（共通学習ツールWeb版の表示を移したもの） ---------- */
function stateHtml(st) {
  if (st && st.state === "確認済み") return `<p class="state done"><span class="tag st-confirmed">確認済み</span>${esc(st.date)}、${esc(st.by)}</p>`;
  return `<p class="state"><span class="tag st-draft">仮</span><span>現場の確認前です。AIの下書きなので、現場の人と確かめてから使ってください。</span></p>`;
}
function basisPill(b) { return `<span class="tag basis">${esc(b)}</span>`; }
function uChecksHtml(n, list) {
  const works = store.works();
  return `<div class="u-checks">${list.map((c, i) => {
    const m = store.get(`memo:${n}:${i}`, { done: false, text: "" });
    return `<div class="u-check">
      <label for="chk-${n}-${i}"><input type="checkbox" id="chk-${n}-${i}" data-memo="${n}:${i}" ${m.done ? "checked" : ""}><span>${inline(c.what)}</span></label>
      <p class="where">${inline(c.where)}</p>
      <label class="sr" for="memo-${n}-${i}">自分の町のメモ</label>
      <textarea id="memo-${n}-${i}" data-memo-text="${n}:${i}" rows="1" placeholder="自分の町で分かったこと（端末内に保存）">${esc(m.text)}</textarea>
    </div>`;
  }).join("")}</div><p class="muted small">${works ? "メモはこの端末の中だけに残ります。送信しません。" : "この環境では保存できません。メモは閉じると消えます。"}</p>`;
}
function bindUChecks(root) {
  const save = key => {
    const box = root.querySelector(`[data-memo="${key}"]`), ta = root.querySelector(`[data-memo-text="${key}"]`);
    store.set("memo:" + key, { done: box.checked, text: ta.value });
  };
  root.querySelectorAll("[data-memo]").forEach(b => b.addEventListener("change", () => save(b.dataset.memo)));
  root.querySelectorAll("[data-memo-text]").forEach(t => t.addEventListener("input", () => save(t.dataset.memoText)));
}
const ITEM_NAMES = ["一言で", "仕組みの図", "時間軸", "現場の実情と限界", "立場で見え方が違うところ", "よくある誤解", "用語", "深掘りの一次資料", "自分の町で確認すること", "自己チェック"];
function viewUnit(n, sec) {
  const u = UNITS[n];
  if (!u) { viewUnits(); return; }
  noteOpen("u" + n);
  const it = u.items;
  const home = HOME_SHELF[n];
  const hs = SHELVES[home];
  const list = hs ? hs.home_units : UNIT_ORDER;
  const pos = list.indexOf(n);
  const prev = list[pos - 1], next = list[pos + 1];
  const local = (D.local || {})[n];
  setNav("units", `<a href="#home">表紙</a> › ${hs ? `<a href="#s${home}">棚${home} ${esc(hs.name)}</a> › ` : ""}単元${n} ${esc(u.title)}`);
  const idx = ITEM_NAMES.map((t, i) => [`${i + 1} ${t}`, `i${i + 1}`]).concat([["地域の層", "il"], ["版と生成の記録", "ir"]]);
  const h = (i, title) => `<h2 class="item-h" id="h-i${i}"><span class="no">${i}</span>${esc(title)}${marksHtml("u" + n, "i" + i, `単元${n} ${u.title}：${title}`)}</h2>`;
  main.innerHTML = `
  <div class="unit">
    <nav class="index" aria-label="この単元の項目">${idx.map(([t, id]) => `<a href="#u${n}:${id}">${esc(t)}</a>`).join("")}</nav>
    <article class="sheet" aria-labelledby="h-unit">
      <header class="unit-head">
        <p class="eyebrow">${hs ? `棚${home} ${esc(hs.name)}の単元` : "単元"}　共通学習ツール 教材 ${esc(u.record.version)}</p>
        <h1 id="h-unit">単元${n} ${esc(u.title)}</h1>
        <div class="tags"><span class="tag basis">版 ${esc(u.record.version)}</span><span class="tag basis">基準日 ${esc(u.record.baseline)}</span><span class="tag basis">本文 ${u.char_count.toLocaleString()}字</span>
          <button type="button" class="mk" id="copy-unit">本文をコピー</button></div>
        <div class="row">${marksHtml("u" + n, 0, `単元${n} ${u.title}`)}</div>
        ${(DOWN_FROM[n] || []).length ? `<p class="small muted">この単元を降り先にしている棚：${DOWN_FROM[n].map(s => `<a href="#s${s}">棚${s} ${esc(SHELVES[s].name)}</a>`).join("、")}</p>` : ""}
      </header>
      <section class="item" id="sec-i1">${h(1, ITEM_NAMES[0])}<p class="u-summary">${inline(it.summary.text)}</p></section>
      <section class="item" id="sec-i2">${h(2, ITEM_NAMES[1])}
        <p class="small muted">${esc(it.mechanism.figure || "")}</p>
        <div class="flows">${it.mechanism.flows.map(f => `<div class="flow"><span class="node">${inline(f.who)}</span><span class="edge"><span class="sr">から、</span>${inline(f.what)}<span class="sr">が、次へ</span></span><span class="node">${inline(f.to)}</span>${f.note ? `<p class="note">${inline(f.note)}</p>` : ""}</div>`).join("")}</div>
        ${it.mechanism.notes.map(p => `<p class="para">${inline(p)}</p>`).join("")}</section>
      <section class="item" id="sec-i3">${h(3, ITEM_NAMES[2])}
        <div class="tbl-wrap"><table><thead><tr><th scope="col">時期</th><th scope="col">起きること</th><th scope="col">区分</th></tr></thead><tbody>${it.timeline.rows.map(r => `<tr><td class="when">${inline(r.when)}</td><td>${inline(r.event)}</td><td>${basisPill(r.basis)}</td></tr>`).join("")}</tbody></table></div>
        ${it.timeline.notes.map(p => `<p class="para">${inline(p)}</p>`).join("")}</section>
      <section class="item" id="sec-i4">${h(4, ITEM_NAMES[3])}${stateHtml(it.field_limits.status)}
        <ul class="bul">${it.field_limits.points.map(p => `<li>${inline(p)}</li>`).join("")}</ul></section>
      <section class="item" id="sec-i5">${h(5, ITEM_NAMES[4])}${stateHtml(it.perspectives.status)}
        <div class="three"><div><b>医療側</b><span>${inline(it.perspectives.medical)}</span></div><div><b>行政側</b><span>${inline(it.perspectives.admin)}</span></div><div><b>福祉側</b><span>${inline(it.perspectives.welfare)}</span></div></div></section>
      <section class="item" id="sec-i6">${h(6, ITEM_NAMES[5])}
        <ol class="myth">${it.misconceptions.map(m => `<li><span class="m">${inline(m.myth)}</span><span class="f">${inline(m.fact)}</span></li>`).join("")}</ol></section>
      <section class="item" id="sec-i7">${h(7, ITEM_NAMES[6])}${tableHtml(["医療側の言い方", "行政側の言い方", "意味"], it.terms.map(t => [t.medical, t.admin, t.meaning]))}</section>
      <section class="item" id="sec-i8">${h(8, ITEM_NAMES[7])}<ul class="bul">${it.sources.map(x => `<li>${x.url ? extLink(esc(x.url), esc(x.text)) : inline(x.text)}</li>`).join("")}</ul></section>
      <section class="item" id="sec-i9">${h(9, ITEM_NAMES[8])}${uChecksHtml(n, it.local_checks)}</section>
      <section class="item" id="sec-i10">${h(10, ITEM_NAMES[9])}<div>${it.self_check.map(c => `<details class="qa"><summary>${inline(c.question)}</summary><div><p>${inline(c.answer)}</p></div></details>`).join("")}</div></section>
      <section class="item" id="sec-il"><h2 class="item-h">地域の層${local ? `（${esc(local.town)}）` : ""}</h2>
        ${local ? `${(local.lead || []).map(p => `<p class="para">${inline(p)}</p>`).join("")}${local.facts.map(f => `<h3 class="sub-h">${esc(f.title)}</h3>${blocksHtml(f.blocks)}`).join("")}` : `<p class="muted">この版は共通の骨格だけで、特定の町の数字は入れていません。自分の現場の答えは、棚ページの「自分の現場で確かめること」に書きます。</p>`}</section>
      <section class="item" id="sec-ir"><h2 class="item-h">版と生成の記録</h2>
        <div class="tbl-wrap"><table><tbody>${[["版", u.record.version], ["基準日", u.record.baseline], ["生成", u.record.generated], ["点検", u.record.reviewed], ["未照合", u.record.unverified]].map(([a, b]) => `<tr><th scope="row">${a}</th><td>${inline(b)}</td></tr>`).join("")}</tbody></table></div></section>
      <nav class="pager" aria-label="前後の単元">
        ${hs ? `<a class="btn" href="#s${home}">棚${home}へ戻る</a>` : "<span></span>"}
        <div class="row">${prev ? `<a class="btn" href="#u${prev}">前：単元${prev}</a>` : ""}${next ? `<a class="btn solid" href="#u${next}">次：単元${next} ${esc(UNITS[next] ? UNITS[next].title : "")}</a>` : ""}</div>
      </nav>
    </article>
  </div>`;
  document.getElementById("copy-unit").addEventListener("click", () => copy(u.md));
  bindMarks(main); bindUChecks(main);
  if (sec) jump("sec-" + sec);
}
function viewUnits() {
  setNav("units", "単元（12）");
  const row = n => {
    const u = UNITS[n];
    const first = u.items.summary.text.split("。")[0] + "。";
    const from = (DOWN_FROM[n] || []).map(s => `棚${s}`).join("・");
    const o = opensOf("u" + n);
    return `<a class="hit" href="#u${n}"><b>単元${n} ${esc(u.title)}</b><small>${esc(plain(first))}</small><small>降り先にしている棚：${from || "—"}　${o.length ? `最後に開いた日：${esc(jpDate(o[o.length - 1]))}` : "まだ開いていない"}</small></a>`;
  };
  main.innerHTML = `<section class="sec"><h1 class="sec-h" style="border-top:0;padding-top:0">単元（12）</h1>
      <p class="para muted">共通学習ツール 教材 v0 の12単元。各単元は同じ10項目（単元の型）で読む。持ち主の棚は設計書「棚ごとの中身」の割り当て。</p></section>
    ${S.shelves.filter(s => (s.home_units || []).length).map(s => `<section class="sec" aria-labelledby="h-us${s.no}"><h2 class="sec-h" id="h-us${s.no}">棚${s.no} ${esc(s.name)}</h2><div class="hits">${s.home_units.map(row).join("")}</div></section>`).join("")}
    <section class="sec" aria-labelledby="h-new"><h2 class="sec-h" id="h-new">新しく書く単元</h2>
      <div class="downs">${S.shelves.flatMap(s => (s.new_units || []).map(u => `<div class="down none"><span class="k">棚${s.no} ${esc(s.name)}</span><b>「${esc(u.name)}」</b><span>${statusTag(u.status)}</span></div>`)).join("")}</div></section>`;
}

/* ---------- 用語・問い・制約カード（共通学習ツールWeb版の表示を移したもの） ---------- */
function allUnitTerms() {
  const out = [];
  UNIT_ORDER.forEach(n => { const u = UNITS[n]; if (u) u.items.terms.forEach(t => out.push({ ...t, unit: n })); });
  return out;
}
function viewTerms() {
  setNav("terms", "用語集");
  const gl = D.glossary || [];
  const terms = allUnitTerms();
  main.innerHTML = `<section class="sec"><h1 class="sec-h" style="border-top:0;padding-top:0">用語集</h1>
    <p class="para muted">同じ言葉が、立場によって違う意味で使われます。三者の見え方、ズレが起きる一言、共通に使える言い換えを並べました（共通学習ツール 教材 v0）。</p>
    <div style="max-width:420px;display:grid;gap:4px"><label for="term-filter"><b>言葉で絞る</b></label><input id="term-filter" class="num-in" type="search" placeholder="例：緊急" autocomplete="off"></div>
    <div id="gl-list" style="display:grid;gap:18px"></div></section>
    <section class="sec"><h2 class="sec-h">単元の用語（${terms.length}語）</h2><div id="ut-list"></div></section>`;
  const render = f => {
    const hit = s => !f || String(s).includes(f);
    const g = gl.filter(x => [x.term, x.medical, x.admin, x.welfare, x.gap, x.common].some(hit));
    document.getElementById("gl-list").innerHTML = g.map(x => `<article style="display:grid;gap:8px"><h3 class="sub-h">${esc(x.term)}</h3>
      <div class="three"><div><b>医療側</b><span>${inline(x.medical)}</span></div><div><b>行政側</b><span>${inline(x.admin)}</span></div><div><b>福祉側</b><span>${inline(x.welfare)}</span></div></div>
      <p class="para"><strong>ズレが起きる一言：</strong>${inline(x.gap)}</p><p class="para"><strong>共通の言い換え：</strong>${inline(x.common)}</p></article>`).join("") || (gl.length ? '<p class="muted">この言葉は三者比較に入っていません。下の単元の用語を見てください。</p>' : "");
    const t = terms.filter(x => [x.medical, x.admin, x.meaning].some(hit));
    document.getElementById("ut-list").innerHTML = t.length ? tableHtml(["医療側の言い方", "行政側の言い方", "意味", "単元"], t.map(x => [x.medical, x.admin, x.meaning, `単元${x.unit}`])) : '<p class="muted">見つかりません。</p>';
  };
  render("");
  document.getElementById("term-filter").addEventListener("input", e => render(e.target.value.trim()));
}
function unitLink(n) { const u = UNITS[n]; return `<a href="#u${n}">単元${n} ${esc(u ? u.title : "")}</a>`; }
function questionHtml(q, open) {
  return `<details class="qa" id="q-${q.id}" ${open ? "open" : ""}>
    <summary>${esc(q.q)}</summary>
    <div>
      <p>${inline(q.answer)}</p>
      <div><p class="small"><strong>読む順</strong></p><div style="display:grid;gap:4px">${q.units.map(unitLink).join("")}</div></div>
      <div><p class="small"><strong>自分の町で確認すること</strong></p><ul class="bul small">${q.checks.map(c => `<li>${inline(c)}</li>`).join("")}</ul></div>
      <div><p class="small"><strong>会議で確かめる質問</strong></p><ul class="bul small">${q.ask.map(c => `<li>${inline(c)}</li>`).join("")}</ul></div>
    </div></details>`;
}
function viewQuestions(openId) {
  setNav("questions", "問いから");
  const qs = D.questions || [];
  main.innerHTML = `<section class="sec"><h1 class="sec-h" style="border-top:0;padding-top:0">問いから入る</h1>
    <p class="para muted">困りごとの言葉で引きます。短い答えのあとに、読む単元の順、自分の町で確認すること、会議で確かめる質問が続きます（共通学習ツール 教材 v0）。</p>
    <div>${qs.map(q => questionHtml(q, String(q.id) === String(openId))).join("")}</div></section>`;
  if (openId) jump("q-" + openId);
}
function cardText(c) {
  return [`${c.role} の制約カード（仮）`, "", "できること", ...c.can.map(x => "・" + x), "", "できないこと", ...c.cannot.map(x => "・" + x), "", "動ける時期", ...c.calendar.map(x => "・" + x), "", "手続きと所要時間", ...c.procedure.map(x => "・" + x), "", "判断に使う指標と言葉", c.metrics, "", "言われて困る頼み方", ...c.bad.map(x => "・" + x), "", "通る頼み方", ...c.good.map(x => "・" + x), "", "根拠：" + c.basis.join("、")].join("\n");
}
function viewCards() {
  setNav("cards", "制約カード");
  const cs = D.cards || [];
  main.innerHTML = `<section class="sec"><h1 class="sec-h" style="border-top:0;padding-top:0">制約カード</h1>
    <p class="para muted">会議の相手ごとに1枚。その人が何をできて何をできないか、いつ動けるか、どう頼めば通るかをまとめたもの。すべて「仮」で、その役割の人に読んでもらって直す前提です（共通学習ツール 教材 v0）。</p>
    <div class="cards">${cs.map(c => `<a class="cardlink" href="#card-${c.id}"><b>${esc(c.role)}</b><span class="small muted">${esc(c.one)}</span></a>`).join("")}</div></section>`;
}
function viewCard(id) {
  const c = CARDS[id];
  if (!c) { viewCards(); return; }
  setNav("cards", `<a href="#cards">制約カード</a> › ${esc(c.role)}`);
  const ul = a => `<ul class="bul">${a.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`;
  main.innerHTML = `<article class="a5" aria-labelledby="h-card">
    <header class="row" style="justify-content:space-between"><div><p class="eyebrow">制約カード</p><h1 id="h-card" style="font-size:1.375rem">${esc(c.role)}</h1></div><span class="tag st-draft">仮</span></header>
    <div class="pair"><div><h2>できること</h2>${ul(c.can)}</div><div><h2>できないこと</h2>${ul(c.cannot)}</div></div>
    <div class="pair"><div><h2>動ける時期</h2>${ul(c.calendar)}</div><div><h2>手続きと所要時間</h2>${ul(c.procedure)}</div></div>
    <div><h2>判断に使う指標と言葉</h2><p>${inline(c.metrics)}</p></div>
    <div class="pair"><div><h2>言われて困る頼み方</h2>${ul(c.bad)}</div><div><h2>通る頼み方</h2>${ul(c.good)}</div></div>
    <p class="muted small">根拠：${c.basis.map(esc).join("、")}</p>
    <p class="muted small">AIの下書きです。自治体ごとに違うので、この役割の人に読んでもらって直してください。</p>
    <div class="row">${marksHtml("card-" + c.id, 0, `制約カード ${c.role}`)}</div>
    <div class="row"><button type="button" class="btn" id="copy-card">カードをコピー</button><a class="btn" href="#cards">カードの一覧へ</a></div>
  </article>`;
  document.getElementById("copy-card").addEventListener("click", () => copy(cardText(c)));
  bindMarks(main);
}

/* ---------- マイノート（印4種・開いた記録・書き出しと読み込み） ---------- */
const ntFilter = { imp: true, save: true, weak: true, done: true };
function viewNote() {
  setNav("note", "マイノート");
  const all = marks();
  const keys = Object.keys(all);
  const count = k => keys.filter(x => all[x][k]).length;
  const opens = store.get("opens", {});
  const loc = store.get("local", {}), nums = store.get("nums", {});
  const works = store.works();
  const shelfRows = S.shelves.map(s => {
    const a = opens[s.id] || [];
    return [`棚${s.no} ${s.name}`, `${a.length}日`, a.length ? jpDate(a[a.length - 1]) : "—", a.slice().reverse().slice(0, 12).join("、") || "—"];
  });
  const unitOpened = UNIT_ORDER.filter(n => (opens["u" + n] || []).length);
  main.innerHTML = `<section class="sec"><h1 class="sec-h" style="border-top:0;padding-top:0">マイノート</h1>
      <p class="para muted">学習の印（★重要・📌保存・🔁苦手・✅復習した）と、棚を開いた日を集めます。1か月後（12月20日）に「会議や面談の前に引いた場面が3回あるか」を確かめるのに使います。記録はこの端末の中だけにあります。${works ? "" : " この環境では保存できません。"}</p>
      <div class="stats">${MK_TYPES.map(([k, l]) => `<span>${l} <b>${count(k)}</b></span>`).join("")}<span>自分の現場の記入 <b>${Object.keys(loc).length}</b>欄</span><span>数字の記入 <b>${Object.keys(nums).length}</b>枠</span></div></section>
    <section class="sec" aria-labelledby="h-nm"><h2 class="sec-h" id="h-nm">印をつけたところ</h2>
      <div class="row" role="group" aria-label="表示する印">${MK_TYPES.map(([k, l]) => `<button type="button" class="mk ${k}" data-f="${k}" aria-pressed="${ntFilter[k]}">${l}</button>`).join("")}</div>
      <div id="nt-list" style="display:grid;gap:8px"></div></section>
    <section class="sec" aria-labelledby="h-op"><h2 class="sec-h" id="h-op">棚を開いた日</h2>
      ${tableHtml(["棚", "開いた日数", "最後に開いた日", "開いた日（新しい順、12件まで）"], shelfRows, { cell: c => esc(c) })}
      <p class="small muted">単元を開いた日：${unitOpened.length ? unitOpened.map(n => `単元${n}（${(opens["u" + n] || []).length}日、最後 ${esc(jpDate(opens["u" + n].slice(-1)[0]))}）`).join("、") : "まだありません"}</p></section>
    <section class="sec" aria-labelledby="h-io"><h2 class="sec-h" id="h-io">書き出しと読み込み（端末間の移動）</h2>
      <p class="para muted">印・開いた日・自分の現場の答え・数字の記入・単元のメモを1つのJSONにまとめます。読み込むと、この端末の記録はそのJSONの中身に置き換わります。</p>
      <div class="row"><button type="button" class="btn solid" id="io-file">ファイルに書き出す</button><button type="button" class="btn" id="io-text">下の欄に書き出す</button></div>
      <div class="form"><label for="io-area">書き出した文字（読み込むときはここに貼る）</label><textarea id="io-area" spellcheck="false"></textarea>
        <div class="row"><button type="button" class="btn" id="io-copy">欄の文字をコピー</button><button type="button" class="btn" id="io-load">欄の文字を読み込む</button>
        <label class="btn" for="io-pick">ファイルを選んで読み込む</label><input type="file" id="io-pick" accept="application/json,.json" class="sr"></div>
        <p class="small muted" id="io-msg" aria-live="polite"></p></div></section>`;
  const list = () => {
    const cur = marks();
    const ks = Object.keys(cur).filter(k => MK_TYPES.some(([t]) => ntFilter[t] && cur[k][t])).sort((a, b) => (cur[b].t || 0) - (cur[a].t || 0));
    document.getElementById("nt-list").innerHTML = ks.map(k => {
      const v = cur[k];
      const [id, n] = k.split("|");
      const href = /^s\d$/.test(id) ? `#${id}${n !== "0" ? ":" + n : ""}` : /^u\d+$/.test(id) ? `#${id}${n !== "0" ? ":" + n : ""}` : id === "cal" ? "#cal" : /^card-/.test(id) ? "#" + id : (v.href || "#home");
      return `<div class="nt-item"><a href="${esc(href)}"><b>${esc(v.h || k)}</b></a><span class="tags">${MK_TYPES.filter(([t]) => v[t]).map(([t, l]) => `<span class="tag basis">${l}${t === "done" ? " " + esc(v.done) : ""}</span>`).join("")}</span></div>`;
    }).join("") || '<p class="muted">まだありません。棚や単元の見出しの横にある印を押すと、ここに集まります。</p>';
  };
  list();
  main.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => {
    ntFilter[b.dataset.f] = !ntFilter[b.dataset.f];
    b.setAttribute("aria-pressed", String(ntFilter[b.dataset.f]));
    list();
  }));
  const area = document.getElementById("io-area"), msg = document.getElementById("io-msg");
  const dump = () => {
    const memo = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(PREFIX + "memo:")) memo[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } } catch (e) { }
    return JSON.stringify({ schema: "iryo-shakai-ref/1", exported: today(), marks: marks(), opens: store.get("opens", {}), local: store.get("local", {}), nums: store.get("nums", {}), memo }, null, 1);
  };
  document.getElementById("io-text").addEventListener("click", () => { area.value = dump(); msg.textContent = "書き出しました。別の端末の同じ欄に貼って「欄の文字を読み込む」で移せます。"; });
  document.getElementById("io-copy").addEventListener("click", () => { if (!area.value) area.value = dump(); copy(area.value); });
  document.getElementById("io-file").addEventListener("click", () => {
    const blob = new Blob([dump()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `iryo-shakai-ref_${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg.textContent = "ファイルに書き出しました（端末の中に保存。送信はしません）。";
  });
  let armed = false;
  const load = text => {
    let o;
    try { o = JSON.parse(text); } catch (e) { msg.textContent = "読み込めません。書き出した文字をそのまま貼ってください。"; return; }
    if (!o || o.schema !== "iryo-shakai-ref/1") { msg.textContent = "このページで書き出したJSONではありません（schema が違います）。"; return; }
    if (!armed) { armed = true; msg.textContent = "もう一度押すと、この端末の記録が読み込んだ中身に置き換わります。"; return; }
    armed = false;
    ["marks", "opens", "local", "nums"].forEach(k => store.set(k, o[k] || {}));
    try { Object.keys(localStorage).filter(k => k.startsWith(PREFIX + "memo:")).forEach(k => localStorage.removeItem(k)); } catch (e) { }
    Object.entries(o.memo || {}).forEach(([k, v]) => store.set(k, v));
    toast("読み込みました"); sideCount(); viewNote();
  };
  document.getElementById("io-load").addEventListener("click", () => load(area.value));
  document.getElementById("io-pick").addEventListener("change", e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    f.text().then(t => { area.value = t; armed = false; load(t); });
  });
}

/* ---------- 検索（棚・単元・用語・問い・制約カード・暦を横断）。当たりは1行ずつ出し、押すとその行まで飛んで光らせる ---------- */
function buildIndex() {
  const idx = [];
  const head = (kind, title, href) => idx.push({ kind, title, href, text: "", line: "", head: true });
  const line = (kind, title, href, t) => { if (t && String(t).trim()) idx.push({ kind, title, href, text: plain(t), line: String(t) }); };
  const blockLines = blocks => (blocks || []).flatMap(b => b.kind === "table" ? b.rows.map(r => r.join(" ")) : b.kind === "para" ? [b.text] : b.kind === "head" ? [b.text, b.inline || ""] : (b.items || []));
  S.shelves.forEach(s => {
    const t = `棚${s.no} ${s.name}`;
    const sec = (id, name, lines) => { const href = `#s${s.no}:${id}`; head("棚", `${t} › ${name}`, href); lines.forEach(x => line("棚", `${t} › ${name}`, href, x)); };
    head("棚", t, `#s${s.no}`);
    line("棚", `${t} › 状態`, `#s${s.no}`, s.status_text);
    sec("sum", "一言で", [s.summary]);
    sec("fig", "一枚図", [s.figure.plan]);
    sec("num", "押さえる数字", [...s.numbers.rows.map(r => r.join(" ")), ...blockLines(s.numbers.after)]);
    sec("ov", "全体像", s.overview.flatMap(x => [x.title.split("：")[1] || "", x.text, ...blockLines(x.blocks)]));
    sec("cal", "暦", [...s.calendar.rows.map(r => r.join(" ")), ...blockLines(s.calendar.after)]);
    sec("neg", "会議・交渉で使う", s.negotiation);
    sec("mis", "よくある誤解", s.misconceptions);
    sec("local", "自分の現場で確かめること", s.local_checks.flatMap(c => [c.what, c.where]));
    (s.topics || []).forEach((tp, i) => sec(`t${i}`, tp.title, [tp.summary, ...blockLines(tp.blocks)]));
    sec("down", "降り先", [s.down_text]);
    sec("src", "この棚の照合に使った資料", [s.sources_text]);
  });
  const c = S.guide.calendar;
  [["year", c.year], ["multi", c.multi]].forEach(([id, tb]) => { head("暦", `棚をまたぐ暦 › ${tb.title}`, "#cal:" + id); tb.rows.forEach(r => line("暦", `棚をまたぐ暦 › ${tb.title}`, "#cal:" + id, r.join(" "))); });
  S.guide.sections.filter(x => x.title !== "棚をまたぐ暦").forEach(x => { head("記録", `使い方と照合の記録 › ${x.title}`, "#about"); blockLines(x.blocks).forEach(t => line("記録", `使い方と照合の記録 › ${x.title}`, "#about", t)); });
  D.units.forEach(u => {
    const it = u.items, t = `単元${u.unit} ${u.title}`;
    const sec = (i, lines) => { const href = `#u${u.unit}:i${i}`; lines.forEach(x => line("単元", `${t} › ${ITEM_NAMES[i - 1]}`, href, x)); };
    head("単元", t, `#u${u.unit}`);
    sec(1, [it.summary.text]);
    sec(2, [...it.mechanism.flows.map(f => [f.who, f.what, f.to, f.note].filter(Boolean).join(" ")), ...it.mechanism.notes]);
    sec(3, [...it.timeline.rows.map(r => [r.when, r.event, r.basis].join(" ")), ...it.timeline.notes]);
    sec(4, it.field_limits.points);
    sec(5, [it.perspectives.medical, it.perspectives.admin, it.perspectives.welfare]);
    sec(6, it.misconceptions.map(m => m.myth + " " + m.fact));
    sec(7, it.terms.map(x => [x.medical, x.admin, x.meaning].join(" ")));
    sec(8, it.sources.map(x => x.text));
    sec(9, it.local_checks.flatMap(x => [x.what, x.where]));
    sec(10, it.self_check.flatMap(x => [x.question, x.answer]));
  });
  (D.questions || []).forEach(q => { head("問い", q.q, `#q-${q.id}`); [q.answer, ...q.checks, ...q.ask].forEach(x => line("問い", q.q, `#q-${q.id}`, x)); });
  (D.glossary || []).forEach(g => { head("用語", g.term, "#terms"); [g.medical, g.admin, g.welfare, g.gap, g.common].forEach(x => line("用語", g.term, "#terms", x)); });
  (D.cards || []).forEach(cd => { head("カード", cd.role, `#card-${cd.id}`); [...cd.can, ...cd.cannot, ...cd.calendar, ...cd.procedure, cd.metrics, ...cd.bad, ...cd.good, cd.basis.join("、")].forEach(x => line("カード", cd.role, `#card-${cd.id}`, x)); });
  return idx;
}
let INDEX = null;
const SEARCH_MAX = 80;
let lastHits = [], lastQ = "", pendingFind = null;
function excerpt(text, q) {
  const i = text.indexOf(q);
  if (i < 0) return esc(text.slice(0, 70)) + (text.length > 70 ? "…" : "");
  const a = Math.max(0, i - 24), b = Math.min(text.length, i + q.length + 50);
  return (a > 0 ? "…" : "") + esc(text.slice(a, i)) + "<mark>" + esc(q) + "</mark>" + esc(text.slice(i + q.length, b)) + (b < text.length ? "…" : "");
}
function viewSearch(q) {
  INDEX = INDEX || buildIndex();
  setNav("", `「${esc(q)}」の検索`);
  const heads = INDEX.filter(e => e.head && e.title.includes(q));
  const lines = INDEX.filter(e => !e.head && e.text.includes(q));
  const hits = heads.concat(lines);
  lastHits = hits.slice(0, SEARCH_MAX); lastQ = q;
  main.innerHTML = `<section class="sec"><h1 class="sec-h" style="border-top:0;padding-top:0">「${esc(q)}」の検索結果（${hits.length}件）</h1>
    <p class="small muted" aria-live="polite">${hits.length}件見つかりました。${hits.length > SEARCH_MAX ? `先頭の${SEARCH_MAX}件を出しています。言葉を足して絞ってください。` : ""}押すと、その行まで飛んで光らせます。</p>
    <div class="hits">${lastHits.map((e, i) => `<a class="hit" href="${e.href}" data-hit="${i}"><span><span class="tag basis">${e.kind}</span> <b>${esc(e.title)}</b></span>${e.head ? "" : `<small>${excerpt(e.text, q)}</small>`}</a>`).join("") || '<p class="hit muted">見つかりません。別の言い方を試すか、<a href="#terms">用語集</a>を見てください。</p>'}</div></section>`;
  main.querySelectorAll("[data-hit]").forEach(a => a.addEventListener("click", ev => {
    if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    const e = lastHits[+a.dataset.hit];
    pendingFind = e.head ? null : { q: lastQ, line: e.line };
    if (location.hash === e.href) { qg.value = ""; current = ""; route(); }
    else location.hash = e.href.slice(1);
  }));
}
/* 見えている文字だけを、比べやすい形にそろえる（読み上げ用の文字・今月の札・印のボタンは除く） */
const norm = s => plain(s).replace(/【要入力】/g, "").replace(/【(.+?)】/g, "$1").replace(/→/g, "").replace(/\s+/g, "");
function textOf(el) {
  let out = "";
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.parentElement.closest(".sr, .tag.now, .marks")) out += n.nodeValue; }
  return out.replace(/\s+/g, "");
}
function markIn(el, q) {
  /* 太字やリンクの境目をまたぐ言葉にも印を付ける（文字の並びをつないで探し、またいだ部分ごとに包む） */
  const nodes = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.parentElement.closest(".sr, .marks")) nodes.push(n); }
  const all = nodes.map(n => n.nodeValue).join("");
  const hits = [];
  for (let i = all.indexOf(q); i >= 0; i = all.indexOf(q, i + q.length)) hits.push(i);
  if (!hits.length) return;
  const starts = []; let pos = 0;
  nodes.forEach(n => { starts.push(pos); pos += n.nodeValue.length; });
  for (let k = nodes.length - 1; k >= 0; k--) {
    const n = nodes[k], s0 = starts[k], s1 = s0 + n.nodeValue.length;
    const parts = hits.map(h => [Math.max(h, s0) - s0, Math.min(h + q.length, s1) - s0]).filter(([x, y]) => x < y).reverse();
    parts.forEach(([x, y]) => {
      const mid = n.splitText(x); mid.splitText(y - x);
      const m = document.createElement("mark"); m.className = "found";
      mid.parentNode.replaceChild(m, mid); m.appendChild(mid);
    });
  }
}
function findLine(q, lineText) {
  const nq = norm(q), nl = norm(lineText), pre = nl.slice(0, 12);
  const cands = [...main.querySelectorAll("p, li, tr, summary, h3, .flow, .three > div, .u-check label")]
    .map(el => ({ el, t: textOf(el) })).filter(x => x.t.includes(nq));
  if (!cands.length) return false;
  const best = (cands.filter(x => x.t.includes(pre)).length ? cands.filter(x => x.t.includes(pre)) : cands).sort((a, b) => a.t.length - b.t.length)[0].el;
  for (let d = best.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
  markIn(best, q);
  best.classList.remove("flash"); void best.offsetWidth; best.classList.add("flash");
  best.scrollIntoView({ block: "center" });
  best.setAttribute("tabindex", "-1"); best.focus({ preventScroll: true });
  return true;
}
function runFind() {
  if (!pendingFind) return;
  const p = pendingFind; pendingFind = null;
  findLine(p.q, p.line);
}

/* ---------- 画面の切り替え ---------- */
function jump(id) {
  const t = document.getElementById(id);
  if (t) { t.scrollIntoView(); const h = t.querySelector("h2,h3,summary") || t; h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
}
let current = "";
function route(initial) {
  const h = decodeURIComponent(location.hash.slice(1)) || "home";
  const [base, sec] = h.split(":");
  if (base === current && sec) { jump("sec-" + sec); runFind(); return; }
  current = base;
  let m;
  if ((m = base.match(/^s(\d)$/))) viewShelf(+m[1], sec);
  else if ((m = base.match(/^u(\d+)$/))) viewUnit(+m[1], sec);
  else if ((m = base.match(/^q-(.+)$/))) { current = ""; viewQuestions(m[1]); markScrollTables(); runFind(); return; }
  else if ((m = base.match(/^card-(.+)$/))) viewCard(m[1]);
  else if (base === "cal") viewCal();
  else if (base === "about") viewAbout();
  else if (base === "units") viewUnits();
  else if (base === "terms") viewTerms();
  else if (base === "questions") viewQuestions();
  else if (base === "cards") viewCards();
  else if (base === "note") viewNote();
  else { current = "home"; viewHome(); }
  markScrollTables();
  if (base === "cal" && sec) jump("sec-" + sec);
  if (!sec && !pendingFind) { window.scrollTo(0, 0); if (!initial) main.focus({ preventScroll: true }); }
  runFind();
}
function markScrollTables() {
  main.querySelectorAll(".tbl-wrap").forEach(w => {
    if (w.scrollWidth > w.clientWidth + 1) { w.tabIndex = 0; if (!w.getAttribute("aria-label")) { w.setAttribute("role", "region"); w.setAttribute("aria-label", "横に動かせる表"); } }
    else w.removeAttribute("tabindex");
  });
}
window.addEventListener("resize", () => { clearTimeout(markScrollTables.t); markScrollTables.t = setTimeout(markScrollTables, 200); });
window.addEventListener("hashchange", () => {
  const g = document.getElementById("q");
  if (g.value) g.value = "";
  route();
});
const qg = document.getElementById("q");
qg.addEventListener("input", () => {
  const q = qg.value.trim();
  if (q) { current = ""; viewSearch(q); } else route();
});
document.getElementById("search-form").addEventListener("submit", e => e.preventDefault());
document.getElementById("side-nav").innerHTML = sideHtml();
document.getElementById("foot").innerHTML = `中身：${esc(S.meta.content_doc)}（照合 2026年11月11日。docs/shelves の書き出しから取り込み）／単元・用語・問い・制約カード：共通学習ツール 教材 v0（基準日 ${esc(D.meta.baseline)}。${esc(D.meta.status)}）<br>このページは外と通信しません。「自分の現場」の答えと学習の印は、この端末の中だけに残ります。会議で数字や条文を言う前に、各棚の資料で確かめてください。${store.works() ? "" : "<br><b>この環境では保存ができません。書いた内容は閉じると消えます。</b>"}`;
sideCount();
route(true);
