# MojiQ

PDF/画像の校正・注釈ツール（デスクトップアプリケーション）

## プロジェクト概要

- **アプリ名**: MojiQ
- **バージョン**: 2.0.4
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
| Shift+ドラッグ | スナップ描画（ペン/マーカー→直線、直線→水平/垂直、枠線→正方形、楕円→正円） |

## 変更履歴

### 2026-02-11
#### PDFページ回転時の描画オブジェクト回転対応
- **機能概要**: PDFページを回転ボタンで回転させた場合、新規描画するオブジェクトも回転角度に合わせて表示
- **対象オブジェクト**:
  - テキスト: ページ回転に合わせて回転（ページコンテンツと同じ向き）
  - スタンプ（トル、トルツメ等）: ページ回転に合わせて回転
  - 校正記号（半円、くの字、L字、Z字、コの字、□、△）: ページ回転に合わせて回転
- **仕様**:
  - 初回起動時（0度）を基準として、回転ボタンで回転させた角度分だけ描画を回転
  - プレビュー描画時にも回転を適用（描画中の見た目と保存後の見た目が一致）
  - 画面座標で向き判定を行い、ページ回転に関係なく直感的な操作を維持
- **修正ファイル**: `js/drawing.js`（getCurrentPageRotation, drawWithPageRotation, saveObjectToPage, プレビュー描画処理）

#### 削除ボタンの回転対応
- **機能概要**: 選択オブジェクトの削除ボタンもページ回転に合わせて表示
- **修正内容**:
  - 削除ボタン描画時にオブジェクトの回転角度を適用
  - ヒットテストでクリック座標を逆回転変換して正しく判定
- **修正ファイル**: `js/drawing-renderer.js`（renderSelectionHandles, hitTestDeleteButton）

#### オブジェクト手動回転機能の制限
- **変更内容**: 回転ハンドルを画像オブジェクトのみに表示するよう変更
- **理由**: テキストや校正記号はページ回転に連動するため、個別の手動回転は不要
- **修正ファイル**: `js/drawing-renderer.js`, `js/drawing-select.js`

### 2026-02-10
#### オブジェクト回転機能の追加
- **機能概要**: 選択ツールで個別オブジェクトを回転できる機能を追加
- **仕様**:
  - 選択時に上部に緑色の回転ハンドルを表示
  - ドラッグで任意の角度に回転
  - Shiftキーで15度単位にスナップ
  - 回転はオブジェクトの中心を基準に適用
  - pen, marker, polyline以外のオブジェクトが回転可能
- **UI**: アーチ状矢印のカスタムカーソルを回転ハンドル上で表示
- **修正ファイル**: `js/constants.js`, `js/drawing-renderer.js`, `js/drawing-select.js`

#### アノテーション（テキスト指示）の回転対応
- **機能概要**: 図形+テキスト指示を回転させた場合、引出線とテキストもセットで回転
- **仕様**:
  - 親オブジェクトの回転が引出線とアノテーションテキストに適用される
  - 回転後もアノテーションの選択・移動が正常に動作
- **修正ファイル**: `js/drawing-renderer.js`（renderAnnotation, hitTestAnnotation, hitTestLeaderEndHandle等）

#### 回転オブジェクト上でのアノテーション移動修正
- **問題**: 回転させたオブジェクト上でテキストを移動すると座標が狂う
- **原因**: 画面座標での移動量をそのまま適用していたため、回転後のローカル座標系と一致しなかった
- **修正内容**:
  - 移動量（dx, dy）を親オブジェクトの回転角度で逆回転変換
  - ローカル座標系での正しい移動量を計算して適用
- **修正ファイル**: `js/drawing-select.js`（applyMoveAnnotationOnly, applyMoveFontLabelText, applyMoveLeaderEndByDelta等）

#### 回転中心の安定化（getShapeBoundsOnly関数追加）
- **問題**: アノテーションを移動すると図形も動いてしまう
- **原因**: `getBounds()`がアノテーションを含めて計算するため、アノテーション移動時に回転中心が変化
- **修正内容**:
  - `getShapeBoundsOnly()`関数を新規作成（アノテーション除外）
  - 回転中心の計算に`getShapeBoundsOnly()`を使用
  - 選択枠・リサイズハンドル・回転ハンドルも図形のみのバウンディングボックスを使用
- **修正ファイル**: `js/drawing-renderer.js`, `js/drawing-select.js`

#### 画像回転時のポインターずれ修正
- **問題**: 画像を回転させて描画すると、ポインター位置と描画位置がずれる
- **原因**: CSS `transform: rotate()` でキャンバスを回転させた際、回転の中心点（transform-origin: center）を考慮した座標変換が行われていなかった
- **修正内容**:
  - 回転の中心点（バウンディングボックスの中心）を基準に座標変換を実装
  - クリック座標を中心からの相対座標に変換
  - 回転角度の逆回転（-rotation）を三角関数で適用
  - 逆回転後の座標をキャンバス座標に変換
  - `canvasWrapper.offsetWidth/offsetHeight`で回転前のCSSサイズを取得してスケール計算
- **修正ファイル**: `js/utils.js`（getCanvasCoordinates）, `js/drawing.js`（getPos）, `js/simulator/event-handlers.js`（getPos）

#### 画像回転機能の追加
- **機能概要**: PDF/画像を90度・180度回転して表示できる機能を追加
- **仕様**:
  - 回転は時計回りに90度→180度→0度でサイクル
  - 全ページ共通の回転（ページごとではなくグローバル設定）
  - 回転状態はページ移動しても維持される
  - PDF保存時にも回転が反映される
- **UI**: サイドバー下部のコメントテキストボタンの右に回転ボタンを配置
- **アイコン**: 2つの矢印が円を描くデザイン
- **修正ファイル**: `js/pdf-manager.js`, `index.html`, `css/header.css`, `css/dark-mode.css`

#### 校正チェックモーダルの修正
- **問題**: 校正チェックモーダルで別のボタンを押してから開くと「読み込み中」のまま進まない
- **原因**: `openModal()`で`basePath`が既にセットされている場合、フォルダ読み込み処理が実行されなかった
- **修正内容**: `basePath`が既に存在する場合は`loadFolder(basePath)`を実行するよう修正
- **修正ファイル**: `js/ui/calibration-panel.js`

#### 校正チェックモーダルの文言変更
- **変更内容**: モーダルヘッダーのテキストを「校正チェック」から「校正チェックjsonを選択してください」に変更
- **修正ファイル**: `index.html`

### 2026-02-09
#### PDFビューワーでマーカーの色があせる問題の修正
- **問題**: PDF保存後にAcrobatなどのビューワーで開くとマーカーの色があせて見える（ページ切り替えで元に戻る）
- **原因**: PDF保存時にマーカーのmultiply合成モードを無効化していたため、色が薄くなっていた
- **修正内容**:
  - エクスポートモード時の透明度を調整（元の値×1.3、最大0.5）してmultiply効果に近づける
  - 透明度を維持しつつ自然な色で表示
- **修正ファイル**: `js/drawing-renderer.js`

#### レインボーパレットの色選択機能の修正
- **問題**: レインボーパレットから色が選択できない
- **原因**: `MojiQUtils.hslToHex`関数が未定義だった
- **修正内容**: `utils.js`に`hslToHex`関数を追加（HSL→16進数カラーコード変換）
- **修正ファイル**: `js/utils.js`

#### +テキスト指示の横書き改行時の右揃え問題の修正
- **問題**: +テキスト指示で横書きの状態で改行すると各行が右揃えになってしまう
- **原因**: 引出線が左向きの場合にalign='right'が設定され、複数行でも右揃えで描画されていた
- **修正内容**:
  - 横書きで複数行の場合は常に左揃えで描画するよう変更
  - align='right'で複数行の場合、x座標を調整して左揃えで描画
  - バウンディングボックスの計算も描画と一致するよう修正
- **修正ファイル**: `js/drawing-renderer.js`（renderText, renderAnnotationText, renderAnnotation, getBounds）

#### +テキスト指示の縦書き時の白フチ被り問題の修正
- **問題**: 縦書きテキストで白フチが下の文字に被ってしまう
- **原因**: 各文字を順番に描画する際、白フチと本体を同時に描画していたため
- **修正内容**:
  - 縦書きを2パス描画に変更（1パス目：全ての白フチ、2パス目：全ての本体）
  - 白フチはshadowBlur+複数回描画で元の仕様を維持
- **修正ファイル**: `js/drawing-renderer.js`（renderText, renderAnnotationText, renderAnnotation）

### 2026-02-09（以前の変更）
#### マーカーツールのデフォルト太さ変更
- **変更内容**: マーカーツールのデフォルト線幅を6px→8pxに変更
- **修正ファイル**: `js/settings.js`

#### Shiftキーによるスナップ描画機能の追加
- **機能概要**: 各描画ツールでShiftキーを押しながら描画すると、形状がスナップされる
- **対応ツール**:
  - **ペン/マーカー**: 水平・垂直方向にスナップ（直線描画）
  - **直線/直線+テキスト指示**: 水平・垂直方向にスナップ
  - **枠線/枠線+テキスト指示**: 正方形にスナップ
  - **楕円/楕円+テキスト指示**: 正円にスナップ
- **修正ファイル**:
  - `js/drawing.js`: スナップ描画処理の実装（プレビュー描画・保存処理）、パン操作判定の除外
  - `js/mode-controller.js`: Shiftキー押下時のカーソル変更判定の除外
  - `js/shortcuts.js`: Shiftキー押下時のデフォルト動作防止、フォーカス制御

#### Shiftキー操作の改善
- **問題**: 上記ツール選択時にShiftキーを押すと、パン操作モードになる・カーソルが手のひらに変わる・UIにフォーカスが入る
- **修正内容**:
  - スナップ描画対応ツール選択時はShift+クリックでパン操作にならないよう修正
  - スナップ描画対応ツール選択時はShiftキー押下でカーソルが変わらないよう修正
  - スナップ描画対応ツール選択時はShiftキー押下でUIフォーカスが発生しないよう`e.preventDefault()`と`document.activeElement.blur()`を追加
- **対象モード**: `draw`, `marker`, `line`, `lineAnnotated`, `rect`, `rectAnnotated`, `ellipse`, `ellipseAnnotated`
- **修正ファイル**: `js/drawing.js`, `js/mode-controller.js`, `js/shortcuts.js`

#### PDF保存時の白フチ黒いシミ対策
- **問題**: PDF保存時にテキストとスタンプの白フチ周りに黒いシミが残る
- **原因**: アンチエイリアス処理による半透明ピクセルが透明背景と合成されて暗く見える
- **修正内容**:
  - **shadowBlur追加**: 全ての白フチ描画にshadowBlurを追加（アンチエイリアスの端を白い影で覆う）
  - **最終的なlineWidth設定**:
    - テキスト（renderText）: lineWidth 5→1 + shadowBlur=4
    - 図形テキスト（renderAnnotationText, renderAnnotation）: lineWidth 5→1 + shadowBlur=4
    - スタンプ文字（トル系）: lineWidth 8→2 + shadowBlur=5
    - 済スタンプ枠線: lineWidth 6→2 + shadowBlur=5
    - ルビスタンプ枠線: lineWidth 5→1 + shadowBlur=5
    - 小文字スタンプ: lineWidth 5→1 + shadowBlur=5
    - フォントラベル: lineWidth 6→1 + shadowBlur=6
  - **済・ルビスタンプ**: 文字の白フチは内側が白塗りつぶしのため不要として削除
- **修正ファイル**: `js/drawing-renderer.js`

### 2026-02-08
#### 写植グリッドサイズ表示のサイドバー移動・シンプル化
- **変更内容**:
  - `adjustMessage`（写植グリッドのサイズ表示）をキャンバス上の浮遊UIからサイドバーの`gridSettingsArea`内に移動
  - 複雑なダッシュボードUI（行数・文字数・余白・方向バッジ）をシンプルな「サイズ - pt」表示に変更
  - 常に表示（グレーアウト状態）→ グリッド描画時にアクティブ化（水色背景）
- **修正ファイル**:
  - `index.html`: adjustMessage HTMLをgridSettingsArea内に移動、シンプル構造に変更
  - `css/simulator.css`: サイドバー内表示用スタイル、グレーアウト/アクティブ状態
  - `css/dark-mode.css`: ダークモード対応
  - `js/simulator/ui-update.js`: updateDashboardValues/updateDashboardHighlightを簡素化、削除したバッジ参照を削除
  - `js/simulator/grid-drawing.js`, `event-handlers.js`, `tools.js`, `undo-redo.js`, `js/pdf-manager.js`: `style.display`を`classList.add/remove('active')`に変更

#### 縮尺合わせShiftスナップ機能の修正
- **問題**: 計測モードでShiftキーを押しながらドラッグしても水平・垂直にスナップしない
- **原因**: `ui-update.js`でHTMLから削除した`badgeDensity`を参照し`ReferenceError`が発生、`SimulatorKeyboard.init()`が実行されず`mojiq:shift`イベントが受信されなかった
- **修正内容**: `ui-update.js`から削除済みバッジ（badgeLines, badgeChars, badgePt, badgeDensity）への参照を削除
- **修正ファイル**: `js/simulator/ui-update.js`

### 2026-02-07
#### PDF保存時のテキスト・スタンプぼやけ修正
- **問題**: PDF保存時にテキストやスタンプがぼやけて表示される
- **原因**: `pdf-lib-saver.js`でCanvas描画をPNG化する際の解像度スケール（`scale = 2`）が不十分
- **修正内容**:
  - `renderDrawingObjectsToPng()`: `scale = 2` → `scale = 4` に変更
  - `renderSpreadDrawingObjectsToPng()`: `scale = 2` → `scale = 4` に変更
  - 両関数にCanvas画像スムージング設定を追加（`imageSmoothingEnabled = true`, `imageSmoothingQuality = 'high'`）
- **修正ファイル**: `js/pdf-lib-saver.js`

#### PDF保存時の白フチ外側の黒いシミ修正
- **問題**: PDF保存時にテキストやスタンプの白フチ外側に黒いシミが発生
- **原因**: Canvas描画時にストロークの`lineJoin`が未設定で、アンチエイリアスによる半透明ピクセルが透明背景との合成で暗く見える
- **修正内容**:
  - すべての白フチ描画箇所に`ctx.lineJoin = 'round'`と`ctx.lineCap = 'round'`を追加
  - 白フチを複数回描画（太いものから細いものへ）してアンチエイリアスの半透明ピクセルを覆う
  - 対象関数: `drawWithOutline`, `renderDoneStamp`, `renderKomojiStamp`, `renderRubyStamp`, `renderToruStamp`, `renderTorutsumeStamp`, `renderTorumamaStamp`, `renderZenkakuakiStamp`, `renderNibunakiStamp`, `renderShibunakiStamp`, `renderKaigyouStamp`, `renderFontLabel`, `renderAnnotationText`
- **修正ファイル**: `js/drawing-renderer.js`

#### 済スタンプ・ルビスタンプの枠内白塗りつぶし
- **問題**: スタンプの枠内が透明で背景が見えてしまう
- **修正内容**:
  - 済スタンプ: 円の内側を白で塗りつぶし（`radius + 2`で少し大きめに）
  - ルビスタンプ: 角丸長方形の内側を白で塗りつぶし（外側に2pxのマージン）
- **修正ファイル**: `js/drawing-renderer.js`

#### 消しゴムで消したオブジェクトのカット/ペースト修正
- **問題**: 消しゴムで一部を消したオブジェクトをCtrl+X/Ctrl+Vでカット/ペーストすると、消した部分が元に戻る
- **原因**:
  - カット時に関連する消しゴムオブジェクトが一緒にコピーされていなかった
  - ペースト時に消しゴムの`linkedObjectIds`が古いIDのままだった
- **修正内容**:
  - `cutSelected()`: 選択オブジェクトに関連する消しゴム（`linkedObjectIds`で紐づけ）も一緒にクリップボードにコピー・削除
  - `pasteFromClipboard()`: IDマッピングを作成し、消しゴムの`linkedObjectIds`を新しいIDに変換
- **修正ファイル**: `js/drawing-select.js`

#### 消しゴムで消した部分のPDF保存時ぼやけ修正
- **問題**: 消しゴムで消した枠線がPDF保存時にぼやけて表示される
- **原因**: `renderObjectWithErasers`関数で、オフスクリーンキャンバスのスケーリングに`window.devicePixelRatio`を使用していたが、PDF保存時はメインキャンバスが`scale=4`でスケーリングされているため解像度が不一致
- **修正内容**:
  - `ctx.getTransform()`で現在のキャンバスのスケーリング係数を取得
  - オフスクリーンキャンバスに現在のスケーリングを適用
- **修正ファイル**: `js/drawing-renderer.js`
