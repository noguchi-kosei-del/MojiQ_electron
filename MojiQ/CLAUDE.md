# MojiQ 開発メモ

## 概要
MojiQはPDF校正ツールです。PDF注釈の読み込み、描画オブジェクトの追加、済スタンプによる確認管理機能を提供します。

## アーキテクチャ

### MojiQ名前空間 (2026-03-24追加)

グローバル変数を統一管理するため、`window.MojiQ`名前空間を導入しました。

**ファイル**: `js/core/namespace.js`

**使用方法**:
```javascript
// 推奨（新しい方法）
MojiQ.PdfManager.loadPdf(...)
MojiQ.Drawing.init(...)
MojiQ.Modal.showAlert(...)

// 後方互換性（従来の方法、引き続き動作）
window.MojiQPdfManager.loadPdf(...)
```

**モジュール一覧**:
- `MojiQ.PdfManager` - PDF管理
- `MojiQ.Drawing` - 描画機能
- `MojiQ.DrawingObjects` - 描画オブジェクト管理
- `MojiQ.DrawingRenderer` - 描画レンダリング
- `MojiQ.Modal` - モーダルダイアログ
- `MojiQ.Store` - 状態管理
- `MojiQ.Events` - イベントバス
- その他多数（`MojiQ.list()`で確認可能）

**デバッグ**:
```javascript
MojiQ.debug()  // 名前空間の状態を出力
MojiQ.list()   // 登録済みモジュール一覧
```

### モジュール命名規則

| パターン | 説明 | 例 |
|---------|------|-----|
| `MojiQ.Xxx` | 統一名前空間（推奨） | `MojiQ.PdfManager` |
| `window.MojiQXxx` | 後方互換性エイリアス | `window.MojiQPdfManager` |
| `window._MojiQXxx` | 内部モジュール | `window._MojiQPdfCache` |

### エラーハンドリング (2026-03-24追加)

**ファイル**: `js/core/error-handler.js`

標準化されたエラーハンドリングモジュール。

```javascript
const ErrorHandler = MojiQ.ErrorHandler;

try {
    // 処理
} catch (e) {
    ErrorHandler.handle(e, 'ModuleName.functionName', {
        level: ErrorHandler.Level.ERROR,  // DEBUG, INFO, WARN, ERROR, FATAL
        notify: true,  // ユーザーにモーダルで通知
        context: { fileName: 'test.pdf' }  // 追加情報
    });
}

// 同期関数用ラッパー
const result = ErrorHandler.tryCatch(() => {
    return riskyOperation();
}, 'location', { notify: true, defaultValue: null });

// 非同期関数用ラッパー
const result = await ErrorHandler.tryCatchAsync(async () => {
    return await asyncOperation();
}, 'location', { notify: true });
```

### バリデーションユーティリティ (2026-03-24追加)

**ファイル**: `js/core/validators.js`

共通のバリデーション関数。

```javascript
const V = MojiQ.Validators;

// 座標検証
if (!V.isValidPosition(pos)) return;

// サイズ検証
if (!V.isValidSize(size)) return;

// オブジェクト検証
if (!V.isValidObject(obj, ['id', 'type'])) return;

// スケール検証（NaN/Infinity防止）
if (!V.isValidScalePair(scaleX, scaleY)) return;

// ページ番号検証
if (!V.isValidPageNumber(pageNum, maxPages)) return;
```

## 最近の主要な変更 (2026-03〜05)

### v2.3.6 セキュリティ強化（CSP・ファイルアクセス許可リスト・OOM対策） (2026-05-29)

機能追加・変更はなく、**セキュリティ強化のみ**のリリース。2026-05-29 のセキュリティ監査（Tauri 版で問題視された「WebView から PC 全ファイルへアクセス可能」「CSP 無効」の 2 項目を Electron 版で確認）の結果を反映。

#### 1. CSP（Content-Security-Policy）の確実な適用 — 最重要

**問題**: CSP が `electron/main.js` の `session.defaultSession.webRequest.onHeadersReceived`（HTTP ヘッダー注入）のみで設定されていたが、本アプリは `loadFile()` で `file://` として HTML を読み込むため、ヘッダー注入だけでは CSP が確実に適用されない。HTML 側に `<meta>` タグが無かった。

**修正内容**: `index.html` / `calibration-viewer.html` / `electron/splash.html` の 3 ファイルの `<head>` に、`main.js` の `appCsp` と**完全同一**の `<meta http-equiv="Content-Security-Policy">` を追加（meta タグ ＋ ヘッダー注入の二重 = 多層防御）。
- ディレクティブ: `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'`
- `'unsafe-inline'`（script/style）はアプリ内テンプレート由来の `onclick`・インラインスタイル互換のため残置。**外部スクリプトのロードはブロック**（最大の XSS 入口を封鎖）
- 検証方法: `npm run dev`（`--mojiq-csp-debug=1` 付き）で起動し、DevTools Console で外部スクリプト注入を試すと `Refused to load the script ... violates ... script-src` が出れば適用済み。`window.electronAPI.getCspViolations()` で違反ログ取得（debug ビルドのみ公開）

#### 2. ファイルアクセス制御（allowlist 方式）— 最重要

**目的**: WebView（レンダラー）層から任意の PC ファイルへアクセスさせない。

**実装** (`electron/main.js`):
- `isReadFileAllowed()` / `isWriteFileAllowed()` による許可リスト検証。許可されるのは ①ユーザーがダイアログで明示選択したパス（`allowReadFile`/`allowWriteFile` 登録） ②JSON フォルダ配下（`isPathInJsonFolder`） ③校正テキストフォルダ配下（`isPathInTxtFolder`）のみ
- 全ファイル IPC（`read-file` / `read-file-binary` / `save-file` / `get-file-size` / `check-disk-space` / `file-exists`）が冒頭で検証し、外れたら `forbiddenPathResponse()`（`FORBIDDEN_PATH`）を返す
- `isPathSafe()`：`..` トラバーサル・`\0`・Windows デバイスパス/予約名/禁止文字を拒否。`fs.realpathSync.native` でシンボリックリンク解決後に基準フォルダ照合（`isRealPathUnderBase`）
- **PDF オープンの経路をダイアログ経由に変更**: ブラウザの `<input type=file>`（`pdfUpload.click()`）から、許可リスト登録を伴うネイティブダイアログ `showOpenPdfDialog()` 経由に切替（`js/script.js` の `openPdfWithAllowedDialog()`、`js/pdf-manager.js` の `openPdfHandler`）。Electron 環境では `file.path` を `currentSaveFilePath` に保持して上書き保存を可能化
- **D&D ファイルの許可登録**: `electron/preload.js` の `registerDroppedFiles()` が drop されたファイルパスを `register-dropped-files` IPC で許可リストに登録

#### 3. OOM・プロセス分離・堅牢化

- **読み込みサイズ上限**: `read-file` = 100MB、`read-file-binary` = 500MB（`fs.promises.stat` で事前チェック）
- **同期 I/O の非同期化**: `read-file`/`save-file` 等を `fs.promises` 化しメインプロセスのブロックを防止
- **一時ファイルのスコープ化**: `getMojiqTempDir()` で `%TEMP%\MojiQ` 配下に限定（`app.getPath('temp')` は同関数内の 1 箇所のみ）
- **コマンドインジェクション対策**: ディスク容量取得の `wmic` はドライブレターを `/^[A-Z]$/` で検証後に実行（`execSync` → 非同期 `exec` 化）。印刷（SumatraPDF）は `spawn` 配列引数でシェル非経由
- **packaged ランタイム判定**: `getSecurityPreloadArgs()`（`--mojiq-packaged=0/1`）で preload に環境を伝達。`get-runtime-security-info-sync` IPC でフォールバック

#### 4. セキュリティ回帰チェックスクリプト

- `scripts/check-security-regression.mjs`（`npm run check:security`）を新設。`contextIsolation:true` / `nodeIntegration:false` / 各ファイル IPC の許可リスト検証 / realpath 照合 / temp スコープ / packaged フラグ / CSP debug API の露出制御 などを静的検査し、退行を CI 的に検出

#### Electron 基本設定（従来から維持）
- `nodeIntegration: false` / `contextIsolation: true`（全ウィンドウ・子ウィンドウ）、Electron 28 のため `sandbox` デフォルト有効
- レンダラーへの API 公開は `contextBridge.exposeInMainWorld('electronAPI', ...)` のみ

#### 残存する軽微なハードニング候補（任意・未対応）
- `setWindowOpenHandler` が全 URL に `action: 'allow'` を返す（想定 URL 以外は `deny`＋`shell.openExternal` が望ましい）
- `webContents.on('will-navigate', ...)` 未設定

**変更ファイル**:
- `electron/main.js` — allowlist 検証・CSP ヘッダー注入・サイズ上限・temp スコープ・wmic 非同期化・packaged フラグ・`showOpenPdfDialog`/`register-dropped-files`/`file-exists` ハンドラ
- `electron/preload.js` — CSP 違反ロガー（debug 限定）・packaged 判定・`registerDroppedFiles`（D&D 許可登録）・`getCspViolations`（debug 限定公開）
- `index.html` / `calibration-viewer.html` / `electron/splash.html` — CSP `<meta>` タグ追加
- `js/script.js` / `js/pdf-manager.js` — PDF オープンを許可リスト登録ダイアログ経由に変更
- `package.json` — `check:security` スクリプト追加、`dev` に `--mojiq-csp-debug=1` 追加、バージョンを `2.3.5` → `2.3.6` に更新
- `scripts/check-security-regression.mjs` — 新規（セキュリティ回帰チェック）

---

### v2.3.5 折れ線ツールのEsc確定・Shift直角スナップ (2026-05-22)

#### 1. Escキーで「開いた折れ線」として確定

**変更内容**: 折れ線描画中（`state.currentMode === 'polyline' && state.interactionState === 3`）の `Esc` キーを、従来の「破棄してキャンセル」から「**始点と繋がない開いた折れ線として確定**」に変更。`Enter` キーとダブルクリックは従来通り「始点と末尾を結んだ閉じた折れ線として確定」。

**実装**:
- `finalizePolyline(closeShape = true)` に引数を追加。`closeShape=false` のときは末尾に始点を追加せずそのまま保存
- `boundKeydownHandler`（折れ線モードの分岐）で `Esc` → `finalizePolyline(false)` / `Enter` → `finalizePolyline(true)` に振り分け
- `boundDblclickHandler` は `finalizePolyline(true)` を明示
- `cancelPolyline()` 関数は `removeEventListeners()` のクリーンアップ経路（モード切替時の中断）で引き続き使用するため削除せず温存

#### 2. Shift押下で前頂点から水平/垂直に直角スナップ

**変更内容**: 折れ線の2頂点目以降を Shift を押しながら配置すると、前頂点からの x方向／y方向の差分が大きい軸を残し、もう一方を 0 に丸めて **水平 or 垂直の線分**として描画される。プレビュー線・確定点の両方に適用。

**実装**:
- `snapToRightAngle(prev, curr)` ヘルパー追加。`Math.abs(dx) >= Math.abs(dy)` なら水平（`y = prev.y`）、そうでなければ垂直（`x = prev.x`）にスナップ
- `startDrawing` の polyline 2回目以降クリック分岐で、`e.shiftKey` ならローカル座標・キャンバス座標の両方にスナップを適用してから push
- `draw`（mousemove プレビュー）の polyline 分岐で、`e.shiftKey` ならプレビュー線の終端をスナップ後の座標にする

**パン操作との競合解消** (主要な追加修正):
`startDrawing` 冒頭の Shift+左クリック判定（`isShiftLeftDrag`）が、Shift キー併用クリックをパン操作として吸収していたため、`shiftSnapModes` リストに `'polyline'` を追加してパン化を抑止。これがないと Shift+クリックが頂点追加へ届かず、スナップ機能自体が動かない。

**注意**: プレビュー線はマウス移動イベントに紐付くため、Shift を押す／離すだけで再描画はされない（カーソルを少し動かせば追従）。意図的な単純化。

**変更ファイル**:
- `js/drawing.js` — `shiftSnapModes` に `'polyline'` 追加、`snapToRightAngle()` 追加、`finalizePolyline(closeShape)` 引数化、Esc/Enter/dblclick の確定経路を整理、`startDrawing` と `draw` の polyline 分岐で Shift スナップ適用
- `package.json` / `package-lock.json` — バージョンを `2.3.4` → `2.3.5` に更新

---

### v2.3.4 文字サイズ（アップ・ダウン）スタンプセクション追加 (2026-05-19)

#### 指示入れモード右サイドバーに「文字サイズ（アップ・ダウン）」セクションを新設

**変更内容**: 既存「文字サイズ」セクションの直下（「フォント指定」の上）に、`〇ptアップ` /
`〇ptダウン` の文言スタンプセクションを新規追加。挙動・UI は「文字サイズ」と同等
（トグル開閉／4列グリッド／追加・編集・削除・すべて削除）。スタンプ選択後にキャンバスを
ドラッグすると、引出線付きの赤・白フチテキストとして配置される。

**実装方針**: 文字サイズ／フォント指定スタンプは保存時 `type:'text'` 統一オブジェクト＋任意の
`leaderLine` で、配置・引出線・描画パイプラインは `state.activeStampText` で駆動される。
したがって `drawing.js` / `script.js` / `drawing-renderer.js` / `drawing-modes.js` /
`types.js` / `constants.js` は **変更不要**。新セクションは「文字サイズ」セクションの複製で実現。

**仕様**:
- スタンプ文言: `${value}pt` ＋ `アップ`／`ダウン`（小数対応、例 `1.5ptアップ`）。
- ボタン属性: `dataset.value`（pt数）／`dataset.direction`（`up`|`down`）／`dataset.text`（全文言）。
  識別セレクタは `.stamp-btn[data-direction]`（文字サイズ=`[data-size]` / フォント=`.font-type`
  と非衝突）。
- 既定プリセット: アップ `0.5,1,1.5,2,2.5,3,4,5` / ダウン `0.5,1,1.5,2`。
  文字サイズと同様に **非永続**（毎セッション既定値で再生成）。作品仕様プリセットには非連動だが、
  `rebuildStampButtons`（プリセット読み込み時の全再構築）でも生成するためセクション自体は消えない。
- 追加フロー: 「追加」→ `showPrompt` で pt数入力 → `showChoice`（既存の縦並び選択ダイアログ）で
  アップ／ダウン選択 → 配置。編集は pt数のみ変更（方向は維持）。
- 「文字サイズ」「フォント指定」と相互排他（選択表示・トグル active・ボタン active を相互クリア）。

**変更ファイル**:
- `js/stamps.js` — モジュール変数（`sizeAdjustToggleBtn`/`sizeAdjustDropdown`/
  `sizeAdjustPaletteDiv`/`selectedSizeAdjustDisplay`）＋`SIZE_ADJUST_DEFAULTS`、
  `sizeAdjustLabel` / `createSizeAdjustStampElement` / `createSizeAdjustActionRow` /
  `updateSizeAdjustButtonStates` / `buildSizeAdjustArea` / `getOrCreateSizeAdjustPalette` /
  `addSizeAdjustStamp` を追加。`renderDefaultButtons` / `rebuildStampButtons` の両方で生成。
  `updateSelectedDisplay`（`'sizeAdjust'` 分岐追加＋size/font 分岐に相互クリア）/
  `clearSelectedDisplay` / `setupToggleListeners`（新トグル＋外側クリック）/
  `closeAllDropdowns` / `forceCloseAllDropdowns` / `cleanup` を拡張
- `js/mode-controller.js` — `toggleDeleteModeForSection` / `toggleEditModeForSection` /
  `turnOffAllSectionModes` に `'sizeAdjust'`（`sizeAdjust*ModeBtn` / `.sizeadjust-section`）対応
- `css/stamps.css` — `.sizeadjust-section`（`.stamp-section` 同等＋スクロールバー）、
  3列グリッド、アップ＝赤基調／ダウン＝青基調の色分け、トグルラベル2行整理＋選択ピル調整
- `css/components.css` — `.sizeadjust-section.delete-mode`/`.edit-mode` を既存ルールに追加
- `css/dark-mode.css` — `.sizeadjust-section` ＋アップ/ダウン色分けのダークモード対応
- `package.json` / `package-lock.json` — バージョンを `2.3.3` → `2.3.4` に更新
  （`package-lock.json` は過去 `2.2.6` で乖離していたため合わせて `2.3.4` に統一）
- `index.html` — 変更なし（スタンプ系セクションは `#stampContainer` に動的生成）

#### 実装後の UI 調整（フィードバック反映）

1. **選択時にトグルボタンが縦に伸びる不具合の修正**: `.stamp-toggle-btn .toggle-label` は
   `flex-shrink:0` かつ `white-space:normal` のため、長いラベル「文字サイズ（アップ・ダウン）」が
   選択ピル出現時に折り返してボタンが3行分に肥大化していた。`#sizeAdjustStampToggleBtn` 限定の
   スコープCSSで対処。
2. **ドロップダウンを4列→3列に変更**: 文言が長く `0.5pt…` のように省略されていたため、
   `.sizeadjust-section .stamp-palette` を `repeat(3,1fr)` にしてボタン幅を拡大。
3. **アップ＝赤基調／ダウン＝青基調の色分け**: `.sizeadjust-section .stamp-btn[data-direction="up"]`
   を赤系（`--color-proofreading-*`）、`[data-direction="down"]` を青系（`--color-primary-*`）に。
   通常／ホバー／`.active`、ダークモードも対応。アップ群が上・ダウン群が下に並ぶため色で分離表示。
4. **トグルラベルを2行に整理＋選択スタンプをピル表示**: ラベルを `文字サイズ<br>（アップ・ダウン）`
   に改行し横幅を確保。横1行ラベルが選択ピルの幅を潰して `3ptアップ` が `3` までしか見えなかった
   問題を解消（ピルは font-size/margin/padding を詰めて省略表示）。選択中スタンプ表示自体は
   `updateSelectedDisplay('sizeAdjust', …)` で既に機能しており、CSS幅の問題のみ。

---

### v2.2.6 ズーム時の余白拡張・Ctrl+A による UI 誤フォーカス防止 (2026-05-08)

#### 1. ズーム時に画像/PDF の外側に動的な余白（overscroll margin）を付与

**問題**: 画像/PDF をズームした時、画像の端付近に視点を寄せると外側の余白が固定 20px のままで、ズーム倍率が上がるほど画像の端をビューポート中央付近に持ってこられない（移動可能範囲が窮屈に感じる）。

**修正方針**: PsDesign（`C:\Users\noguchi-kosei\Desktop\PsDesign\ver_1.0`）の `applyOverscrollMargin()` を移植。画像が `.shared-canvas-area` のクライアント領域を溢れた時のみ、`#canvas-wrapper` 自身に動的な `style.margin` を付与してスクロール可動範囲を拡張する（Photoshop のキャンバス挙動に近い）。CSS の `padding: 20px` は残したまま、上から動的 margin を載せる二段構え。

**修正内容**:
- `js/constants.js` — `ZOOM.OVERSCROLL_FRACTION = 0.85` を追加（ビューポート寸法に対する片側マージン比率。PsDesign 準拠で `0.5 = 控えめ / 1.0 = 画面外まで送れる`）
- `js/zoom.js` `applyOverscrollMargin()` を新規追加。`baseCSSExtent × currentZoom` が `canvasArea.clientWidth/Height` を超えたら `padX = round(availW × 0.85)` / `padY = round(availH × 0.85)` を `canvasWrapper.style.margin` に設定。収まる時はクリア
- `js/zoom.js` `updateZoomDisplay()` の末尾で `applyOverscrollMargin()` を呼ぶ。これによりズーム値変更／ページ切替／PDF再描画／見開き切替（`pdf-manager.js` で `baseCSSExtent` 更新後に `MojiQZoom.updateZoomDisplay()` を呼んでいる4経路）すべてにマージンが自動追従
- `js/zoom.js` `performZoom()` / `performZoomToPoint()` のスクロール計算をマージン差分対応に変更:
  ```
  scrollLeft = (scrollLeft + offsetX - prevPadX) × ratio - offsetX + newPadX
  ```
  これにより新規マージン付与/剥離の瞬間でもビューポート中心（または Alt+ホイール時のマウス位置）が画像内のずれた点を指さない
- `js/zoom.js` `setupResizeObserver()` を追加。`.shared-canvas-area` を ResizeObserver で監視してウィンドウリサイズ時にもマージン再計算。`cleanup()` でも `disconnect`

**影響範囲**: `#canvas-wrapper` 内の座標系（描画ツール・選択・パン）はマージンの外側にあるため影響なし。マージンが付かない倍率（ビューポートに収まる時）の挙動は完全に従来通り。

#### 2. Ctrl+A による UI 要素への誤フォーカス防止

**問題**: キャンバス上で Ctrl+A を押すと、ブラウザのデフォルト動作でページ全体のテキストが選択され、サイドバーのラベル・「セリフ見本を入力」textarea・文字サイズ/線の太さ input 等の UI 要素にカーソルが移ってしまう。MojiQ には独自の `selectAll` ショートカットが未定義のため、ブラウザデフォルトが素通しになっていた。

**修正内容** (`js/shortcuts.js`):
- `keydownHandler` の `isCtrlOrMeta` ブロック末尾に Ctrl/Cmd+A の捕捉処理を追加
- INPUT / TEXTAREA / contenteditable にフォーカスがある時（`isInputActive(e) === true`）は通常動作（編集中テキストの全選択）を許可
- それ以外（キャンバス上・UI 余白）では `e.preventDefault()` でブラウザのデフォルトを止め、`document.activeElement.blur()` で残留フォーカスも外す
- `!e.shiftKey && !e.altKey` 条件で Ctrl+Shift+A / Ctrl+Alt+A を将来別ショートカットへ割り当てる余地を残す

#### バージョン更新

**package.json**: バージョンを `2.2.5` → `2.2.6` に更新。`package-lock.json` の `version` フィールドが過去 `2.0.5` で乖離していたため、合わせて `2.2.6` に揃えた。

---

### v2.2.5 Acrobat注釈テキストがオブジェクト化されないバグ修正 (2026-05-07)

#### Acrobat の Text(ノート) 注釈が MojiQ で表示されない問題を修正

**症状**: MojiQ で保存した PDF を Acrobat で開き、Text 注釈（ノート/コメント）を新規追加して再保存し、再度 MojiQ で開くと、追加した Acrobat 注釈がテキストオブジェクト化されずに表示されない。

**原因**: `js/pdf-annotation-loader.js` の `isMojiQProcessedAnnotation` が「**テキスト内容一致 OR 30px 以内座標一致**」という OR 判定で誤マッチしていた。
- MojiQ 保存時に Subject メタデータへ `MojiQText:...`（MojiQ オリジナルテキストの内容＋座標）を記録する。
- 再オープン時、各 PDF 注釈をこのメタデータと突合し、マッチしたものはラスタライズ済みとみなしてスキップする想定。
- ところが内容のみで一致する OR 判定のため、過去 MojiQ で書いた「修正」「OK」「!?」のような短い定番フレーズと同じ文字列の Acrobat 注釈が **位置に関係なく除外**されていた。
- もしくは内容が違っていても **30px 以内に偶然入っただけ**でも除外されていた。
- そもそも `MojiQText` メタデータは [pdf-lib-saver.js:72](js/pdf-lib-saver.js) の `!obj._pdfAnnotationSource` 判定により **MojiQ オリジナルテキスト（PDF 注釈由来でないもの）しか記録しない**ので、Acrobat 注釈との内容のみ／位置のみ OR 判定は本来正当な動機がない。

**修正内容** (`js/pdf-annotation-loader.js`):
- `isMojiQProcessedAnnotation` の判定を **「内容一致 AND 30px 以内座標一致」の AND** に変更。
- これにより「同じ内容を別の場所に貼った Acrobat 注釈」「同じ位置に違う内容を貼った Acrobat 注釈」のどちらも正しくオブジェクト化される。
- 副次的に `obj.startPos` / `mojiQ.canvasRect` の null ガードと、`savedWidth/Height = 0` 時の `scaleX/Y = 1` フォールバック（旧コードはゼロ除算で Infinity になっていた）を追加。
- `POS_TOLERANCE_PX = 30` で旧トレランスを維持。

**`isCheckedAnnotation`（済スタンプ判定）は据え置き**: 同じ OR パターンだが、コードコメント上「テキストが編集されている可能性を考慮」と明記されており、済スタンプが「同じ位置に編集後の内容で残ったコメント」を追従する仕様と整合する。今回のバグ報告は注釈のオブジェクト化に関するものなので影響範囲外として温存。同様の誤動作が起きた場合は同方針で AND 化が必要。

**動作確認の観点**:
- MojiQ 保存済 PDF を Acrobat で開き、過去 MojiQ テキストと **同じ文字列** のノート注釈を **別の場所**に追加 → MojiQ で開いてオブジェクト化されることを確認。
- 過去 MojiQ テキストと **同じ位置(30px 内)** に **異なる内容**のノート注釈を追加 → オブジェクト化されることを確認。
- 同内容かつ同位置の真の重複ケース（レアだが起こり得る）はスキップ継続で二重表示防止。

**package.json**: バージョンを `2.2.4` → `2.2.5` に更新。

---

### v2.2.4 半円ツールを指定ツールへ移動・ドラッグ描画式に戻す (2026-04-21)

#### 半円を「指定ツール」へ移動・ドラッグ描画式に戻す

**変更内容**: v2.2.2 で「校正記号スタンプ」へ移してクリック配置式（スタンプ式）に変更した「半円」を、ドラッグで弧の幅・高さ・向きを指定する従来式に戻し、配置先を「校正記号スタンプ」セクションから「指定ツール」セクション（矢印／両矢印／全体移動と同列）へ移動した。

**理由**: 半円は配置時に弧の大きさと向き（横向き=上側の弧 / 縦向き=右側の弧）を視覚的に指定したい場面が多く、固定サイズのスタンプ式では不便だった。矢印・全体移動と同様の扱いに統一。

**修正ファイル**:
- `index.html` — 「校正記号スタンプ」セクション内の `semicircleBtnSidebar`（`symbol-btn`）を削除し、「指定ツール」セクション（`instruction-stamp-buttons`）の `bracketBtnSidebar` 直後に `stamp-btn stamp-btn-with-icon` 形式（半円 SVG アイコン＋ラベル）で再配置
- `js/drawing.js` `startDrawing` — `symbolStampSpecs` テーブルから `'semicircle'` エントリを削除（クリック配置を無効化）。以降はデフォルトの `state.interactionState = 1` 経路に入りドラッグ開始
- `js/drawing.js` `draw`（mousemove プレビュー）に `semicircle` 専用ブロックを追加（`renderSemicircle` と同計算: bbox から `orientation` を判定し、horizontal は上側弧 `[Math.PI, 2π]` / vertical は右側弧 `[-π/2, π/2]`）
- `js/drawing.js` `stopDrawing` に `semicircle` 専用の保存ブロックを追加（`DrawingModes.finalizeSemicircle(startPos, currentPos, color, lineWidth)` を呼んで保存）
- `js/ui/proofreading-ui.js` — `stampLabelMapping` と `drawingModeMapping` に `'semicircleBtnSidebar'` を追加（指定ツール扱い）。`symbolToolMapping` / `symbolDirectModeMapping` / `symbolLabelMapping` から削除（校正記号スタンプ扱いを解除）

**白フチ**: `drawing-renderer.js` `renderSemicircle` は v2.2.3 で `strokePathWithWhiteOutline` を呼ぶように改修済みのため、保存後は自動的に白フチ付きで描画される。ドラッグ中プレビューは矢印・全体移動と同様にフチなしで表示され、`redrawCanvas(false)` で本番描画に切り替わる。

**互換性**: `DrawingModes.finalizeSemicircle` は v2.2.2 以前から残っていたため追加実装不要。既存の `semicircle` オブジェクト（v2.2.2-v2.2.3 でスタンプ式配置したもの）は同じスキーマ（`startPos` / `endPos` / `orientation`）のため読み込み・描画とも互換性あり。

**package.json**: バージョンを `2.2.3` → `2.2.4` に更新。

---

### v2.2.3 文字サイズスタンプ修正・矢印ツール再ドラッグ式化・校正記号スタンプ改修 (2026-04-20)

#### -8. ？スタンプの規定サイズを縮小

**変更内容**: `STAMP_SIZES.QUESTION` を 20 → 16 に変更（`renderTextStamp` の `fontSize = size * 0.9` で 18px → 約14.4px に縮小）。`drawing.js` / `drawing-renderer.js` / `drawing-select.js` のフォールバック値も 16 に揃えた。

#### -7. ？スタンプから円を削除（白フチ付きテキストのみに変更）

**変更内容**: ？スタンプの見た目を「赤丸の中に？」から「赤色の白フチ付き？テキストのみ」に変更。

**修正ファイル**:
- `js/drawing-renderer.js` `renderQuestionStamp` を `renderCircleStamp` 経由から `renderTextStamp(ctx, obj, '？')` 直接呼び出しに変更（小文字指定の白フチ付きテキストと同じ描画パターン）
- `js/constants.js` — 未使用となった `STAMP_PARAMS.CIRCLE_STAMPS.questionStamp` 定義を削除

#### -6. 写植指示スタンプに「？」スタンプを追加

**変更内容**: 写植指示スタンプセクション（指示入れモードの「指示ツール」と校正チェックモードの「済スタンプ／ルビスタンプ」横）に新しい「？」スタンプを追加。クリックで赤色の白塗り円形スタンプ（`size: 20px`、`fontSizeRatio: 0.7`）を配置。済スタンプ（`doneStamp`）と同じ円形スタンプ系列。

**変更ファイル**:
- `js/constants.js` — `STAMP_SIZES.QUESTION = 20`、`STAMP_PARAMS.CIRCLE_STAMPS.questionStamp` 定義、`OBJECT_TYPES.QUESTION_STAMP` 追加
- `index.html` — 指示ツールの写植指示スタンプ section に `questionStampBtn`（「？」）、校正チェックモード側に `proofQuestionStampBtn`（「？スタンプ」）を追加
- `js/script.js` — `elements.questionStampBtn` の取得とモードコントローラへの引き渡しを追加
- `js/mode-controller.js` — `questionStampBtn` 用の参照保持・active クラス付与・クリックハンドラ登録／解除を `rubyStampBtn` のパターンに従って追加。スタンプモード判定にも `questionStamp` を追加
- `js/ui/proofreading-ui.js` — `shashokuStampLabelMapping` に `'questionStampBtn': '？'` を追加（指示ツールバッジ表示用）
- `js/ui/proofreading-panel.js` — 校正チェックモードの `proofQuestionStampBtn` クリックハンドラ・モード変更監視・選択リセット処理を追加
- `js/drawing.js` `startDrawing` — `state.currentMode === 'questionStamp'` の分岐を追加し、`saveObjectToPage({ type: 'questionStamp', startPos, color, size })` で配置
- `js/drawing-renderer.js` — `renderQuestionStamp` ヘルパー追加、`renderObject` の switch、`getBounds` / `getShapeBoundsOnly` / `hitTestAll` の `questionStamp` ケースを追加（円形・サイズ20px）
- `js/drawing-select.js` — 選択ツールでのリサイズ時の `obj.size` スケール処理に `questionStamp` ケースを追加
- `js/ui/history-panel.js` — ログ表示用ラベルに `'questionStamp': '？スタンプ'` を追加
- `js/types.js` — `QuestionStampObject` の typedef を追加

#### -5. 矢印 / 両矢印に白フチを追加

**追加修正**: `js/drawing.js` `stopDrawing` の line 保存ブロックは保存後に `doubleArrowAnnotated` のときだけ `redrawCanvas(false)` を呼んでいた。`arrow` / `doubleArrow` 保存時にも同じ条件で redraw を呼ばないと、ドラッグ中の白フチなしプレビューがそのまま残り、保存後すぐには `renderArrow` / `renderDoubleArrow` の白フチが描画されない。`lineType === 'arrow' || lineType === 'doubleArrow'` の分岐を追加して即座に `redrawCanvas(false)` を呼ぶようにした。


**変更内容** (`js/drawing-renderer.js` `renderArrow` / `renderDoubleArrow`):
- 直線＋矢頭を「直線→矢頭1→endPos戻り→矢頭2」の1本の連続パスとして組み立て
- `strokePathWithWhiteOutline(ctx, color, lineWidth)` を1回呼んで白フチ＋本体色を描画
- 直線と矢頭をサブパスに分けると後続の白フチが直線の本体色を上書きして矢頭根元で線が途切れる問題を回避（全体移動と同じ対応）

#### -4. 全体移動を「指定ツール」へ移動・ドラッグ描画式に戻す

**変更内容**: 「全体移動」（コの字、`bracket` モード）を「校正記号スタンプ」セクションから「指定ツール」セクションへ移動し、配置方法をクリック式（スタンプ式）からドラッグ描画式へ戻した。矢印・両矢印と同じ扱い。ドラッグ方向で `orientation`（縦/横）と `flipped`（反転）が決まる従来仕様。

**修正内容**:
- `index.html` — 「校正記号スタンプ」内の `bracketBtnSidebar`（`symbol-btn`）を削除し、「指定ツール」内に `stamp-btn stamp-btn-with-icon` 形式（コの字 SVG アイコン＋ラベル）で再配置
- `js/drawing.js` `symbolStampSpecs` から `'bracket'` を削除（クリック配置を無効化）
- `js/drawing.js` `draw`（mousemove プレビュー）に `bracket` 専用ブロックを追加。bbox から `orientation` / `flipped` を判定して `renderBracket` と同形状の連続パスをプレビュー描画
- `js/drawing.js` `stopDrawing` に `bracket` 専用の保存ブロックを追加。`DrawingModes.finalizeBracket(startPos, currentPos, color, lineWidth)` を呼んで保存
- `js/ui/proofreading-ui.js` — `symbolToolMapping` / `symbolLabelMapping` から `bracketBtnSidebar` を削除し、`stampLabelMapping` に `'全体移動'`、`drawingModeMapping` に `'bracket'` を追加

#### -3. 全体移動（コの字）の角がフチで途切れるバグ修正・スタンプ規定線幅を 2px に固定

**全体移動の角途切れ修正** (`js/drawing-renderer.js` `renderBracket`):
- 修正前は「メインのコの字」「上端セリフ」「下端セリフ」（横向きは左右セリフ）の3本のサブパスを順にストロークしていた
- 各サブパスごとに白フチ→本体色の順で描画されるため、後続セリフの白フチストロークが直前メインパスの本体色を角部で上書きし、L字部分の線が途切れて見えていた
- セリフを含めて1本の連続パス（`moveTo` から始まる polyline）に統合して `strokePathWithWhiteOutline` を1回呼ぶ形に変更

**スタンプ規定線幅** (`js/drawing.js`):
- `symbolStampSpecs` 経由のクリック配置で `style.lineWidth`（ツールバーの線幅スライダ値）を継承していたのを `lineWidth: 2` に固定
- 校正記号スタンプは小サイズで配置することが多く、太線になると視認性が下がるため

#### -2. 矢印 / 両矢印を選択すると「指示ツール」バッジが空表示になるバグ修正

**問題**: 矢印・両矢印を「指定ツール」セクションへ移動したことで、`#proofreading-instruction-area .instruction-stamp-buttons .stamp-btn` セレクタに `arrowBtnSidebar` / `doubleArrowBtnSidebar` が含まれるようになり、`proofreading-ui.js` の汎用クリックハンドラが発火。しかし `stampLabelMapping` に対応エントリがなかったため `selectedProofreadingDisplay.textContent = ''` のまま `.visible` クラスだけが付与され、ラベルなしの長い空ピルがトグルボタンに表示されていた。

**修正内容** (`js/ui/proofreading-ui.js`):
- `stampLabelMapping` に `arrowBtnSidebar: '矢印'` / `doubleArrowBtnSidebar: '両矢印'` を追加
- `drawingModeMapping` にも同 ID → `'arrow'` / `'doubleArrow'` を追加（`mode-controller` 側でも click ハンドラ登録済みだが、`doubleArrowAnnotated` と同様に二重登録で安全側に倒す）

#### -1. 「校正記号ツール」→「校正記号スタンプ」名称変更・初期サイズ縮小・白フチ追加

**変更内容**:
- セクションラベル「校正記号ツール」を「校正記号スタンプ」に変更（`index.html`）。配置動作がスタンプ式であることを名称で明示
- スタンプ配置時の規定サイズを v2.2.2 の半分に縮小（`js/drawing.js` `symbolStampSpecs`）
  - rectSymbolStamp / triangleSymbolStamp / lshape / zshape: 40×40 → 20×20
  - chevron: 30×40 → 15×20
  - bracket: 40×40 → 20×20
  - semicircle: 40×20 → 20×10
- 7形状（半円・くの字・L字・Z字・コの字・全角アキ・半角アキ）に白フチを追加。テキストレンダリングと同じ「白で `shadowBlur` 付き多重ストローク → 本体色ストローク」パターン
- `js/drawing-renderer.js` に `strokePathWithWhiteOutline(ctx, color, lineWidth)` ヘルパーを追加。各 `render*` 関数の本体ストロークを置換（`renderBracket` は5本のサブパスすべてに適用）

**理由**: 規定サイズが大きすぎて文字に被りやすかった点と、図形が文字や下地と混ざって視認性が下がる点を改善。

#### 0. 矢印 / 両矢印を「指定ツール」へ移動・ドラッグ描画式に戻す

**変更内容**: v2.2.2 で校正記号ツールに含めて「クリック配置式（スタンプ式）」に変更した「矢印」「両矢印」を、ドラッグで長さ・角度を指定する従来式に戻し、配置先を「校正記号ツール」セクションから「指定ツール」セクションへ移動。

**理由**: 矢印は方向と長さを指示する性質上、ドラッグ描画の方が自然。スタンプ式では水平60px固定でしか配置できなかった。指定ツール（小文字指定・字間指示）と機能的に近いため同セクションへ集約。

**修正内容**:
- `index.html` — 「校正記号ツール」セクション内の `arrowBtnSidebar` / `doubleArrowBtnSidebar` を削除し、「指定ツール」セクション（`instruction-stamp-buttons`）の先頭へ `stamp-btn-with-icon` 形式（SVG アイコン＋ラベル）で再配置
- `js/drawing.js` `startDrawing` の `symbolStampSpecs` テーブルから `'arrow'` / `'doubleArrow'` のエントリを削除（クリック配置を無効化）
- `js/drawing.js` `draw`（mousemove プレビュー）の `line` 分岐に arrow / doubleArrow 用の矢頭描画ブロックを追加（終端、両矢印は始端にも矢頭）
- `js/drawing.js` `stopDrawing` の `line` 保存ブロックで `state.currentMode` を見て保存タイプを `'arrow'` / `'doubleArrow'` / `'doubleArrowAnnotated'` / `'line'` に振り分け（従来は `'doubleArrowAnnotated'` 以外すべて `'line'` で保存していた）

**互換性**: `js/drawing-renderer.js` の `renderArrow` / `renderDoubleArrow` および `getShapeBoundsOnly` の零ディメンション・パディング、`js/drawing-modes.js` の引出線起点計算は v2.2.2 から変更不要。

#### 1. 文字サイズスタンプ編集後に古いサイズで配置されるバグ修正

**問題**: 文字サイズスタンプを選択した状態で編集機能から数値を変更すると、ボタンの表示（`dataset.size` / `textContent`）は更新されるが、キャンバスに配置すると編集前の古いサイズで配置されてしまう。

**原因** (`js/stamps.js` の編集モード分岐): 編集対象が現在アクティブなボタン（`.active` クラス付き）の場合でも、`state.activeStampText` とトグルボタン右側の選択表示（`selectedSizeDisplay`）が古い値のまま残っていた。テキスト配置時は `state.activeStampText` が参照されるため、編集後の値が反映されなかった。フォント編集側（`js/modal.js` `submitFontFromModal`）は既に `state.activeFontBtn === state.editingTargetBtn` の判定でアクティブ状態を更新していたが、サイズ編集側では未対応だった。

**修正内容** (`js/stamps.js` `createSizeStampElement`):
- 編集前に `btn.classList.contains('active')` で現在選択中かを判定
- アクティブだった場合は `state.activeStampText` を新しい `newSize + 'P'` に更新
- `updateSelectedDisplay('size', newText)` でトグルボタン右側の選択表示も更新

#### 2. 文字サイズスタンプ削除時の確認メッセージが編集前の値のままになるバグ修正

**問題**: 文字サイズスタンプを編集機能で数値変更した後に削除モードで削除しようとすると、確認ダイアログのメッセージ（「サイズ「XXP」を削除しますか？」）に編集前の古い数値が表示される。

**原因** (`js/stamps.js` `createSizeStampElement` の削除モード分岐): 削除確認メッセージがクロージャ変数 `size`（関数引数で受けた初期値）を直接参照していた。編集モードは `btn.dataset.size` / `btn.textContent` のみ更新するため、クロージャ変数 `size` は古い値のままで、削除確認ダイアログにそのまま表示されていた。フォント側（`btn.dataset.text` を参照）は既に対応済みで、サイズ側のみ未対応だった。

**修正内容** (`js/stamps.js` `createSizeStampElement`):
- 削除確認メッセージの値を `parseInt(btn.dataset.size, 10)` から取得するよう変更
- 通常クリック時の選択表示（`updateSelectedDisplay('size', ...)`）も `btn.dataset.text` を参照するよう統一（編集後に通常クリックした場合にトグル右側の表示が古い値になる潜在バグも解消）

**変更ファイル**:
- `js/stamps.js` — サイズ編集モード分岐にアクティブ状態更新処理を追加、削除メッセージ・選択表示をクロージャから `btn.dataset` 参照に変更
- `package.json` — バージョンを `2.2.2` → `2.2.3` に更新

---

### v2.2.2 字間指示改修・指定ツール新設・校正記号スタンプ化・カスタムアップデート通知 (2026-04-17)

#### 1. 字間指示ツール（`doubleArrowAnnotated`）の引出線始点を Y字線終端に変更

**問題**: 引出線の起点が Y字線の **中点（midpoint）** に設定されており、字間を示すY字線の真ん中から引出線が生えている状態になっていた。字間指示の慣習としては Y字線の **終端（endPos）** から引出線が伸びる方が自然。

**修正内容**:
- `js/drawing.js` — 描画時の `getLeaderStartPos()` / `getLeaderStartPosCanvas()` 内の `line` 分岐に `doubleArrowAnnotated` 専用の早期 return を追加（`shapeEndPos` / `endCanvas` を返す）
- `js/drawing-modes.js` — 選択ツール移動時に呼ばれる `getLeaderStartPos()` にも `doubleArrowAnnotated` 専用分岐を追加。これでテキスト移動・引出線端点編集・リサイズ時も引出線起点が Y字線終端に追従
- `lineAnnotated`（直線+テキスト指示）は中点始点のまま変更なし

#### 2. 字間指示ツールの終端側 Y字を描画しない

引出線が終端から伸びるため、終端の Y字は冗長。`renderDoubleArrowAnnotated`（`js/drawing-renderer.js`）とドラッグ中プレビュー（`js/drawing.js`）で startPos 側の Y字のみ描画するよう修正。

#### 3. 「指定ツール」セクション新設・小文字指定/字間指示を移動

**変更内容** (`index.html` / `css/stamps.css`):
- 校正記号ツールセクションの下に新規「指定ツール」セクションを追加
- 「小文字指定」と「字間指示」を「校正指示ツール」から新セクションへ移動
- 両ボタンに SVG アイコンを追加:
  - 小文字指定: 正方形枠の中に「小」
  - 字間指示: 横向きの Y（右に伸びる水平線＋左端から上下に分岐）
- アイコン下にラベル（「小文字指定」「字間指示」）を表示
- ラベル色は校正記号ツール（`.symbol-label`）と同じ `var(--text-secondary)` に統一
- 新規クラス `.stamp-btn-with-icon` を `css/stamps.css` に追加（高さ48px・縦並び・ラベル9px）

#### 4. 校正記号ツールをスタンプ式に変更

**概要**: 校正記号ツール 9 種（`arrow` / `doubleArrow` / `rectSymbolStamp` / `triangleSymbolStamp` / `chevron` / `lshape` / `zshape` / `bracket` / `semicircle`）をドラッグ描画式からクリック配置式に変更。配置後は選択ツールで移動・四隅ハンドルからの拡大縮小が可能。

**修正内容** (`js/drawing.js`):
- `startDrawing` にスタンプ式分岐を追加: `symbolStampSpecs` テーブルでモードごとの規定サイズ・向き（`orientation` / `direction` / `rotated` / `flipped`）を定義し、クリック位置を中心に `startPos`/`endPos` の bounding box を組み立てて `saveObjectToPage` → 即 return
- モード別デフォルト:
  - arrow / doubleArrow: 60×0（水平）
  - rectSymbolStamp / triangleSymbolStamp: 40×40
  - chevron: 30×40（vertical）
  - lshape: 40×40（direction=0）
  - zshape: 40×40（rotated=false）
  - bracket: 40×40（horizontal / flipped=false）
  - semicircle: 40×20（horizontal）
- `draw`（mousemove プレビュー）から 7 形状の専用プレビューブロック（semicircle/chevron/lshape/zshape/bracket/rectSymbolStamp/triangleSymbolStamp）を削除。`line` プレビューの arrow/doubleArrow 参照も整理し `doubleArrowAnnotated` 専用に簡素化
- `stopDrawing` から 7 形状の保存ブロックを削除。`line` 保存ブロックの arrow/doubleArrow 分岐も簡素化（`doubleArrowAnnotated` と `line` の2分岐のみ）

**リサイズ安全化** (`js/drawing-renderer.js`):
- 水平/垂直ライン（arrow/doubleArrow/line/doubleArrowAnnotated）は bbox の幅または高さが 0 になり、四隅ハンドルからリサイズすると `scaleY = newH / 0 = Infinity` で NaN 座標が発生する潜在バグが存在
- `getShapeBoundsOnly()` の該当 case に零ディメンション検出時の `±5px` パディングを追加し、水平/垂直ラインでも角ハンドル拡縮が破綻しないよう修正
- 既存の `drawing-select.js` の `applyMove` / `resizeObject` / `hitTestAll` がそのまま適用されるため選択ツール側の変更は不要

#### 5. アップデート通知を起動時カスタムダイアログに変更

**概要**: v2.1.4 までアップデート通知は `dialog.showMessageBox`（Electron ネイティブ）で表示していたが、v2.2.2 で MojiQ 内のカスタムモーダル（既存の `modal-overlay` スタイル）に統一。終了確認ダイアログ（v2.1.3）と同じ IPC 往復パターンを使用。

**フロー**:
```
main process → checkForUpdates() で更新検出
  → pendingUpdate に保存、trySendUpdate() 呼び出し
  → メインウィンドウが show() 済みでなければ保留
  → show() 後に再度 trySendUpdate() → 'show-update-available' IPC 送信
レンダラー → MojiQModal.showUpdateAvailable() でカスタムモーダル表示
  → ユーザー選択 → 'update-action' IPC 返送
main process → 'update' ならインストーラー起動＆アプリ終了
```

**IPC チャネル**:

| チャネル | 方向 | 用途 |
|---------|------|------|
| `show-update-available` | Main→Renderer | カスタムモーダル表示要求（payload: `{currentVersion, latestVersion}`） |
| `update-action` | Renderer→Main | ユーザー選択結果（`update` / `later`） |

**変更ファイル**:
- `electron/main.js` — `checkForUpdates()` からネイティブダイアログを削除。`pendingUpdate` 変数と `trySendUpdate()` ヘルパー追加。メインウィンドウ `show()` 直後に再呼び出し
- `electron/preload.js` — `onShowUpdateAvailable` / `sendUpdateAction` IPC 定義追加
- `js/modal.js` — `showUpdateAvailable(currentVersion, latestVersion)` 追加（2ボタン: 後で / 今すぐ更新、Enter=更新、Esc=後で、背景クリック=後で）
- `js/script.js` — `onShowUpdateAvailable` ハンドラ追加、モーダル結果を `sendUpdateAction` で返送

---

### v2.2.1 保存処理フリーズバグ修正・多層防御追加 (2026-04-17)

#### 背景

ユーザーから「保存時に『PDFを保存しています...』／『現在保存処理中です。完了までお待ちください。』が表示されたまま処理が進まない」というフリーズバグの報告があり、`pdf-manager.js` の保存関数群を横断的に調査・修正。

#### 1. try-catch-finally 範囲不足の修正（主要バグ）

**問題**: `savePdf()` / `saveAsNew()` / `exportPdfToPath()` / `saveTransparentPdf()` / `saveTransparentPdfDirect()` の5関数すべてで、`acquireSaveLock()` 成功直後から `try` ブロック開始までの間に `isProcessing=true`・`lockMenu(true)`・`savePdfBtn.disabled=true`・描画系前処理（`finalizeCurrentStroke`、`deselectObject`、`redrawCanvas`、`saveCurrentCanvasToHistory`）・`showProgressOverlay()` が実行されていた。この範囲で例外（例: `canvas.toDataURL()` の SecurityError）が throw されると `finally` のクリーンアップが走らず、メニューグレーアウト／プログレスオーバーレイ／無効化されたボタンが残留。以降 `if (isProcessing) return;` で silent return となり完全フリーズに見える。

**修正内容** (`js/pdf-manager.js`):
- 5関数すべてで状態変更を `try` ブロック内へ移動
- `finally` で参照する変数（`originalTitle` / `showProgress` / `menuLocked` / `btnDisabled`）をフラグ方式で管理し、実際に変更した分だけ確実に復元
- 描画系前処理は個別の軽量 `try/catch` で warn ログに留めて保存本体は続行

#### 2. 透過モード二重ロック解消

**問題**: 背景透過モードON時、`savePdf()` / `saveAsNew()` が `acquireSaveLock()` 成功後に `saveTransparentPdfDirect()` を呼び、内部で再度ロック取得を試みて必ず失敗。結果として「保存処理を実行中です」アラートが出て何も保存されず、透過モードでの保存が絶対に動作しなかった。

**修正内容** (`js/pdf-manager.js`):
- `savePdf()` / `saveAsNew()` の透過モード分岐を `acquireSaveLock` より**前**に移動
- ロック取得は `saveTransparentPdfDirect()` 側に一元化、手動の `releaseSaveLock()` を削除

#### 3. Promise.race タイムアウトの追加

**問題**: `save-and-quit` フローには3分タイムアウトがあったが、通常保存には `pdfDoc.save()` / Electron IPC ハング時の復帰機構がなかった。

**修正内容** (`js/pdf-manager.js`):
- `withSaveTimeout(promise, label, ms)` ヘルパーを追加（`calculateSaveTimeout()` による動的タイムアウト 60秒〜10分）
- 5箇所の `PdfLibSaver.saveNonDestructive()` / `PdfLibSaver.saveTransparent()` を包囲

#### 4. isProcessing 残留の二次防御

**問題**: `acquireSaveLock()` にはタイムアウト機構があるが、`isProcessing` フラグには自動リセット機構がなかった。

**修正内容** (`js/pdf-manager.js`):
- `recoverStaleSaveProcessing()` を追加（`saveOperation.lockTime` を基準に残留検知、強制リセット時は `isProcessing` / ロック / `lockMenu` / `hideProgressOverlay` を一括復元）
- 5保存関数の入口ガード前で呼び出し

#### 5. IPC 呼び出しにタイムアウト

**問題**: `MojiQElectron.saveFile` / `DrawingExportImport.exportToPath` / `exportCommentsToPath` は IPC ハング時に無限待機。

**修正内容** (`js/pdf-manager.js`):
- ラッパー関数 `saveFileWithTimeout()` / `exportDrawingWithTimeout()` / `exportCommentsWithTimeout()` を追加
- PDF本体書き込みは120秒、JSON書き込みは60秒で固定タイムアウト
- 13箇所の IPC 呼び出しを全てラッパー経由に置換

#### 6. `uint8ArrayToBase64` メインスレッドブロック解消

**問題**: 25MBのPDFで数秒のUIフリーズ（進捗バーも止まる）。

**修正内容**:
- `js/pdf/pdf-utils.js` に `uint8ArrayToBase64Async()` を追加（約1MBごとに `setTimeout(0)` で UI に制御を返す）
- `js/pdf-manager.js` の保存パス6箇所を非同期版に切替

#### 7. onProgress 例外ガード

**修正内容** (`js/pdf-manager.js`):
- 4箇所の `onProgress` コールバック内の `updateLoadingProgress()` を `try-catch` で包囲し、DOM 例外が保存フローを破壊するのを防止

#### 8. 保存完了メッセージの真実性

**問題**: 描画JSON保存が失敗しコメントJSONのみ成功した場合でも「PDFと描画＋コメントデータの保存が完了しました」と嘘のメッセージが表示されていた。

**修正内容** (`js/pdf-manager.js`):
- `buildSaveCompletionMessage(enabled, drawingSuccess, commentSuccess)` ヘルパーを追加
- 実際に成功した項目のみ含めるようにメッセージを組み立て
- 「PDFとコメントデータの保存が完了しました。」の新パターンを追加
- 4箇所の保存メッセージ組み立て箇所を置換

**変更ファイル**:
- `js/pdf-manager.js` — 全修正の中心、5保存関数 + 各種ヘルパー追加
- `js/pdf/pdf-utils.js` — `uint8ArrayToBase64Async()` を追加
- `package.json` — バージョンを `2.2.0` → `2.2.1` に更新

---

### v2.2.0 校正チェックモードに画像ツールを移植 (2026-04-13)

#### 校正チェックモードのツールバーに画像ツールを追加

**変更内容**: 指示入れモードにのみ存在していた画像ツール（`imgInsertBtn`）を、校正チェックモードのツールバーでも使用可能にした。配置はテキストツール（`textBtn`）の直下。

**実装詳細**:
- HTMLのツールバー（`index.html` Line 721-722）は両モード共通で、`imgInsertBtn`は既に`textBtn`の直下に配置済み
- JavaScriptハンドラ（`mode-controller.js`）も両モード共通で初期化されているため、新規コードは不要
- `css/proofreading-mode.css` の校正モード用非表示ルールから `body.proofreading-mode #imgInsertBtn` を削除するだけで機能する

**変更ファイル**:
- `css/proofreading-mode.css` — 非表示ルールから `#imgInsertBtn` を1行削除
- `package.json` — バージョンを `2.1.9` → `2.2.0` に更新

---

### v2.1.9 アノテーション移動のスナップバック不具合修正 (2026-04-10)

#### 多数描画ページで+テキスト指示のテキストを移動しても元位置に戻る不具合の修正

**問題**: 1ページに多数の描画がある状態で、枠線・楕円・直線の「+テキスト指示」アノテーションテキストを選択ツールで移動すると、ドラッグ中は追従するが、選択を解除した瞬間に元の位置に戻って見える。

**原因**: `drawing-renderer.js` の `renderAll()` は、オブジェクト数が10を超えるページでページ全体を合成したキャンバスを `_pageDrawingCache`（キー = `pageVersion`）にキャッシュし、選択が無い時にそのキャッシュを再利用する実装になっていた。一方 `drawing-select.js` のドラッグ系編集（`applyMoveAnnotationOnly`, `applyMove`, リサイズ, 回転, 引出線編集等）は `DrawingObjects.updateObject` を経由せず、オブジェクトを直接ミューテーションして `saveUndoState` のみを呼んでいたため、描画キャッシュのバージョンが上がらなかった。結果、ユーザーが選択を外した瞬間に移動前のキャッシュが再利用され、アノテーションだけ元位置に戻ったように見えていた。

**修正内容** (`js/drawing-objects.js`):

1. **`saveUndoState` で `incrementPageVersion` を呼ぶ**: 直接ミューテーション経由のコミットでも必ず描画キャッシュが無効化されるように変更。`updateObject` 等からの呼び出しでは既にインクリメント済みだが、二重インクリメントは無害。
2. **`undo` / `redo` にも `incrementPageVersion` を追加**: これまで PDFページキャッシュ（`MojiQPdfManager.invalidatePageCache`）しか無効化されておらず、undo/redo 後にも同様のスナップバック不具合が潜在していたため同時に修正。

**影響範囲**: 移動・リサイズ・回転・引出線編集・アノテーション移動・フォントラベル移動・undo/redo 全般。`+テキスト指示` のアノテーションテキスト移動が最も顕著な症状だったが、同じキャッシュ不整合が他の直接ミューテーション操作でも潜在的に発生していた。

---

### v2.1.8 ハンバーガーメニューリンク変更 (2026-04-09)

#### 「校正のやり方」リンク差し替え・「校正記号の入れ方/読み方」削除

**変更内容** (`index.html`):
- 「校正のやり方」のリンク先を新しいNotionページに変更
- 「校正記号の入れ方/読み方」メニュー項目を削除

---

### v2.1.7 校正チェックデータフォルダの自動スキップ (2026-04-07)

#### 校正JSON選択時の「校正チェックデータ」フォルダ自動スキップ

**問題**: 校正JSON選択のフォルダブラウザで、フォルダ構造が `TOP > レーベル名 > 作品名 > 校正チェックデータ > JSON` となっており、「校正チェックデータ」フォルダを毎回クリックする必要があった。

**修正内容** (`js/ui/calibration-panel.js`):
- `loadFolder()` でフォルダ内容を取得後、サブフォルダが「校正チェックデータ」1つのみの場合、自動的にそのフォルダ内に遷移
- `navigationStack` にスキップ元のパスを記録するため、パンくずリストで戻ることも可能
- 他のサブフォルダ（作品名等）が同階層にある場合はスキップしない

---

### v2.1.6 圧縮保存注釈修正・スタンプUI改善・写植シミュレーターセクション (2026-04-06)

#### 圧縮保存時のAcrobat注釈（FreeText）表示修正

**問題1**: Acrobatで入れたFreeText注釈がMojiQで圧縮保存すると枠付きテキストとして表示される。
**問題2**: FreeText注釈の見た目（色・縦書き・フォント等）が圧縮保存後に変わってしまう。

**原因**: 圧縮保存時にFreeText注釈を`/AP`（外観ストリーム）なしで再構築していたため、PDFビューアがデフォルトの枠付き表示を生成。また、MojiQのテキストオブジェクト変換ではスタイル情報が失われていた。

**修正内容** (`pdf-lib-saver.js`):
1. **`annotationMode: 0` → `1`に変更（2箇所）**: PDF.jsの注釈レンダリングを有効化し、元の注釈の見た目をそのままJPEGに焼き込む
2. **FreeText注釈の再構築スキップ**: `/AP`なしでの再構築による枠付き表示を防止。Popup型と同様にスキップ
3. **FreeText由来テキストは非表示のまま**: PDF.jsが描画するため、MojiQテキストオブジェクトの二重描画は不要

**非圧縮保存**: 元のPDFページがそのまま保持されるため影響なし。

#### 文字サイズ・フォント指定パネルのUI改善

**変更内容**:

| 変更 | 詳細 |
|------|------|
| アクション行を縦配列 | `section-action-row`を`display: grid`（横並び）から`display: flex; flex-direction: column`に変更。全幅ボタンが縦に並ぶ |
| 文字サイズに編集ボタン追加 | フォント指定と同様にプロンプトで数値を変更可能。`createSizeActionRow()`ヘルパー関数で3箇所の重複コードを統一 |
| フォント指定アクション行のDRY化 | `createFontActionRow()`ヘルパー関数で3箇所の重複コードを統一 |
| 「すべて削除」ボタン追加 | 文字サイズ・フォント指定ともに全項目を一括削除。ホバー時は紫基調（`#9c27b0`） |
| データなし時のグレーアウト | 編集・削除・すべて削除ボタンをデータがない場合に`disabled`化。`updateSizeButtonStates()`/`updateFontButtonStates()`で一括管理 |
| `:disabled`時のホバー抑制 | 全ボタンの`:hover`に`:not(:disabled)`を追加 |
| ドロップダウン閉じ時にモード解除 | `closeAllDropdowns`、`forceCloseAllDropdowns`、トグルボタンクリック、外部クリックの全経路で`turnOffAllSectionModes()`を呼び出し |
| 編集・削除モードの再クリック解除修正 | `turnOffAllSectionModes()`がクラスを先に消すため再クリックで解除できなかったバグを修正。`wasActive`フラグで状態を保存 |

**変更ファイル**:
- `js/stamps.js` — ヘルパー関数追加、すべて削除ボタン、ボタン状態管理統一
- `js/mode-controller.js` — `toggleEditModeForSection`がsizeにも対応、`turnOffAllSectionModes`にサイズ編集ボタン追加、`wasActive`修正
- `css/stamps.css` — 縦配列化、すべて削除ボタンスタイル、`:disabled`スタイル
- `css/components.css` — `.font-section`にもedit-mode/delete-modeスタイル追加
- `css/dark-mode.css` — ダークモード対応

#### 写植シミュレーターセクション化

**変更内容** (`index.html`, `css/simulator.css`, `css/dark-mode.css`):
- `scaleDisplay`から`adjustMessage`までを`.simulator-section`で囲み、「写植シミュレーター」ラベルを表示
- セリフ見本textareaに`width: 100%; box-sizing: border-box`を追加（枠からのはみ出し修正）
- プレースホルダーテキストを「入力するとセリフ見本が使用可能になります。」に変更

---

### v2.1.5 引出線キャンセル・クリック誤動作修正 (2026-04-06)

#### アノテーションモードの引出線Escキャンセル

**問題**: +テキスト指示（`rectAnnotated`/`ellipseAnnotated`/`lineAnnotated`）で枠線等を描画した後、引出線の確定前にキャンセルする手段がなかった。

**修正内容** (`js/drawing.js`):
- `boundKeydownHandler`に`interactionState === 2`（引出線確定待ち状態）でのEscキー処理を追加
- Escキーで`interactionState`を0にリセットし、`redrawCanvas(false)`で引出線プレビューを消去
- 枠線自体は保存済みのためそのまま残る

#### アノテーションモードのクリック時誤動作修正

**問題**: +テキスト指示モードで枠線・楕円・直線をドラッグせずクリックすると、図形が保存されていないのに引出線フェーズ（`interactionState = 2`）に遷移し、テキスト入力の挙動になっていた。

**原因**: `stopDrawing()`のアノテーションモード処理ブロック（`if (state.annotationMode)`）が、図形のサイズチェック結果に関係なく無条件で`interactionState = 2`に遷移していた。

**修正内容** (`js/drawing.js`):
- `shapeSaved`フラグを追加し、`saveObjectToPage()`が実際に呼ばれた場合のみ`true`にセット
- line（直線）、rect（枠線）、ellipse（楕円）の各保存箇所に`shapeSaved = true`を追加
- アノテーションモードの引出線フェーズ遷移条件を`state.annotationMode && shapeSaved`に変更

---

### v2.1.4 コメントJSON追加保存��能 (2026-04-06)

#### 描画+コメントを追加保存

**概要**: PDF保存時に、PDF注釈由来のテキストオブジェクトを`_コメント.json`として描画JSONとは別に保存する機能を追加。

**背景**: PDF注釈由来テキスト（`_pdfAnnotationSource`付き）は描画JSON（`_描画.json`）からは除外されていた。これらを別ファイルとして保存し、後から読み込み可能にする。

**動作**:
- 保存ドロップダウンの「描画+コメントを追加保存」チェックONでPDF保存
- `{ファイル名}_描画.json`（従来通り）と `{ファイ���名}_コメント.json`（新規）が生成される
- コメントJSONは描画JSONと同フォーマット（`_pdfAnnotationSource`除去済み）のため、既存の「描画データを読み込み」でインポート可能

**実装詳細**:

| ファイル | 変更内容 |
|---------|---------|
| `index.html` | チェックボックスラベルを「描画+コメントを（改行）追加保存」に変更 |
| `js/drawing-export-import.js` | `_prepareCommentData()` — `_pdfAnnotationSource`付きオブジェクトを抽出し、`MojiQClone.deep()`でコピー後プロパティ削除。メタデータ(`getLoadedMojiQTexts()`)からのテキストも含め重複排除 |
| `js/drawing-export-import.js` | `exportCommentsToPath()` — `exportToPath()`と同構造で`_コメント.json`として保存。見開きモード対応、上書き防止付き |
| `js/pdf-manager.js` | 4箇所の保存処理（上書き・初回・名前を付けて・パス指定）に`exportCommentsToPath()`呼び出しを追加 |

**保存完了メッ��ージ**:
- コメントあり: 「PDFと描画＋コメントデータの保存が完了���ました。」
- コメントなし: 「PDFと描���データの保存が完了��ました。」
- チェックOFF: 「PDF保存が完了しました。」

**データソース**:
1. DrawingObjects上の`_pdfAnnotationSource`付きオブジェクト（ライブ注釈）
2. `MojiQPdfManager.getLoadedMojiQTexts()`（メタデータから復元、再保存時にDrawingObjectsに無い場合）

#### アップデートダイアログの前面表示修正

**問題**: 新バージョン検出時の更新ダイアログがメインウィンドウの裏に隠れてしまう。

**修正内容** (`electron/main.js`):
- `dialog.showMessageBox()`の第1引数に`mainWindow`を渡し、メインウィンドウの子ウィンドウとして表示されるように変更

---

### v2.1.3 追加修正 (2026-04-02)

#### 見開き表示＋圧縮保存のメタデータ欠落修正

**問題**: 圧縮保存・見開き保存・透過保存時にSubjectフィールドに`MojiQText`・`MojiQChecked`メタデータが保存されず、再読み込み時にコメント情報が失われる。

**修正内容** (`pdf-lib-saver.js`):
- `createCompressedPdf()` にSubjectフィールドのメタデータ書き込みを追加
- `saveNonDestructiveSpread()` にも`MojiQText`・`MojiQChecked`メタデータ書き込みを追加
- `saveTransparentSpread()`・`saveTransparent()` にも同様に追加
- `createCompressedPdf()` に保存結果のバイト列妥当性検証を追加

#### パス指定保存（保存して終了）の圧縮モード欠落修正

**問題**: `exportPdfToPath()`の`saveOptions`に`compressMode`が含まれておらず、「保存して終了」時に圧縮保存チェックが無視されていた。

**修正内容** (`pdf-manager.js`):
- `exportPdfToPath()`の`saveOptions`に`compressMode`と`compressWarning`表示を追加

#### 校正チェックモードのカスタムカラーパレット修正

**問題**: 校正チェックモードでカスタムカラーパレットを選択してもオブジェクトの色が変更されない。指示入れモードとの挙動不一致。

**原因**:
1. `proofColorPicker`に`input`イベント（リアルタイム反映）がなく`change`のみだった
2. `proofCustomColorSwatch`に`data-color`属性が設定されず、再クリック時に常にピッカーが開いた
3. `setColor()`が`MojiQCanvasContext.setColor()`を呼ばず`ctx.strokeStyle`が更新されなかった

**修正内容** (`proofreading-panel.js`):
- `setColor()`: `MojiQCanvasContext.setColor(color)`を呼び出してコンテキスト同期
- `proofColorPicker`に`input`イベント追加（ドラッグ中リアルタイム色変更）
- `change`イベントで`customColorSwatch.setAttribute('data-color', color)`を設定
- カスタムスウォッチクリック時: 色があれば適用しつつ常にピッカーも開く（指示入れモードと同じ）
- `updateActiveColorSwatch()`: 他スウォッチ選択時に`data-color`をクリア
- `syncCustomColorFromMain()`: モード切替時に`data-color`も同期
- `onEyedropperColorPicked()`: スポイト取得時にも`data-color`設定

#### 圧縮保存時のPDFコメント保持・アイコン除去

**問題**: 圧縮保存するとAcrobatで入れたPDFコメントが失われる。また、PDF.jsの`pdfPage.render()`がデフォルトで注釈アイコンをキャンバスに描画し、JPEGに焼き込まれていた。

**修正内容** (`pdf-lib-saver.js`):
1. **アノテーションデータの手動再構築**: `copyPages()`を使わず（リソース肥大化防止）、元PDFのアノテーションから必要なフィールド（Subtype, Rect, Contents, 著者, 日付, 色等）のみ抽出して新規辞書として構築。`/AP`（アピアランス）は意図的にコピーしない（アイコン非表示）。Popup型アノテーションもスキップ。
2. **`pdfPage.render()`に`annotationMode: 0`を追加**: 単ページ圧縮パスと見開き圧縮用`_renderPageToCompressCanvas()`の両方で、PDF注釈アイコンがJPEGに焼き込まれないようにした。

#### ヘッダーUI修正

**修正内容** (`index.html`):
- ハンバーガーメニューとモード切替トグルの間の区切り線（`header-divider`）を削除

---

### v2.1.3 致命的バグ修正・終了確認モーダル統一 (2026-04-02)

#### 致命的バグ修正（16件）

バックエンド全体を調査し、保存失敗・フリーズ・データ消失を引き起こしうるリスク箇所を修正。

| # | 深刻度 | 問題 | 修正ファイル |
|---|--------|------|------------|
| 1 | P0 | JSON読み込み時に`deserializeAllPagesData()`が失敗すると退避オブジェクトが復元されずデータ消失 | `drawing-export-import.js` |
| 2 | P0 | 圧縮保存時にJPEG変換がタイムアウトするとページが無通知でスキップされる | `pdf-lib-saver.js` |
| 3 | P0 | `page-manager.js`のUndo/Redoで`isUndoRedoInProgress`フラグが条件付きリセットのためデッドロック | `page-manager.js` |
| 4 | P1 | 印刷プロセス（SumatraPDF spawn）にタイムアウトなし→フリーズ | `electron/main.js` |
| 5 | P1 | 終了時`dialog.showMessageBox`のawait中にウィンドウ破棄→クラッシュ | `electron/main.js` |
| 6 | P1 | `read-file` IPCハンドラにファイルサイズ上限なし→大ファイルでOOM | `electron/main.js` |
| 7 | P0 | `hasUnsavedChanges`が描画JSONエクスポート完了前にリセット→データ消失リスク | `pdf-manager.js` |
| 8 | P0 | `save-and-quit`フローにタイムアウトなし→ゾンビプロセス | `script.js` |
| 9 | P1 | `read-file-binary` IPCハンドラにサイズ上限なし→OOM | `electron/main.js` |
| 10 | P1 | 消しゴム描画用offscreen canvasが使用後に解放されない→メモリリーク | `drawing-renderer.js` |
| 11 | P1 | `getContext('2d')`のnullチェック欠落→メモリ不足時にクラッシュ | `drawing-renderer.js` |
| 12 | P0 | `pdfDoc.save()`の結果が未検証→破損データが保存される可能性 | `pdf-lib-saver.js` |
| 13 | P0 | PDF読み込み失敗時に`state.pdfDocs`等がリセットされず壊れた状態が残る | `pdf-manager.js` |
| 14 | P1 | PDF注釈の`viewport.width/height`がゼロの場合にゼロ除算 | `pdf-annotation-loader.js` |
| 15 | P1 | メタデータSubjectフィールドがテキストオブジェクト数に比例して巨大化 | `pdf-lib-saver.js` |
| 16 | P1 | 画像デシリアライズのタイムアウト時に`imageDataUrl`が未削除→再シリアライズ時にサイズ肥大化 | `drawing-objects.js` |

**修正詳細**:

- **#1**: `deserializeAllPagesData()`をtry-catchで囲み、失敗しても退避オブジェクトの復元を保証
- **#2**: JPEG変換失敗ページをカウントし、`compressWarning`でユーザーに通知。`saveWithCompression()`の全returnパスに反映
- **#3**: `performUndo()`/`performRedo()`のfinallyで`isUndoRedoInProgress`を無条件リセット
- **#4**: `print-pdf-direct`に60秒、`print-pdf-with-dialog`に5分のタイムアウト。二重resolve防止付き
- **#5**: `dialog.showMessageBox`をtry-catchで囲み、失敗時にforce quitフォールバック → **v2.1.3でカスタムモーダルに置換済み**
- **#6**: `read-file`に100MBサイズ上限チェック
- **#7**: `hasUnsavedChanges = false`を描画JSONエクスポート完了後に移動（上書き保存・新規保存両方）
- **#8**: `savePdf()`に3分タイムアウトを`Promise.race`で追加
- **#9**: `read-file-binary`に500MBサイズ上限チェック
- **#10**: offscreen canvas使用後に`width=0, height=0`でメモリ解放
- **#11**: 消しゴムoffscreenとキャッシュcanvasの2箇所にnullチェックとフォールバック追加
- **#12**: 5つの保存関数すべてで`pdfBytes`が有効なUint8Arrayか検証
- **#13**: catchブロックで`state.pdfDocs`, `state.pageMapping`, `state.totalPages`をクリア
- **#14**: `viewport.width/height`のゼロチェック、`annot.rect`の配列長・有限数検証
- **#15**: 100KB超のメタデータに対してconsole.warnで警告
- **#16**: タイムアウト時に`imageDataUrl`を削除し、`img.src = ''`で読み込み中止

#### 終了確認ダイアログのカスタムモーダル化

**問題**: アプリ終了時の未保存確認がElectronネイティブの`dialog.showMessageBox`で表示され、他のカスタムモーダルと見た目が統一されていなかった。

**修正内容**: レンダラー側のカスタムモーダルで表示するように変更。

**変更フロー**:
```
変更前: main process → dialog.showMessageBox（ネイティブ）
変更後: main process → 'show-close-confirm' → renderer → MojiQModal.showCloseConfirm()
        → ユーザー選択 → 'close-action' → main process
```

**変更ファイル**:

| ファイル | 変更内容 |
|---------|---------|
| `electron/main.js` | `respond-unsaved-changes`からネイティブダイアログ削除。`show-close-confirm`送信と`close-action`受信の新ハンドラ追加 |
| `electron/preload.js` | `onShowCloseConfirm`、`sendCloseAction` IPC定義追加 |
| `js/modal.js` | `showCloseConfirm()` - 3ボタン終了確認モーダル（動的生成、既存CSSクラス使用） |
| `js/script.js` | `onShowCloseConfirm`ハンドラ追加。カスタムモーダル結果を`sendCloseAction`でmain processに送信 |

**モーダル仕様**:
- タイトル: 「終了確認」
- メッセージ: 「描画内容が保存されていません。保存しますか？」
- ボタン（横並び右寄せ）: キャンセル（グレー）/ 終了する（赤`#e53935`）/ 保存して終了する（青`#2196f3`）
- Enterで「保存して終了する」、Escで「キャンセル」、背景クリックで「キャンセル」

**IPC チャネル**:

| チャネル | 方向 | 用途 |
|---------|------|------|
| `show-close-confirm` | Main→Renderer | カスタムモーダル表示要求 |
| `close-action` | Renderer→Main | ユーザー選択結果（`save-and-quit` / `quit-without-saving` / `cancel`） |

---

### v2.1.2 バグ修正・機能追加 (2026-04-01)

#### 描画オブジェクトのコピー＆ペースト機能 (Ctrl+C / Ctrl+V)

**概要**: 選択中の描画オブジェクトをCtrl+Cでコピー、Ctrl+Vでペーストできる機能を実装。既存のカット(Ctrl+X)＆ペースト(Ctrl+V)の仕組みを拡張。

**変更ファイル**:
- `drawing-clipboard.js`: `copySelected()`関数を追加。カットと異なりオブジェクトを削除せず、`isCut=false`でクリップボードに保存（何度でもペースト可能）
- `drawing-select.js`: 公開APIに`copySelected()`を追加（`MojiQDrawingClipboard`に委譲）
- `settings.js`: `DEFAULT_SETTINGS.shortcuts`に`copy`ショートカット定義を追加
- `shortcuts.js`: `matchesShortcut(e, 'copy')`のハンドラを追加、`mojiq:copy`イベントをdispatch
- `page-manager.js`: `mojiq:copy`イベントリスナーを追加
- `script.js`: ショートカットアクションに`copy`caseを追加

#### 同じ位置にペースト機能 (Ctrl+Shift+V)

**概要**: Ctrl+Shift+Vでオフセットなしの同じ位置にペーストできる機能を追加。

**変更ファイル**:
- `settings.js`: `pasteInPlace`ショートカット定義を追加（`Ctrl+Shift+V`）
- `shortcuts.js`: `pasteInPlace`をpasteより先に判定し、`{ inPlace: true }`付きで`mojiq:paste`イベントをdispatch
- `drawing-clipboard.js`: `pasteFromClipboard()`に`options.inPlace`パラメータ追加
- `drawing-select.js` / `page-manager.js` / `script.js`: options伝播

#### PDF注釈由来テキストのコピー＆ペースト改善

**問題1**: ペーストしたPDF注釈由来テキストが保存時にコメントテキスト非表示の対象になってしまう。
**修正**: `drawing-clipboard.js`の`pasteFromClipboard()`でペースト時に`_pdfAnnotationSource`プロパティを削除し、通常テキストとして扱うようにした。

**問題2**: ペーストしたPDF注釈由来テキストが描画JSON読み込み時に消失する。
**原因**: JSON読み込み時の退避ロジックが`_pdfAnnotationSource`付きオブジェクトのみを退避していたため、ペースト由来のテキスト（`_pdfAnnotationSource`なし）は退避されず、全ページクリアで消失していた。
**修正**: `drawing-export-import.js`の`_processImportData()`で、退避対象を「PDF注釈オブジェクトのみ」から「**JSONに含まれていない全オブジェクト**」に変更。JSONのオブジェクトIDのセットを構築し、IDがJSONに存在しないオブジェクトを全て退避・復元するようにした。

**問題3**: JSON保存時にPDF注釈由来テキスト（`_pdfAnnotationSource`付き）がJSONに含まれ、読み込み時にPDF動的ロード分と重複する。
**修正**: `drawing-export-import.js`の`_prepareExportData()`で`_pdfAnnotationSource`付きオブジェクトを常にJSONから除外。読み込み時のフィルタリングでも古いJSONに含まれる注釈オブジェクトを除外。

#### 描画JSON保存時の上書き防止

**概要**: `drawing-export-import.js`の`exportToPath()`（PDF保存時の自動保存）で、同名の描画JSONファイルが既に存在する場合、末尾に`(1)`,`(2)`...と番号を付けて新規ファイルとして保存。`_getUniqueFilePath()`ヘルパーメソッドを追加し、`electronAPI.fileExists()`でファイル存在確認を行う。`.mojiq.json`複合拡張子に対応。

#### 見開き表示＋圧縮保存で見開きPDFにならないバグ修正

**問題**: 見開き表示の状態で圧縮保存にチェックを入れてPDF保存すると、見開きPDF（2ページを1ページに結合）ではなく、単ページごとに保存されてしまう。

**原因**: `saveNonDestructive()`で`compressMode`が`true`の場合、見開きモード判定（`spreadMode`チェック）に到達する前に`saveWithCompression()`に早期リターンしていた。`saveWithCompression()`が呼ぶ`createCompressedPdf()`は各ページを個別に処理する単ページ専用の実装で、見開きページ（幅2倍のページ）を作成するロジックがなかった。

**修正内容** (`pdf-lib-saver.js`):

1. **`_renderPageToCompressCanvas()`ヘルパー関数を新規追加**
   - 個別ページ（PDF/画像/白紙）を見開きキャンバスの指定位置に圧縮描画する関数
   - 画像ページはアスペクト比を保持してスケーリング
   - PDFページは一時キャンバスにレンダリング後、見開きキャンバスに転写

2. **`createCompressedPdf()`に見開きモード分岐を追加**
   - `spreadMode && spreadMapping.length > 0`の場合、`spreadMapping`単位で処理
   - 幅2倍のキャンバスを作成し、左右ページを`_renderPageToCompressCanvas()`で描画
   - 見開きキー（`spread_N`）から描画オブジェクトを取得して重ねる
   - 見開きキーにオブジェクトがない場合は左右ページから個別に取得してフォールバック
   - JPEGに変換後、見開きサイズ（`spreadWidth × spreadHeight`）のページとしてPDFに追加

3. **通常モードのコードを整理**
   - 見開き時の不要な座標変換ロジック（単ページに分割して描画する旧コード）を削除
   - 単ページ専用に簡潔化

---

### v2.1.1 バグ修正 (2026-03-31)

#### PDF保存後のコメントテキストボタン状態不整合の修正

**問題**: PDF注釈由来のテキストオブジェクトがある原稿をPDF保存すると、コメントテキストが非表示になるが、コメントテキストボタン（サイドバー・校正パネル両方）が非表示状態を反映せず、ボタンを2度クリックしないと表示に戻せなかった。

**原因**:
1. 保存時に`setIsHiddenInternal(true)`でUIを更新せずに非表示フラグのみ設定し、`finally`で`setIsHiddenInternal(originalIsHidden)`で復元していたが、UIボタンと再描画が更新されなかった
2. `text-layer-manager.js`の`updateButtonState()`がサイドバーの`textLayerBtn`のみ更新し、校正パネルの`proofToggleTextLayerBtn`を更新していなかった

**修正内容**:
- `pdf-lib-saver.js`: 全5保存関数の`finally`ブロックで`setIsHiddenInternal(originalIsHidden)` → `setIsHidden(true)`に変更。メタデータの`commentTextHidden`も常に`true`に統一
- `text-layer-manager.js`: `updateButtonState()`に校正パネルの`proofToggleTextLayerBtn`のactive/titleの更新を追加

#### モーダル表示中のページ移動ロック

**問題**: 読込完了ダイアログなどのモーダル表示中に方向キーやホイールスクロールでページ移動ができてしまっていた。

**原因**:
1. `utils.js`の`isModalOpen()`が`.modal`クラスのみを検索しており、実際のモーダル（`promptModal`、`confirmModal`等）が使用する`.modal-overlay`クラスを検出できていなかった
2. `navigation.js`のページ移動関数（ホイール、ボタン、スライダー）にモーダルチェックがなかった
3. `shortcuts.js`の`isModalOpen()`が設定モーダルのみをチェックしており、汎用モーダルを検出していなかった

**修正内容**:
- `utils.js`: `isModalOpen()`のセレクタに`.modal-overlay[style*="display: flex"]`を追加
- `navigation.js`: `navigateToPage()`、ホイールスクロール（キャンバス・ナビバー）、前後ボタンの各ハンドラにモーダルチェックを追加
- `shortcuts.js`: `isModalOpen()`に`MojiQUtils.isModalOpen()`による汎用モーダル検出を追加
- `viewer-mode.js`: `navigatePage()`にモーダルチェックを追加

#### 校正チェックモードのカテゴリトグルがモード切替で閉じるバグ修正

**問題**: 正誤・提案タブでカテゴリ内の全項目にチェック→一部チェックを外した状態で指示入れモードに切り替え、校正チェックモードに戻るとカテゴリのトグルが閉じた状態になっていた。

**原因**: 全項目チェック時に`checkAllItemsInCategory()`が`checkedCategories.add()`でカテゴリを自動チェック&折りたたみするが、その後個別アイテムのチェックを外しても`checkedCategories`からの削除が行われなかった。モード切替時のHTML再生成で`checkedCategories.has()`が`true`のまま`collapsed`クラス付きで生成されていた。

**修正内容** (`proofreading-panel.js`):
- `checkAllItemsInCategory()`に、全チェックが崩れた場合にカテゴリのチェックボックス解除・`checkedCategories`からの削除・`collapsed`クラス除去を行う処理を追加

#### 校正チェックモードのチェック状態がモード切替で消えるバグ修正

**問題**: 校正チェックモードでJSONを読み込み、正誤・提案タブの項目にチェックを入れた状態で指示入れモードに切り替え、再度校正チェックモードに戻るとチェックが外れてしまう。

**原因**: `renderCheckData()`が呼ばれるたびに`checkedItems.clear()`を無条件に実行していた。モード切替時に`show()`（`proofreading-panel.js`）と`enterProofreadingMode()`（`script.js`）の両方から`renderCheckData()`が呼ばれ、チェック状態がリセットされていた。

**修正内容**:
- `proofreading-panel.js`: `renderCheckData(data, options)`に`options`引数を追加。`{ preserveChecked: true }`指定時は`checkedItems.clear()`をスキップ
- `script.js`: `enterProofreadingMode()`から呼ぶ`renderCheckData()`に`{ preserveChecked: true }`を指定
- `proofreading-panel.js`: `show()`内の呼び出しにも`{ preserveChecked: true }`を指定

#### コメントタブのチェック済み項目の表示改善

**変更**: コメントタブで項目にチェックを入れた際、チェックボックスとページリンクの色が薄くならないように修正。

**修正内容** (`css/proofreading-mode.css`):
- `.proofreading-comment-item.checked`の`opacity: 0.5`対象から`.proofreading-comment-checkbox-icon`と`.proofreading-comment-page`を除外

#### 描画JSON読み込み時にPDF注釈コメントオブジェクトが削除されるバグ修正

**問題**: PDF注釈のコメントオブジェクトがあるPDFで描画JSONを読み込むと、コメントオブジェクトが削除されてしまう。

**原因**: `_processImportData()`で全ページの描画をクリアする際に`clearPageObjects()`でPDF注釈由来のオブジェクトも一緒に削除していた。さらに`deserializePageObjects()`が`state.pageObjects[pageNum].objects = restored`で配列を丸ごと上書きするため、クリア後に復元しても再度消えていた。

**修正内容** (`drawing-export-import.js`):
- クリア前にPDF注釈由来オブジェクト（`_pdfAnnotationSource`プロパティを持つ）を全ページから退避
- `deserializeAllPagesData()`による描画データ復元後に、退避したPDF注釈オブジェクトを`addObject()`で復元

---

### PDF保存・描画JSON読み込み関連のバグ修正 (2026-03-27)

#### ドラッグ＆ドロップ読み込み時の上書き保存バグ修正

**問題**: アプリのアイコンにファイルをドラッグ＆ドロップで読み込むと、初回読込でも上書き保存ができてしまう。

**原因**: `loadPdfFromPath`関数で`currentSaveFilePath = filePath`を設定していたため、ファイルを読み込んだだけで上書き保存が有効になっていた。ブラウザ経由の読み込み（`loadPdf`等）では`currentSaveFilePath = null`に設定されており、動作が不一致だった。

**修正内容** (`pdf-manager.js`):
- `loadPdfFromPath`関数で`currentSaveFilePath = null`に変更
- これにより、初回読込時は上書き保存が無効になり、「名前を付けて保存」後に上書き保存が有効になる

#### 圧縮保存時のコメントテキスト非表示保存バグ修正

**問題**: 描画JSONを読み込んで圧縮保存を有効にしてPDF保存すると、コメントテキストオブジェクトが非表示にならずPDFに保存されてしまう。

**原因**: `createCompressedPdf`関数内で描画オブジェクトを描画する際に、`TextLayerManager.shouldRenderObject()`によるPDF注釈由来テキストの非表示チェックが行われていなかった。

**修正内容** (`pdf-lib-saver.js`):
- `createCompressedPdf`関数に`TextLayerManager`変数を追加
- 通常モードと見開きモードの両方で、描画前に`shouldRenderObject()`をチェック

#### 描画JSON読み込み後のPDF保存でテキストが小さくなるバグ修正

**問題**: 描画JSONを読み込んで（圧縮保存オフで）PDF保存すると、長文のテキストオブジェクトが小さくなってしまう。

**原因**:
1. `renderAll`関数で描画キャッシュを使用する際、`ctx.setTransform(1, 0, 0, 1, 0, 0)`でスケールをリセットしてキャッシュ画像を描画していた
2. キャッシュは画面表示用のサイズで作成されているため、PDF保存時に設定したスケーリングが無視されていた
3. JSON読み込み時のスケーリングに使用するサイズ（`_getCurrentCanvasSize`）とPDF保存時のスケーリングに使用するサイズ（`mapItem.displayWidth/Height`）が不一致だった

**修正内容**:
- `drawing-renderer.js`: エクスポートモード時はキャッシュを使わず直接描画するように修正
- `drawing-export-import.js`: `_scaleCoordinatesForImport`で各ページごとに`getDisplayPageSize(pageNum)`を使用してスケーリング

---

### ページバー方向キーバグ修正 (2026-03-27)

**問題**: ページバーでスライダーのハンドルをドラッグして移動した後、方向キーでページ移動すると環境設定の方向キー設定と逆方向に移動してしまう。

**原因**: ドラッグ終了後もスライダー（`<input type="range">`）にフォーカスが残っていたため、方向キーを押すとブラウザのネイティブ動作でスライダー値が変更されていた。この動作はスライダーの`dir`属性（RTL/LTR）に依存し、ユーザーの方向キー設定（`getArrowKeyInverted()`）とは無関係だった。

**修正内容** (`navigation.js`):
- `endSliderDrag()`関数で、ドラッグ終了時に`pageSlider.blur()`を呼び出してフォーカスを外すように修正
- これにより方向キー操作は`shortcuts.js`の処理に委ねられ、ユーザー設定が正しく反映される

---

### 写植シミュレーターツールの分離・改善 (2026-03-27)

#### 一文字グリッドとセリフ見本の分離

**背景**: 従来の「写植グリッド」ツールは、セリフサンプル欄の入力状態によって動作が変わっていたため、操作が分かりにくかった。

**変更内容**:
- **一文字グリッド**: 1x1固定サイズの空グリッド枠のみを描画（縮尺基準用）
- **セリフ見本**: セリフサンプルの文字が入ったグリッドを描画（テキストから行数・文字数を自動計算）

**実装詳細**:
- `pendingGridState.showText`プロパティで文字表示の有無を制御
- `grid`モード: `showText = false`、`lines = 1`、`chars = 1`固定
- `sampleGrid`モード: `showText = true`、テキストから自動計算

#### ホイールによるグリッドサイズ変更

**変更**: ハンドルドラッグによるリサイズを廃止し、マウスホイールでのサイズ変更に変更。

**実装**:
- グリッド上でホイールスクロール → ptサイズを±0.5変更
- `navigation.js`でグリッド調整中はページ移動をスキップ
- 座標計算は`getPos(e)`を使用してCSS変換を正しく処理
- サイズ表示は小数点第一位で四捨五入

#### ツールボタンUI改善

**変更内容**:
1. 縮尺合わせ、一文字グリッド、セリフ見本をアイコンのみの3列表示に変更
2. ツールチップで機能名を表示
3. セリフ見本入力欄を常時表示（縮尺合わせ完了前はグレーアウト）
4. ツール切り替え時に他のツールボタンの選択状態を解除

#### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `index.html` | ツールボタンのアイコン化、3列レイアウト |
| `js/simulator/tools.js` | `deactivateAllTools()`、`deactivateDrawingTools()`追加 |
| `js/simulator/event-handlers.js` | `handleWheel()`追加、座標計算修正、マーキー選択防止 |
| `js/simulator/grid-drawing.js` | `showText`による文字描画条件分岐 |
| `js/simulator/ui-update.js` | サイズ表示の四捨五入 |
| `js/drawing.js` | `sampleGrid`モードのスキップ追加 |
| `js/navigation.js` | グリッド調整中のページ移動スキップ |
| `js/mode-controller.js` | `sampleGrid`モードの解除処理追加 |

---

### 横長ページ時の見開きオプションのグレーアウト (2026-03-26)

**機能**: 横長ページ（見開き原稿）を含むPDF/画像を読み込んでいる場合、ページ編集ドロップダウンの「右綴じ」「左綴じ」オプションをグレーアウトして操作不可にする。

**理由**: 既に見開き状態の横長ページを再度見開き分割することは意味がないため。

**修正内容**:

1. **`pdf-manager.js`**
   - `isLandscapeImage()` - 全ページをスキャンし、いずれかが横長（width > height）かどうかを判定
   - 判定順序: `displayWidth/Height` → `width/height` → `imagePageData`

2. **`script.js`**
   - ページ編集ドロップダウンを開く際に`isLandscapeImage()`を呼び出し
   - 横長ページがある場合、`bindingRightBtn`と`bindingLeftBtn`に`disabled`属性と`.disabled`クラスを付与

3. **`navigation.css`** / **`dark-mode.css`**
   - `.spread-binding-dropdown .page-edit-dropdown-item:disabled` のスタイル追加
   - グレーアウト表示（`color: #aaa`、`pointer-events: none`）

---

### PDF保存エラーメッセージ改善・校正パネルUI改善 (2026-03-25)

#### PDF保存時の「読み取り専用です」エラー改善

**問題**: PDF保存時に「読み取り専用です」とエラーが出る場合、原因が分かりづらかった。

**原因**: Windowsではファイルロック（他アプリで開いている）と読み取り専用属性の両方で`EACCES`/`EPERM`エラーが発生するが、同じメッセージを表示していた。

**修正内容** (`electron/main.js`):
- `isFileReadOnly()` - ファイルの読み取り専用属性をチェック
- `isFileLocked()` - ファイルが他プロセスでロックされているかチェック
- エラーメッセージを原因別に分類:
  - 読み取り専用属性: 「ファイルが読み取り専用です。ファイルのプロパティを確認するか...」
  - ファイルロック: 「ファイルが他のアプリケーションで開かれています。PDFビューア等を閉じて...」
  - フォルダ権限: 「保存先フォルダへの書き込み権限がありません...」

#### 校正パネル（正誤・提案タブ）のUI改善

**変更内容**:

1. **テキストスタンプボタンの追加**
   - 各項目にテキストアイコン（Aa）ボタンを追加
   - ボタンをクリックするとテキスト入力モードに切り替わる
   - 行全体のクリックは無効化し、操作対象を明確化
   - ツールチップ: 「クリックで内容を追記」

2. **区切り線の追加**
   - チェックボックスとテキストボタンの間に区切り線を追加
   - テキストボタンとページリンクの間に区切り線を追加
   - 上下に余白のあるデザイン

3. **列の配置調整**
   - 全列を上下中央揃えに統一
   - ページリンクとテキスト内容の間隔を狭める

4. **確認済み表示の改善**
   - 「確認済み」文字色を緑色（`#4caf50`）に変更
   - チェックボックス、ハイパーリンク、テキストボタンは透明度を変えない

5. **カテゴリ全項目チェック時の自動処理**
   - カテゴリ内の全項目にチェックを入れると、カテゴリのチェックボックスが自動でチェックされ、トグルが畳まれる

**変更ファイル**:
- `electron/main.js` - PDF保存エラーメッセージ改善
- `js/ui/proofreading-panel.js` - テキストボタン追加、自動カテゴリチェック
- `css/proofreading-mode.css` - UI改善スタイル

---

### PDF注釈テキストの保存・読み込み改善 (2026-03-24)

#### Acrobatで追加した新しい注釈のオブジェクト化

**問題**: MojiQで保存したPDFにAcrobatで新しい注釈を追加した後、MojiQで開いても新しい注釈がオブジェクト化されなかった。

**原因**: MojiQ保存済みPDFの場合、すべてのPDF注釈の読み込みをスキップしていた。

**修正内容** (`pdf-annotation-loader.js`):
- `isMojiQProcessedAnnotation()` 関数を追加
- メタデータに保存されている注釈（既にラスタライズ済み）のみスキップ
- 新しい注釈はオブジェクト化される

```javascript
// メタデータに含まれていない注釈（Acrobatで新しく追加された）はオブジェクト化
if (mojiQTexts && isMojiQProcessedAnnotation(obj, pageNum, mojiQTexts, displayWidth, displayHeight)) {
    continue;  // 既存の注釈はスキップ
}
window.MojiQDrawingObjects.addObject(pageNum, obj);  // 新しい注釈は追加
```

#### コメントテキスト非表示ボタンのグレーアウト

**機能**: PDF注釈由来のテキストオブジェクトが存在しない場合、コメントテキスト非表示ボタンをグレーアウトして操作不可にする。

**修正内容**:
- `text-layer-manager.js`:
  - `checkHasAnnotationText()` - 全ページを走査してPDF注釈由来テキストの存在を確認
  - `updateButtonAvailability()` - テキストの有無に応じてボタンの有効/無効を切り替え
  - `mojiq:objects-changed`イベントをリスンして削除時にボタン状態を更新
- `pdf-annotation-loader.js`: 注釈読み込み完了後に`updateButtonAvailability()`を呼び出し
- CSS: `.sidebar-bottom-btn:disabled`、`.proofreading-icon-btn:disabled`のスタイル追加

#### PDF保存時のPDF注釈テキスト非表示保存

**機能**: PDF保存時、PDF注釈由来のテキストオブジェクトを常に非表示状態で保存（ラスタライズしない）。

**修正内容** (`pdf-lib-saver.js`):
- 全5つの保存関数に対応:
  - `saveNonDestructive()`
  - `saveWithCompression()`
  - `saveNonDestructiveSpread()`
  - `saveTransparentSpread()`
  - `saveTransparent()`
- 保存前に`setIsHiddenInternal(true)`で一時的に非表示
- メタデータには元のユーザー設定（`originalIsHidden`）を保存
- `finally`で状態を復元

**`text-layer-manager.js`に追加**:
- `setIsHiddenInternal()` - UI更新なしで内部フラグのみ変更（保存処理用）

---

### バグ修正・リファクタリング (2026-03-24)

致命的なバグの修正と、コード品質向上のためのリファクタリングを実施。

#### 高リスク問題の修正

| # | 問題 | 修正ファイル | 対応内容 |
|---|------|------------|---------|
| 1 | スケーリング計算でNaN/Infinity | `drawing-export-import.js:251-284` | currentSizeとscaleX/scaleYの検証を追加 |
| 2 | PDF保存時のnull参照エラー | `pdf-manager.js` (4箇所) | resultのnull/undefinedチェックを追加 |
| 3 | JSON解析エラーメッセージ隠蔽 | `drawing-export-import.js:474-476` | 元のエラーメッセージを含める |
| 4 | 校正パネルの複数DOM更新 | `proofreading-panel.js:1577-1590` | 単一のrequestAnimationFrameに統合 |
| 5 | renderAnnotationの重いループ | `drawing-renderer.js` (複数箇所) | ストローク回数を5回→3回に最適化 |

#### グローバル変数の整理

**新規ファイル**: `js/core/namespace.js`

- 統一名前空間 `window.MojiQ` を導入
- 既存の `window.MojiQXxx` は後方互換性エイリアスとして維持
- 特殊モジュールの名前空間への統合:
  - `DrawingExportImport` → `MojiQDrawingExportImport`
  - `ProofreadingPanel` → `MojiQProofreadingPanel`
  - `AppLock` → `MojiQAppLock`

#### リファクタリング

**新規ファイル**: `js/core/error-handler.js`
- 標準化されたエラーハンドリング
- エラーレベル/カテゴリの分類
- 統一されたログ・通知・履歴管理

**新規ファイル**: `js/core/validators.js`
- 共通バリデーション関数
- 座標、サイズ、スケール、オブジェクトの検証

**リファクタリング**: `js/drawing-select.js`
- 7箇所の座標検証コードを共通の`isValidPosition()`関数に統合

#### 変更ファイル一覧

```
新規作成:
  js/core/namespace.js        # 統一名前空間
  js/core/error-handler.js    # エラーハンドリング
  js/core/validators.js       # バリデーション

修正:
  js/drawing-export-import.js # NaN/Infinity対策、エラーメッセージ改善
  js/pdf-manager.js           # null参照エラー防止
  js/drawing-renderer.js      # 描画パフォーマンス最適化
  js/drawing-select.js        # 重複コード削減
  js/ui/proofreading-panel.js # DOM更新最適化
  js/lock.js                  # 名前空間対応
  index.html                  # 新規モジュールの読み込み追加
```

---

### 済スタンプ配置のウィンドウサイズ対応 (2026-03-24)

#### 問題
コメントタブのチェックボックスから付ける済スタンプが、ウィンドウサイズによってずれた位置に配置されることがあった。

#### 原因
`canvasRect`がコメント読み込み時の表示サイズで計算されており、ウィンドウサイズが変更されると現在のキャンバス座標系と一致しなくなっていた。

#### 修正内容

**proofreading-panel.js**
1. メタデータ由来のコメントの座標を現在の表示サイズに変換
   - 保存時の`savedDisplayWidth`/`savedDisplayHeight`と現在の表示サイズを比較
   - スケール係数を計算して座標を変換

2. PDF注釈の座標を元のPDF座標から現在の表示サイズで再計算
   - `rect`（元のPDF座標）と`viewportWidth`/`viewportHeight`を使用
   - `getDisplayPageSize()`で現在の表示サイズを取得して再計算

3. メタデータ読み込み時に表示サイズ情報を保存
   - `savedDisplayWidth`と`savedDisplayHeight`をコメントデータに追加

### 描画JSON読み込み時のコメントタブ更新 (2026-03-24)

#### 問題
テキストがある描画JSONを読み込んだ際にコメントタブに何も表示されなかった。

#### 原因
1. `deserializeAllPagesData`後に`mojiq:objects-changed`イベントが発火されていなかった
2. イベントリスナーが`if (window.MojiQStore)`ブロック内にあり、条件によっては登録されないことがあった

#### 修正内容

**drawing-export-import.js**
- `_processImportData`で描画データ復元後に`mojiq:objects-changed`イベントを発火

```javascript
window.dispatchEvent(new CustomEvent('mojiq:objects-changed', {
    detail: { action: 'import', objectType: 'text' }
}));
```

**proofreading-panel.js**
- `mojiq:file-loaded`と`mojiq:objects-changed`のイベントリスナーを`if (window.MojiQStore)`ブロックの外に移動
- これにより`MojiQStore`の有無に関わらずイベントリスナーが登録される

---

### 確認済みコメントのPDFメタデータ保存・復元機能

#### 背景・課題
- AcrobatでPDF注釈を入れたPDFをMojiQで読み込むとテキストがオブジェクト化される
- 済スタンプを付けて保存・再読み込みすると：
  - ラスタライズ済みテキストの上に再びテキストオブジェクトが重なる
  - コメントタブからも除外されない

#### 解決策
PDFのSubjectフィールドにメタデータを保存し、再読み込み時に活用する。

#### メタデータ形式
```
MojiQ:commentTextHidden=false;MojiQText:[Base64];MojiQChecked:[Base64]
```

- `MojiQ:` - MojiQ保存済みPDFであることを示すフラグ
- `MojiQText:` - 済スタンプなしのMojiQテキスト情報（Base64エンコードJSON）
- `MojiQChecked:` - 済スタンプ付きコメントの識別情報（Base64エンコードJSON）

### 変更ファイル一覧

#### pdf-lib-saver.js
- `collectMojiQTextData()` - MojiQテキスト情報を収集（済スタンプ付きは除外）
- `collectCheckedCommentsData()` - 確認済みコメント情報を収集
- `saveNonDestructive()` - メタデータをSubjectフィールドに保存

**重要な実装詳細:**
```javascript
// 以前のメタデータから読み込んだMojiQテキストも保持
// （MojiQ保存済みPDFを再読み込みした場合、DrawingObjectsにはテキストがないため）
if (window.MojiQPdfManager && window.MojiQPdfManager.getLoadedMojiQTexts) {
    const loadedTexts = window.MojiQPdfManager.getLoadedMojiQTexts();
    // 確認済みテキストは除外して保存
}
```

#### pdf-manager.js
- グローバル変数追加: `loadedCheckedComments`, `isMojiQSavedPdf`, `loadedMojiQTexts`
- `loadMojiQMetadata()` - PDFからメタデータを解析・復元
- 公開API追加:
  - `getLoadedCheckedComments()` - 確認済みコメント情報を取得
  - `isMojiQSavedPdf()` - MojiQ保存済みPDFかどうか
  - `getLoadedMojiQTexts()` - MojiQテキスト情報を取得

**重要:** `loadMojiQMetadata`は`loadPdfAnnotationsForAllPages`の前に実行すること。

#### pdf-annotation-loader.js
- `isCheckedAnnotation()` - 確認済み注釈かどうかを判定
- `isMojiQProcessedAnnotation()` - MojiQで既に処理済みの注釈かどうかを判定
- `loadPdfAnnotationsForAllPages()` - 既存の注釈はスキップ、新しい注釈のみオブジェクト化

```javascript
// 確認済みコメント、または既にMojiQで処理済みの注釈はスキップ
// Acrobatで新しく追加された注釈のみオブジェクト化
if (checkedComments && isCheckedAnnotation(obj, pageNum, checkedComments)) continue;
if (mojiQTexts && isMojiQProcessedAnnotation(obj, pageNum, mojiQTexts, displayWidth, displayHeight)) continue;
window.MojiQDrawingObjects.addObject(pageNum, obj);
```

#### proofreading-panel.js
- `isAnnotationChecked()` - 注釈が確認済みかどうかを判定
- `loadPdfComments()` - 確認済みコメントをコメントタブから除外
- `loadMojiQTextFromMetadata()` - メタデータからMojiQテキストを読み込み
- `addDoneStampForComment()` - DrawingObjectがない場合は`canvasRect`を直接使用

#### drawing-renderer.js
- `hitTestAll()` - `commentIndex`付きの済スタンプは選択対象から除外

```javascript
if (objects[i].type === 'doneStamp' && objects[i].commentIndex !== undefined) continue;
```

#### drawing-select.js
- 矩形選択時も`commentIndex`付きの済スタンプを除外

### 動作フロー

#### 保存時
```
ProofreadingPanel.getCheckedCommentSignatures()
  + MojiQPdfManager.getLoadedCheckedComments()
  → collectCheckedCommentsData() でマージ・Base64エンコード
  → Subject に "MojiQChecked:[Base64]" を追加

MojiQDrawingObjects + MojiQPdfManager.getLoadedMojiQTexts()
  → collectMojiQTextData() で収集（確認済みは除外）
  → Subject に "MojiQText:[Base64]" を追加
```

#### 読み込み時
```
loadMojiQMetadata() で "MojiQChecked:" と "MojiQText:" を解析
  → loadedCheckedComments, loadedMojiQTexts に保存
  → isMojiQSavedPdf フラグを設定

pdf-annotation-loader:
  → MojiQ保存済みPDFなら注釈オブジェクト化をスキップ

proofreading-panel:
  → 確認済みコメントは表示スキップ
  → MojiQテキストはメタデータから読み込み
```

### チェックボックスからの済スタンプ

- `commentIndex`プロパティを持つ済スタンプは選択・消しゴムで操作不可
- これにより誤って削除されることを防止

### 注意事項

1. **メタデータ読み込み順序**: `loadMojiQMetadata`は必ず`loadPdfAnnotationsForAllPages`の前に実行
2. **DrawingObjectsが空の場合**: MojiQ保存済みPDFではテキストがラスタライズ済みのためDrawingObjectsは空。`getLoadedMojiQTexts()`からテキスト情報を取得する必要がある
3. **確認済み情報のマージ**: 保存時は以前のメタデータの確認済み情報と現在のセッションの確認済み情報をマージする

## ファイル構成

> 注: 以下は 2026-05-29 時点の実構成に合わせて更新済み。js/ 配下は実在ファイルを網羅。

```
MojiQ/
├── electron/                      # Electron メインプロセス
│   ├── main.js                    # メインプロセス（CSP・許可リスト・IPC・印刷・更新）
│   ├── preload.js                 # プリロード（electronAPI 公開・CSP違反ロガー・D&D許可登録）
│   ├── splash-preload.js          # スプラッシュ用プリロード
│   └── splash.html                # スプラッシュ画面
├── index.html                     # メイン HTML
├── calibration-viewer.html        # 校正チェックビューワー（別ウィンドウ）
├── css/                           # スタイルシート一式
├── logo/                          # アイコン・ロゴ（pdf-icons 含む）
├── scripts/
│   ├── check-security-regression.mjs # セキュリティ回帰チェック（npm run check:security）
│   └── set-icon.js                # ビルド時アイコン設定
├── js/
│   ├── core/                      # コア基盤
│   │   ├── namespace.js           # 統一名前空間（MojiQ）
│   │   ├── error-handler.js       # 標準化されたエラーハンドリング
│   │   ├── validators.js          # 共通バリデーション関数
│   │   ├── store.js               # 状態管理
│   │   ├── event-bus.js           # イベントバス
│   │   ├── dom-cache.js           # DOMキャッシュ
│   │   ├── clone.js               # オブジェクトクローン
│   │   ├── render-manager.js      # レンダリング管理
│   │   ├── legacy-bridge.js       # レガシーブリッジ
│   │   └── module-registry.js     # モジュールレジストリ
│   ├── pdf/                       # PDF サブモジュール
│   │   ├── pdf-utils.js           # PDF ユーティリティ
│   │   ├── pdf-compress.js        # PDF 圧縮
│   │   ├── pdf-cache.js           # PDF キャッシュ
│   │   └── pdf-spread-state.js    # 見開き状態管理
│   ├── simulator/                 # 写植シミュレーター
│   │   ├── index.js
│   │   ├── state.js
│   │   ├── dom-elements.js
│   │   ├── grid-drawing.js
│   │   ├── zoom.js
│   │   ├── event-handlers.js
│   │   ├── tools.js
│   │   ├── undo-redo.js
│   │   ├── ui-update.js
│   │   └── keyboard.js
│   ├── ui/                        # UI サブモジュール
│   │   ├── proofreading-panel.js  # 校正パネル（コメントタブ）
│   │   ├── proofreading-ui.js     # 校正ツール UI
│   │   ├── calibration-panel.js   # 校正チェック JSON 選択パネル
│   │   ├── history-panel.js       # 作業履歴パネル
│   │   └── dropdown-positioner.js # ドロップダウン位置計算
│   ├── vendor/                    # バンドル済みライブラリ
│   │   ├── pdf.min.js / pdf.worker.min.js # pdf.js
│   │   ├── pdf-lib.min.js         # pdf-lib
│   │   └── jspdf.umd.min.js       # jsPDF
│   ├── script.js                  # メインエントリ
│   ├── constants.js / types.js / utils.js
│   ├── electron-bridge.js         # Electron IPC ブリッジ（MojiQElectron）
│   ├── pdf-manager.js             # PDF 管理（読み込み・表示・保存制御・メタデータ）
│   ├── pdf-lib-saver.js           # PDF 保存（メタデータ書き込み・注釈非表示保存）
│   ├── pdf-annotation-loader.js   # PDF 注釈読み込み（新規注釈のみオブジェクト化）
│   ├── text-layer-manager.js      # PDF 注釈テキスト表示/非表示管理
│   ├── drawing.js                 # 描画メイン
│   ├── drawing-objects.js         # 描画オブジェクト管理
│   ├── drawing-renderer.js        # 描画レンダリング
│   ├── drawing-select.js          # 選択ツール
│   ├── drawing-modes.js           # 描画モード別処理
│   ├── drawing-export-import.js   # 描画データのエクスポート/インポート
│   ├── drawing-clipboard.js       # コピー/カット/ペースト
│   ├── stamps.js                  # スタンプ UI 管理
│   ├── mode-controller.js         # モード制御
│   ├── page-manager.js            # ページ管理・Undo/Redo
│   ├── navigation.js              # ナビゲーション
│   ├── zoom.js                    # ズーム
│   ├── viewer-mode.js             # 閲覧モード
│   ├── print-manager.js           # 印刷管理
│   ├── modal.js                   # モーダルダイアログ
│   ├── lock.js                    # UI ロック
│   ├── shortcuts.js               # ショートカット
│   ├── settings.js / settings-ui.js # 設定・設定 UI
│   ├── canvas-context.js          # キャンバスコンテキスト
│   ├── json-folder-browser.js     # JSON フォルダブラウザ（作品仕様読み込み）
│   └── calibration-viewer.js      # 校正チェックビューワーのロジック
├── package.json
└── CLAUDE.md                      # このファイル
```
