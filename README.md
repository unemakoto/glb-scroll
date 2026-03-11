# 概要
- Not Equal 環境からdata-webglを撤去。glbファイル読み込みのみ。

# 環境
- Node.js v24.14.0
- npm 11.9.0

# 手順
## ローカルサーバー
```npm run dev``` の後に O + Enter でブラウザが起動。

## 検証サーバー
```npm run build-cdn``` でdistディレクトリが生成される。

## 本番サーバー
```npm run build-www``` でdistディレクトリが生成される。

# デバッグ
lil-guiやstats.jsを表示するときはクエリで ```debug=1```を付加する。

