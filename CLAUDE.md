# MojiQ

PDF/画像の校正・注釈ツール（デスクトップアプリケーション）

## プロジェクト概要

- **アプリ名**: MojiQ
- **バージョン**: 2.0.3
- **識別子**: com.mojiq.app
- **目的**: PDF/JPEGファイルへの校正指示・注釈付け、写植サイズシミュレーション

## 技術スタック

### フロントエンド
- **Vanilla JavaScript** (ES6+)
- **HTML5 Canvas** (多層キャンバス構造)
- **CSS3** (ダークモード対応)

### バックエンド (Electron)
- **Electron 28** (デスクトップアプリフレームワーク)
- **Node.js**
- **pdf-to-printer** (印刷機能)

### PDF処理ライブラリ（ローカルバンドル）
- **pdf.js** - PDF描画・閲覧
- **pdf-lib** - PDF編集・保存
- **jsPDF** - PDF生成

## 主要機能

### 1. PDF/画像閲覧
- PDFファイルの読み込み・表示
- JPEGファイルの読み込み（複数選択対応）
- ドラッグ&ドロップによるファイル読み込み
- ページ送り・スライダーによるナビゲーション
- ズーム（0.25x〜4.0x）
- 見開き表示（右綴じ/左綴じ対応）

### 2. 描画ツール
- **ペン**: フリーハンド描画
- **マーカー**: 半透明の強調表示
- **消しゴム**: オブジェクト単位の削除
- **直線/矢印/両矢印**: 図形描画
- **矩形/楕円/半円**: 図形描画
- **折れ線**: 複数点の連結線
- **テキスト**: 縦書き/横書き対応

### 3. 校正記号ツール
- **トル/トルツメ/トルママスタンプ**: 削除指示
- **全角アキ/半角アキ**: 空白指示
- **改行**: 改行指示
- **小文字指定**: ラベル付き矩形
- **字間指示**: 両矢印+テキスト
- **アキ記号（＜）**: 字間調整
- **行移動記号（∟）**: 行の移動
- **改行記号**: 改行位置
- **全体移動記号（⊐）**: 範囲移動

### 4. 写植指示スタンプ
- **済スタンプ**: 確認済みマーク
- **ルビスタンプ**: ルビ指示
- **フォントラベル**: フォント指定（枠+ラベル）

### 5. 写植グリッドシミュレーター
- 縮尺合わせ機能（mm単位でのキャリブレーション）
- 文字サイズ（pt）の視覚化
- 行数・文字数の自動計算
- 縦書き/横書き切り替え

### 6. PDF保存・印刷
- 上書き保存/名前を付けて保存
- 背景透過度の調整（0%〜100%）
- 印刷機能（プリンター選択、部数、ページ範囲）
- SumatraPDFによるダイレクト印刷

### 7. UI機能
- ダークモード/ライトモード切り替え
- サイドバー折りたたみ
- ツールバー折りたたみ
- ワークスペース反転（左右入れ替え）
- ページバー表示/非表示
- ショートカットキーのカスタマイズ
- 作業履歴パネル
- メモ機能

### 8. 外部連携
- 検版ビューワー連携（--page オプションで初期ページ指定）
- JSONフォルダブラウザ（作品仕様ファイル読み込み）
- 自動アップデートチェック

## アーキテクチャ

### キャンバス構造（多層）
```
canvas-wrapper
├── layer-pdf-bg     // PDF背景レイヤー
├── whiteboard       // 描画レイヤー（校正指示）
└── sim-whiteboard   // シミュレーターレイヤー（写植グリッド）
```

### コアモジュール
| モジュール | ファイル | 説明 |
|-----------|---------|------|
| Store | `js/core/store.js` | 中央集権的な状態管理 |
| EventBus | `js/core/event-bus.js` | イベント通知システム |
| DOMCache | `js/core/dom-cache.js` | DOM要素キャッシュ |
| Clone | `js/core/clone.js` | ディープクローン |
| RenderManager | `js/core/render-manager.js` | 描画管理 |
| ModuleRegistry | `js/core/module-registry.js` | モジュール登録 |
| LegacyBridge | `js/core/legacy-bridge.js` | 旧コードとの橋渡し |

### 描画モジュール
| モジュール | ファイル | 説明 |
|-----------|---------|------|
| DrawingObjects | `js/drawing-objects.js` | 描画オブジェクト管理 |
| DrawingRenderer | `js/drawing-renderer.js` | 描画レンダリング |
| DrawingSelect | `js/drawing-select.js` | 選択・編集機能 |
| DrawingModes | `js/drawing-modes.js` | 描画モード管理 |
| Drawing | `js/drawing.js` | メイン描画処理 |

### PDFモジュール
| モジュール | ファイル | 説明 |
|-----------|---------|------|
| PDFManager | `js/pdf-manager.js` | PDF読み込み・表示 |
| PDFLibSaver | `js/pdf-lib-saver.js` | PDF保存処理 |
| PDFUtils | `js/pdf/pdf-utils.js` | PDFユーティリティ |
| PDFCompress | `js/pdf/pdf-compress.js` | PDF圧縮処理 |
| PDFCache | `js/pdf/pdf-cache.js` | PDFキャッシュ |
| TextLayerManager | `js/text-layer-manager.js` | テキストレイヤー管理 |

### UIモジュール
| モジュール | ファイル | 説明 |
|-----------|---------|------|
| Modal | `js/modal.js` | モーダルダイアログ |
| Stamps | `js/stamps.js` | スタンプUI管理 |
| ProofreadingUI | `js/ui/proofreading-ui.js` | 校正ツールUI |
| HistoryPanel | `js/ui/history-panel.js` | 作業履歴パネル |
| DropdownPositioner | `js/ui/dropdown-positioner.js` | ドロップダウン位置計算 |

### シミュレーターモジュール
| モジュール | ファイル | 説明 |
|-----------|---------|------|
| State | `js/simulator/state.js` | シミュレーター状態 |
| DOMElements | `js/simulator/dom-elements.js` | DOM要素参照 |
| GridDrawing | `js/simulator/grid-drawing.js` | グリッド描画 |
| Zoom | `js/simulator/zoom.js` | ズーム処理 |
| EventHandlers | `js/simulator/event-handlers.js` | イベントハンドラ |
| Tools | `js/simulator/tools.js` | ツール処理 |
| UndoRedo | `js/simulator/undo-redo.js` | 元に戻す/やり直し |
| UIUpdate | `js/simulator/ui-update.js` | UI更新 |
| Keyboard | `js/simulator/keyboard.js` | キーボード処理 |

## データ構造

### 描画オブジェクト型
```javascript
// ペンストローク
{ type: 'pen', id, points: [{x,y}...], color, lineWidth }

// マーカー
{ type: 'marker', id, points, color, lineWidth, opacity, compositeOp }

// 直線
{ type: 'line', id, startPos, endPos, color, lineWidth }

// 矩形
{ type: 'rect', id, startPos, endPos, color, lineWidth }

// 楕円
{ type: 'ellipse', id, startPos, endPos, color, lineWidth }

// 半円
{ type: 'semicircle', id, startPos, endPos, color, lineWidth, orientation }

// テキスト
{ type: 'text', id, text, startPos, fontSize, color, align, isVertical, fontFamily, leaderLine }

// 画像
{ type: 'image', id, startPos, endPos, imageData }

// スタンプ
{ type: 'doneStamp'|'rubyStamp', id, startPos, color, size }

// フォントラベル
{ type: 'fontLabel', id, startPos, endPos, color, lineWidth, fontName, fontSize, textX, textY, textAlign }
```

### アプリケーション状態 (Store)
```javascript
{
  app: { mode, isLocked, isModalOpen },
  page: { currentPageNum, totalPages, pageMapping, pdfDocs },
  canvas: { currentZoom, baseCSSExtent, dpr },
  drawing: { currentMode, interactionState, color, lineWidth, fontSize, isPanning, isSpacePressed, isShiftPressed },
  objects: { pages: { [pageNum]: { objects, selectedIndex } }, pendingObject, idCounter },
  history: { undoStacks, redoStacks, maxStackSize },
  stamps: { activeStampText, selectedFontInfo, activeFontBtn, isDeleteMode, isEditMode, useLeaderLine },
  simulator: { pixelsPerMm, isCalibrated, pageGridStates, currentMode, ptStep }
}
```

## IPC通信 (Electron)

| チャンネル | 方向 | 説明 |
|-----------|------|------|
| `show-open-dialog` | invoke | ファイル選択ダイアログ |
| `show-save-dialog` | invoke | ファイル保存ダイアログ |
| `read-file` | invoke | ファイル読み込み（base64/JSON） |
| `save-file` | invoke | ファイル保存（アトミック書き込み） |
| `read-file-binary` | invoke | バイナリ読み込み（大容量対応） |
| `print-pdf` | invoke | システムビューアで印刷 |
| `print-pdf-direct` | invoke | ダイレクト印刷（プリンター指定） |
| `print-pdf-with-dialog` | invoke | 印刷ダイアログ表示 |
| `get-printers` | invoke | プリンター一覧取得 |
| `list-directory` | invoke | フォルダ一覧取得（JSONフォルダ限定） |
| `read-json-file` | invoke | JSONファイル読み込み |
| `show-confirm-dialog` | invoke | 確認ダイアログ |
| `show-message-dialog` | invoke | メッセージダイアログ |
| `set-native-theme` | invoke | ダークモード設定 |
| `focus-window` | invoke | ウィンドウフォーカス |
| `window-minimize` | send | ウィンドウ最小化 |
| `window-maximize` | send | ウィンドウ最大化 |
| `window-close` | send | ウィンドウ終了 |
| `file-opened` | receive | ファイル読み込み完了（base64） |
| `file-opened-path` | receive | ファイルパス通知（大容量対応） |
| `image-files-opened` | receive | 画像ファイル通知 |
| `check-unsaved-changes` | receive | 未保存確認要求 |
| `save-and-quit` | receive | 保存して終了 |

## 開発・ビルド

### 開発環境の起動
```bash
npm start
# または
npm run dev  # ログ出力付き
```

### プロダクションビルド
```bash
npm run build:win   # Windows（NSIS + Portable）
npm run build:mac   # macOS
npm run build:linux # Linux
```

### ビルド出力
- Windows: NSIS インストーラー, Portable exe
- macOS: DMG, ZIP
- Linux: AppImage, DEB

## ディレクトリ構成

```
MojiQ/
├── electron/                  # Electron メインプロセス
│   ├── main.js               # メインプロセス (~970行)
│   ├── preload.js            # プリロードスクリプト
│   ├── splash-preload.js     # スプラッシュ用プリロード
│   └── splash.html           # スプラッシュ画面
├── js/                        # フロントエンド JavaScript
│   ├── core/                 # コア基盤モジュール
│   │   ├── store.js          # 状態管理
│   │   ├── event-bus.js      # イベント通知
│   │   ├── dom-cache.js      # DOMキャッシュ
│   │   ├── clone.js          # ディープクローン
│   │   ├── render-manager.js # 描画管理
│   │   ├── module-registry.js # モジュール登録
│   │   └── legacy-bridge.js  # 旧コード橋渡し
│   ├── pdf/                  # PDFサブモジュール
│   │   ├── pdf-utils.js
│   │   ├── pdf-compress.js
│   │   └── pdf-cache.js
│   ├── simulator/            # シミュレーター
│   │   ├── state.js
│   │   ├── dom-elements.js
│   │   ├── grid-drawing.js
│   │   ├── zoom.js
│   │   ├── event-handlers.js
│   │   ├── tools.js
│   │   ├── undo-redo.js
│   │   ├── ui-update.js
│   │   ├── keyboard.js
│   │   └── index.js
│   ├── ui/                   # UIサブモジュール
│   │   ├── dropdown-positioner.js
│   │   ├── proofreading-ui.js
│   │   └── history-panel.js
│   ├── vendor/               # ベンダーライブラリ
│   │   ├── pdf.min.js
│   │   ├── pdf.worker.min.js
│   │   ├── jspdf.umd.min.js
│   │   └── pdf-lib.min.js
│   ├── constants.js          # 定数定義
│   ├── types.js              # JSDoc型定義
│   ├── utils.js              # ユーティリティ
│   ├── electron-bridge.js    # Electron IPC ブリッジ
│   ├── drawing.js            # 描画メイン
│   ├── drawing-objects.js    # 描画オブジェクト
│   ├── drawing-renderer.js   # 描画レンダリング
│   ├── drawing-select.js     # 選択機能
│   ├── drawing-modes.js      # 描画モード
│   ├── pdf-manager.js        # PDF管理
│   ├── pdf-lib-saver.js      # PDF保存
│   ├── text-layer-manager.js # テキストレイヤー
│   ├── print-manager.js      # 印刷管理
│   ├── page-manager.js       # ページ管理
│   ├── navigation.js         # ナビゲーション
│   ├── zoom.js               # ズーム
│   ├── viewer-mode.js        # 閲覧モード
│   ├── mode-controller.js    # モード制御
│   ├── modal.js              # モーダル
│   ├── stamps.js             # スタンプ
│   ├── lock.js               # UIロック
│   ├── json-folder-browser.js # JSONフォルダブラウザ
│   ├── shortcuts.js          # ショートカット
│   ├── settings.js           # 設定管理
│   ├── settings-ui.js        # 設定UI
│   ├── canvas-context.js     # キャンバスコンテキスト
│   └── script.js             # メインエントリ
├── css/                       # スタイルシート
│   ├── main.css              # メイン（インポート用）
│   ├── base.css              # 基本スタイル
│   ├── layout.css            # レイアウト
│   ├── header.css            # ヘッダー
│   ├── sidebar.css           # サイドバー
│   ├── canvas.css            # キャンバス
│   ├── components.css        # コンポーネント
│   ├── navigation.css        # ナビゲーション
│   ├── stamps.css            # スタンプ
│   ├── simulator.css         # シミュレーター
│   ├── history-panel.css     # 履歴パネル
│   ├── settings.css          # 設定
│   └── dark-mode.css         # ダークモード
├── logo/                      # アイコン・ロゴ
│   ├── MojiQ_icon.ico
│   ├── MojiQ_icon.png
│   ├── MojiQ_logo.png
│   ├── MojiQ_favicon.ico
│   └── pdf-icons/            # ファイルアイコン
├── index.html                 # メインHTML (~1050行)
├── package.json               # npm設定
└── start.bat                  # 起動バッチ
```

## セキュリティ

### パストラバーサル防止
- `isPathSafe()`: パスの正規化チェック
- `isPathInJsonFolder()`: JSONフォルダ内限定アクセス
- Windowsデバイス名（CON, PRN等）のブロック

### ファイル書き込み
- アトミック書き込み（一時ファイル→リネーム）
- 書き込み中のクラッシュでも元ファイルを破損しない

### シングルインスタンス
- `app.requestSingleInstanceLock()` で複数起動を防止
- 2回目の起動時は既存ウィンドウにフォーカス

## 定数設定

### サイズ制限
| 項目 | 値 |
|------|-----|
| PDF Canvas圧縮しきい値 | 500MB |
| 画像圧縮しきい値 | 300MB |
| JPEG圧縮品質 | 0.75 |
| 履歴最大数 | 50 |

### ズーム
| 項目 | 値 |
|------|-----|
| 最小 | 0.25x |
| 最大 | 4.0x |
| ステップ | 0.25 |

### 描画
| 項目 | 値 |
|------|-----|
| デフォルト線幅 | 2px |
| 最小線幅 | 1px |
| 最大線幅 | 50px |
| 選択ハンドルサイズ | 8px |

## ファイル関連付け

- `.pdf` - PDF Document
- `.jpg` / `.jpeg` - JPEG Image

## 外部依存

### JSONフォルダパス（ハードコード）
```
G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\JSONフォルダ
```

### 更新ファイルパス（ハードコード）
```
G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\App_installer
```

## ショートカットキー

| キー | 機能 |
|------|------|
| Ctrl+O | PDFを開く |
| Ctrl+S | 保存 |
| Ctrl+Shift+S | 名前を付けて保存 |
| Ctrl+P | 印刷 |
| Ctrl+Z | 元に戻す |
| Ctrl+Y | やり直し |
| Ctrl++ | 拡大 |
| Ctrl+- | 縮小 |
| Ctrl+0 | 100% |
| Ctrl+T | テキストレイヤー表示切替 |
| V | 選択ツール |
| P | ペンツール |
| M | マーカーツール |
| E | 消しゴムツール |
| I | スポイトツール |
| F12 | 開発者ツール |
| 左右キー | ページ送り |
| Space+ドラッグ | パン（移動） |
