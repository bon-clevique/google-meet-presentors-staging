# Meet Presenter Switch — 実装計画

> Design Doc §8.1 の実装順序に準拠

## 概要

Google Meet で発表者をワンクリック切り替えする Chrome 拡張（Manifest V3）。
ホストのみがインストールし、発表者リスト・資料 URL を事前登録、フローティング UI から即時切り替え。

---

## フェーズ構成

### Phase 1: 基盤（型定義・マニフェスト・アイコン）

| Step | 内容 | ファイル | Bloom | Agent |
|------|------|---------|-------|-------|
| 1-1 | 共有型定義・メッセージ定数 | `shared/types.js` | L3 | Sonnet |
| 1-2 | manifest.json 作成 | `manifest.json` | L3 | Sonnet |
| 1-3 | プレースホルダーアイコン生成 | `icons/` | L1 | Sonnet |

**受入基準:**
- [ ] `shared/types.js` に `PresenterEntry`, `SessionConfig` の JSDoc 型定義と `MSG` 定数が定義されている
- [ ] `manifest.json` が MV3 準拠で `tabs`, `storage`, `activeTab`, `scripting` 権限を含む
- [ ] `host_permissions` が `meet.google.com/*` と `docs.google.com/presentation/*` に限定されている
- [ ] アイコン 3 サイズ（16, 48, 128px）が存在する
- [ ] Chrome / Dia に読み込んでエラーが出ない → `chrome://extensions/` で確認

---

### Phase 2: Service Worker（タブ管理・プリロード）

| Step | 内容 | ファイル | Bloom | Agent |
|------|------|---------|-------|-------|
| 2-1 | メッセージハンドラの骨組み | `background/worker.js` | L3 | Sonnet |
| 2-2 | タブプリロード機能 | `background/worker.js` | L4 | Sonnet |
| 2-3 | セッション永続化（LRU 30 件） | `background/worker.js` | L3 | Sonnet |
| 2-4 | 切り替えシーケンス実装 | `background/worker.js` | L4 | Sonnet |

**受入基準:**
- [ ] `MSG.PRELOAD_TAB` 受信 → `chrome.tabs.create({ active: false })` でバックグラウンドタブが開く
- [ ] `tabs.onUpdated` で `status='complete'` を検知し `preloadStatus` が `'ready'` になる
- [ ] タブロード 15 秒タイムアウトで `preloadStatus` が `'error'` に遷移する
- [ ] `session:{meetCode}` キーで `chrome.storage.local` に保存される
- [ ] 31 件目のセッション保存時に最古の 1 件が削除される
- [ ] `MSG.SWITCH_PRESENTER` で現在タブ停止 → 次タブアクティブ化 → Content Script へ通知が流れる
- [ ] Service Worker 再起動後もセッション状態が復元される

---

### Phase 3: Content Script（Meet DOM 操作・フローティング UI）

| Step | 内容 | ファイル | Bloom | Agent |
|------|------|---------|-------|-------|
| 3-1 | Meet ページ検出・初期化 | `content/meet.js` | L3 | Sonnet |
| 3-2 | フローティング UI 注入 | `content/floating-ui.js` | L3 | Sonnet |
| 3-3 | フローティング UI スタイル | `styles/floating.css` | L3 | Sonnet |
| 3-4 | ドラッグ移動・折りたたみ | `content/floating-ui.js` | L3 | Sonnet |
| 3-5 | 共有停止 DOM 操作 | `content/meet.js` | L4 | Sonnet |
| 3-6 | `getDisplayMedia` 呼び出し | `content/meet.js` | L4 | Sonnet |
| 3-7 | パネル状態更新 | `content/meet.js` | L3 | Sonnet |

**受入基準:**
- [ ] `meet.google.com` でのみ Content Script が実行される
- [ ] フローティングパネルが Meet 画面右下に表示される
- [ ] パネルがドラッグで移動可能、最小化ボタンで折りたたみ/展開できる
- [ ] 「現在の発表者」「次の発表者」の名前が正しく表示される
- [ ] 各発表者のプリロード状態（✅/⏳/❌）がリアルタイムで更新される
- [ ] 「次の発表者へ」ボタンクリック → `stopSharing()` → 800ms 待機 → `getDisplayMedia()` が 1 つのユーザーアクション起点で完了する
- [ ] `aria-label` と `data-tooltip` 両方でボタン検索のフォールバックが存在する
- [ ] ページリロード後もパネルが自動で再注入される

---

### Phase 4: Popup UI（発表者リスト管理）

| Step | 内容 | ファイル | Bloom | Agent |
|------|------|---------|-------|-------|
| 4-1 | HTML/CSS レイアウト | `popup/popup.html`, `popup.css` | L3 | Sonnet |
| 4-2 | 発表者エントリ CRUD | `popup/popup.js` | L3 | Sonnet |
| 4-3 | ドラッグ＆ドロップ並び替え | `popup/popup.js` | L4 | Sonnet |
| 4-4 | URL → コンテンツ種別自動判定 | `popup/popup.js` | L3 | Sonnet |
| 4-5 | Meet コード自動取得・保存 | `popup/popup.js` | L3 | Sonnet |

**受入基準:**
- [ ] ポップアップに発表者名・URL・種別の入力フォームが表示される
- [ ] 追加・削除・並び替え（D&D）が動作する
- [ ] `docs.google.com/presentation` URL 入力で種別が自動的に `slides` に設定される
- [ ] 現在アクティブな Meet タブから `meetCode` が自動抽出される
- [ ] 「保存」で `chrome.storage.local` に永続化される
- [ ] 保存済みセッションを開き直すとリストが復元される
- [ ] 発表者 0 件の状態で保存ボタンが disabled になる

---

### Phase 5: 結合・手動テスト

| Step | 内容 | Bloom | Agent |
|------|------|-------|-------|
| 5-1 | 全コンポーネント結合確認 | L4 | Opus (main) |
| 5-2 | Slides → Slides 切り替えテスト | L4 | ユーザー手動 |
| 5-3 | Slides → 通常タブ切り替えテスト | L4 | ユーザー手動 |
| 5-4 | エラーケーステスト（プリロード失敗、DOM 変更） | L4 | ユーザー手動 |
| 5-5 | ページリロード後の復元テスト | L3 | ユーザー手動 |

**受入基準:**
- [ ] Slides → Slides 切り替えが 3 秒以内に完了する
- [ ] Slides → 通常タブの異種切り替えが正常動作する
- [ ] プリロード失敗時にエラー UI が表示されリトライ可能
- [ ] `chrome.storage` から設定が正しく復元される
- [ ] `aria-label` フォールバックが機能する

---

## Agent Team 構成

| Role | Model | 担当 |
|------|-------|------|
| Leader | **Opus** (main) | 設計判断・タスク割当・最終確認 |
| implementer | Sonnet | Phase 1-4 の実装 |
| reviewer | Sonnet | コードレビュー（Phase ごと） |

---

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| `getDisplayMedia` のユーザージェスチャー制約 | 切り替えが 2 クリックになる | ボタンクリックハンドラ内で同期的に呼び出す |
| Meet DOM セレクターの変更 | 共有停止が動作しない | `aria-label` + `data-tooltip` の多重フォールバック |
| Service Worker の idle 停止 | 状態ロスト | `chrome.storage` で全状態を永続化 |
| プリロードタブが閉じられる | 切り替え失敗 | `tabs.onRemoved` リスナーで `preloadStatus` を `idle` に戻す |
