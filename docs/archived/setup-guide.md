# Meet Presenter Switch — セットアップガイド

> 実装開始前にユーザーが完了すべき手順

## 1. リポジトリ接続

```bash
cd ~/dev/clevique/meet-staging

# .gitignore 作成
cat <<'EOF' > .gitignore
.DS_Store
node_modules/
*.zip
.env
coverage/
dist/
EOF

git add .gitignore
git commit -m "chore: initial commit"
git branch -M main
git push -u origin main
```

## 2. 開発者モードの有効化（Dia / Chrome 共通）

1. Chromium 系ブラウザ（Dia, Chrome 等）で `chrome://extensions/` を開く
2. 右上の **「デベロッパー モード」** トグルを ON にする
3. 「パッケージ化されていない拡張機能を読み込む」が表示されることを確認

> この設定は拡張開発中ずっと ON のままにしておく。Dia は Chromium ベースのため Manifest V3 拡張がそのまま動作する。

## 3. Google Meet テスト環境

### 必要なもの

| 項目 | 説明 |
|------|------|
| Google アカウント | Meet にアクセスできるアカウント |
| テスト用 Meet | `https://meet.google.com/new` で作成可能 |
| テスト用タブ 2-3 個 | 切り替えテスト用の Web ページや Google Slides |

### テスト用 Google Slides の準備（推奨）

1. [Google Slides](https://slides.google.com) で新規スライドを 2-3 個作成
2. 各スライドの共有設定を「リンクを知っている全員」に変更
3. URL をメモしておく（実装テスト時に使用）

### テスト用 Web ページ（任意）

以下のような公開ページを 2-3 個ブックマークしておくと便利：
- `https://example.com`
- 自分の任意の Web ページ
- ローカルの PDF ファイル（`file://` URL）

## 4. 開発ツール（任意だが推奨）

### Chrome Extension のデバッグツール

| ツール | 用途 | アクセス方法 |
|--------|------|-------------|
| DevTools | Content Script デバッグ | F12 / ⌘+⌥+I |
| Service Worker DevTools | SW のログ確認 | `chrome://extensions/` → 拡張の「Service Worker」リンク |

### ホットリロード（任意）

開発中にファイル変更を自動リロードしたい場合：

```bash
npm install -g web-ext
web-ext run --target chromium --source-dir .
```

> MVP ではホットリロードなしでも十分。`chrome://extensions/` で手動リロード（⟳ ボタン）で対応可能。

## 5. 確認チェックリスト

実装開始前に以下を確認：

- [ ] Git リモートが設定されている (`origin` → GitHub)
- [ ] Dia / Chrome でデベロッパーモードが ON
- [ ] Google Meet にアクセスできるアカウントがある
- [ ] テスト用 Google Slides が 2-3 個用意されている
- [ ] PRD (`files/MeetPresenterSwitch_PRD.md`) を読了
- [ ] Design Doc (`files/MeetPresenterSwitch_DesignDoc.md`) を読了

## 6. プロジェクト構成（実装時に自動生成）

以下のディレクトリ構成は実装フェーズで Claude Code が自動作成します。手動作成は不要です。

```
meet-presenter-switch/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── content/
│   ├── meet.js
│   └── floating-ui.js
├── background/
│   └── worker.js
├── shared/
│   └── types.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── styles/
    └── floating.css
```
