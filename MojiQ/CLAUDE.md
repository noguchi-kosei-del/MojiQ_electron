# MojiQ プロジェクト

PDF/画像への校正指示・チェック機能を備えたElectronアプリケーション

## ビルドコマンド

```bash
cd MojiQ
npm run build:win    # Windows向けビルド
npm run build:mac    # Mac向けビルド
npm run start        # 開発用起動
```

## 主要ファイル構成

- `MojiQ/js/script.js` - メインスクリプト、モード切替処理
- `MojiQ/js/navigation.js` - ページバー制御、表示/非表示管理
- `MojiQ/js/stamps.js` - スタンプ機能（文字サイズ、フォント指定）
- `MojiQ/js/text-layer-manager.js` - コメントテキストレイヤー管理
- `MojiQ/js/ui/proofreading-panel.js` - 校正パネルUI
- `MojiQ/css/navigation.css` - ページバーのスタイル
- `MojiQ/css/proofreading-mode.css` - 校正モード専用スタイル
- `MojiQ/css/stamps.css` - スタンプUIのスタイル
- `MojiQ/css/canvas.css` - キャンバス・ホーム画面のスタイル
- `MojiQ/css/history-panel.css` - 作業履歴パネルのスタイル

## モード

- **指示入れモード**: PDF/画像に校正指示を書き込む
- **校正チェックモード**: 校正チェックリストを表示・管理

## 最近の変更 (2026-03-12)

### バージョン更新
- バージョンを2.0.7から2.0.8に更新

### 新機能: Alt+スクロールでポインター位置ズーム
- Alt+ホイールスクロールでマウスポインター位置に向かってズームイン/ズームアウト
- 従来のCtrl/Cmd+ホイールは画面中央基準のズーム（変更なし）
- ページ移動との競合を防止

### UI変更: 校正チェックモードのタブUI化
- 正誤・提案のトグルボックスを廃止
- 上部タブバー（正誤/提案/コメント）で切り替えるUI に変更
- 新機能「コメント」タブ: PDFに既存の注釈（Text, FreeText, Highlight, Underline, StrikeOut）を表示
  - ページ番号（クリックでジャンプ）
  - 注釈タイプ（色分けバッジ）
  - コメント内容
- 各タブで検索機能が動作
- ダークモード対応

### バグ修正: 見開き原稿のコメントページ表示ずれ
- コメントタブで見開き原稿のページ番号が1ページ分ずれる問題を修正
  - 左右ページ判定が逆になっていた（右側=偶数ノンブル、左側=奇数ノンブルに修正）
  - 例: 実際は16Pにあるコメントが17Pと表示される問題を修正

### 改善: コメント数の自動取得
- PDF読み込み完了時にコメントタブの件数を自動表示
  - タブをクリックしなくても件数「(N)」が表示される

### 関連ファイル
- `MojiQ/index.html` - タブバー・タブコンテンツのHTML構造
- `MojiQ/css/proofreading-mode.css` - タブUI・コメントアイテムのスタイル
- `MojiQ/js/ui/proofreading-panel.js` - タブ切り替え、PDFコメント読み込み機能、ページ判定修正、自動読み込み
- `MojiQ/js/zoom.js` - performZoomToPoint関数を追加、Alt+ホイール対応
- `MojiQ/js/navigation.js` - Alt+ホイール時にページ移動をスキップ
- `MojiQ/js/viewer-mode.js` - Alt+ホイール時にページ移動をスキップ
- `MojiQ/js/shortcuts.js` - Alt+ホイールのブラウザデフォルト動作を防止

---

## 過去の変更 (2026-03-11)

### バージョン更新
- バージョンを2.0.6から2.0.7に更新

### バグ修正（保存機能の致命的バグ）
- 保存タイムアウト計算が描画オブジェクト数を正しくカウントできていない問題を修正
  - `state.pageDrawings`（存在しない変数）→ `MojiQDrawingObjects.getAllPagesData()` に修正
  - これにより大量の描画オブジェクトがある場合でも適切なタイムアウトが設定される
- 大きなPDFページでのメモリ枯渇によるフリーズを防止
  - `getOptimalScale`にページサイズを考慮したメモリ制限を追加
  - MAX_CANVAS_PIXELS（50メガピクセル、約200MB）を超える場合は自動的にスケールを下げる

### 関連ファイル
- `MojiQ/js/pdf-manager.js` - calculateSaveTimeout関数を修正
- `MojiQ/js/pdf-lib-saver.js` - getOptimalScale関数にメモリ制限を追加

---

## 過去の変更 (2026-03-09)

### リファクタリング: モジュール分割
- `drawing-clipboard.js`（新規）: クリップボード操作（カット/ペースト）をdrawing-select.jsから分離
- `pdf-annotation-loader.js`（新規）: PDF注釈読み込み機能をpdf-manager.jsから分離

### デッドコード削除
- `pdf-manager.js`: applyRotationToCanvasコメント削除
- `lock.js`: 未定義のwindow.unlockTabsチェック削除
- `core/store.js`: 未使用のgetSnapshot関数削除
- `drawing.js`: 未使用のgetSnapshot関数削除

### バグ修正（致命的）
- 画像モードで0除算が発生する問題を修正（naturalWidth/Height未ロード時）
- 配列境界外アクセスによるオブジェクト誤操作を修正（drawing-select.js）
- getSelectedObjectsのインデックス不整合を修正（drawing-objects.js）
- ImageBitmapメモリリークを修正（pdf-manager.js invalidatePageCache）
- Undo/Redo競合状態によるタイマーリークを修正（page-manager.js）
- 座標計算時のNaN発生を防止（drawing-select.js 9箇所）
- ボタン要素のnullチェック漏れを修正（mode-controller.js 8箇所）

### 新機能: PDF/JPEG画像のドラッグ配置
- 原稿読み込み後にPDF/JPEGをドロップすると選択ダイアログを表示
  - 「画像として配置」: 画像ツールと同じ動作で中央に配置
  - 「原稿として読み込み」: 従来の原稿再読み込み処理
- PDF/JPEG以外の画像形式（PNG/GIF/BMP/WebP）は対応形式表示ダイアログ後に画像として配置

### その他バグ修正
- 画像オブジェクトの上下左右中央ハンドルで縮小・拡大できない問題を修正
- ウィンドウサイズ変更後に描画JSONを読み込むと位置がずれる問題を修正
- 印刷機能が動作しない問題を修正

### 関連ファイル
- `MojiQ/js/drawing-clipboard.js` - 新規（クリップボードモジュール）
- `MojiQ/js/pdf-annotation-loader.js` - 新規（PDF注釈読み込みモジュール）
- `MojiQ/js/drawing-select.js` - クリップボード分離、座標チェック追加
- `MojiQ/js/pdf-manager.js` - 注釈分離、ImageBitmapリーク修正
- `MojiQ/js/drawing.js` - 0除算防止
- `MojiQ/js/drawing-objects.js` - インデックスチェック追加
- `MojiQ/js/page-manager.js` - タイマーリーク修正
- `MojiQ/js/mode-controller.js` - nullチェック追加
- `MojiQ/index.html` - 新規モジュール読み込み追加

---

## 過去の変更 (2026-03-08)

### バグ修正
- 見開きモードで描画JSONをインポートしても描画が表示されない問題を修正
  - 単ページキーで保存されたデータを見開きキーにマージする`refreshSpreadDrawings`を追加
- 描画JSONを上書き保存して再読み込みすると内容が正しく保存されていない問題を修正
  - `getAllPagesData`でspread_*キーとNaNキーをスキップするよう修正
- 描画を再読み込みすると位置がずれる問題を修正
  - エクスポート時にバックアップ/復元パターンを使用し、座標の二重変換を防止
- 描画データを追加保存にチェックを入れて上書き保存しても描画JSONが保存されない問題を修正
  - `exportToPath`でElectron環境判定を`window.MojiQElectron.isElectron`に統一

### UI改善
- PDF保存完了後にダイアログを表示
  - 描画JSON保存成功時: 「PDFと描画データの保存が完了しました。」
  - PDF保存のみ: 「PDF保存が完了しました。」
- 保存完了ダイアログからキャンセルボタンを削除

### 関連ファイル
- `MojiQ/js/drawing-export-import.js` - エクスポート時のバックアップ/復元、Electron判定統一
- `MojiQ/js/drawing-objects.js` - getAllPagesDataでspread_*キースキップ、backup/restore関数追加
- `MojiQ/js/pdf-manager.js` - refreshSpreadDrawings追加、保存完了ダイアログ、描画エクスポート結果反映
- `MojiQ/js/modal.js` - showAlertでキャンセルボタン非表示

---

## 過去の変更 (2026-03-06)

### バグ修正
- 見開きモード左綴じ時に新しいファイルを読み込むとページバーが逆のままになる問題を修正
- 校正チェックモードでオブジェクト選択中にカスタムカラーパレットをクリックしても色が変わらない問題を修正
- 校正チェックモードでズームインした状態でページ移動するとページバーの位置がずれる問題を修正
- 描画JSONを複数回上書き保存して読み込むとオブジェクト位置座標がずれる問題を修正（ディープコピー対応）
- フォント指定の枠線が消しゴムツールで消せない問題を修正

### UI改善
- テキスト入力モーダルのスクロールバーデザインを他のUIと統一
- 校正チェックモードのカスタムカラーパレット: カラーピッカーポップアップを削除、モード切替時に色情報を引き継ぎ
- 校正チェックモードのページバー位置をキャンバス表示エリアの中央に配置（サイドバー+ツールバー分を考慮）

### 関連ファイル
- `MojiQ/js/pdf-manager.js` - 綴じ方向リセット処理追加
- `MojiQ/js/ui/proofreading-panel.js` - カスタムカラー同期、色変更処理
- `MojiQ/js/drawing.js` - 消しゴムツールにfontLabel追加
- `MojiQ/js/drawing-objects.js` - deserializeObjectでディープコピー
- `MojiQ/css/proofreading-mode.css` - ページバー位置調整
- `MojiQ/css/components.css` - スクロールバースタイル追加
- `MojiQ/css/dark-mode.css` - ダークモード用スクロールバースタイル追加

---

## 過去の変更 (2026-03-05)

### ページジャンプ機能 (Ctrl+J)
- Ctrl+Jでページ番号入力ダイアログを表示
- 入力したページ番号へジャンプ
- 見開きモード対応: ノンブル計算（最初の見開きは1、以降は各2ノンブル → 総ノンブル = 2×見開き数-1）
- 横長原稿対応: ノンブル計算で入力範囲を拡張
  - 例: 16ページの横長原稿 → 1 + 15×2 = 31ノンブル
  - ノンブル18 → 実際のページ10 (`Math.ceil((18-1)/2) + 1 = 10`)
- 関連ファイル: `MojiQ/js/shortcuts.js`, `MojiQ/js/page-manager.js`, `MojiQ/js/settings.js`

### PDF/JPEG読み込みドロップダウン
- 読み込みボタンにドロップダウンメニューを追加
- 「PDF/JPEGを読み込み」: 通常のPDF/JPEG読み込み
- 「描画を追加」: 既に読み込んだPDF/JPEGに描画データ(.mojiq.json)を追加

### 描画データのエクスポート/インポート機能
- 保存ドロップダウンに「描画データを追加保存」チェックボックスを追加
- チェック時はPDF保存と同時に描画JSONも保存（同名ファイル存在時は確認ダイアログ表示）
- チェック状態はlocalStorageで記憶
- 描画情報（ペン、マーカー、枠線など）をJSONファイルとして保存可能
- ファイル名は「元のファイル名_描画.json」形式
- 関連ファイル: `MojiQ/js/drawing-export-import.js`

### 文言変更
- 「校正ツール」→「指示ツール」に変更
- 校正チェックボタンのツールチップを「校正チェックを読み込み」に変更

### 空データ時のメッセージ改善
- 文字サイズ・フォント指定: 「データがありません（追加するか作品仕様を読み込みから読み込んでください）」
- 正誤チェック・提案チェック: 「データがありません（校正チェックを読み込みから読み込んでください）」
- メッセージを左揃えに変更

### ヘッダーボタンUI改善
- 作品仕様/校正チェックボタンに枠線と背景色を追加
- 作品仕様ボタン: 緑色系（#2e7d32）
- 校正チェックボタン: 青色系（#1565c0）
- モード切替時のボタン表示方式を変更: 2つ表示（片方グレーアウト）→ 1つのみ表示（モードに応じて切替）

---

## 過去の変更 (2026-03-04)

### 校正チェックモード - ページジャンプ機能
- JSONの項目ページ番号クリックで該当ページへジャンプ
- 見開き原稿（横長画像）対応: 1ページ目は単独、2ページ目以降は見開き計算
- アプリの見開きモード（SpreadViewMode）対応: 白紙ページ分を加算

### 校正チェックモード - 色設定
- 正誤（correctness）選択時: 赤色（#ff0000）で描画
- 提案（proposal）選択時: 青色（#0000ff）で描画
- 提案チェックのUIを青を基調に変更

---

## 過去の変更 (2026-03-03)

### UI改善
- 校正チェックモードのカラーセクションpadding調整（0 12px 10px）
- 区切り線デザイン変更: 両端が繋がらないスタイル（疑似要素使用）
- コメントテキストボタンにショートカット(Ctrl+T)を追加
- ツールチップから「非表示中」の表記を削除
- ホーム画面のモード名称にアイコンを追加

### スタンプ機能
- 「データがありません」メッセージ表示（文字サイズ・フォント指定が空の場合）
- 削除時にもメッセージを表示

### ページバー
- 3秒間操作がない場合のフェードアウト機能
- 位置を下げて統一（bottom: 15px）
