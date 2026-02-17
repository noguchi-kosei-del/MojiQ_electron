/**
 * MojiQ Constants - 定数定義モジュール
 * マジックナンバーや設定値を一元管理
 */
window.MojiQConstants = (function() {
    'use strict';

    // ========================================
    // 描画関連の定数
    // ========================================

    /** @type {Object} スタンプサイズ */
    const STAMP_SIZES = {
        DONE: 28,           // 済スタンプのデフォルトサイズ
        KOMOJI: 14,         // 小文字スタンプのデフォルトサイズ
        RUBY: 14,           // ルビスタンプのデフォルトサイズ
        TORU: 14,           // トルスタンプのデフォルトサイズ
        FONT_LABEL: 12      // フォントラベルのフォントサイズ
    };

    /** @type {Object} スタンプ描画パラメータ（重複コード削減用） */
    const STAMP_PARAMS = {
        WIDTH_RATIO: 1.8,           // 幅計算用: size * WIDTH_RATIO
        HEIGHT_RATIO: 0.9,          // 高さ計算用: size * HEIGHT_RATIO
        CORNER_RADIUS: 0.15,        // 角丸比率: size * CORNER_RADIUS
        FONT_SIZE_RATIO: 0.9,       // フォントサイズ比率: size * FONT_SIZE_RATIO
        // テキストスタンプの定義（白フチ付きテキストのみ）
        DEFINITIONS: {
            toruStamp: { text: 'トル' },
            torutsumeStamp: { text: 'トルツメ' },
            torumamaStamp: { text: 'トルママ' },
            zenkakuakiStamp: { text: '全角アキ' },
            nibunakiStamp: { text: '半角アキ' },
            shibunakiStamp: { text: '四分アキ' },
            kaigyouStamp: { text: '改行' }
        },
        // 円形スタンプの定義（済、小文字など）
        CIRCLE_STAMPS: {
            doneStamp: {
                text: '済',
                fontSizeRatio: 0.6,     // size * 0.6
                hasFill: true,          // 内部白塗り
                textOutline: false,     // テキスト白フチなし
                strokeWidth: 2
            },
            komojiStamp: {
                text: '小',
                fontSizeRatio: 0.6,
                hasFill: false,         // 内部透明
                textOutline: true,      // テキスト白フチあり
                strokeWidth: 1
            }
        },
        // 角丸長方形スタンプの定義（ルビなど）
        ROUNDED_RECT_STAMPS: {
            rubyStamp: {
                text: 'ルビ',
                fontSizeRatio: 0.45,
                hasFill: true,          // 内部白塗り
                textOutline: false,     // テキスト白フチなし
                strokeWidth: 1
            }
        }
    };

    /** @type {Object} テキストアウトライン（白フチ）描画パラメータ */
    const OUTLINE = {
        SHADOW_BLUR: 5,             // 影のぼかし半径
        LINE_WIDTH_MAX: 8,          // アウトライン最大線幅
        LINE_WIDTH_MIN: 2,          // アウトライン最小線幅
        ANNOTATION_SHADOW_BLUR: 4   // アノテーション用影のぼかし
    };

    /** @type {Object} 線の太さ */
    const LINE_WIDTHS = {
        DEFAULT: 2,         // ペンのデフォルト線幅
        MARKER_DEFAULT: 8,  // マーカーのデフォルト線幅
        ERASER_DEFAULT: 5,  // 消しゴムのデフォルトサイズ
        OUTLINE: 3,         // テキストのアウトライン幅
        MIN: 1,             // 最小線幅
        MAX: 20             // 最大線幅
    };

    /** @type {Object} 選択ハンドル */
    const SELECTION = {
        HANDLE_SIZE: 8,     // 選択ハンドルのサイズ
        HIT_TOLERANCE: 5    // ヒットテストの許容誤差
    };

    /** @type {Object} 回転ハンドル */
    const ROTATION = {
        HANDLE_DISTANCE: 25,    // tmハンドルからの距離
        HANDLE_RADIUS: 6,       // 回転ハンドルの半径
        HANDLE_COLOR: '#4CAF50', // 緑色
        SNAP_ANGLE: Math.PI / 12 // 15度スナップ（ラジアン）
    };

    // ========================================
    // 色の定数
    // ========================================

    /** @type {Object} システムカラー */
    const COLORS = {
        WHITE: '#ffffff',
        BLACK: '#000000',
        RED: '#ff0000',
        YELLOW: '#ffff00',
        SELECTION: '#2196F3',
        SELECTION_HANDLE: '#FFFFFF'
    };

    /** @type {Array<string>} 自動割り当て色のパレット */
    const AUTO_COLORS = [
        '#FF0000', '#FF00FF', '#00C400', '#FF6A00',
        '#0066FF', '#AA00FF', '#FF0070', '#0099E0'
    ];

    // ========================================
    // レイアウト・サイズの定数
    // ========================================

    /** @type {Object} レイアウト定数 */
    const LAYOUT = {
        LEADER_PADDING: 11,             // 引出線の引き出し距離
        LINE_HEIGHT_MULTIPLIER: 1.1,    // 縦書きの行間倍率
        LINE_HEIGHT_HORIZONTAL: 1.2,    // 横書きの行間倍率
        SPACE_HEIGHT_RATIO: 0.3,        // 空白の高さ比率
        PUNCTUATION_OFFSET_X: 0.7,      // 句読点のX方向オフセット比率
        PUNCTUATION_OFFSET_Y: -0.55     // 句読点のY方向オフセット比率
    };

    /** @type {Object} デバイスピクセル比の設定 */
    const DPR = {
        MIN: 2,
        MAX: 3
    };

    // ========================================
    // タイミング・アニメーション
    // ========================================

    /** @type {Object} タイミング定数 (ms) */
    const TIMING = {
        MODAL_FOCUS_DELAY: 50,      // モーダルフォーカス遅延
        WHEEL_EVENT_DEBOUNCE: 100,  // ホイールイベントデバウンス
        NAV_BAR_HIDE_DELAY: 3000    // ページバー非表示遅延
    };

    // ========================================
    // 距離・しきい値
    // ========================================

    /** @type {Object} 距離しきい値 */
    const THRESHOLDS = {
        MIN_SHAPE_SIZE: 5,          // 図形の最小サイズ
        MIN_DRAG_DISTANCE: 5,       // ドラッグ認識の最小距離
        PDF_SIZE_LIMIT: 500 * 1024 * 1024,  // PDF Canvas圧縮しきい値 (500MB)
        PDF_OPTIMIZE_LIMIT: 500 * 1024 * 1024,  // pdf-lib最適化処理の上限 (500MB未満で発動)
        IMAGE_SIZE_LIMIT: 300 * 1024 * 1024,    // 画像圧縮しきい値 (300MB)
        IMAGE_COMPRESS_QUALITY: 0.75            // JPEG圧縮品質 (0.0-1.0)
    };

    // ========================================
    // 入力制限（QA対策）
    // ========================================

    /** @type {Object} PDF制限 */
    const PDF_LIMITS = {
        MAX_PAGES: 500,                         // 最大ページ数
        WARNING_PAGES: 200,                     // 警告を出すページ数
        SINGLE_PAGE_SIZE_LIMIT: 100 * 1024 * 1024  // 単ページ100MB
    };

    /** @type {Object} オブジェクト制限 */
    const OBJECT_LIMITS = {
        MAX_PER_PAGE: 5000,         // 1ページあたりの最大オブジェクト数
        WARNING_PER_PAGE: 3000      // 警告を出すオブジェクト数
    };

    /** @type {Object} ストローク制限 */
    const STROKE_LIMITS = {
        MAX_POINTS: 50000,          // 1ストロークあたりの最大ポイント数
        WARNING_POINTS: 30000       // 警告を出すポイント数
    };

    /** @type {Object} テキスト制限 */
    const TEXT_LIMITS = {
        MAX_LENGTH: 50000,          // 最大文字数
        WARNING_LENGTH: 30000       // 警告を出す文字数
    };

    /** @type {Object} 保存設定 */
    const SAVE = {
        DEBOUNCE_MS: 500,           // 保存デバウンス時間
        LOCK_TIMEOUT_MS: 60000      // ロックタイムアウト
    };

    /** @type {Object} シミュレーター制限 */
    const SIMULATOR_LIMITS = {
        MIN_CALIBRATION_MM: 0.1,    // キャリブレーション最小値
        MAX_CALIBRATION_MM: 10000,  // キャリブレーション最大値
        MIN_PT_STEP: 0.1,           // ptステップ最小値
        MAX_PT_STEP: 10             // ptステップ最大値
    };

    // ========================================
    // 履歴管理
    // ========================================

    /** @type {Object} 履歴設定 */
    const HISTORY = {
        MAX_STACK_SIZE: 50          // 履歴スタックの最大サイズ
    };

    // ========================================
    // ビューポートカリング
    // ========================================

    /** @type {Object} カリング設定 */
    const CULLING = {
        MARGIN: 100,                // ビューポート外のマージン (px)
        ENABLED: true               // デフォルトで有効
    };

    // ========================================
    // 縦書き時に回転が必要な文字
    // ========================================

    /** @type {Array<string>} 回転が必要な文字リスト */
    const VERTICAL_ROTATE_CHARS = [
        'ー', '−', '―', '…',
        '(', ')', '（', '）',
        '[', ']', '「', '」',
        '～', '〜', '＝', '='
    ];

    /** @type {Array<string>} 句読点（右上に移動） */
    const PUNCTUATION_CHARS = ['、', '。', '，', '．', '｡', '､'];

    // ========================================
    // ズーム設定
    // ========================================

    /** @type {Object} ズーム設定 */
    const ZOOM = {
        MIN: 0.25,
        MAX: 4.0,
        STEP: 0.25,
        DEFAULT: 1.0
    };

    /** @type {Object} ビュー回転設定 */
    const VIEW_ROTATION = {
        STEP: 90,                       // 回転ステップ（度）
        OPTIONS: [0, 90, 180, 270]      // 有効な回転値
    };

    // ========================================
    // 描画モード
    // ========================================

    /** @type {Object} 描画モード定義 */
    const MODES = {
        SELECT: 'select',
        HAND: 'hand',
        DRAW: 'draw',
        MARKER: 'marker',
        RECT: 'rect',
        ELLIPSE: 'ellipse',
        SEMICIRCLE: 'semicircle',
        LINE: 'line',
        ARROW: 'arrow',
        DOUBLE_ARROW: 'doubleArrow',
        TEXT: 'text',
        IMAGE: 'image',
        ERASER: 'eraser',
        DONE_STAMP: 'doneStamp',
        KOMOJI_STAMP: 'komojiStamp',
        RUBY_STAMP: 'rubyStamp'
    };

    /** @type {Object} カーソルスタイル */
    const CURSORS = {
        DEFAULT: 'default',
        CROSSHAIR: 'crosshair',
        GRAB: 'grab',
        GRABBING: 'grabbing',
        POINTER: 'pointer'
    };

    // ========================================
    // 公開API
    // ========================================

    return Object.freeze({
        // 描画
        STAMP_SIZES,
        STAMP_PARAMS,
        LINE_WIDTHS,
        SELECTION,
        ROTATION,
        OUTLINE,

        // 色
        COLORS,
        AUTO_COLORS,

        // レイアウト
        LAYOUT,
        DPR,

        // タイミング
        TIMING,

        // しきい値
        THRESHOLDS,

        // 入力制限（QA対策）
        PDF_LIMITS,
        OBJECT_LIMITS,
        STROKE_LIMITS,
        TEXT_LIMITS,
        SAVE,
        SIMULATOR_LIMITS,

        // 履歴
        HISTORY,

        // カリング
        CULLING,

        // 文字
        VERTICAL_ROTATE_CHARS,
        PUNCTUATION_CHARS,

        // ズーム
        ZOOM,

        // ビュー回転
        VIEW_ROTATION,

        // モード
        MODES,
        CURSORS
    });
})();
