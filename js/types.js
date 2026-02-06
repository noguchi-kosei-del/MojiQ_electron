/**
 * MojiQ Types - JSDoc型定義
 * アプリケーション全体で使用する型を定義
 */

// ========================================
// 基本型
// ========================================

/**
 * 2D座標
 * @typedef {Object} Point
 * @property {number} x - X座標
 * @property {number} y - Y座標
 */

/**
 * バウンディングボックス
 * @typedef {Object} Bounds
 * @property {number} x - 左上X座標
 * @property {number} y - 左上Y座標
 * @property {number} width - 幅
 * @property {number} height - 高さ
 */

// ========================================
// 描画オブジェクト型
// ========================================

/**
 * 基本描画オブジェクト
 * @typedef {Object} BaseDrawingObject
 * @property {string} id - オブジェクトID
 * @property {string} type - オブジェクトタイプ
 * @property {number} [zIndex] - Z順序
 * @property {Annotation} [annotation] - アノテーション情報
 */

/**
 * ペンストローク
 * @typedef {Object} PenObject
 * @property {'pen'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {Point[]} points - ポイント配列
 * @property {string} color - 色
 * @property {number} lineWidth - 線幅
 */

/**
 * マーカーストローク
 * @typedef {Object} MarkerObject
 * @property {'marker'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {Point[]} points - ポイント配列
 * @property {string} color - 色
 * @property {number} lineWidth - 線幅
 * @property {number} opacity - 透明度
 * @property {string} compositeOp - 合成モード
 */

/**
 * 消しゴムストローク
 * @typedef {Object} EraserObject
 * @property {'eraser'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {Point[]} points - ポイント配列
 * @property {number} lineWidth - 線幅
 * @property {string[]} linkedObjectIds - 関連オブジェクトID
 */

/**
 * 直線オブジェクト
 * @typedef {Object} LineObject
 * @property {'line'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {Point} startPos - 開始位置
 * @property {Point} endPos - 終了位置
 * @property {string} color - 色
 * @property {number} lineWidth - 線幅
 */

/**
 * 矩形オブジェクト
 * @typedef {Object} RectObject
 * @property {'rect'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {Point} startPos - 開始位置
 * @property {Point} endPos - 終了位置
 * @property {string} color - 色
 * @property {number} lineWidth - 線幅
 */

/**
 * 楕円オブジェクト
 * @typedef {Object} EllipseObject
 * @property {'ellipse'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {Point} startPos - 開始位置
 * @property {Point} endPos - 終了位置
 * @property {string} color - 色
 * @property {number} lineWidth - 線幅
 */

/**
 * 半円オブジェクト
 * @typedef {Object} SemicircleObject
 * @property {'semicircle'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {Point} startPos - 開始位置
 * @property {Point} endPos - 終了位置
 * @property {string} color - 色
 * @property {number} lineWidth - 線幅
 * @property {'vertical'|'horizontal'} orientation - 向き
 */

/**
 * テキストオブジェクト
 * @typedef {Object} TextObject
 * @property {'text'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {string} text - テキスト内容
 * @property {Point} startPos - 位置
 * @property {number} fontSize - フォントサイズ
 * @property {string} color - 色
 * @property {'left'|'right'|'center'} align - 配置
 * @property {boolean} isVertical - 縦書きかどうか
 * @property {string} [fontFamily] - フォントファミリー
 * @property {LeaderLine} [leaderLine] - 引出線
 */

/**
 * 画像オブジェクト
 * @typedef {Object} ImageObject
 * @property {'image'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {Point} startPos - 開始位置
 * @property {Point} endPos - 終了位置
 * @property {HTMLImageElement} imageData - 画像データ
 */

/**
 * 済スタンプオブジェクト
 * @typedef {Object} DoneStampObject
 * @property {'doneStamp'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {Point} startPos - 位置
 * @property {string} color - 色
 * @property {number} size - サイズ
 */

/**
 * ルビスタンプオブジェクト
 * @typedef {Object} RubyStampObject
 * @property {'rubyStamp'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {Point} startPos - 位置
 * @property {string} color - 色
 * @property {number} size - サイズ
 */

/**
 * フォントラベルオブジェクト
 * @typedef {Object} FontLabelObject
 * @property {'fontLabel'} type - タイプ
 * @property {string} id - オブジェクトID
 * @property {Point} startPos - 開始位置
 * @property {Point} endPos - 終了位置
 * @property {string} color - 色
 * @property {number} lineWidth - 線幅
 * @property {string} fontName - フォント名
 * @property {number} fontSize - フォントサイズ
 * @property {number} textX - テキストX座標
 * @property {number} textY - テキストY座標
 * @property {'left'|'right'} textAlign - テキスト配置
 */

/**
 * 描画オブジェクト（Union型）
 * @typedef {PenObject|MarkerObject|EraserObject|LineObject|RectObject|EllipseObject|SemicircleObject|TextObject|ImageObject|DoneStampObject|RubyStampObject|FontLabelObject} DrawingObject
 */

// ========================================
// アノテーション関連
// ========================================

/**
 * 引出線
 * @typedef {Object} LeaderLine
 * @property {Point} start - 開始位置
 * @property {Point} end - 終了位置
 */

/**
 * アノテーション
 * @typedef {Object} Annotation
 * @property {string} text - テキスト
 * @property {number} x - X座標
 * @property {number} y - Y座標
 * @property {'left'|'right'} align - 配置
 * @property {boolean} isVertical - 縦書きかどうか
 * @property {string} color - 色
 * @property {number} fontSize - フォントサイズ
 * @property {LeaderLine} [leaderLine] - 引出線
 */

// ========================================
// 描画情報
// ========================================

/**
 * 描画情報（テキスト入力時）
 * @typedef {Object} DrawingInfo
 * @property {boolean} isLeader - 引出線があるか
 * @property {number} startX - 開始X座標
 * @property {number} startY - 開始Y座標
 * @property {number} endX - 終了X座標
 * @property {number} endY - 終了Y座標
 * @property {boolean} [drawTextOnly] - テキストのみ描画するか
 */

/**
 * 描画スタイル
 * @typedef {Object} DrawingStyle
 * @property {string} color - 色
 * @property {number} lineWidth - 線幅
 */

// ========================================
// アプリケーション状態
// ========================================

/**
 * アプリケーション状態
 * @typedef {Object} AppState
 * @property {string} currentMode - 現在の描画モード
 * @property {string|null} activeStampText - アクティブなスタンプテキスト
 * @property {FontInfo|null} selectedFontInfo - 選択中のフォント情報
 * @property {HTMLElement|null} activeFontBtn - アクティブなフォントボタン
 * @property {number} interactionState - インタラクション状態 (0: なし, 1: 描画中, 2: アノテーション待ち)
 * @property {HTMLImageElement|null} pendingImage - 配置待ちの画像
 * @property {boolean} isDeleteMode - 削除モードか
 * @property {boolean} isEditMode - 編集モードか
 * @property {HTMLElement|null} editingTargetBtn - 編集対象のボタン
 * @property {number} eraserSize - 消しゴムサイズ
 * @property {number} savedLineWidth - 保存された線幅
 * @property {number} currentZoom - 現在のズーム倍率
 * @property {{width: number, height: number}} baseCSSExtent - ベースCSSサイズ
 * @property {boolean} isPanning - パン中か
 * @property {boolean} isSpacePressed - スペースキーが押されているか
 * @property {boolean} isShiftPressed - シフトキーが押されているか
 * @property {Point} panStart - パン開始位置
 * @property {{left: number, top: number}} scrollStart - スクロール開始位置
 * @property {string[]} autoColors - 自動割り当て色
 * @property {number} fontCount - フォント数
 * @property {Array} pdfDocs - PDFドキュメント配列
 * @property {number} currentPageNum - 現在のページ番号
 * @property {number} totalPages - 総ページ数
 * @property {Object} pageDrawingHistory - ページ描画履歴
 * @property {Object} pageRedoHistory - ページRedo履歴
 * @property {Array} pageMapping - ページマッピング
 * @property {boolean} useLeaderLine - 引出線を使用するか（ゲッター）
 * @property {boolean} annotationMode - アノテーションモードか（ゲッター）
 */

/**
 * フォント情報
 * @typedef {Object} FontInfo
 * @property {string} name - フォント名
 * @property {string} color - 色
 */

// ========================================
// コールバック関数型
// ========================================

/**
 * 履歴保存コールバック
 * @callback SaveHistoryCallback
 * @returns {void}
 */

/**
 * 入力リクエストハンドラコールバック
 * @callback HandleInputRequestCallback
 * @param {DrawingInfo} drawingInfo - 描画情報
 * @returns {void}
 */

/**
 * テキスト編集コールバック
 * @callback EditTextCallback
 * @param {TextObject} textObj - テキストオブジェクト
 * @param {number} index - インデックス
 * @param {number} pageNum - ページ番号
 * @returns {void}
 */

/**
 * アノテーション編集コールバック
 * @callback EditAnnotationCallback
 * @param {DrawingObject} obj - オブジェクト
 * @param {number} index - インデックス
 * @param {number} pageNum - ページ番号
 * @returns {void}
 */

/**
 * テキストオブジェクト更新コールバック
 * @callback UpdateTextObjectCallback
 * @param {number} pageNum - ページ番号
 * @param {string} objectId - オブジェクトID
 * @param {{text?: string, isVertical?: boolean}} newProps - 新しいプロパティ
 * @returns {void}
 */

/**
 * 再描画コールバック
 * @callback RedrawCallback
 * @param {boolean} [saveHistory=true] - 履歴を保存するか
 * @returns {void}
 */

// 型定義のみのファイルなので実行コードは不要
// このファイルはJSDocの@typedefを提供するためのもの
