# PDF Clipper

画像やPDFの必要な部分をブラウザ上で選択し、PNGまたはJPGで保存する軽量Webアプリです。
ファイルは外部サーバーへ送信せず、読み込み・切り抜き・画像生成をブラウザ内で行います。

## 主な機能

### 読み込み

- PNG / JPG / WebP / PDF
- ドラッグ＆ドロップ
- ファイル選択
- クリップボードからの画像貼り付け
- PDFのページ移動
- PDFの150dpi / 300dpi描画

### 切り抜き編集

- マウス・タッチ・ペンによる範囲操作
- X・Y・幅・高さの数値指定
- 1:1、4:3、3:2、16:9、9:16、A判などの縦横比固定
- 左・中央・右、上・中央・下への整列
- Shift＋ドラッグによる水平・垂直移動
- Shift＋ハンドルによる中心基準の対称リサイズ
- 元に戻す・やり直す
- 左右90度回転
- 周囲の単色・透明余白の自動削除
- 3分割グリッドと選択サイズ表示

### 書き出し

- PNG / JPG
- JPG品質・背景色設定
- 0.5倍・原寸・2倍・3倍出力
- PNGとしてクリップボードへコピー
- 複数の切り抜きを書き出し候補へ保存
- 候補を個別保存、またはZIPで一括保存

## 基本的な使い方

1. 画像またはPDFを読み込みます。
2. 必要な範囲をドラッグで選択します。
3. 必要に応じて整列、回転、余白削除、縦横比を調整します。
4. 形式や倍率を選び、「書き出す」を押します。

複数箇所を書き出す場合は、それぞれの範囲で「候補に追加」を押し、最後に「ZIPでまとめて保存」を使用します。候補へ追加した時点の形式・倍率・品質で画像が生成されます。

## ローカル起動

ビルドは不要です。リポジトリ直下で簡易Webサーバーを起動してください。
ES ModulesとPDF.jsを使用するため、`index.html`の直接起動ではなくWebサーバー経由で開きます。

```bash
python -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。

## GitHub Pagesで公開

1. `Settings` → `Pages`
2. `Build and deployment` のSourceを `Deploy from a branch`
3. Branchを `main`、フォルダーを `/ (root)` に設定

## ショートカット

- `Ctrl / Command + O`：ファイルを開く
- `Ctrl / Command + Z`：元に戻す
- `Ctrl / Command + Y` または `Ctrl / Command + Shift + Z`：やり直す
- 矢印キー：切り抜き範囲を1px移動
- `Shift + 矢印キー`：10px移動
- `Shift + 枠内ドラッグ`：水平または垂直に移動
- `Shift + ハンドル`：中心を保ったまま対称にサイズ変更
- `Space + ドラッグ`：画像を移動
- `0`：全体表示
- `1`：100%表示
- `+ / -`：拡大・縮小
- `Enter`：現在の範囲を書き出す

## 技術構成

- HTML
- CSS
- Vanilla JavaScript
- ES Modules
- Canvas API
- PDF.js（PDF描画時にCDNから読み込み）
- JSZip（ZIP作成時にCDNから読み込み）

## ファイル構成

```text
index.html
styles.css
enhancements.css
app.js
enhancements.js
advanced/
  init.js
  shared.js
  overlay.js
  history-transform.js
  output.js
```

`app.js`が基本的な読み込み・編集・書き出しを担当し、`advanced/`以下が履歴、回転、余白削除、グリッド、複数候補、ZIP出力などの発展機能を担当します。

## 注意事項

- 「PNGをコピー」はClipboard APIを使用するため、GitHub PagesなどのHTTPS環境での利用を推奨します。
- PDF.jsとJSZipは必要な操作を行った時点でCDNから読み込みます。
- 非常に大きなPDFや出力画像は、ブラウザのCanvas上限に合わせて制限される場合があります。
- 余白の自動削除は四隅の色を背景として推定します。四隅に主要な図柄がある画像では、手動調整を併用してください。
