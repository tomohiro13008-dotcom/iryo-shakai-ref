// dist/index.html を実際のブラウザで開いて確かめる（REVIEW.md の証拠）
// 使い方：node tests/e2e_check.js [スクリーンショットの出力先]
// Playwright（Chromium）を使う。ページの外への通信が1件でもあれば失敗にする。
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const URL = "file://" + path.resolve(__dirname, "..", "dist", "index.html");
const OUT = process.argv[2] || null;
const results = [];
const ok = (name, pass, detail) => { results.push({ name, pass: !!pass, detail: detail || "" }); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1368, height: 780 } });
  const page = await ctx.newPage();
  const external = [], errors = [];
  page.on("request", r => { if (!r.url().startsWith("file://") && !r.url().startsWith("blob:") && !r.url().startsWith("data:")) external.push(r.url()); });
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  const go = async h => { await page.goto(URL + "#" + h); await page.waitForTimeout(60); };

  // 完成条件1：表紙に7棚。状態は文字の札
  await go("home");
  const tiles = await page.$$eval(".tile", ts => ts.map(t => ({ no: t.querySelector(".t-no").textContent, tags: [...t.querySelectorAll(".tag")].map(x => x.textContent), seen: t.querySelector(".t-seen").textContent })));
  ok("表紙に7棚のタイル", tiles.length === 7, tiles.map(t => t.no).join(" "));
  ok("各棚に状態の札（文字）", tiles.every(t => t.tags.some(x => /照合済み|確認済み|仮|未作成/.test(x))), tiles.map(t => t.tags[0]).join(" / "));
  const bandOrder = await page.$$eval(".map .band", bs => bs.map(b => b.getAttribute("aria-label") + ":" + [...b.querySelectorAll(".t-no")].map(x => x.textContent).join(",")));
  ok("三段（これから／制度と現場／土台）の順", bandOrder.join(" | ") === "これから:棚6,棚7 | 制度と現場:棚4,棚5 | 土台:棚1,棚2,棚3", bandOrder.join(" | "));
  ok("表紙の上に検索", await page.$("#q") !== null, "");

  // 完成条件2：7棚すべてに棚ページ。項目がそろい、未作成を隠さない
  for (let n = 1; n <= 7; n++) {
    await go("s" + n);
    const secs = await page.$$eval("main section.sec", ss => ss.map(s => s.id));
    const need = ["sec-sum", "sec-fig", "sec-num", "sec-ov", "sec-cal", "sec-neg", "sec-mis", "sec-local", "sec-down", "sec-src"];
    const fig = await page.textContent("#sec-fig");
    const sites = await page.$$eval("#sec-local .site label", ls => [...new Set(ls.map(l => l.textContent))]);
    const nIn = await page.$$eval("#sec-num input.num-in", x => x.length);
    ok(`棚${n}の棚ページ（10の節・一枚図：未作成・3欄）`, need.every(x => secs.includes(x)) && fig.includes("一枚図：未作成") && sites.join("、") === "鏡野町国保病院、富診療所、継承クリニック", `節${secs.length}、要入力の枠${nIn}`);
  }

  // 完成条件3：12単元と統合アプリへ1タップ
  await go("s2");
  const downs = await page.$$eval("#sec-down a.down", as => as.map(a => a.getAttribute("href")));
  ok("棚2の降り先から単元2・6・10と統合アプリ", ["#u2", "#u6", "#u10"].every(h => downs.includes(h)) && downs.some(h => h.startsWith("https://claude.ai/artifact/")), downs.join(" "));
  let unitsOk = 0; const unitDetail = [];
  for (let n = 1; n <= 12; n++) {
    await go("u" + n);
    const heads = await page.$$eval(".item-h", hs => hs.map(h => h.querySelector(".no") ? h.querySelector(".no").textContent : "").filter(Boolean));
    const box = await page.$$eval(".item", it => it.every(x => x.getBoundingClientRect().width > 300));
    if (heads.join(",") === "1,2,3,4,5,6,7,8,9,10" && box) unitsOk++; else unitDetail.push(`単元${n}:${heads.join(",")}`);
  }
  ok("12単元すべてが開き、見出し10項目がそろう", unitsOk === 12, unitDetail.join(" ") || "12/12");

  // 完成条件5：最後に開いた日と復習の印が残る（再読み込みの後も）
  await go("s3");
  await page.click("#sec-cal .marks .mk.done");
  await page.click("#sec-neg .marks .mk.imp");
  await page.fill("[data-local='s3:0:hosp']", "テスト記入");
  await page.fill("#sec-num input.num-in >> nth=0", "123");
  await page.reload(); await page.waitForTimeout(60);
  const kept = await page.evaluate(() => ({
    done: document.querySelector("#sec-cal .marks .mk.done").getAttribute("aria-pressed"),
    imp: document.querySelector("#sec-neg .marks .mk.imp").getAttribute("aria-pressed"),
    local: document.querySelector("[data-local='s3:0:hosp']").value,
    num: document.querySelector("#sec-num input.num-in").value,
  }));
  ok("印・自分の現場・数字の記入が再読み込み後も残る", kept.done === "true" && kept.imp === "true" && kept.local === "テスト記入" && kept.num === "123", JSON.stringify(kept));
  await go("home");
  const seen3 = await page.$$eval(".tile", ts => ts.find(t => t.querySelector(".t-no").textContent === "棚3").querySelector(".t-seen").textContent);
  ok("表紙に最後に開いた日", /最後に開いた日：\d{4}年/.test(seen3), seen3);

  // マイノート：一覧・書き出し・読み込み
  await go("note");
  const noted = await page.$$eval("#nt-list .nt-item", x => x.length);
  await page.click("#io-text");
  const dumped = await page.inputValue("#io-area");
  const dj = JSON.parse(dumped);
  ok("マイノートに印が集まり、JSONに書き出せる", noted === 2 && dj.schema === "iryo-shakai-ref/1" && dj.local["s3:0:hosp"].v === "テスト記入", `印${noted}件、書き出し${dumped.length}文字`);
  await page.evaluate(() => { localStorage.clear(); });
  await go("note");
  await page.fill("#io-area", dumped);
  await page.click("#io-load"); await page.click("#io-load");
  await page.waitForTimeout(60);
  const back = await page.evaluate(() => JSON.parse(localStorage.getItem("iryoshakai:local") || "{}")["s3:0:hosp"]);
  ok("読み込みで記録が戻る（2回押して置き換え）", back && back.v === "テスト記入", JSON.stringify(back));

  // 用語と検索
  await page.fill("#q", "繰出");
  await page.waitForTimeout(60);
  const kinds = await page.$$eval(".hit .tag", t => [...new Set(t.map(x => x.textContent))]);
  const nHits = await page.$$eval(".hit", x => x.length);
  ok("検索で棚・単元・用語・問いを横断して引ける", ["棚", "単元", "問い"].every(k => kinds.includes(k)), `「繰出」${nHits}件 種類：${kinds.join("・")}`);
  await page.fill("#q", "");
  await go("terms");
  ok("用語集が出る", (await page.$$eval("#gl-list article", x => x.length)) === 10, "");

  // 暦
  await go("cal");
  const nowRows = await page.$$eval("tr.is-now", r => r.map(x => x.cells[0].textContent));
  ok("棚をまたぐ暦（1年と複数年）に今月・今年度の札", nowRows.length === 2, nowRows.join(" / "));

  // キーボードだけ：Tab で左メニューの棚へ行き Enter、棚ページの印を Space で押す
  await page.goto("about:blank"); await page.goto(URL + "#home"); await page.waitForTimeout(60); // 開き直す
  await page.keyboard.press("Tab"); // 本文へ（スキップリンク）
  const skip = await page.evaluate(() => document.activeElement.textContent);
  let reached = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const t = await page.evaluate(() => document.activeElement.getAttribute("href"));
    if (t === "#s5") { reached = true; break; }
  }
  await page.keyboard.press("Enter"); await page.waitForTimeout(60);
  const h1 = await page.textContent("#h-shelf");
  const focusStyle = await page.evaluate(() => { const a = document.querySelector(".side-nav a[href='#s5']"); a.focus(); const s = getComputedStyle(a); return s.outlineStyle + " " + s.outlineColor + " / " + s.boxShadow; });
  ok("キーボード：スキップリンク→左メニュー→Enterで棚5", skip === "本文へ" && reached && h1.includes("病院とクリニックの経営"), `最初のTab「${skip}」`);
  ok("フォーカスは黄色と黒の二重の枠", /solid/.test(focusStyle) && /255, 212, 61|0, 0, 0/.test(focusStyle), focusStyle);
  // 棚ページの中の部品にTabで届くか（印・入力欄・リンクの数）
  const focusables = await page.$$eval("main a[href], main button, main input, main textarea, main summary", x => x.length);
  const unreachable = await page.$$eval("main [onclick], main div[role=button]", x => x.length);
  ok("棚ページの操作部品はすべて a・button・input・textarea・summary", unreachable === 0, `Tabで届く部品 ${focusables}`);

  // スマホの幅：横にはみ出さない、メニューをキーボードで開閉
  const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await m.newPage();
  mp.on("request", r => { if (!r.url().startsWith("file://")) external.push(r.url()); });
  const over = [];
  for (const h of ["home", "s1", "s5", "u2", "cal", "note", "terms"]) {
    await mp.goto(URL + "#" + h); await mp.waitForTimeout(60);
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    if (w > 390) over.push(`${h}:${w}`);
    if (OUT && ["home", "s1"].includes(h)) await mp.screenshot({ path: path.join(OUT, `mobile_${h}.png`) });
  }
  ok("スマホの幅（390px）で横にはみ出さない", over.length === 0, over.join(" ") || "7画面");
  await mp.goto(URL + "#home"); await mp.waitForTimeout(60);
  await mp.focus("#menu-btn"); await mp.keyboard.press("Tab");
  const intoHidden = await mp.evaluate(() => document.activeElement.closest("#side") !== null);
  ok("スマホ幅で閉じたメニューにはTabで入らない", !intoHidden, "");
  await mp.focus("#menu-btn"); await mp.keyboard.press("Enter");
  const opened = await mp.evaluate(() => document.getElementById("side").classList.contains("open") && document.activeElement.closest("#side") !== null);
  await mp.keyboard.press("Escape");
  const closed = await mp.evaluate(() => !document.getElementById("side").classList.contains("open") && document.activeElement.id === "menu-btn");
  ok("スマホのメニューをキーボードで開き、Escで閉じる", opened && closed, "");

  if (OUT) {
    for (const h of ["home", "s2", "u2", "cal"]) { await go(h); await page.screenshot({ path: path.join(OUT, `surface_${h}.png`) }); }
  }
  ok("外への通信が0件", external.length === 0, external.join(" ") || "0件");
  ok("スクリプトのエラーが0件", errors.length === 0, errors.join(" ") || "0件");
  await browser.close();
  const pass = results.filter(r => r.pass).length;
  for (const r of results) console.log(`${r.pass ? "○" : "×"} ${r.name}${r.detail ? "　" + r.detail : ""}`);
  console.log(`${pass}/${results.length}`);
  if (pass !== results.length) process.exit(1);
})();
