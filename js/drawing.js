/**
 * MojiQ Drawing - 描画ロジックモジュール（オブジェクトベース対応版）
 * キャンバスへの描画操作を統括管理
 */
window.MojiQDrawing = (function() {
    'use strict';

    // 定数とユーティリティへの参照
    const Constants = window.MojiQConstants;
    const Utils = window.MojiQUtils;
    const DrawingModes = window.MojiQDrawingModes;

    // DOM要素への参照
    let mojiqCanvas = null;
    let ctx = null;
    let simCtx = null;
    let canvasArea = null;
    let state = null;
    let dpr = 1;

    // 描画関連変数（ローカル座標 - オブジェクト保存用）
    let startPos = { x: 0, y: 0 };
    let currentPos = { x: 0, y: 0 };
    let shapeEndPos = { x: 0, y: 0 };
    let snapshot = null;
    let currentStrokePoints = [];

    // 描画関連変数（キャンバス座標 - プレビュー描画用）
    // 見開きモード時、プレビュー描画はキャンバス座標を使用し、
    // オブジェクト保存時のみローカル座標を使用する
    let startPosCanvas = { x: 0, y: 0 };
    let currentPosCanvas = { x: 0, y: 0 };
    let shapeEndPosCanvas = { x: 0, y: 0 };  // アノテーション用
    let currentStrokePointsCanvas = [];

    // 画面座標（向き判定用 - ページ回転に影響されない）
    let startPosScreen = { x: 0, y: 0 };
    let currentPosScreen = { x: 0, y: 0 };

    // 折れ線ツール用変数
    let polylinePoints = [];          // 確定した頂点（ローカル座標 - 保存用）
    let polylinePointsCanvas = [];    // 確定した頂点（キャンバス座標 - プレビュー用）
    let polylineSnapshot = null;      // 折れ線描画前のスナップショット

    // ラベル付き枠線ツール用変数
    let labeledRectLeaderStart = null;  // 引出線の開始点（ローカル座標）
    let labeledRectLeaderEnd = null;    // 引出線の終端点（ローカル座標）
    let labeledRectLeaderStartCanvas = null;  // 引出線の開始点（キャンバス座標）
    let labeledRectLeaderEndCanvas = null;    // 引出線の終端点（キャンバス座標）
    let labeledRectSnapshot = null;     // 引出線描画後のスナップショット

    // アノテーション用：最後に追加したオブジェクトID
    let lastAddedObjectId = null;

    // コールバック
    let saveHistoryCallback = null;
    let handleInputRequestCallback = null;
    let putFontLabelCallback = null;
    let editTextCallback = null;
    let editAnnotationCallback = null;

    // オブジェクト管理モジュールへの参照
    let DrawingObjects = null;
    let DrawingRenderer = null;
    let DrawingSelect = null;

    // 現在のページ番号取得用コールバック
    let getCurrentPageCallback = null;

    // イベントリスナー参照（cleanup用）
    let boundMouseoutHandler = null;
    let boundDblclickHandler = null;
    let boundKeydownHandler = null;

    /**
     * 初期化
     * @param {object} elements - DOM要素
     * @param {object} appState - アプリケーション状態への参照
     * @param {object} callbacks - コールバック関数群
     */
    function init(elements, appState, callbacks) {
        // DOM Cacheからキャンバス関連要素を取得
        if (window.MojiQDOMCache && MojiQDOMCache.isInitialized()) {
            const cached = MojiQDOMCache.getCanvasElements();
            mojiqCanvas = cached.mojiqCanvas;
            ctx = cached.ctx;
            simCtx = cached.simCtx;
            canvasArea = cached.canvasArea;
            dpr = cached.dpr;
        } else {
            // フォールバック：従来の方式
            mojiqCanvas = elements.mojiqCanvas;
            ctx = elements.ctx;
            simCtx = elements.simCtx;
            canvasArea = elements.canvasArea;
            // DPRを計算（定数を使用）
            const dprConfig = Constants ? Constants.DPR : { MIN: 2, MAX: 3 };
            dpr = Math.min(dprConfig.MAX, Math.max(dprConfig.MIN, window.devicePixelRatio || 1));
        }
        state = appState;

        saveHistoryCallback = callbacks.saveHistory;
        handleInputRequestCallback = callbacks.handleInputRequest;
        putFontLabelCallback = callbacks.putFontLabel;
        getCurrentPageCallback = callbacks.getCurrentPage;
        editTextCallback = callbacks.editText;  // テキスト編集コールバック
        editAnnotationCallback = callbacks.editAnnotation;  // アノテーション編集コールバック

        // オブジェクト管理モジュールを取得
        DrawingObjects = window.MojiQDrawingObjects;
        DrawingRenderer = window.MojiQDrawingRenderer;
        DrawingSelect = window.MojiQDrawingSelect;

        // 選択ツールを初期化
        if (DrawingSelect) {
            DrawingSelect.init(ctx, mojiqCanvas, getCurrentPage(), {
                redraw: redrawCanvas,
                editText: (textObj, index, pageNum) => {
                    // テキスト編集コールバックを呼び出し
                    if (editTextCallback) {
                        editTextCallback(textObj, index, pageNum);
                    }
                },
                editAnnotation: (obj, index, pageNum) => {
                    // アノテーション編集コールバックを呼び出し
                    if (editAnnotationCallback) {
                        editAnnotationCallback(obj, index, pageNum);
                    }
                }
            });
        }

        setupEventListeners();

        // イベントバスリスナーを登録（Phase 7: イベントシステム強化）
        setupEventBusListeners();
    }

    /**
     * イベントバスリスナーを設定
     */
    function setupEventBusListeners() {
        if (!window.MojiQEvents) return;

        // 再描画リクエストイベント
        window.MojiQEvents.on('mojiq:request-redraw', (data) => {
            const saveHistory = data && data.saveHistory !== undefined ? data.saveHistory : true;
            redrawCanvas(saveHistory);
        });

        // 履歴保存リクエストイベント
        window.MojiQEvents.on('mojiq:save-history', () => {
            if (saveHistoryCallback) {
                saveHistoryCallback();
            }
        });

        // キャンバスクリアリクエストイベント
        window.MojiQEvents.on('mojiq:clear-canvas', () => {
            clearCanvas();
        });

        // 選択解除リクエストイベント
        window.MojiQEvents.on('mojiq:deselect', () => {
            if (DrawingObjects) {
                const pageNum = getCurrentPage();
                DrawingObjects.deselectObject(pageNum);
                redrawCanvas(false);
            }
        });
    }

    /**
     * 現在のページ番号を取得
     */
    function getCurrentPage() {
        if (getCurrentPageCallback) {
            return getCurrentPageCallback();
        }
        return 1;
    }

    // 見開きモード時の描画対象ページ（左ページか右ページか）
    let spreadDrawingPageNum = null;

    /**
     * 見開きモード時に描画対象のページを取得
     * 見開きモードでは見開き全体を1ページとして扱う
     * @param {number} x - キャンバス上のX座標
     * @returns {number|string} - ページ番号（見開きモードではspread_Nキー）
     */
    function getSpreadDrawingPage(x) {
        // 見開きモードでは見開き全体を1ページとして扱う
        return getCurrentPage();
    }

    /**
     * 見開きモード時の座標をページローカル座標に変換
     * 見開きモードでは見開き全体を1ページとして扱うため、座標変換は不要
     * @param {{x: number, y: number}} pos - キャンバス座標
     * @returns {{x: number, y: number, pageNum: number|string}} - 座標とページ番号
     */
    function convertSpreadPos(pos) {
        // 見開きモードでは座標変換なし（見開き全体を1ページとして扱う）
        return { x: pos.x, y: pos.y, pageNum: getCurrentPage() };
    }

    /**
     * 座標取得 (MojiQキャンバス基準)
     * @param {MouseEvent|TouchEvent} e - イベントオブジェクト
     * @returns {{x: number, y: number}} キャンバス座標
     */
    function getPos(e) {
        // ユーティリティを使用（利用可能な場合）
        if (Utils && Utils.getCanvasCoordinates) {
            return Utils.getCanvasCoordinates(e, mojiqCanvas, dpr);
        }

        // フォールバック
        // タッチイベントの安全なアクセス（changedTouchesが空の場合に対応）
        let clientX, clientY;
        if (e.clientX !== undefined) {
            clientX = e.clientX;
            clientY = e.clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            // フォールバック：座標が取得できない場合は0を返す
            return { x: 0, y: 0 };
        }

        const canvasWrapper = mojiqCanvas.parentElement;

        // キャンバスの論理サイズ（dpr適用前）
        const canvasWidth = mojiqCanvas.width / dpr;
        const canvasHeight = mojiqCanvas.height / dpr;

        if (!canvasWrapper) {
            // フォールバック
            const rect = mojiqCanvas.getBoundingClientRect();
            const scaleX = mojiqCanvas.width / rect.width;
            const scaleY = mojiqCanvas.height / rect.height;
            return {
                x: (clientX - rect.left) * scaleX / dpr,
                y: (clientY - rect.top) * scaleY / dpr
            };
        }

        // CSS変換を取得
        const style = window.getComputedStyle(canvasWrapper);
        const transform = style.transform;

        if (transform === 'none' || transform === '') {
            // 変換なし: 通常の計算
            const rect = mojiqCanvas.getBoundingClientRect();
            const scaleX = mojiqCanvas.width / rect.width;
            const scaleY = mojiqCanvas.height / rect.height;
            return {
                x: (clientX - rect.left) * scaleX / dpr,
                y: (clientY - rect.top) * scaleY / dpr
            };
        }

        // DOMMatrixで逆変換を計算
        const matrix = new DOMMatrix(transform);
        const inverseMatrix = matrix.inverse();

        // canvasWrapperの変換前のサイズ
        const cssWidth = canvasWrapper.offsetWidth;
        const cssHeight = canvasWrapper.offsetHeight;

        // 変換後のバウンディングボックスの中心
        const rect = canvasWrapper.getBoundingClientRect();
        const rectCenterX = rect.left + rect.width / 2;
        const rectCenterY = rect.top + rect.height / 2;

        // クリック位置を中心からの相対座標に変換
        const relPoint = new DOMPoint(clientX - rectCenterX, clientY - rectCenterY);

        // 逆変換を適用
        const unrotatedPoint = relPoint.matrixTransform(inverseMatrix);

        // 中心からの相対座標をキャンバス座標に変換
        const scaleX = canvasWidth / cssWidth;
        const scaleY = canvasHeight / cssHeight;

        return {
            x: unrotatedPoint.x * scaleX + canvasWidth / 2,
            y: unrotatedPoint.y * scaleY + canvasHeight / 2
        };
    }

    /**
     * 見開きモード時の座標取得
     * 見開きモードでは見開き全体を1ページとして扱うため、座標変換は不要
     * @param {MouseEvent|TouchEvent} e - イベントオブジェクト
     * @returns {{x: number, y: number}} キャンバス座標
     */
    function getPosForSpread(e) {
        // 見開きモードでも座標変換なし（見開き全体を1ページとして扱う）
        return getPos(e);
    }

    /**
     * 消しゴムストロークのバウンディングボックスを計算
     */
    function getEraserBounds(eraserStroke) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const padding = (eraserStroke.lineWidth || 10) / 2;

        eraserStroke.points.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });

        return {
            x: minX - padding,
            y: minY - padding,
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2
        };
    }

    /**
     * 2つのバウンディングボックスが交差するかどうか
     * @param {{x: number, y: number, width: number, height: number}} a - 矩形A
     * @param {{x: number, y: number, width: number, height: number}} b - 矩形B
     * @returns {boolean} 交差しているか
     */
    function boundsIntersect(a, b) {
        // ユーティリティを使用（利用可能な場合）
        if (Utils && Utils.boundsIntersect) {
            return Utils.boundsIntersect(a, b);
        }

        // フォールバック
        return !(a.x + a.width < b.x ||
                 b.x + b.width < a.x ||
                 a.y + a.height < b.y ||
                 b.y + b.height < a.y);
    }

    /**
     * モード名を正規化（Annotated版を基本モードにマッピング）
     * rectAnnotated -> rect, ellipseAnnotated -> ellipse, lineAnnotated -> line
     */
    function normalizeMode(mode) {
        if (mode === 'rectAnnotated') return 'rect';
        if (mode === 'ellipseAnnotated') return 'ellipse';
        if (mode === 'lineAnnotated') return 'line';
        if (mode === 'arrow' || mode === 'doubleArrow' || mode === 'doubleArrowAnnotated') return 'line';
        return mode;
    }

    /**
     * 引出線の開始位置を取得
     */
    function getLeaderStartPos(targetPos) {
        const normalizedMode = normalizeMode(state.currentMode);
        if (normalizedMode === 'rect' || (normalizedMode === 'text' && state.activeStampText === null && !state.selectedFontInfo) || normalizedMode === 'image') {
            if (normalizedMode === 'text') return shapeEndPos;
            const minX = Math.min(startPos.x, shapeEndPos.x);
            const maxX = Math.max(startPos.x, shapeEndPos.x);
            const minY = Math.min(startPos.y, shapeEndPos.y);
            const maxY = Math.max(startPos.y, shapeEndPos.y);
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            const candidates = [
                { x: centerX, y: minY }, { x: centerX, y: maxY },
                { x: minX, y: centerY }, { x: maxX, y: centerY }
            ];
            let nearest = candidates[0];
            let minDist = Infinity;
            candidates.forEach(p => {
                const dist = Math.sqrt(Math.pow(targetPos.x - p.x, 2) + Math.pow(targetPos.y - p.y, 2));
                if (dist < minDist) { minDist = dist; nearest = p; }
            });
            return nearest;
        } else if (normalizedMode === 'line') {
            return { x: (startPos.x + shapeEndPos.x) / 2, y: (startPos.y + shapeEndPos.y) / 2 };
        } else if (normalizedMode === 'ellipse') {
            const w = Math.abs(shapeEndPos.x - startPos.x);
            const h = Math.abs(shapeEndPos.y - startPos.y);
            const cx = startPos.x + (shapeEndPos.x - startPos.x) / 2;
            const cy = startPos.y + (shapeEndPos.y - startPos.y) / 2;
            const rx = w / 2;
            const ry = h / 2;
            const dx = targetPos.x - cx;
            const dy = targetPos.y - cy;
            const angle = Math.atan2(dy, dx);
            return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
        } else {
            return shapeEndPos;
        }
    }

    /**
     * 引出線の開始位置を計算（キャンバス座標版 - プレビュー描画用）
     * @param {{x: number, y: number}} targetPos - 現在のマウス位置（キャンバス座標）
     * @returns {{x: number, y: number}} - 引出線の開始位置（キャンバス座標）
     */
    function getLeaderStartPosCanvas(targetPos) {
        // アノテーションモードでは描画完了時にshapeEndPosCanvasが設定される
        const startCanvas = startPosCanvas;
        const endCanvas = shapeEndPosCanvas.x !== 0 || shapeEndPosCanvas.y !== 0 ? shapeEndPosCanvas : currentPosCanvas;
        const normalizedMode = normalizeMode(state.currentMode);

        if (normalizedMode === 'rect' || (normalizedMode === 'text' && state.activeStampText === null && !state.selectedFontInfo) || normalizedMode === 'image') {
            if (normalizedMode === 'text') return endCanvas;
            const minX = Math.min(startCanvas.x, endCanvas.x);
            const maxX = Math.max(startCanvas.x, endCanvas.x);
            const minY = Math.min(startCanvas.y, endCanvas.y);
            const maxY = Math.max(startCanvas.y, endCanvas.y);
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            const candidates = [
                { x: centerX, y: minY }, { x: centerX, y: maxY },
                { x: minX, y: centerY }, { x: maxX, y: centerY }
            ];
            let nearest = candidates[0];
            let minDist = Infinity;
            candidates.forEach(p => {
                const dist = Math.sqrt(Math.pow(targetPos.x - p.x, 2) + Math.pow(targetPos.y - p.y, 2));
                if (dist < minDist) { minDist = dist; nearest = p; }
            });
            return nearest;
        } else if (normalizedMode === 'line') {
            return { x: (startCanvas.x + endCanvas.x) / 2, y: (startCanvas.y + endCanvas.y) / 2 };
        } else if (normalizedMode === 'ellipse') {
            const w = Math.abs(endCanvas.x - startCanvas.x);
            const h = Math.abs(endCanvas.y - startCanvas.y);
            const cx = startCanvas.x + (endCanvas.x - startCanvas.x) / 2;
            const cy = startCanvas.y + (endCanvas.y - startCanvas.y) / 2;
            const rx = w / 2;
            const ry = h / 2;
            const dx = targetPos.x - cx;
            const dy = targetPos.y - cy;
            const angle = Math.atan2(dy, dx);
            return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
        } else {
            return endCanvas;
        }
    }

    /**
     * 現在の描画コンテキストから色と線幅を取得
     */
    function getCurrentDrawingStyle() {
        // colorPickerから色を取得（ctx.strokeStyleはページ切り替え時にリセットされるため使用しない）
        const color = window.MojiQCanvasContext ? MojiQCanvasContext.getColor() : (ctx.strokeStyle || '#000000');
        return {
            color: color,
            lineWidth: ctx.lineWidth || 2
        };
    }

    /**
     * 現在のPDFページ回転角度を取得（ラジアン）
     * @returns {number} 回転角度（ラジアン）、回転なしの場合は0
     */
    function getCurrentPageRotation() {
        const PdfManager = window.MojiQPdfManager;
        if (PdfManager && PdfManager.getPageRotation) {
            const degrees = PdfManager.getPageRotation();
            // 度数をラジアンに変換（テキスト等をページコンテンツに合わせる）
            return -degrees * Math.PI / 180;
        }
        return 0;
    }

    /**
     * プレビュー描画時にページ回転を適用する
     * @param {CanvasRenderingContext2D} context - 描画コンテキスト
     * @param {number} centerX - 回転中心X
     * @param {number} centerY - 回転中心Y
     * @param {function} drawFunc - 描画関数
     */
    function drawWithPageRotation(context, centerX, centerY, drawFunc) {
        const rotation = getCurrentPageRotation();
        context.save();
        if (rotation !== 0) {
            context.translate(centerX, centerY);
            context.rotate(rotation);
            context.translate(-centerX, -centerY);
        }
        drawFunc();
        context.restore();
    }

    /**
     * オブジェクトを保存（描画完了時に呼び出し）
     * @param {object} objData - オブジェクトデータ
     * @param {number|null} targetPageNum - 保存先ページ番号（見開きモード用、省略時は現在のページ）
     */
    function saveObjectToPage(objData, targetPageNum = null) {
        if (!DrawingObjects) return null;

        // 見開きモード時は指定されたページ、または描画中のページを使用
        let pageNum;
        if (targetPageNum !== null) {
            pageNum = targetPageNum;
        } else if (spreadDrawingPageNum !== null) {
            pageNum = spreadDrawingPageNum;
        } else {
            pageNum = getCurrentPage();
        }

        // ページ番号が無効な場合は保存しない（安全策）
        if (pageNum === null || pageNum === undefined) {
            return null;
        }

        // 画像以外のオブジェクトはPDFページの回転角度に応じて回転
        // 初回起動時（0度）を基準として、回転ボタンで回転させた角度分だけ描画を回転
        if (objData.type !== 'image') {
            const pageRotation = getCurrentPageRotation();
            if (pageRotation !== 0) {
                objData.rotation = pageRotation;
            }
        }

        const objectId = DrawingObjects.addObject(pageNum, objData);
        lastAddedObjectId = objectId;
        return objectId;
    }

    /**
     * 最後に追加したオブジェクトIDを取得
     */
    function getLastAddedObjectId() {
        return lastAddedObjectId;
    }

    /**
     * 最後に追加したオブジェクトにアノテーションを追加
     */
    function addAnnotationToLastObject(annotationData) {
        if (!DrawingObjects || !lastAddedObjectId) return false;

        // 見開きモードでは見開き全体を1ページとして扱う
        const pageNum = getCurrentPage();
        return DrawingObjects.updateObjectById(pageNum, lastAddedObjectId, annotationData);
    }

    // レンダリング要求フラグ（バッチ処理用）
    let pendingRender = false;
    let pendingSaveHistory = false;

    /**
     * キャンバスを再描画（内部実装）
     */
    function doRedrawCanvas() {
        if (!ctx || !mojiqCanvas) return;

        const PdfManager = window.MojiQPdfManager;

        // 見開きモードの場合の早期チェック
        if (PdfManager && PdfManager.isSpreadViewMode()) {
            // 見開きレンダリング中、または表示処理中の場合のみスキップ
            // （displaySpreadFromCacheが描画を担当する）
            // メタデータがない場合でも、オブジェクトのクリアと再描画は必要
            if (PdfManager.isSpreadRenderingNow() ||
                PdfManager.isSpreadDisplaying()) {
                pendingRender = false;
                return;
            }
        }

        // 変換行列をリセットしてからキャンバスをクリア
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, mojiqCanvas.width, mojiqCanvas.height);

        // コンテキスト状態をリセット（マーカー描画後のアンドゥ時に透明度が残る問題を修正）
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';

        // オブジェクトを再描画
        if (DrawingRenderer) {
            // 変換行列をリセットしてdprスケールを適用
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);

            // 見開きモードでも単ページモードでも同じ処理
            // （見開きは1ページとして扱う - spread_Nキーを使用）
            const pageNum = getCurrentPage();
            DrawingRenderer.renderAll(ctx, pageNum);

            // マーキー選択の矩形を描画
            if (DrawingSelect && DrawingSelect.isMarqueeSelecting()) {
                const marqueeRect = DrawingSelect.getMarqueeRect();
                if (marqueeRect) {
                    DrawingRenderer.renderMarqueeRect(ctx, marqueeRect);
                }
            }
        }

        // 履歴も更新（選択操作中は保存しない）
        if (pendingSaveHistory && saveHistoryCallback) saveHistoryCallback();

        // ボタン状態を更新（クリアボタンのdisabled状態など）
        if (window.MojiQPageManager) {
            MojiQPageManager.updatePageControls();
        }

        // フラグをリセット
        pendingRender = false;
        pendingSaveHistory = false;
    }

    /**
     * キャンバスを再描画（バッチ処理対応）
     * @param {boolean} saveHistory - 履歴を保存するかどうか（デフォルト: true）
     */
    function redrawCanvas(saveHistory = true) {
        if (!ctx || !mojiqCanvas) return;

        // 履歴保存フラグを更新（一度でもtrueが指定されたら保存）
        if (saveHistory) pendingSaveHistory = true;

        // RenderManagerが利用可能な場合はバッチ処理
        if (window.MojiQRenderManager) {
            // 常にrequestRenderを呼び出す（RenderManagerが重複を除去する）
            // pendingRenderフラグは最初のリクエスト追跡用に維持
            if (!pendingRender) {
                pendingRender = true;
            }
            MojiQRenderManager.requestRender(doRedrawCanvas);
        } else {
            // フォールバック：即座に描画
            pendingSaveHistory = saveHistory;
            doRedrawCanvas();
        }
    }

    /**
     * 描画開始
     */
    function startDrawing(e) {
        if (e.type === 'touchstart') e.preventDefault();

        // ビューワーモード中は描画をスキップ
        if (window.MojiQViewerMode && MojiQViewerMode.isActive()) {
            return;
        }

        // Simulatorのキャリブレーション/グリッドモード時はMojiQDrawingの処理をスキップ
        if (window.SimulatorState) {
            const simMode = window.SimulatorState.get('currentMode');
            if (simMode === 'calibration' || simMode === 'grid') {
                return;
            }
        }

        if (state.isPanning) return;

        // ナビゲーションバーを隠す
        if (window.MojiQNavigation) {
            window.MojiQNavigation.hideNavBar();
        }

        // タッチイベントの安全なアクセス
        let clientX, clientY;
        if (e.clientX !== undefined) {
            clientX = e.clientX;
            clientY = e.clientY;
        } else if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            return; // 座標が取得できない場合は処理を中断
        }

        const isLeftClick = (e.button === 0 || e.type === 'touchstart');
        const isMiddleClick = (e.button === 1);
        const isRightClick = (e.button === 2);

        const isHandModeDrag = (state.currentMode === 'hand' && isLeftClick);
        const isSpaceLeftDrag = (state.isSpacePressed && isLeftClick);
        // 選択モードではShift+クリックは複数選択用なのでパン操作にしない
        // ペン・マーカー・直線モードではShift+クリックはスナップ描画用なのでパン操作にしない
        const shiftSnapModes = ['select', 'draw', 'marker', 'line', 'lineAnnotated', 'rect', 'rectAnnotated', 'ellipse', 'ellipseAnnotated'];
        const isShiftLeftDrag = (state.isShiftPressed && isLeftClick && !shiftSnapModes.includes(state.currentMode));
        const isCtrlRightDrag = ((e.ctrlKey || e.metaKey) && isRightClick);

        if (isHandModeDrag || isSpaceLeftDrag || isShiftLeftDrag || isMiddleClick || isCtrlRightDrag) {
            e.preventDefault();
            e.stopPropagation();
            state.isPanning = true;
            state.panStart = { x: clientX, y: clientY };
            state.scrollStart = { left: canvasArea.scrollLeft, top: canvasArea.scrollTop };
            mojiqCanvas.classList.add('cursor-grabbing');
            return;
        }

        if (isRightClick) return;

        // キャンバス座標を取得（プレビュー描画用）
        const canvasPos = getPos(e);

        // 見開きモードでは見開き全体を1ページとして扱うため、spreadDrawingPageNumは使用しない
        const PdfManager = window.MojiQPdfManager;
        spreadDrawingPageNum = null;

        // ページローカル座標に変換（オブジェクト保存用）
        // 見開きモード時は右ページのオフセットを引く
        const localPos = getPosForSpread(e);

        // 後方互換性のため pos = localPos（オブジェクト保存用座標）
        const pos = localPos;

        // スポイトモードの処理（クリックで色を取得）
        if (state.currentMode === 'eyedropper') {
            if (window.MojiQCanvasContext) {
                // キャンバスを同期的に再描画して最新の状態にする
                doRedrawCanvas();
                const color = MojiQCanvasContext.pickColorFromCanvas(canvasPos.x, canvasPos.y);
                if (color) {
                    MojiQCanvasContext.applyEyedropperColor(color);
                }
            }
            return;
        }

        // 選択モードの処理
        if (state.currentMode === 'select') {
            if (DrawingSelect) {
                // 見開きモードでも単ページモードでも同じ処理
                // （見開きは1ページとして扱うため、座標変換は不要）
                const selectPageNum = getCurrentPage();
                DrawingSelect.setCurrentPage(selectPageNum);
                // Shift+クリックで複数選択
                DrawingSelect.startSelect(pos, e.shiftKey, canvasPos);
            }
            return;
        }

        // 済スタンプモードの処理（クリックで即座にスタンプを配置）
        if (state.currentMode === 'doneStamp') {
            const style = getCurrentDrawingStyle();
            const stampSize = Constants ? Constants.STAMP_SIZES.DONE : 28;
            saveObjectToPage({
                type: 'doneStamp',
                startPos: { x: pos.x, y: pos.y },
                color: style.color,
                size: stampSize
            });
            if (saveHistoryCallback) saveHistoryCallback();
            redrawCanvas(false);
            return;
        }

        // 小文字スタンプモードの処理（クリックで即座にスタンプを配置）
        if (state.currentMode === 'komojiStamp') {
            const style = getCurrentDrawingStyle();
            const stampSize = Constants ? Constants.STAMP_SIZES.KOMOJI : 28;
            saveObjectToPage({
                type: 'komojiStamp',
                startPos: { x: pos.x, y: pos.y },
                color: style.color,
                size: stampSize
            });
            if (saveHistoryCallback) saveHistoryCallback();
            redrawCanvas(false);
            return;
        }

        // ルビスタンプモードの処理（クリックで即座にスタンプを配置）
        if (state.currentMode === 'rubyStamp') {
            const style = getCurrentDrawingStyle();
            const stampSize = Constants ? Constants.STAMP_SIZES.RUBY : 14;
            saveObjectToPage({
                type: 'rubyStamp',
                startPos: { x: pos.x, y: pos.y },
                color: style.color,
                size: stampSize
            });
            if (saveHistoryCallback) saveHistoryCallback();
            redrawCanvas(false);
            return;
        }

        // 指示スタンプモードの処理（ドラッグで指示線を描画可能）
        const instructionStampModes = [
            'toruStamp', 'torutsumeStamp', 'torumamaStamp',
            'zenkakuakiStamp', 'nibunakiStamp', 'shibunakiStamp', 'kaigyouStamp'
        ];
        if (instructionStampModes.includes(state.currentMode)) {
            // 描画コンテキストを確実に初期化（色が黒になる不具合を防ぐ）
            if (window.MojiQCanvasContext) {
                MojiQCanvasContext.initContext();
            }
            state.interactionState = 1;
            startPos = pos;           // ローカル座標（保存用）
            currentPos = pos;
            startPosCanvas = canvasPos;  // キャンバス座標（プレビュー用）
            currentPosCanvas = canvasPos;
            snapshot = ctx.getImageData(0, 0, mojiqCanvas.width, mojiqCanvas.height);
            return;
        }

        // ラベル付き枠線モードの処理（引出線→枠線をシームレスに）
        if (state.currentMode === 'labeledRect') {
            // 描画コンテキストを確実に初期化（色が黒になる不具合を防ぐ）
            if (window.MojiQCanvasContext) {
                MojiQCanvasContext.initContext();
            }
            // 引出線描画フェーズを開始
            state.interactionState = 1;
            startPos = pos;           // ローカル座標（保存用）
            currentPos = pos;
            startPosCanvas = canvasPos;  // キャンバス座標（プレビュー用）
            currentPosCanvas = canvasPos;
            labeledRectLeaderStart = { x: pos.x, y: pos.y };  // ローカル座標（保存用）
            labeledRectLeaderStartCanvas = { x: canvasPos.x, y: canvasPos.y };  // キャンバス座標（プレビュー用）
            snapshot = ctx.getImageData(0, 0, mojiqCanvas.width, mojiqCanvas.height);
            return;
        }

        // 折れ線モードの処理（クリックで頂点を追加、ダブルクリックで確定）
        if (state.currentMode === 'polyline') {
            // 折れ線描画中かどうかチェック
            if (polylinePoints.length === 0) {
                // 最初のクリック：開始点を設定
                polylinePoints = [{ x: pos.x, y: pos.y }];  // ローカル座標（保存用）
                polylinePointsCanvas = [{ x: canvasPos.x, y: canvasPos.y }];  // キャンバス座標（プレビュー用）
                polylineSnapshot = ctx.getImageData(0, 0, mojiqCanvas.width, mojiqCanvas.height);
                state.interactionState = 3;  // 折れ線描画中を示す状態
            } else {
                // 2回目以降のクリック：クリック位置をそのまま頂点として追加
                polylinePoints.push({ x: pos.x, y: pos.y });
                polylinePointsCanvas.push({ x: canvasPos.x, y: canvasPos.y });
            }
            return;
        }

        if (state.interactionState === 2) {
            finalizeAnnotation(pos, canvasPos);
            return;
        }

        state.interactionState = 1;
        startPos = pos;           // ローカル座標（保存用）
        currentPos = pos;
        startPosCanvas = canvasPos;  // キャンバス座標（プレビュー用）
        currentPosCanvas = canvasPos;
        // 画面座標を記録（向き判定用 - ページ回転に影響されない）
        startPosScreen = { x: clientX, y: clientY };
        currentPosScreen = { x: clientX, y: clientY };
        snapshot = ctx.getImageData(0, 0, mojiqCanvas.width, mojiqCanvas.height);

        // 描画コンテキストを確実に初期化（色が黒になる不具合を防ぐ）
        if (window.MojiQCanvasContext) {
            MojiQCanvasContext.initContext();
        }

        if (state.currentMode === 'marker') {
            currentStrokePoints = [{ x: pos.x, y: pos.y }];  // ローカル座標（保存用）
            currentStrokePointsCanvas = [{ x: canvasPos.x, y: canvasPos.y }];  // キャンバス座標（プレビュー用）
            ctx.beginPath();
        } else if (state.currentMode === 'draw') {
            currentStrokePoints = [{ x: pos.x, y: pos.y }];  // ローカル座標（保存用）
            currentStrokePointsCanvas = [{ x: canvasPos.x, y: canvasPos.y }];  // キャンバス座標（プレビュー用）
            ctx.beginPath();
            ctx.moveTo(canvasPos.x, canvasPos.y);  // プレビューはキャンバス座標
        } else if (state.currentMode === 'eraser') {
            currentStrokePoints = [{ x: pos.x, y: pos.y }];  // ローカル座標（保存用）
            currentStrokePointsCanvas = [{ x: canvasPos.x, y: canvasPos.y }];  // キャンバス座標（プレビュー用）
            ctx.beginPath();
            ctx.moveTo(canvasPos.x, canvasPos.y);  // プレビューはキャンバス座標

            // 消しゴムの場合、Simulatorキャンバスも同時に消去開始
            if (simCtx) {
                simCtx.globalAlpha = 1.0;
                simCtx.globalCompositeOperation = 'destination-out';
                simCtx.lineWidth = state.eraserSize;
                simCtx.lineCap = 'round';
                simCtx.lineJoin = 'round';
                simCtx.beginPath();
                simCtx.moveTo(canvasPos.x, canvasPos.y);  // プレビューはキャンバス座標
            }
        }
    }

    /**
     * 描画中
     */
    function draw(e) {
        if (e.type === 'touchmove') e.preventDefault();

        // Simulatorのキャリブレーション/グリッドモード時はMojiQDrawingの処理をスキップ
        if (window.SimulatorState) {
            const simMode = window.SimulatorState.get('currentMode');
            if (simMode === 'calibration' || simMode === 'grid') {
                return;
            }
        }

        if (state.isPanning) {
            e.preventDefault();
            e.stopPropagation();

            // タッチイベントの安全なアクセス
            let clientX, clientY;
            if (e.clientX !== undefined) {
                clientX = e.clientX;
                clientY = e.clientY;
            } else if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                return; // 座標が取得できない場合は処理を中断
            }

            const dx = clientX - state.panStart.x;
            const dy = clientY - state.panStart.y;

            canvasArea.scrollLeft = state.scrollStart.left - dx;
            canvasArea.scrollTop = state.scrollStart.top - dy;
            return;
        }

        // キャンバス座標を取得（プレビュー描画用）
        const canvasPos = getPos(e);
        // ページローカル座標に変換（オブジェクト保存用）
        const localPos = getPosForSpread(e);
        const pos = localPos;  // 後方互換性
        currentPos = pos;
        currentPosCanvas = canvasPos;
        // 画面座標を更新（向き判定用）
        if (e.clientX !== undefined) {
            currentPosScreen = { x: e.clientX, y: e.clientY };
        } else if (e.touches && e.touches.length > 0) {
            currentPosScreen = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }

        // 選択モードの処理
        if (state.currentMode === 'select') {
            if (DrawingSelect) {
                // 見開きモードで移動中の場合はキャンバス座標を使用
                // （ページを跨いでも座標系が一貫するように）
                const PdfManager = window.MojiQPdfManager;
                if (PdfManager && PdfManager.isSpreadViewMode() && DrawingSelect.isOperating()) {
                    DrawingSelect.moveSelect(canvasPos);
                } else {
                    DrawingSelect.moveSelect(pos);
                }
            }
            return;
        }

        if (state.interactionState === 2) {
            ctx.putImageData(snapshot, 0, 0);
            const leaderStart = getLeaderStartPos(pos);
            // プレビュー描画はキャンバス座標を使用
            const leaderStartCanvas = getLeaderStartPosCanvas(canvasPos);
            ctx.beginPath();
            ctx.moveTo(leaderStartCanvas.x, leaderStartCanvas.y);
            ctx.lineTo(canvasPos.x, canvasPos.y);
            ctx.stroke();
            return;
        }

        // 折れ線モードのプレビュー描画
        if (state.interactionState === 3 && state.currentMode === 'polyline' && polylinePointsCanvas.length > 0) {
            ctx.putImageData(polylineSnapshot, 0, 0);

            // 確定済みの折れ線を描画（キャンバス座標を使用）
            ctx.beginPath();
            ctx.moveTo(polylinePointsCanvas[0].x, polylinePointsCanvas[0].y);
            for (let i = 1; i < polylinePointsCanvas.length; i++) {
                ctx.lineTo(polylinePointsCanvas[i].x, polylinePointsCanvas[i].y);
            }
            ctx.stroke();

            // 現在のマウス位置までのプレビュー線を描画
            const lastPoint = polylinePointsCanvas[polylinePointsCanvas.length - 1];
            ctx.beginPath();
            ctx.moveTo(lastPoint.x, lastPoint.y);
            ctx.lineTo(canvasPos.x, canvasPos.y);
            ctx.stroke();

            return;
        }

        // ラベル付き枠線モード：引出線フェーズ（interactionState === 1）
        if (state.interactionState === 1 && state.currentMode === 'labeledRect') {
            currentPos = pos;  // currentPosを更新（ローカル座標）
            currentPosCanvas = canvasPos;  // キャンバス座標
            ctx.putImageData(snapshot, 0, 0);

            // キャンバス座標で距離を計算（プレビュー用）
            const dist = Math.sqrt(Math.pow(canvasPos.x - startPosCanvas.x, 2) + Math.pow(canvasPos.y - startPosCanvas.y, 2));

            // 引出線が十分な長さになったら、枠線描画フェーズに自動移行
            const leaderLength = 30;  // 引出線の長さ
            if (dist >= leaderLength) {
                // 引出線の終端を計算（固定長）- キャンバス座標
                const dx = canvasPos.x - startPosCanvas.x;
                const dy = canvasPos.y - startPosCanvas.y;
                const leaderEndXCanvas = startPosCanvas.x + (dx / dist) * leaderLength;
                const leaderEndYCanvas = startPosCanvas.y + (dy / dist) * leaderLength;

                // ローカル座標版も計算（保存用）
                const dxLocal = pos.x - labeledRectLeaderStart.x;
                const dyLocal = pos.y - labeledRectLeaderStart.y;
                const distLocal = Math.sqrt(dxLocal * dxLocal + dyLocal * dyLocal);
                const leaderEndX = labeledRectLeaderStart.x + (dxLocal / distLocal) * leaderLength;
                const leaderEndY = labeledRectLeaderStart.y + (dyLocal / distLocal) * leaderLength;
                labeledRectLeaderEnd = { x: leaderEndX, y: leaderEndY };

                // 引出線を確定描画（キャンバス座標でプレビュー）
                ctx.beginPath();
                ctx.moveTo(startPosCanvas.x, startPosCanvas.y);
                ctx.lineTo(leaderEndXCanvas, leaderEndYCanvas);
                ctx.stroke();
                // 先端に●を描画
                const dotRadius = Math.max(ctx.lineWidth, 2);
                ctx.beginPath();
                ctx.arc(startPosCanvas.x, startPosCanvas.y, dotRadius, 0, 2 * Math.PI);
                ctx.fillStyle = ctx.strokeStyle;
                ctx.fill();

                // 枠線の開始点を設定（引出線終端から少し離す）
                const offsetDistance = 5;
                // ローカル座標
                const rectStartX = leaderEndX + (dxLocal / distLocal) * offsetDistance;
                const rectStartY = leaderEndY + (dyLocal / distLocal) * offsetDistance;
                // キャンバス座標
                const rectStartXCanvas = leaderEndXCanvas + (dx / dist) * offsetDistance;
                const rectStartYCanvas = leaderEndYCanvas + (dy / dist) * offsetDistance;

                // スナップショットを保存して枠線描画フェーズへ移行
                labeledRectSnapshot = ctx.getImageData(0, 0, mojiqCanvas.width, mojiqCanvas.height);
                startPos = { x: rectStartX, y: rectStartY };  // ローカル座標（保存用）
                startPosCanvas = { x: rectStartXCanvas, y: rectStartYCanvas };  // キャンバス座標（プレビュー用）
                state.interactionState = 5;  // 枠線描画中
                mojiqCanvas.style.cursor = 'crosshair';

                // 枠線のプレビューも描画（キャンバス座標）
                ctx.beginPath();
                const minX = Math.min(startPosCanvas.x, canvasPos.x);
                const minY = Math.min(startPosCanvas.y, canvasPos.y);
                const w = Math.abs(canvasPos.x - startPosCanvas.x);
                const h = Math.abs(canvasPos.y - startPosCanvas.y);
                const size = Math.min(w, h);
                if (size > 0) {
                    ctx.rect(minX, minY, size, size);
                    ctx.stroke();
                }
            } else if (dist >= 10) {
                // 引出線のプレビューを描画（先端に●）- キャンバス座標
                ctx.beginPath();
                ctx.moveTo(startPosCanvas.x, startPosCanvas.y);
                ctx.lineTo(canvasPos.x, canvasPos.y);
                ctx.stroke();
                // 先端に●を描画
                const dotRadius = Math.max(ctx.lineWidth, 2);
                ctx.beginPath();
                ctx.arc(startPosCanvas.x, startPosCanvas.y, dotRadius, 0, 2 * Math.PI);
                ctx.fillStyle = ctx.strokeStyle;
                ctx.fill();
            }
            return;
        }

        // ラベル付き枠線モード：枠線描画中（interactionState === 5）
        if (state.interactionState === 5 && state.currentMode === 'labeledRect') {
            currentPos = pos;  // currentPosを更新（ローカル座標）
            currentPosCanvas = canvasPos;  // キャンバス座標
            ctx.putImageData(labeledRectSnapshot, 0, 0);
            ctx.beginPath();
            // 正方形のプレビューを描画（短い辺に合わせる）- キャンバス座標
            const minX = Math.min(startPosCanvas.x, canvasPos.x);
            const minY = Math.min(startPosCanvas.y, canvasPos.y);
            const w = Math.abs(canvasPos.x - startPosCanvas.x);
            const h = Math.abs(canvasPos.y - startPosCanvas.y);
            const size = Math.min(w, h);
            ctx.rect(minX, minY, size, size);
            ctx.stroke();
            return;
        }

        if (state.interactionState === 1) {
            // Shiftキーによる水平・垂直スナップ（ペンとマーカー）
            let drawPos = pos;
            let drawCanvasPos = canvasPos;
            if (e.shiftKey && (state.currentMode === 'draw' || state.currentMode === 'marker')) {
                const dx = Math.abs(canvasPos.x - startPosCanvas.x);
                const dy = Math.abs(canvasPos.y - startPosCanvas.y);
                if (dx > dy) {
                    // 水平方向にスナップ
                    drawCanvasPos = { x: canvasPos.x, y: startPosCanvas.y };
                    drawPos = { x: pos.x, y: startPos.y };
                } else {
                    // 垂直方向にスナップ
                    drawCanvasPos = { x: startPosCanvas.x, y: canvasPos.y };
                    drawPos = { x: startPos.x, y: pos.y };
                }
            }

            if (state.currentMode === 'marker') {
                // ローカル座標を保存用配列に追加
                currentStrokePoints.push({ x: drawPos.x, y: drawPos.y });
                // キャンバス座標をプレビュー用配列に追加
                currentStrokePointsCanvas.push({ x: drawCanvasPos.x, y: drawCanvasPos.y });

                ctx.putImageData(snapshot, 0, 0);
                MojiQCanvasContext.initContext();
                ctx.beginPath();
                if (currentStrokePointsCanvas.length < 3) {
                    const b = currentStrokePointsCanvas[0];
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, ctx.lineWidth / 2, 0, Math.PI * 2, !0);
                    ctx.fill();
                    ctx.closePath();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(currentStrokePointsCanvas[0].x, currentStrokePointsCanvas[0].y);
                    let i;
                    for (i = 1; i < currentStrokePointsCanvas.length - 2; i++) {
                        const c = (currentStrokePointsCanvas[i].x + currentStrokePointsCanvas[i + 1].x) / 2;
                        const d = (currentStrokePointsCanvas[i].y + currentStrokePointsCanvas[i + 1].y) / 2;
                        ctx.quadraticCurveTo(currentStrokePointsCanvas[i].x, currentStrokePointsCanvas[i].y, c, d);
                    }
                    ctx.quadraticCurveTo(currentStrokePointsCanvas[i].x, currentStrokePointsCanvas[i].y, currentStrokePointsCanvas[i + 1].x, currentStrokePointsCanvas[i + 1].y);
                    ctx.stroke();
                }
            } else if (state.currentMode === 'draw') {
                // ローカル座標を保存用配列に追加
                currentStrokePoints.push({ x: drawPos.x, y: drawPos.y });
                // キャンバス座標をプレビュー用配列に追加
                currentStrokePointsCanvas.push({ x: drawCanvasPos.x, y: drawCanvasPos.y });

                // プレビューはキャンバス座標で描画
                ctx.lineTo(drawCanvasPos.x, drawCanvasPos.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(drawCanvasPos.x, drawCanvasPos.y);
            } else if (state.currentMode === 'eraser') {
                // ローカル座標を保存用配列に追加
                currentStrokePoints.push({ x: pos.x, y: pos.y });
                // キャンバス座標をプレビュー用配列に追加
                currentStrokePointsCanvas.push({ x: canvasPos.x, y: canvasPos.y });

                // プレビューはキャンバス座標で描画
                ctx.lineTo(canvasPos.x, canvasPos.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(canvasPos.x, canvasPos.y);

                // 消しゴムの場合、Simulatorキャンバスも同時に消去（キャンバス座標）
                if (simCtx) {
                    simCtx.lineTo(canvasPos.x, canvasPos.y);
                    simCtx.stroke();
                    simCtx.beginPath();
                    simCtx.moveTo(canvasPos.x, canvasPos.y);
                }
            } else {
                // 形状描画モード（rect, ellipse, line等）でもcurrentPosを更新
                currentPos = pos;  // ローカル座標（保存用）
                currentPosCanvas = canvasPos;  // キャンバス座標（プレビュー用）

                ctx.putImageData(snapshot, 0, 0);
                ctx.beginPath();
                const normalizedModeForDraw = normalizeMode(state.currentMode);
                if (normalizedModeForDraw === 'rect') {
                    // プレビューはキャンバス座標で描画
                    let w = canvasPos.x - startPosCanvas.x;
                    let h = canvasPos.y - startPosCanvas.y;
                    // Shiftキーで正方形にスナップ
                    if (e.shiftKey) {
                        const size = Math.max(Math.abs(w), Math.abs(h));
                        w = size * Math.sign(w || 1);
                        h = size * Math.sign(h || 1);
                    }
                    ctx.rect(startPosCanvas.x, startPosCanvas.y, w, h);
                    ctx.stroke();

                    // 写植スタンプの場合はフォント名ラベルも描画
                    if (state.selectedFontInfo) {
                        // テキスト位置を計算（キャンバス座標）
                        const padding = 5;
                        let textX, textY;
                        if (canvasPos.x > startPosCanvas.x) {
                            textX = canvasPos.x + padding;
                        } else {
                            textX = canvasPos.x - padding;
                        }
                        if (canvasPos.y > startPosCanvas.y) {
                            textY = canvasPos.y + padding;
                        } else {
                            textY = canvasPos.y - padding;
                        }

                        // フォント名ラベルを描画
                        const fontSize = 12;
                        ctx.font = `bold ${fontSize}px sans-serif`;
                        ctx.fillStyle = state.selectedFontInfo.color || '#000000';
                        ctx.textAlign = canvasPos.x > startPosCanvas.x ? 'left' : 'right';
                        ctx.textBaseline = canvasPos.y > startPosCanvas.y ? 'top' : 'bottom';

                        // 白い縁取り
                        ctx.save();
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = '#ffffff';
                        ctx.strokeText(state.selectedFontInfo.name, textX, textY);
                        ctx.restore();

                        // テキスト本体
                        ctx.fillText(state.selectedFontInfo.name, textX, textY);
                    }
                } else if (normalizedModeForDraw === 'ellipse') {
                    // プレビューはキャンバス座標で描画
                    let w = canvasPos.x - startPosCanvas.x;
                    let h = canvasPos.y - startPosCanvas.y;
                    // Shiftキーで正円にスナップ
                    if (e.shiftKey) {
                        const size = Math.max(Math.abs(w), Math.abs(h));
                        w = size * Math.sign(w || 1);
                        h = size * Math.sign(h || 1);
                    }
                    const cx = startPosCanvas.x + w / 2;
                    const cy = startPosCanvas.y + h / 2;
                    ctx.ellipse(cx, cy, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, 2 * Math.PI);
                    ctx.stroke();
                } else if (state.currentMode === 'semicircle') {
                    // プレビューはキャンバス座標で描画（ページ回転を適用）
                    const w = Math.abs(canvasPos.x - startPosCanvas.x);
                    const h = Math.abs(canvasPos.y - startPosCanvas.y);
                    const cx = startPosCanvas.x + (canvasPos.x - startPosCanvas.x) / 2;
                    const cy = startPosCanvas.y + (canvasPos.y - startPosCanvas.y) / 2;
                    // 画面座標で縦横の比率を判定
                    const screenW = Math.abs(currentPosScreen.x - startPosScreen.x);
                    const screenH = Math.abs(currentPosScreen.y - startPosScreen.y);
                    drawWithPageRotation(ctx, cx, cy, () => {
                        ctx.beginPath();
                        if (screenH > screenW) {
                            // 縦に長い場合: 縦向きの弧（右側の弧）
                            ctx.ellipse(cx, cy, w / 2, h / 2, 0, -0.5 * Math.PI, 0.5 * Math.PI);
                        } else {
                            // 横に長い場合: 横向きの弧（上側の弧）
                            ctx.ellipse(cx, cy, w / 2, h / 2, 0, Math.PI, 2 * Math.PI);
                        }
                        ctx.stroke();
                    });
                } else if (state.currentMode === 'chevron') {
                    // プレビューはキャンバス座標で描画（ページ回転を適用）
                    const topY = Math.min(startPosCanvas.y, canvasPos.y);
                    const bottomY = Math.max(startPosCanvas.y, canvasPos.y);
                    const leftX = Math.min(startPosCanvas.x, canvasPos.x);
                    const rightX = Math.max(startPosCanvas.x, canvasPos.x);
                    const midY = (topY + bottomY) / 2;
                    const midX = (leftX + rightX) / 2;
                    const centerX = (leftX + rightX) / 2;
                    const centerY = (topY + bottomY) / 2;

                    drawWithPageRotation(ctx, centerX, centerY, () => {
                        ctx.beginPath();
                        // Ctrlキーで頂点位置を下に変更
                        if (e.ctrlKey || e.metaKey) {
                            // Ctrl押下時: 常に ∨の形（頂点が下側）
                            ctx.moveTo(leftX, topY);
                            ctx.lineTo(midX, bottomY);
                            ctx.lineTo(rightX, topY);
                        } else {
                            // 通常時: 常に ＜の形（頂点が左側）
                            ctx.moveTo(rightX, topY);
                            ctx.lineTo(leftX, midY);
                            ctx.lineTo(rightX, bottomY);
                        }
                        ctx.stroke();
                    });
                } else if (state.currentMode === 'lshape') {
                    // プレビューはキャンバス座標で描画（ページ回転を適用）
                    const topY = Math.min(startPosCanvas.y, canvasPos.y);
                    const bottomY = Math.max(startPosCanvas.y, canvasPos.y);
                    const leftX = Math.min(startPosCanvas.x, canvasPos.x);
                    const rightX = Math.max(startPosCanvas.x, canvasPos.x);
                    const centerX = (leftX + rightX) / 2;
                    const centerY = (topY + bottomY) / 2;
                    // 画面座標でドラッグ方向を判定
                    const screenDx = currentPosScreen.x - startPosScreen.x;
                    const screenDy = currentPosScreen.y - startPosScreen.y;

                    drawWithPageRotation(ctx, centerX, centerY, () => {
                        ctx.beginPath();
                        // ドラッグ方向で4つの向きを決定（画面座標で判定）
                        if (screenDx >= 0 && screenDy >= 0) {
                            // 右下にドラッグ: L（標準形、左上が角）
                            ctx.moveTo(leftX, bottomY);
                            ctx.lineTo(leftX, topY);
                            ctx.lineTo(rightX, topY);
                        } else if (screenDx < 0 && screenDy >= 0) {
                            // 左下にドラッグ: ⌐（右上が角）
                            ctx.moveTo(rightX, bottomY);
                            ctx.lineTo(rightX, topY);
                            ctx.lineTo(leftX, topY);
                        } else if (screenDx >= 0 && screenDy < 0) {
                            // 右上にドラッグ: Γ（左下が角）
                            ctx.moveTo(leftX, topY);
                            ctx.lineTo(leftX, bottomY);
                            ctx.lineTo(rightX, bottomY);
                        } else {
                            // 左上にドラッグ: ⌝（右下が角）
                            ctx.moveTo(rightX, topY);
                            ctx.lineTo(rightX, bottomY);
                            ctx.lineTo(leftX, bottomY);
                        }
                        ctx.stroke();
                    });
                } else if (state.currentMode === 'zshape') {
                    // プレビューはキャンバス座標で描画（ページ回転を適用）
                    const centerX = (startPosCanvas.x + canvasPos.x) / 2;
                    const centerY = (startPosCanvas.y + canvasPos.y) / 2;

                    drawWithPageRotation(ctx, centerX, centerY, () => {
                        ctx.beginPath();
                        // Ctrlキーで90度回転したクランク形状
                        if (e.ctrlKey || e.metaKey) {
                            // Ctrl押下時: 横→縦→横の形状
                            const dx = canvasPos.x - startPosCanvas.x;
                            const midX = startPosCanvas.x + dx / 2;

                            ctx.moveTo(startPosCanvas.x, startPosCanvas.y);
                            ctx.lineTo(midX, startPosCanvas.y);
                            ctx.lineTo(midX, canvasPos.y);
                            ctx.lineTo(canvasPos.x, canvasPos.y);
                        } else {
                            // 通常時: 縦→横→縦の形状
                            const dy = canvasPos.y - startPosCanvas.y;
                            const midY = startPosCanvas.y + dy / 2;

                            ctx.moveTo(startPosCanvas.x, startPosCanvas.y);
                            ctx.lineTo(startPosCanvas.x, midY);
                            ctx.lineTo(canvasPos.x, midY);
                            ctx.lineTo(canvasPos.x, canvasPos.y);
                        }
                        ctx.stroke();
                    });
                } else if (state.currentMode === 'bracket') {
                    // プレビューはキャンバス座標で描画（ページ回転を適用）
                    const w = Math.abs(canvasPos.x - startPosCanvas.x);
                    const h = Math.abs(canvasPos.y - startPosCanvas.y);
                    // セリフ（はみ出し部分）のサイズ
                    const serifSize = Math.min(w, h) * 0.15;
                    const topY = Math.min(startPosCanvas.y, canvasPos.y);
                    const bottomY = Math.max(startPosCanvas.y, canvasPos.y);
                    const leftX = Math.min(startPosCanvas.x, canvasPos.x);
                    const rightX = Math.max(startPosCanvas.x, canvasPos.x);
                    const centerX = (leftX + rightX) / 2;
                    const centerY = (topY + bottomY) / 2;
                    // 画面座標で判定
                    const screenW = Math.abs(currentPosScreen.x - startPosScreen.x);
                    const screenH = Math.abs(currentPosScreen.y - startPosScreen.y);
                    const screenDx = currentPosScreen.x - startPosScreen.x;
                    const screenDy = currentPosScreen.y - startPosScreen.y;

                    drawWithPageRotation(ctx, centerX, centerY, () => {
                        // 縦横の比率で向きを決定（画面座標で判定）
                        if (screenH > screenW) {
                            // 縦に長い場合: 縦向きのコの字
                            if (screenDx >= 0) {
                                // 右にドラッグ: ⊐の形（開口部が左側）
                                ctx.beginPath();
                                ctx.moveTo(leftX, topY);
                                ctx.lineTo(rightX, topY);
                                ctx.lineTo(rightX, bottomY);
                                ctx.lineTo(leftX, bottomY);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(leftX, topY);
                                ctx.lineTo(leftX, topY - serifSize);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(leftX, bottomY);
                                ctx.lineTo(leftX, bottomY + serifSize);
                                ctx.stroke();
                            } else {
                                // 左にドラッグ: ⊏の形（開口部が右側）
                                ctx.beginPath();
                                ctx.moveTo(rightX, topY);
                                ctx.lineTo(leftX, topY);
                                ctx.lineTo(leftX, bottomY);
                                ctx.lineTo(rightX, bottomY);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(rightX, topY);
                                ctx.lineTo(rightX, topY - serifSize);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(rightX, bottomY);
                                ctx.lineTo(rightX, bottomY + serifSize);
                                ctx.stroke();
                            }
                        } else {
                            // 横に長い場合: 横向きのコの字
                            if (screenDy >= 0) {
                                // 下にドラッグ: ⊔の形（開口部が上側）
                                ctx.beginPath();
                                ctx.moveTo(leftX, topY);
                                ctx.lineTo(leftX, bottomY);
                                ctx.lineTo(rightX, bottomY);
                                ctx.lineTo(rightX, topY);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(leftX, topY);
                                ctx.lineTo(leftX - serifSize, topY);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(rightX, topY);
                                ctx.lineTo(rightX + serifSize, topY);
                                ctx.stroke();
                            } else {
                                // 上にドラッグ: ⊓の形（開口部が下側）
                                ctx.beginPath();
                                ctx.moveTo(leftX, bottomY);
                                ctx.lineTo(leftX, topY);
                                ctx.lineTo(rightX, topY);
                                ctx.lineTo(rightX, bottomY);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(leftX, bottomY);
                                ctx.lineTo(leftX - serifSize, bottomY);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(rightX, bottomY);
                                ctx.lineTo(rightX + serifSize, bottomY);
                                ctx.stroke();
                            }
                        }
                    });
                } else if (state.currentMode === 'rectSymbolStamp') {
                    // 全角アキ（□）のドラッグ中プレビュー（ページ回転を適用）
                    const w = canvasPos.x - startPosCanvas.x;
                    const h = canvasPos.y - startPosCanvas.y;
                    const centerX = startPosCanvas.x + w / 2;
                    const centerY = startPosCanvas.y + h / 2;
                    drawWithPageRotation(ctx, centerX, centerY, () => {
                        ctx.beginPath();
                        ctx.rect(startPosCanvas.x, startPosCanvas.y, w, h);
                        ctx.stroke();
                    });
                } else if (state.currentMode === 'triangleSymbolStamp') {
                    // 半角アキ（△）のドラッグ中プレビュー（ページ回転を適用）
                    const topY = Math.min(startPosCanvas.y, canvasPos.y);
                    const bottomY = Math.max(startPosCanvas.y, canvasPos.y);
                    const leftX = Math.min(startPosCanvas.x, canvasPos.x);
                    const rightX = Math.max(startPosCanvas.x, canvasPos.x);
                    const midX = (leftX + rightX) / 2;
                    const centerX = midX;
                    const centerY = (topY + bottomY) / 2;
                    drawWithPageRotation(ctx, centerX, centerY, () => {
                        ctx.beginPath();
                        // 上向きの三角形
                        ctx.moveTo(midX, topY);
                        ctx.lineTo(leftX, bottomY);
                        ctx.lineTo(rightX, bottomY);
                        ctx.closePath();
                        ctx.stroke();
                    });
                } else if (normalizedModeForDraw === 'line') {
                    // Shiftキーで水平・垂直の直線に制限（縮尺合わせと同様の挙動）
                    // プレビューはキャンバス座標で描画
                    let endX = canvasPos.x;
                    let endY = canvasPos.y;
                    if (state.isShiftPressed) {
                        const dx = Math.abs(canvasPos.x - startPosCanvas.x);
                        const dy = Math.abs(canvasPos.y - startPosCanvas.y);
                        if (dx > dy) {
                            // 水平方向に固定
                            endY = startPosCanvas.y;
                        } else {
                            // 垂直方向に固定
                            endX = startPosCanvas.x;
                        }
                    }
                    ctx.moveTo(startPosCanvas.x, startPosCanvas.y);
                    ctx.lineTo(endX, endY);
                    ctx.stroke();
                    // 矢印プレビュー：矢頭を描画
                    if (state.currentMode === 'arrow' || state.currentMode === 'doubleArrow' || state.currentMode === 'doubleArrowAnnotated') {
                        const headLen = Math.max(5, (ctx.lineWidth || 2) * 2);
                        const angle = Math.atan2(endY - startPosCanvas.y, endX - startPosCanvas.x);
                        // 字間指示入れは外向き(+)、それ以外は内向き(-)
                        const sign = (state.currentMode === 'doubleArrowAnnotated') ? 1 : -1;
                        // endPos側の矢頭
                        ctx.beginPath();
                        ctx.moveTo(endX, endY);
                        ctx.lineTo(endX + sign * headLen * Math.cos(angle - Math.PI / 6), endY + sign * headLen * Math.sin(angle - Math.PI / 6));
                        ctx.moveTo(endX, endY);
                        ctx.lineTo(endX + sign * headLen * Math.cos(angle + Math.PI / 6), endY + sign * headLen * Math.sin(angle + Math.PI / 6));
                        ctx.stroke();
                        if (state.currentMode === 'doubleArrow' || state.currentMode === 'doubleArrowAnnotated') {
                            // startPos側の矢頭
                            const reverseAngle = angle + Math.PI;
                            ctx.beginPath();
                            ctx.moveTo(startPosCanvas.x, startPosCanvas.y);
                            ctx.lineTo(startPosCanvas.x + sign * headLen * Math.cos(reverseAngle - Math.PI / 6), startPosCanvas.y + sign * headLen * Math.sin(reverseAngle - Math.PI / 6));
                            ctx.moveTo(startPosCanvas.x, startPosCanvas.y);
                            ctx.lineTo(startPosCanvas.x + sign * headLen * Math.cos(reverseAngle + Math.PI / 6), startPosCanvas.y + sign * headLen * Math.sin(reverseAngle + Math.PI / 6));
                            ctx.stroke();
                        }
                    }
                } else if (state.currentMode === 'text') {
                    // プレビューはキャンバス座標で描画
                    ctx.moveTo(startPosCanvas.x, startPosCanvas.y);
                    ctx.lineTo(canvasPos.x, canvasPos.y);
                    ctx.stroke();
                } else if (state.currentMode === 'image' && state.pendingImage) {
                    // プレビューはキャンバス座標で描画
                    // アスペクト比を保持して画像サイズを計算
                    const imgAspect = state.pendingImage.naturalWidth / state.pendingImage.naturalHeight;
                    const dragW = canvasPos.x - startPosCanvas.x;
                    const dragH = canvasPos.y - startPosCanvas.y;
                    let w, h;
                    if (Math.abs(dragW / dragH) > imgAspect) {
                        // 横方向の方が比率的に大きい場合、高さに合わせる
                        h = dragH;
                        w = dragH * imgAspect * Math.sign(dragW);
                    } else {
                        // 縦方向の方が比率的に大きい場合、幅に合わせる
                        w = dragW;
                        h = dragW / imgAspect * Math.sign(dragH);
                    }
                    ctx.drawImage(state.pendingImage, startPosCanvas.x, startPosCanvas.y, w, h);
                    ctx.save();
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);
                    ctx.strokeRect(startPosCanvas.x, startPosCanvas.y, w, h);
                    ctx.restore();
                } else if ([
                    'toruStamp', 'torutsumeStamp', 'torumamaStamp',
                    'zenkakuakiStamp', 'nibunakiStamp', 'shibunakiStamp'
                ].includes(state.currentMode)) {
                    // 指示スタンプのドラッグ中：指示線のプレビューを表示（先端に●）- キャンバス座標
                    const dist = Math.sqrt(Math.pow(canvasPos.x - startPosCanvas.x, 2) + Math.pow(canvasPos.y - startPosCanvas.y, 2));
                    if (dist >= 10) {
                        ctx.moveTo(startPosCanvas.x, startPosCanvas.y);
                        ctx.lineTo(canvasPos.x, canvasPos.y);
                        ctx.stroke();
                        // 先端に●を描画
                        const dotRadius = Math.max(ctx.lineWidth, 2);
                        ctx.beginPath();
                        ctx.arc(startPosCanvas.x, startPosCanvas.y, dotRadius, 0, 2 * Math.PI);
                        ctx.fillStyle = ctx.strokeStyle;
                        ctx.fill();
                    }
                }
            }
        }
    }

    /**
     * 描画終了
     */
    function stopDrawing(e) {
        if (e.type === 'touchend') e.preventDefault();

        // Simulatorのキャリブレーション/グリッドモード時はMojiQDrawingの処理をスキップ
        if (window.SimulatorState) {
            const simMode = window.SimulatorState.get('currentMode');
            if (simMode === 'calibration' || simMode === 'grid') {
                return;
            }
        }

        if (state.isPanning) {
            state.isPanning = false;
            mojiqCanvas.classList.remove('cursor-grabbing');
            if (state.isSpacePressed || state.isShiftPressed) mojiqCanvas.classList.add('cursor-grab');
            return;
        }

        // 終了時の座標を取得してcurrentPosを更新（touchendでも座標が取れる場合のみ）
        // これにより、形状描画モードで正しい終点座標が保存される
        try {
            const finalCanvasPos = getPos(e);
            const finalLocalPos = getPosForSpread(e);
            if (finalCanvasPos && typeof finalCanvasPos.x === 'number') {
                currentPos = finalLocalPos;
                currentPosCanvas = finalCanvasPos;
            }
        } catch (err) {
            // touchendで座標が取れない場合はdraw()で更新されたcurrentPosを使用
        }

        // 選択モードの処理
        if (state.currentMode === 'select') {
            if (DrawingSelect) {
                // 見開きモード時はキャンバス座標を使用
                const PdfManager = window.MojiQPdfManager;
                if (PdfManager && PdfManager.isSpreadViewMode()) {
                    DrawingSelect.endSelect(currentPosCanvas, currentPosCanvas);
                } else {
                    DrawingSelect.endSelect(currentPos);
                }
            }
            return;
        }

        if (state.interactionState === 2) return;

        // ラベル付き枠線モード：枠線描画中終了
        if (state.interactionState === 5 && state.currentMode === 'labeledRect') {
            const style = getCurrentDrawingStyle();
            const w = Math.abs(currentPos.x - startPos.x);
            const h = Math.abs(currentPos.y - startPos.y);

            if (w > 5 && h > 5) {
                // 正方形のサイズを計算（短い辺に合わせる）
                const minX = Math.min(startPos.x, currentPos.x);
                const minY = Math.min(startPos.y, currentPos.y);
                const size = Math.min(w, h);

                // 描画情報を保存
                const rectStartPos = { x: minX, y: minY };
                const rectEndPos = { x: minX + size, y: minY + size };
                const rectColor = style.color;
                const rectLineWidth = style.lineWidth;
                const leaderStart = { ...labeledRectLeaderStart };
                const leaderEnd = { ...labeledRectLeaderEnd };

                // 一文字入力モーダルを表示
                if (window.MojiQModal && MojiQModal.showSingleCharInput) {
                    MojiQModal.showSingleCharInput().then((label) => {
                        if (label) {
                            // ラベルが入力された場合、オブジェクトを保存
                            saveObjectToPage({
                                type: 'labeledRect',
                                startPos: rectStartPos,
                                endPos: rectEndPos,
                                color: rectColor,
                                lineWidth: rectLineWidth,
                                label: label,
                                leaderLine: {
                                    start: leaderStart,
                                    end: leaderEnd
                                }
                            });
                        }
                        // キャンバスを再描画
                        redrawCanvas();
                        if (saveHistoryCallback) saveHistoryCallback();

                        // 変数をリセット
                        labeledRectLeaderStart = null;
                        labeledRectLeaderEnd = null;
                        labeledRectLeaderStartCanvas = null;
                        labeledRectLeaderEndCanvas = null;
                        labeledRectSnapshot = null;
                    });
                }
            } else {
                // 枠線が小さすぎる場合はキャンセル
                redrawCanvas(false);
                labeledRectLeaderStart = null;
                labeledRectLeaderEnd = null;
                labeledRectLeaderStartCanvas = null;
                labeledRectLeaderEndCanvas = null;
                labeledRectSnapshot = null;
            }
            state.interactionState = 0;
            return;
        }

        if (state.interactionState === 1) {
            const style = getCurrentDrawingStyle();

            if (state.currentMode === 'draw') {
                // ペンストロークをオブジェクトとして保存
                if (currentStrokePoints.length > 1) {
                    saveObjectToPage({
                        type: 'pen',
                        points: [...currentStrokePoints],
                        color: style.color,
                        lineWidth: style.lineWidth
                    });
                }
                state.interactionState = 0;
                currentStrokePoints = [];
                currentStrokePointsCanvas = [];  // キャンバス座標用配列もリセット
                if (saveHistoryCallback) saveHistoryCallback();
                return;
            }

            if (state.currentMode === 'marker') {
                // マーカーストロークをオブジェクトとして保存
                if (currentStrokePoints.length > 1) {
                    saveObjectToPage({
                        type: 'marker',
                        points: [...currentStrokePoints],
                        color: style.color,
                        lineWidth: style.lineWidth,
                        opacity: 0.3,
                        compositeOp: 'multiply'
                    });
                }
                state.interactionState = 0;
                currentStrokePoints = [];
                currentStrokePointsCanvas = [];  // キャンバス座標用配列もリセット
                if (saveHistoryCallback) saveHistoryCallback();
                return;
            }

            if (state.currentMode === 'eraser') {
                // 消しゴムストロークをオブジェクトとして保存（関連オブジェクトIDも記録）
                if (currentStrokePoints.length > 1) {
                    const eraserStroke = {
                        points: [...currentStrokePoints],
                        lineWidth: state.eraserSize
                    };

                    // 消しゴムストロークのバウンディングボックスを計算
                    const eraserBounds = getEraserBounds(eraserStroke);

                    // 交差するオブジェクトのIDを検出
                    const pageNum = getCurrentPage();
                    const objects = DrawingObjects.getPageObjects(pageNum);
                    const linkedObjectIds = [];

                    // 消しゴムで消せるタイプ
                    // pen, marker: 完全に消去
                    // rect, ellipse, line: 図形部分のみ消去（annotationがある場合は引出線・テキストは残る）
                    // arrow, doubleArrow: 完全に消去
                    // polyline: 完全に消去
                    const erasableTypes = ['pen', 'marker', 'rect', 'ellipse', 'line', 'arrow', 'doubleArrow', 'polyline'];

                    for (let i = 0; i < objects.length; i++) {
                        const obj = objects[i];
                        // 消しゴムで消せるタイプかチェック
                        if (!erasableTypes.includes(obj.type)) continue;

                        // バウンディングボックスの交差判定
                        const objBounds = DrawingRenderer.getBounds(obj);
                        if (boundsIntersect(eraserBounds, objBounds)) {
                            linkedObjectIds.push(obj.id);
                        }
                    }

                    // 消しゴムオブジェクトとして保存（関連オブジェクトIDを含む）
                    saveObjectToPage({
                        type: 'eraser',
                        points: [...currentStrokePoints],
                        lineWidth: state.eraserSize,
                        linkedObjectIds: linkedObjectIds
                    });
                }
                // 消しゴムの場合、Simulatorキャンバスのコンテキストを元に戻す
                if (simCtx) {
                    simCtx.globalCompositeOperation = 'source-over';
                }
                state.interactionState = 0;
                currentStrokePoints = [];
                currentStrokePointsCanvas = [];  // キャンバス座標用配列もリセット
                // 再描画してテキストやアノテーションを復元
                redrawCanvas(false);
                if (saveHistoryCallback) saveHistoryCallback();
                return;
            }

            const normalizedModeForSave = normalizeMode(state.currentMode);

            if (normalizedModeForSave === 'line') {
                // Shiftキーで水平・垂直の直線に制限（縮尺合わせと同様の挙動）
                let endX = currentPos.x;
                let endY = currentPos.y;
                if (state.isShiftPressed) {
                    const dx = Math.abs(currentPos.x - startPos.x);
                    const dy = Math.abs(currentPos.y - startPos.y);
                    if (dx > dy) {
                        // 水平方向に固定
                        endY = startPos.y;
                    } else {
                        // 垂直方向に固定
                        endX = startPos.x;
                    }
                }
                // 直線/矢印をオブジェクトとして保存
                const dist = Math.sqrt(Math.pow(endX - startPos.x, 2) + Math.pow(endY - startPos.y, 2));
                if (dist > 5) {
                    let lineType = 'line';
                    if (state.currentMode === 'arrow') lineType = 'arrow';
                    else if (state.currentMode === 'doubleArrow') lineType = 'doubleArrow';
                    else if (state.currentMode === 'doubleArrowAnnotated') lineType = 'doubleArrowAnnotated';
                    saveObjectToPage({
                        type: lineType,
                        startPos: { ...startPos },
                        endPos: { x: endX, y: endY },
                        color: style.color,
                        lineWidth: style.lineWidth
                    });
                    // 矢印ツールはプレビューに矢頭が含まれないため再描画が必要
                    if (lineType !== 'line') {
                        // annotationModeの場合はsnapshot取得前に同期的再描画が必要
                        if (state.annotationMode) {
                            doRedrawCanvas();
                        } else {
                            redrawCanvas(false);
                        }
                    }
                }
            }

            if (normalizedModeForSave === 'rect') {
                if (state.selectedFontInfo) {
                    state.interactionState = 0;

                    // fontLabelを直接saveObjectToPageで保存（校正指示スタンプと同様の処理）
                    // テキスト位置を計算
                    const padding = 5;
                    let textAlign = 'left';
                    let textX = 0;
                    let textY = 0;
                    if (currentPos.x > startPos.x) {
                        textAlign = 'left';
                        textX = currentPos.x + padding;
                    } else {
                        textAlign = 'right';
                        textX = currentPos.x - padding;
                    }
                    if (currentPos.y > startPos.y) {
                        textY = currentPos.y + padding;
                    } else {
                        textY = currentPos.y - padding;
                    }

                    saveObjectToPage({
                        type: 'fontLabel',
                        startPos: { x: startPos.x, y: startPos.y },
                        endPos: { x: currentPos.x, y: currentPos.y },
                        color: state.selectedFontInfo.color,
                        lineWidth: style.lineWidth,
                        fontName: state.selectedFontInfo.name,
                        fontSize: 12,
                        textAlign: textAlign,
                        textX: textX,
                        textY: textY
                    });

                    if (saveHistoryCallback) saveHistoryCallback();
                    // 見開きモードでのプレビューが残らないよう再描画
                    redrawCanvas(false);
                    return;
                }

                // 矩形をオブジェクトとして保存
                // Shiftキーで正方形にスナップ
                let rectEndX = currentPos.x;
                let rectEndY = currentPos.y;
                if (state.isShiftPressed) {
                    const w = currentPos.x - startPos.x;
                    const h = currentPos.y - startPos.y;
                    const size = Math.max(Math.abs(w), Math.abs(h));
                    rectEndX = startPos.x + size * Math.sign(w || 1);
                    rectEndY = startPos.y + size * Math.sign(h || 1);
                }
                const w = Math.abs(rectEndX - startPos.x);
                const h = Math.abs(rectEndY - startPos.y);
                if (w > 5 && h > 5) {
                    saveObjectToPage({
                        type: 'rect',
                        startPos: { ...startPos },
                        endPos: { x: rectEndX, y: rectEndY },
                        color: style.color,
                        lineWidth: style.lineWidth
                    });
                }
            }

            // ラベル付き枠線モード：引出線フェーズで離した場合はキャンセル
            if (state.currentMode === 'labeledRect' && state.interactionState === 1) {
                // 引出線が短すぎる（枠線描画フェーズに移行していない）場合はキャンセル
                ctx.putImageData(snapshot, 0, 0);
                state.interactionState = 0;
                labeledRectLeaderStart = null;
                labeledRectLeaderEnd = null;
                labeledRectLeaderStartCanvas = null;
                labeledRectLeaderEndCanvas = null;
                return;
            }

            if (normalizedModeForSave === 'ellipse') {
                // 楕円をオブジェクトとして保存
                // Shiftキーで正円にスナップ
                let ellipseEndX = currentPos.x;
                let ellipseEndY = currentPos.y;
                if (state.isShiftPressed) {
                    const w = currentPos.x - startPos.x;
                    const h = currentPos.y - startPos.y;
                    const size = Math.max(Math.abs(w), Math.abs(h));
                    ellipseEndX = startPos.x + size * Math.sign(w || 1);
                    ellipseEndY = startPos.y + size * Math.sign(h || 1);
                }
                const w = Math.abs(ellipseEndX - startPos.x);
                const h = Math.abs(ellipseEndY - startPos.y);
                if (w > 5 && h > 5) {
                    saveObjectToPage({
                        type: 'ellipse',
                        startPos: { ...startPos },
                        endPos: { x: ellipseEndX, y: ellipseEndY },
                        color: style.color,
                        lineWidth: style.lineWidth
                    });
                }
            }

            if (state.currentMode === 'semicircle') {
                // 半円をオブジェクトとして保存（指示線機能なし）
                const w = Math.abs(currentPos.x - startPos.x);
                const h = Math.abs(currentPos.y - startPos.y);
                if (w > 5 || h > 5) {
                    // 画面座標で縦横の比率を計算（ページ回転に影響されない向き判定）
                    const screenW = Math.abs(currentPosScreen.x - startPosScreen.x);
                    const screenH = Math.abs(currentPosScreen.y - startPosScreen.y);
                    const orientation = screenH > screenW ? 'vertical' : 'horizontal';
                    saveObjectToPage({
                        type: 'semicircle',
                        startPos: { ...startPos },
                        endPos: { ...currentPos },
                        color: style.color,
                        lineWidth: style.lineWidth,
                        orientation: orientation
                    });
                }
                // 半円は指示線モードに移行しない
                state.interactionState = 0;
                if (saveHistoryCallback) saveHistoryCallback();
                return;
            }

            if (state.currentMode === 'chevron') {
                // くの字をオブジェクトとして保存（指示線機能なし）
                const w = Math.abs(currentPos.x - startPos.x);
                const h = Math.abs(currentPos.y - startPos.y);
                if (w > 5 || h > 5) {
                    // Ctrlキーで頂点位置を下に変更
                    // 通常時: 常にvertical（頂点右）、Ctrl時: horizontal（頂点下）
                    const isCtrlPressed = e && (e.ctrlKey || e.metaKey);
                    const orientation = isCtrlPressed ? 'horizontal' : 'vertical';
                    const flipped = false; // 常にfalse（方向はorientationで決定）
                    saveObjectToPage({
                        type: 'chevron',
                        startPos: { ...startPos },
                        endPos: { ...currentPos },
                        color: style.color,
                        lineWidth: style.lineWidth,
                        orientation: orientation,
                        flipped: flipped
                    });
                }
                // くの字は指示線モードに移行しない
                state.interactionState = 0;
                if (saveHistoryCallback) saveHistoryCallback();
                return;
            }

            if (state.currentMode === 'lshape') {
                // L字をオブジェクトとして保存（指示線機能なし）
                const w = Math.abs(currentPos.x - startPos.x);
                const h = Math.abs(currentPos.y - startPos.y);
                if (w > 5 || h > 5) {
                    // 画面座標でドラッグ方向を判定（ページ回転に影響されない向き判定）
                    const screenDx = currentPosScreen.x - startPosScreen.x;
                    const screenDy = currentPosScreen.y - startPosScreen.y;
                    // direction: 0=右下(L), 1=左下(⌐), 2=右上(Γ), 3=左上(⌝)
                    let direction;
                    if (screenDx >= 0 && screenDy >= 0) {
                        direction = 0;
                    } else if (screenDx < 0 && screenDy >= 0) {
                        direction = 1;
                    } else if (screenDx >= 0 && screenDy < 0) {
                        direction = 2;
                    } else {
                        direction = 3;
                    }
                    saveObjectToPage({
                        type: 'lshape',
                        startPos: { ...startPos },
                        endPos: { ...currentPos },
                        color: style.color,
                        lineWidth: style.lineWidth,
                        direction: direction
                    });
                }
                // L字は指示線モードに移行しない
                state.interactionState = 0;
                if (saveHistoryCallback) saveHistoryCallback();
                return;
            }

            if (state.currentMode === 'zshape') {
                // Z字をオブジェクトとして保存（指示線機能なし、クランク形状）
                const w = Math.abs(currentPos.x - startPos.x);
                const h = Math.abs(currentPos.y - startPos.y);
                if (w > 5 || h > 5) {
                    // Ctrlキーで90度回転
                    const isCtrlPressed = e && (e.ctrlKey || e.metaKey);
                    saveObjectToPage({
                        type: 'zshape',
                        startPos: { ...startPos },
                        endPos: { ...currentPos },
                        color: style.color,
                        lineWidth: style.lineWidth,
                        rotated: isCtrlPressed  // trueの場合は横→縦→横の形状
                    });
                }
                // Z字は指示線モードに移行しない
                state.interactionState = 0;
                if (saveHistoryCallback) saveHistoryCallback();
                return;
            }

            if (state.currentMode === 'bracket') {
                // コの字をオブジェクトとして保存（指示線機能なし）
                const w = Math.abs(currentPos.x - startPos.x);
                const h = Math.abs(currentPos.y - startPos.y);
                if (w > 5 || h > 5) {
                    // 画面座標で縦横の比率を計算（ページ回転に影響されない向き判定）
                    const screenW = Math.abs(currentPosScreen.x - startPosScreen.x);
                    const screenH = Math.abs(currentPosScreen.y - startPosScreen.y);
                    const orientation = screenH > screenW ? 'vertical' : 'horizontal';
                    // 画面座標でドラッグ方向を判定
                    const screenDx = currentPosScreen.x - startPosScreen.x;
                    const screenDy = currentPosScreen.y - startPosScreen.y;
                    // 縦向きの場合は左にドラッグで反転、横向きの場合は下にドラッグで反転
                    const flipped = (orientation === 'vertical') ? (screenDx < 0) : (screenDy >= 0);
                    saveObjectToPage({
                        type: 'bracket',
                        startPos: { ...startPos },
                        endPos: { ...currentPos },
                        color: style.color,
                        lineWidth: style.lineWidth,
                        orientation: orientation,
                        flipped: flipped
                    });
                }
                // コの字は指示線モードに移行しない
                state.interactionState = 0;
                if (saveHistoryCallback) saveHistoryCallback();
                return;
            }

            if (state.currentMode === 'rectSymbolStamp') {
                // 全角アキ（□）をオブジェクトとして保存
                const w = Math.abs(currentPos.x - startPos.x);
                const h = Math.abs(currentPos.y - startPos.y);
                if (w > 5 && h > 5) {
                    saveObjectToPage({
                        type: 'rectSymbolStamp',
                        startPos: { ...startPos },
                        endPos: { ...currentPos },
                        color: style.color,
                        lineWidth: style.lineWidth
                    });
                }
                state.interactionState = 0;
                if (saveHistoryCallback) saveHistoryCallback();
                return;
            }

            if (state.currentMode === 'triangleSymbolStamp') {
                // 半角アキ（△）をオブジェクトとして保存
                const w = Math.abs(currentPos.x - startPos.x);
                const h = Math.abs(currentPos.y - startPos.y);
                if (w > 5 || h > 5) {
                    saveObjectToPage({
                        type: 'triangleSymbolStamp',
                        startPos: { ...startPos },
                        endPos: { ...currentPos },
                        color: style.color,
                        lineWidth: style.lineWidth
                    });
                }
                state.interactionState = 0;
                if (saveHistoryCallback) saveHistoryCallback();
                return;
            }

            // 指示スタンプの共通処理
            const instructionStampConfig = {
                'toruStamp': 1.2,
                'torutsumeStamp': 1.8,
                'torumamaStamp': 1.8,
                'zenkakuakiStamp': 2.2,
                'nibunakiStamp': 2.2,
                'shibunakiStamp': 2.2,
                'kaigyouStamp': 2.2
            };

            if (instructionStampConfig[state.currentMode] !== undefined) {
                const stampSize = Constants ? Constants.STAMP_SIZES.TORU : 14;
                const dist = Math.sqrt(Math.pow(currentPos.x - startPos.x, 2) + Math.pow(currentPos.y - startPos.y, 2));
                const offsetMultiplier = instructionStampConfig[state.currentMode];

                if (dist >= 10) {
                    // 10px以上ドラッグした場合：指示線付きでスタンプを配置
                    const offsetDistance = stampSize * offsetMultiplier;
                    const dx = currentPos.x - startPos.x;
                    const dy = currentPos.y - startPos.y;
                    const stampX = currentPos.x + (dx / dist) * offsetDistance;
                    const stampY = currentPos.y + (dy / dist) * offsetDistance;

                    // 仮のスタンプオブジェクトを作成して引出線終端を計算
                    const tempStampObj = {
                        type: state.currentMode,
                        startPos: { x: stampX, y: stampY },
                        size: stampSize
                    };
                    const leaderStart = { x: startPos.x, y: startPos.y };
                    let leaderEnd = { x: currentPos.x, y: currentPos.y };

                    // 引出線終端をスタンプのバウンディングボックスから自動計算
                    const DrawingModes = window.MojiQDrawingModes;
                    if (DrawingModes && DrawingModes.getStampLeaderEndPos) {
                        leaderEnd = DrawingModes.getStampLeaderEndPos(tempStampObj, leaderStart);
                    }

                    saveObjectToPage({
                        type: state.currentMode,
                        startPos: { x: stampX, y: stampY },
                        color: style.color,
                        size: stampSize,
                        leaderLine: {
                            start: leaderStart,
                            end: leaderEnd
                        }
                    });
                } else {
                    // クリックのみの場合：通常のスタンプを配置
                    saveObjectToPage({
                        type: state.currentMode,
                        startPos: { x: startPos.x, y: startPos.y },
                        color: style.color,
                        size: stampSize
                    });
                }
                state.interactionState = 0;
                if (saveHistoryCallback) saveHistoryCallback();
                redrawCanvas(false);
                return;
            }

            if (state.currentMode === 'text') {
                state.interactionState = 0;
                const dist = Math.sqrt(Math.pow(currentPos.x - startPos.x, 2) + Math.pow(currentPos.y - startPos.y, 2));
                const isLeader = dist > 5;
                if (!isLeader) currentPos = startPos;
                if (handleInputRequestCallback) {
                    handleInputRequestCallback({
                        isLeader: isLeader && state.useLeaderLine,
                        startX: startPos.x, startY: startPos.y,
                        endX: currentPos.x, endY: currentPos.y
                    });
                }
                return;
            }

            if (state.currentMode === 'image' && state.pendingImage) {
                state.interactionState = 0;
                ctx.putImageData(snapshot, 0, 0);
                // アスペクト比を保持して画像サイズを計算
                const imgAspect = state.pendingImage.naturalWidth / state.pendingImage.naturalHeight;
                const dragW = currentPos.x - startPos.x;
                const dragH = currentPos.y - startPos.y;
                let w, h;
                if (Math.abs(dragW / dragH) > imgAspect) {
                    h = dragH;
                    w = dragH * imgAspect * Math.sign(dragW);
                } else {
                    w = dragW;
                    h = dragW / imgAspect * Math.sign(dragH);
                }
                // キャンバス座標版のサイズ計算（プレビュー用）
                const dragWCanvas = currentPosCanvas.x - startPosCanvas.x;
                const dragHCanvas = currentPosCanvas.y - startPosCanvas.y;
                let wCanvas, hCanvas;
                if (Math.abs(dragWCanvas / dragHCanvas) > imgAspect) {
                    hCanvas = dragHCanvas;
                    wCanvas = dragHCanvas * imgAspect * Math.sign(dragWCanvas);
                } else {
                    wCanvas = dragWCanvas;
                    hCanvas = dragWCanvas / imgAspect * Math.sign(dragHCanvas);
                }
                if (Math.abs(w) > 5 && Math.abs(h) > 5) {
                    ctx.drawImage(state.pendingImage, startPosCanvas.x, startPosCanvas.y, wCanvas, hCanvas);

                    // 画像をオブジェクトとして保存（アスペクト比を保持したendPosを計算）
                    const endPos = { x: startPos.x + w, y: startPos.y + h };
                    saveObjectToPage({
                        type: 'image',
                        startPos: { ...startPos },
                        endPos: endPos,
                        imageData: state.pendingImage
                    });

                    if (state.annotationMode) {
                        if (saveHistoryCallback) saveHistoryCallback();
                        state.interactionState = 2;
                        // 指示線の開始位置計算のため、アスペクト比を保持した実際の終点を使用
                        shapeEndPos = { x: startPos.x + w, y: startPos.y + h };
                        shapeEndPosCanvas = { x: startPosCanvas.x + wCanvas, y: startPosCanvas.y + hCanvas };
                        snapshot = ctx.getImageData(0, 0, mojiqCanvas.width, mojiqCanvas.height);
                        mojiqCanvas.style.cursor = 'crosshair';
                    } else {
                        if (saveHistoryCallback) saveHistoryCallback();
                    }
                } else {
                    // 画像が小さすぎる場合は何もしない
                    if (saveHistoryCallback) saveHistoryCallback();
                }
                return;
            }

            if (state.annotationMode) {
                if (saveHistoryCallback) saveHistoryCallback();
                state.interactionState = 2;
                shapeEndPos = { x: currentPos.x, y: currentPos.y };
                shapeEndPosCanvas = { x: currentPosCanvas.x, y: currentPosCanvas.y };
                snapshot = ctx.getImageData(0, 0, mojiqCanvas.width, mojiqCanvas.height);
                mojiqCanvas.style.cursor = 'crosshair';
            } else {
                state.interactionState = 0;
                if (saveHistoryCallback) saveHistoryCallback();
            }
        }
    }

    /**
     * アノテーション確定
     * @param {object} endPos - 引出線終点（ローカル座標 - オブジェクト保存用）
     * @param {object} endPosCanvas - 引出線終点（キャンバス座標 - プレビュー描画用）
     */
    function finalizeAnnotation(endPos, endPosCanvas) {
        state.interactionState = 0;
        const leaderStart = getLeaderStartPos(endPos);          // ローカル座標（保存用）
        const leaderStartCanvas = getLeaderStartPosCanvas(endPosCanvas);  // キャンバス座標（描画用）
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();
        ctx.moveTo(leaderStartCanvas.x, leaderStartCanvas.y);  // キャンバス座標で描画
        ctx.lineTo(endPosCanvas.x, endPosCanvas.y);
        ctx.stroke();
        if (saveHistoryCallback) saveHistoryCallback();
        if (handleInputRequestCallback) {
            // コールバックにはローカル座標を渡す（オブジェクト保存用）
            handleInputRequestCallback({
                isLeader: false, startX: leaderStart.x, startY: leaderStart.y, endX: endPos.x, endY: endPos.y, drawTextOnly: true
            });
        }
        // shapeEndPosCanvasをリセット
        shapeEndPosCanvas = { x: 0, y: 0 };
    }

    /**
     * 折れ線を確定して保存
     */
    function finalizePolyline() {
        if (polylinePoints.length < 2) {
            // 頂点が2つ未満の場合はキャンセル
            cancelPolyline();
            return;
        }

        // 始点を末尾に追加して閉じた図形にする
        const closedPoints = [...polylinePoints, { ...polylinePoints[0] }];

        const style = getCurrentDrawingStyle();
        saveObjectToPage({
            type: 'polyline',
            points: closedPoints,
            color: style.color,
            lineWidth: style.lineWidth
        });

        // 折れ線の状態をリセット
        polylinePoints = [];
        polylinePointsCanvas = [];  // キャンバス座標用配列もリセット
        polylineSnapshot = null;
        state.interactionState = 0;

        if (saveHistoryCallback) saveHistoryCallback();
        redrawCanvas(false);
    }

    /**
     * 折れ線をキャンセル
     */
    function cancelPolyline() {
        if (polylineSnapshot) {
            ctx.putImageData(polylineSnapshot, 0, 0);
        }
        polylinePoints = [];
        polylinePointsCanvas = [];  // キャンバス座標用配列もリセット
        polylineSnapshot = null;
        state.interactionState = 0;
    }

    /**
     * 折れ線の最後の頂点を削除（1つ戻る）
     */
    function undoLastPolylinePoint() {
        if (polylinePoints.length <= 1) {
            // 頂点が1つ以下なら全キャンセル
            cancelPolyline();
            return;
        }

        // 最後の頂点を削除（両方の配列から）
        polylinePoints.pop();
        polylinePointsCanvas.pop();

        // キャンバスを再描画
        if (polylineSnapshot) {
            ctx.putImageData(polylineSnapshot, 0, 0);
        }

        // 現在の頂点で折れ線を再描画（キャンバス座標を使用）
        ctx.beginPath();
        ctx.strokeStyle = state.drawingColor;
        ctx.lineWidth = state.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(polylinePointsCanvas[0].x, polylinePointsCanvas[0].y);
        for (let i = 1; i < polylinePointsCanvas.length; i++) {
            ctx.lineTo(polylinePointsCanvas[i].x, polylinePointsCanvas[i].y);
        }
        ctx.stroke();
    }

    /**
     * マウスホイールイベントハンドラ
     * 選択モードでアノテーション上でのホイール操作時に文字サイズを変更
     */
    function handleWheelEvent(e) {
        // 選択モード以外は処理しない
        if (state.currentMode !== 'select') return;

        // Ctrl/Cmdキーが押されている場合はズーム操作なので処理しない
        if (e.ctrlKey || e.metaKey) return;

        // DrawingSelectモジュールがない場合は処理しない
        if (!DrawingSelect) return;

        // 見開きモード時はページローカル座標に変換
        const pos = getPosForSpread(e);

        // アノテーション上でのホイール操作を処理
        if (DrawingSelect.handleAnnotationWheelResize(e, pos)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /**
     * イベントリスナーのセットアップ
     */
    function setupEventListeners() {
        // 匿名関数を参照として保存（cleanup用）
        boundMouseoutHandler = (e) => { if (state.interactionState === 1) stopDrawing(e); };
        boundDblclickHandler = (e) => {
            if (state.currentMode === 'polyline' && state.interactionState === 3) {
                e.preventDefault();
                finalizePolyline();
            }
        };
        boundKeydownHandler = (e) => {
            // モーダルが開いている場合やテキスト入力中は削除しない
            const isInputActive = Utils && Utils.isInputElement
                ? Utils.isInputElement(document.activeElement)
                : (document.activeElement && (
                    document.activeElement.tagName === 'INPUT' ||
                    document.activeElement.tagName === 'TEXTAREA' ||
                    document.activeElement.isContentEditable
                ));

            const isModalOpen = Utils && Utils.isModalOpen
                ? Utils.isModalOpen()
                : document.querySelector('.modal[style*="display: flex"]') !== null;

            if (isInputActive || isModalOpen) {
                return; // テキスト入力中またはモーダル表示中は何もしない
            }

            if (state.currentMode === 'select' && DrawingSelect) {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (DrawingSelect.hasSelection()) {
                        e.preventDefault();
                        DrawingSelect.deleteSelected();
                    }
                }
            }

            // 折れ線モードでのキー操作
            if (state.currentMode === 'polyline' && state.interactionState === 3) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelPolyline();
                } else if (e.key === 'Enter') {
                    // Enterキーで確定
                    e.preventDefault();
                    finalizePolyline();
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                    // DeleteまたはBackspaceキーで最後の頂点を削除
                    e.preventDefault();
                    undoLastPolylinePoint();
                }
            }
        };

        mojiqCanvas.addEventListener('mousedown', startDrawing);
        mojiqCanvas.addEventListener('mousemove', draw);
        mojiqCanvas.addEventListener('mouseup', stopDrawing);
        mojiqCanvas.addEventListener('mouseout', boundMouseoutHandler);
        mojiqCanvas.addEventListener('touchstart', startDrawing, { passive: false });
        mojiqCanvas.addEventListener('touchmove', draw, { passive: false });
        mojiqCanvas.addEventListener('touchend', stopDrawing, { passive: false });

        // マウスホイールイベント：選択モード時にアノテーションの文字サイズ変更
        mojiqCanvas.addEventListener('wheel', handleWheelEvent, { passive: false });

        // 折れ線のダブルクリック確定
        mojiqCanvas.addEventListener('dblclick', boundDblclickHandler);

        // キーボードイベント（Deleteキーで選択オブジェクト削除）
        document.addEventListener('keydown', boundKeydownHandler);
    }

    /**
     * イベントリスナーをクリーンアップ
     */
    function cleanup() {
        if (mojiqCanvas) {
            mojiqCanvas.removeEventListener('mousedown', startDrawing);
            mojiqCanvas.removeEventListener('mousemove', draw);
            mojiqCanvas.removeEventListener('mouseup', stopDrawing);
            mojiqCanvas.removeEventListener('mouseout', boundMouseoutHandler);
            mojiqCanvas.removeEventListener('touchstart', startDrawing);
            mojiqCanvas.removeEventListener('touchmove', draw);
            mojiqCanvas.removeEventListener('touchend', stopDrawing);
            mojiqCanvas.removeEventListener('wheel', handleWheelEvent);
            mojiqCanvas.removeEventListener('dblclick', boundDblclickHandler);
        }
        if (boundKeydownHandler) {
            document.removeEventListener('keydown', boundKeydownHandler);
        }

        // 参照をクリア
        boundMouseoutHandler = null;
        boundDblclickHandler = null;
        boundKeydownHandler = null;
    }

    /**
     * スナップショットを取得
     */
    function getSnapshot() {
        return snapshot;
    }

    /**
     * スナップショットを復元
     */
    function restoreSnapshot() {
        if (snapshot) {
            ctx.putImageData(snapshot, 0, 0);
        }
    }

    /**
     * ページ変更時の処理
     */
    function onPageChange(pageNum) {
        if (DrawingObjects) {
            DrawingObjects.setCurrentPage(pageNum);
        }
        if (DrawingSelect) {
            DrawingSelect.setCurrentPage(pageNum);
        }
        redrawCanvas();
    }

    /**
     * Undo
     */
    function undo() {
        if (DrawingObjects && DrawingObjects.canUndo(getCurrentPage())) {
            DrawingObjects.undo(getCurrentPage());
            redrawCanvas();
            return true;
        }
        return false;
    }

    /**
     * Redo
     */
    function redo() {
        if (DrawingObjects && DrawingObjects.canRedo(getCurrentPage())) {
            DrawingObjects.redo(getCurrentPage());
            redrawCanvas();
            return true;
        }
        return false;
    }

    /**
     * 選択中のオブジェクトを削除
     */
    function deleteSelected() {
        if (DrawingSelect && DrawingSelect.hasSelection()) {
            DrawingSelect.deleteSelected();
            return true;
        }
        return false;
    }

    /**
     * 描画操作状態をリセット（タブ切り替え時などに呼び出す）
     */
    function resetDrawingState() {
        // 描画中の操作をキャンセル
        state.interactionState = 0;
        state.isPanning = false;
        state.isSpacePressed = false;
        state.isShiftPressed = false;
        currentStrokePoints = [];
        currentStrokePointsCanvas = [];  // キャンバス座標用配列もリセット
        snapshot = null;

        // 折れ線の状態もリセット
        polylinePoints = [];
        polylinePointsCanvas = [];  // キャンバス座標用配列もリセット
        polylineSnapshot = null;

        // ラベル付き枠線の状態もリセット
        labeledRectLeaderStart = null;
        labeledRectLeaderEnd = null;
        labeledRectLeaderStartCanvas = null;  // キャンバス座標用変数もリセット
        labeledRectLeaderEndCanvas = null;
        labeledRectSnapshot = null;

        // カーソルをリセット
        if (mojiqCanvas) {
            mojiqCanvas.classList.remove('cursor-grabbing', 'cursor-grab');
            if (state.currentMode === 'hand') {
                mojiqCanvas.style.cursor = 'grab';
            } else if (state.currentMode === 'text' || state.currentMode === 'select') {
                mojiqCanvas.style.cursor = 'default';
            } else {
                mojiqCanvas.style.cursor = 'crosshair';
            }
        }

        // 選択ツールの状態もリセット
        if (DrawingSelect) {
            DrawingSelect.resetState();
        }

        // オブジェクトの選択状態も解除（タブ切り替え時の不整合を防ぐ）
        if (DrawingObjects) {
            const pageNum = getCurrentPage();
            DrawingObjects.deselectObject(pageNum);
        }
    }

    /**
     * イベント発行によるredraw要求
     * 新しいコードでは直接redrawCanvas()を呼ぶ代わりにこれを使うことを推奨
     * @param {boolean} saveHistory - 履歴を保存するか
     */
    function requestRedraw(saveHistory = true) {
        if (window.MojiQEvents) {
            window.MojiQEvents.emit('mojiq:request-redraw', { saveHistory: saveHistory });
        } else {
            // フォールバック
            redrawCanvas(saveHistory);
        }
    }

    /**
     * 描画中のストロークを強制的に確定させる（PDF保存時などに呼び出す）
     * @returns {boolean} ストロークが確定されたかどうか
     */
    function finalizeCurrentStroke() {
        // 未確定のストロークがない場合は何もしない
        if (currentStrokePoints.length <= 1) {
            return false;
        }

        const style = getCurrentDrawingStyle();
        let finalized = false;

        // 現在のモードに応じてストロークを確定
        // interactionStateに関係なく、currentStrokePointsにデータがあれば確定する
        if (state.currentMode === 'draw') {
            // ペンストロークを確定
            saveObjectToPage({
                type: 'pen',
                points: [...currentStrokePoints],
                color: style.color,
                lineWidth: style.lineWidth
            });
            finalized = true;
        } else if (state.currentMode === 'marker') {
            // マーカーストロークを確定
            saveObjectToPage({
                type: 'marker',
                points: [...currentStrokePoints],
                color: style.color,
                lineWidth: style.lineWidth,
                opacity: 0.3,
                compositeOp: 'multiply'
            });
            finalized = true;
        } else if (state.currentMode === 'eraser') {
            // 消しゴムストロークを確定
            const eraserStroke = {
                points: [...currentStrokePoints],
                lineWidth: state.eraserSize
            };
            const eraserBounds = getEraserBounds(eraserStroke);
            const pageNum = getCurrentPage();
            const objects = DrawingObjects.getPageObjects(pageNum);
            const linkedObjectIds = [];

            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];
                if (obj.type === 'eraser') continue;
                const objBounds = DrawingRenderer.getBounds(obj);
                if (boundsIntersect(eraserBounds, objBounds)) {
                    linkedObjectIds.push(obj.id);
                }
            }

            saveObjectToPage({
                type: 'eraser',
                points: [...currentStrokePoints],
                lineWidth: state.eraserSize,
                linkedObjectIds: linkedObjectIds
            });
            finalized = true;

            if (simCtx) {
                simCtx.globalCompositeOperation = 'source-over';
            }
        }

        // 状態をリセット
        if (finalized) {
            state.interactionState = 0;
            currentStrokePoints = [];
            currentStrokePointsCanvas = [];
            redrawCanvas();
            if (saveHistoryCallback) saveHistoryCallback();
        }

        return finalized;
    }

    return {
        init,
        cleanup,  // メモリリーク対策: イベントリスナー解除
        getPos,
        getSnapshot,
        restoreSnapshot,
        redrawCanvas,
        requestRedraw,  // Phase 7で追加: イベント経由の再描画リクエスト
        onPageChange,
        undo,
        redo,
        deleteSelected,
        resetDrawingState,
        startPos: () => startPos,
        currentPos: () => currentPos,
        shapeEndPos: () => shapeEndPos,
        getLastAddedObjectId,
        addAnnotationToLastObject,
        getCurrentPage,
        saveObjectToPage,
        finalizeCurrentStroke  // PDF保存時に描画中のストロークを確定
    };
})();
