# PDF Clipper

画像やPDFの必要な部分をブラウザ上で選択し、PNGまたはJPGで保存する軽量Webアプリです。

## 特徴

- PNG / JPG / WebP / PDFを読み込み
- ドラッグ＆ドロップ、ファイル選択、クリップボード貼り付け
- マウス・タッチ・ペンで切り抜き範囲を操作
- X・Y・幅・高さの数値指定
- 1:1、4:3、3:2、16:9などの縦横比固定
- PDFのページ移動、150dpi / 300dpi描画
- PNG / JPG書き出し、JPG品質・背景色設定
- 原寸・2倍・3倍出力
- ファイルを外部サーバーへ送信しないブラウザ内処理

## 使い方

1. `index.html`をWebサーバー経由で開きます。
2. 画像またはPDFを読み込みます。
3. 必要な範囲をドラッグで選択します。
4. 形式や出力倍率を選び、「書き出す」を押します。

## ローカル起動

ビルドは不要です。リポジトリ直下で簡易Webサーバーを起動してください。

```bash
python -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。

## GitHub Pagesで公開

GitHubのリポジトリ設定で次を選択します。

1. `Settings` → `Pages`
2. `Build and deployment` のSourceを `Deploy from a branch`
3. Branchを `main`、フォルダーを `/ (root)` に設定

## ショートカット

- `Ctrl / Command + O`：ファイルを開く
- 矢印キー：切り抜き範囲を1px移動
- `Shift + 矢印キー`：10px移動
- `Space + ドラッグ`：画像を移動
- `0`：全体表示
- `1`：100%表示
- `+ / -`：拡大・縮小
- `Enter`：書き出す

## 技術構成

- HTML
- CSS
- Vanilla JavaScript
- Canvas API
- PDF.js（CDNから遅延読み込み）

## 注意

- PDFはページを画像として描画して切り抜きます。PDF内の埋め込み画像を直接抽出する方式ではありません。
- 非常に大きなPDFページは、ブラウザのCanvas上限を避けるため最大辺16,000pxに調整します。
- PDFの表示にはCDN上のPDF.jsを利用するため、初回読み込み時はインターネット接続が必要です。画像のみの利用は追加通信なしで動作します。

## License

MIT
