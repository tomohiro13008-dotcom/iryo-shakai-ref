# 医療と社会のレファレンス（個人用）

医療と社会、お金の流れ、自治体行政、医療・介護・福祉の制度、病院とクリニックの経営、2040年の地域医療構想、攻めの予防医療。この7つの棚を一画面で見渡し、会議や交渉の前に引けるようにする個人用のレファレンス。地域医療支援統合アプリの外部レファレンスとして組み込む。

## 引き継ぎ欄

- **現在地**（2026-11-11）：v0 を作った（`dist/index.html`。表紙の地図、7棚のページ、棚をまたぐ暦、12単元、用語と検索、マイノート）。一枚図は7棚とも未作成。公開はしていない
- **次の一手**：`REVIEW.md` の「未解決」1・2・4を決める（町名を残すか、数字を5つに絞るか、公開先）。Docs 側で棚7の「子宮須」を直して書き出し直す。公開したら `ext_ref_patch.md`（`seido-ref` の行の差し替え）を統合アプリに当てる

## 置き場所

| パス | 中身 | 正本 |
| --- | --- | --- |
| `docs/design_v0.md` | 設計書（2026-11-11の書き出し） | Claude Docs「医療と社会のレファレンス 設計書 v0（個人用）」 https://claude.ai/artifact/ULuxZk4ovuyuQL3HyLXtn3 |
| `docs/shelves/` | 7棚の中身と使い方・暦（2026-11-11の書き出し） | Claude Docs「医療と社会のレファレンス 中身 v1」 https://claude.ai/artifact/R1Tr4rSb8dhdC2UPVapqtT |
| `source/kyotsu-gakushu-web_v0.html` | 共通学習ツールWeb版（12単元のデータと表示の実装。取り込み元） | https://claude.ai/artifact/NdFbeHqhDDxbqrWejV1X4K |
| `dist/index.html` | レファレンス本体（公開するのはこれだけ。`build.py` で作る。手で直さない） | このリポジトリ |
| `data/shelves.json` | 7棚と棚をまたぐ暦のデータ（`docs/shelves/` から `python3 build.py import` で作る） | `docs/shelves/` |
| `data/units.json` | 12単元・用語集・制約カード・問いのデータ（共通学習ツールWeb版と同じ型） | このリポジトリ（単元の正本） |
| `src/` | ページの骨組み・CSS・JS | このリポジトリ |
| `build.py` | ビルド1本（Python 3 の標準だけ） | このリポジトリ |
| `tests/` | ブラウザーでの確かめ（`e2e_check.js`）と色のコントラストの計算（`contrast.py`） | このリポジトリ |
| `review/` | 確かめたときの画面 | このリポジトリ |
| `ext_ref_patch.md` | 統合アプリに当てる差分（EXTERNAL_REFS の1行と更新履歴1件） | このリポジトリ |

文章の正本はClaude Docs。ここにあるMarkdownは書き出した写しなので、Docsを直したら書き出し直す。

## 作り方

```bash
python3 build.py import
```

`docs/shelves/` を書き出し直したときだけ。`data/shelves.json` を作り直す（`data/units.json` も `source/` から作り直すので、単元のJSONを直接直したあとは実行しない）。

```bash
python3 build.py check
```

`dist/index.html` と、単元のJSONから作り直した共通学習ツールWeb版（`build/`、公開しない）を作り、Web版が `source/` と同じかを確かめる。

```bash
NODE_PATH=$(npm root -g) node tests/e2e_check.js review
```

Playwright が入っている環境で、完成条件・キーボード操作・通信なしをブラウザーで確かめる。

## 関連

- 統合アプリの正本：https://claude.ai/artifact/MYSiYXX18B8yogk8eei1to（v4.0-dev88〜）
- 共通学習ツール 教材v0（12単元の本文）：https://claude.ai/artifact/Lqs5RgQrYWE9dUscQpsozg

## 公開とNetlifyのクレジット

- 作成中はNetlifyにつながない。確認はローカルか、Claudeの公開ページ（Netlifyのクレジットを使わない）
- Netlifyにつなぐときは、本番ブランチを `release` にする。`main` へのpushは本番デプロイにならない
- 念のため `netlify.toml` で、コミットメッセージに `[deploy]` があるときだけビルドする
- Codeからは `.claude/settings.json` でNetlifyのツールとコマンドを禁止してある
- 本番デプロイは1回15クレジット。無料枠は月300（20回分）で、使い切ると全サイトが止まる。ブランチデプロイとデプロイプレビューは0
