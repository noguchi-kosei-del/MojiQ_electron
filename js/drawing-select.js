/**
 * MojiQ Drawing Select - 選択ツールモジュール
 * オブジェクトの選択、移動、リサイズを担当
 */
window.MojiQDrawingSelect = (function() {
    'use strict';

    // 依存モジュール
    let DrawingObjects = null;
    let DrawingRenderer = null;

    // 状態変数
    let state = {
        isSelecting: false,
        isMoving: false,
        isResizing: false,
        isMovingAnnotation: false,  // アノテーション（コメント・指示）のみ移動中
        isMovingLeaderEnd: false,   // 引出線終端を移動中
        isMovingStampLeaderStart: false,  // 指示スタンプの引出線起点を移動中
        isMovingStampLeaderEnd: false,    // 指示スタンプの引出線終端を移動中
        isMovingFontLabelText: false,     // fontLabelのテキスト部分を移動中
        isResizingAnnotationFont: false,  // アノテーションの文字サイズ変更中
        isMarqueeSelecting: false,  // マーキー選択（ドラッグ範囲選択）中
        marqueeStartPos: null,      // マーキー選択の開始位置
        marqueeCurrentPos: null,    // マーキー選択の現在位置
        activeHandle: null,
        dragStartPos: null,
        dragStartPosCanvas: null,   // 見開きモード用：キャンバス座標での開始位置
        originalBounds: null,
        originalObject: null,
        originalObjects: null,  // 複数選択時の元オブジェクト群
        originalErasers: null,  // リンクされた消しゴムの元の状態
        currentPageNum: 1,
        ctx: null,
        canvas: null,
        wheelStartY: null,           // ホイール操作開始時のY座標
        accumulatedWheelDelta: 0     // 累積ホイールデルタ
    };

    // クリップボード（カット/コピー/ペースト用）
    let clipboard = {
        objects: [],       // コピー/カットされたオブジェクト
        isCut: false,      // カット操作かどうか
        sourcePageNum: null // コピー元のページ番号
    };

    // コールバック
    let redrawCallback = null;
    let editTextCallback = null;  // テキスト編集用コールバック
    let editAnnotationCallback = null;  // アノテーション編集用コールバック

    // ダブルクリック検出用
    let lastClickTime = 0;
    let lastClickPos = null;
    const DOUBLE_CLICK_THRESHOLD = 300; // ミリ秒
    const DOUBLE_CLICK_DISTANCE = 10;   // ピクセル

    /**
     * labeledRect用の引出線終端位置を計算
     * 枠線と引出線起点を結ぶ直線が枠線と交差する点を計算（マージン付き）
     * @param {object} obj - labeledRectオブジェクト
     * @param {object} leaderStart - 引出線の起点
     * @returns {object} 引出線終端位置 { x, y }
     */
    function getLabeledRectLeaderEndPos(obj, leaderStart) {
        // 正方形の範囲を計算
        const minX = Math.min(obj.startPos.x, obj.endPos.x);
        const minY = Math.min(obj.startPos.y, obj.endPos.y);
        const w = Math.abs(obj.endPos.x - obj.startPos.x);
        const h = Math.abs(obj.endPos.y - obj.startPos.y);
        const size = Math.min(w, h);

        // 枠線の中心
        const centerX = minX + size / 2;
        const centerY = minY + size / 2;

        // 引出線起点から枠線中心への方向ベクトル
        const dx = centerX - leaderStart.x;
        const dy = centerY - leaderStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1) {
            // 起点と中心がほぼ同じ位置の場合
            return { x: minX, y: minY };
        }

        // 正規化された方向ベクトル
        const nx = dx / dist;
        const ny = dy / dist;

        // 枠線の4辺との交点を計算し、最も近いものを選択
        const margin = 5;  // 枠線との間隔
        const candidates = [];

        // 左辺との交点
        if (nx !== 0) {
            const t = (minX - margin - leaderStart.x) / nx;
            if (t > 0) {
                const y = leaderStart.y + t * ny;
                if (y >= minY - margin && y <= minY + size + margin) {
                    candidates.push({ x: minX - margin, y: y, dist: t });
                }
            }
        }

        // 右辺との交点
        if (nx !== 0) {
            const t = (minX + size + margin - leaderStart.x) / nx;
            if (t > 0) {
                const y = leaderStart.y + t * ny;
                if (y >= minY - margin && y <= minY + size + margin) {
                    candidates.push({ x: minX + size + margin, y: y, dist: t });
                }
            }
        }

        // 上辺との交点
        if (ny !== 0) {
            const t = (minY - margin - leaderStart.y) / ny;
            if (t > 0) {
                const x = leaderStart.x + t * nx;
                if (x >= minX - margin && x <= minX + size + margin) {
                    candidates.push({ x: x, y: minY - margin, dist: t });
                }
            }
        }

        // 下辺との交点
        if (ny !== 0) {
            const t = (minY + size + margin - leaderStart.y) / ny;
            if (t > 0) {
                const x = leaderStart.x + t * nx;
                if (x >= minX - margin && x <= minX + size + margin) {
                    candidates.push({ x: x, y: minY + size + margin, dist: t });
                }
            }
        }

        // 最も近い交点を選択
        if (candidates.length > 0) {
            candidates.sort((a, b) => a.dist - b.dist);
            return { x: candidates[0].x, y: candidates[0].y };
        }

        // フォールバック: 枠線の左上
        return { x: minX - margin, y: minY - margin };
    }

    /**
     * 初期化
     */
    function init(ctx, canvas, pageNum, callbacks) {
        DrawingObjects = window.MojiQDrawingObjects;
        DrawingRenderer = window.MojiQDrawingRenderer;

        state.ctx = ctx;
        state.canvas = canvas;
        state.currentPageNum = pageNum;

        if (callbacks) {
            redrawCallback = callbacks.redraw;
            editTextCallback = callbacks.editText;  // テキスト編集コールバック
            editAnnotationCallback = callbacks.editAnnotation;  // アノテーション編集コールバック
        }
    }

    /**
     * ページ番号を設定
     */
    function setCurrentPage(pageNum) {
        state.currentPageNum = pageNum;
    }

    /**
     * ダブルクリックかどうかを判定
     */
    function isDoubleClick(pos) {
        const now = Date.now();
        const timeDiff = now - lastClickTime;

        if (lastClickPos && timeDiff < DOUBLE_CLICK_THRESHOLD) {
            const dx = pos.x - lastClickPos.x;
            const dy = pos.y - lastClickPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < DOUBLE_CLICK_DISTANCE) {
                // ダブルクリックとして判定、状態をリセット
                lastClickTime = 0;
                lastClickPos = null;
                return true;
            }
        }

        // クリック情報を更新
        lastClickTime = now;
        lastClickPos = { ...pos };
        return false;
    }

    /**
     * 選択開始（マウスダウン）
     * @param {object} pos - クリック位置（ページローカル座標）
     * @param {boolean} shiftKey - Shiftキーが押されているか
     * @param {object} canvasPos - キャンバス座標（見開きモード用、省略可能）
     */
    function startSelect(pos, shiftKey, canvasPos) {
        if (!DrawingObjects || !DrawingRenderer) return false;

        // マウスダウン時にアノテーション文字サイズ変更を終了
        endAnnotationFontResize();

        const pageNum = state.currentPageNum;
        const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
        const selectedIndices = DrawingObjects.getSelectedIndices(pageNum);
        const doubleClicked = isDoubleClick(pos);
        const isMultiSelect = shiftKey === true;

        // 既に選択中のオブジェクトがある場合（単一選択モードでの操作）
        if (!isMultiSelect && selectedIndex !== null && selectedIndex >= 0) {
            const selectedObj = DrawingObjects.getSelectedObject(pageNum);
            const bounds = DrawingRenderer.getBounds(selectedObj);

            // ダブルクリックでテキストオブジェクトの場合は編集モードへ
            if (doubleClicked && selectedObj.type === 'text' && DrawingRenderer.hitTest(pos, selectedObj, 10)) {
                if (editTextCallback) {
                    editTextCallback(selectedObj, selectedIndex, pageNum);
                }
                return true;
            }

            // ダブルクリックでアノテーション（コメント・指示）部分の場合は編集モードへ
            if (doubleClicked && selectedObj.annotation && DrawingRenderer.hitTestAnnotation(pos, selectedObj, 10)) {
                if (editAnnotationCallback) {
                    editAnnotationCallback(selectedObj, selectedIndex, pageNum);
                }
                return true;
            }

            // 削除ボタンのヒットテスト（最優先）
            if (DrawingRenderer.hitTestDeleteButton && DrawingRenderer.hitTestDeleteButton(pos, selectedObj)) {
                // オブジェクトを削除
                DrawingObjects.removeObject(pageNum, selectedIndex);
                if (redrawCallback) redrawCallback();
                if (saveHistoryCallback) saveHistoryCallback();
                return true;
            }

            // 複数選択されていない場合のみハンドルとリサイズを有効化
            if (selectedIndices.length <= 1) {
                // 引出線終端ハンドルのヒットテスト（リサイズハンドルより優先）
                if (selectedObj.annotation && DrawingRenderer.hitTestLeaderEndHandle(pos, selectedObj)) {
                    // 引出線終端の移動開始
                    state.isMovingLeaderEnd = true;
                    state.dragStartPos = { ...pos };
                    state.dragStartPosCanvas = canvasPos ? { ...canvasPos } : { ...pos };
                    state.originalObject = MojiQClone.deep(selectedObj);
                    return true;
                }

                // 指示スタンプの引出線起点ハンドルのヒットテスト
                if (selectedObj.leaderLine && DrawingRenderer.hitTestStampLeaderStartHandle) {
                    if (DrawingRenderer.hitTestStampLeaderStartHandle(pos, selectedObj)) {
                        // 引出線起点の移動開始
                        state.isMovingStampLeaderStart = true;
                        state.dragStartPos = { ...pos };
                        state.dragStartPosCanvas = canvasPos ? { ...canvasPos } : { ...pos };
                        state.originalObject = MojiQClone.deep(selectedObj);
                        return true;
                    }
                }

                // 指示スタンプの引出線終端ハンドルのヒットテスト
                if (selectedObj.leaderLine && DrawingRenderer.hitTestStampLeaderEndHandle) {
                    if (DrawingRenderer.hitTestStampLeaderEndHandle(pos, selectedObj)) {
                        // 引出線終端の移動開始
                        state.isMovingStampLeaderEnd = true;
                        state.dragStartPos = { ...pos };
                        state.dragStartPosCanvas = canvasPos ? { ...canvasPos } : { ...pos };
                        state.originalObject = MojiQClone.deep(selectedObj);
                        return true;
                    }
                }

                // 回転ハンドルのヒットテスト（画像オブジェクトのみ回転可能）
                if (selectedObj.type === 'image' && DrawingRenderer.hitTestRotationHandle) {
                    const rotation = selectedObj.rotation || 0;
                    const shapeBounds = DrawingRenderer.getShapeBoundsOnly ? DrawingRenderer.getShapeBoundsOnly(selectedObj) : bounds;
                    if (DrawingRenderer.hitTestRotationHandle(pos, shapeBounds, rotation)) {
                        // 回転開始
                        state.isRotating = true;
                        state.dragStartPos = { ...pos };
                        state.dragStartPosCanvas = canvasPos ? { ...canvasPos } : { ...pos };
                        state.originalObject = MojiQClone.deep(selectedObj);
                        state.originalBounds = { ...shapeBounds };
                        state.rotationCenter = {
                            x: shapeBounds.x + shapeBounds.width / 2,
                            y: shapeBounds.y + shapeBounds.height / 2
                        };
                        state.rotationStartAngle = Math.atan2(
                            pos.y - state.rotationCenter.y,
                            pos.x - state.rotationCenter.x
                        );
                        state.originalRotation = rotation;
                        return true;
                    }
                }

                // ハンドルのヒットテスト（図形のみのバウンディングボックスを使用）
                const rotation = selectedObj.rotation || 0;
                const shapeBoundsForHandle = DrawingRenderer.getShapeBoundsOnly ? DrawingRenderer.getShapeBoundsOnly(selectedObj) : bounds;
                const handle = DrawingRenderer.hitTestHandle(pos, shapeBoundsForHandle, rotation);
                if (handle) {
                    // リサイズ開始
                    state.isResizing = true;
                    state.activeHandle = handle;
                    state.dragStartPos = { ...pos };
                    state.dragStartPosCanvas = canvasPos ? { ...canvasPos } : { ...pos };
                    state.originalBounds = { ...shapeBoundsForHandle };
                    state.originalObject = MojiQClone.deep(selectedObj);
                    return true;
                }
            }

            // fontLabelのテキスト部分のヒットテスト（テキストのみ移動）
            if (selectedObj.type === 'fontLabel' && DrawingRenderer.hitTestFontLabelText &&
                DrawingRenderer.hitTestFontLabelText(pos, selectedObj, 10)) {
                // fontLabelのテキスト部分のみ移動開始
                state.isMovingFontLabelText = true;
                state.dragStartPos = { ...pos };
                state.dragStartPosCanvas = canvasPos ? { ...canvasPos } : { ...pos };
                state.originalObject = MojiQClone.deep(selectedObj);
                return true;
            }

            // アノテーション部分のヒットテスト（コメント・指示のみ移動）
            if (selectedObj.annotation && DrawingRenderer.hitTestAnnotation(pos, selectedObj, 10)) {
                // アノテーションのみ移動開始
                state.isMovingAnnotation = true;
                state.dragStartPos = { ...pos };
                state.dragStartPosCanvas = canvasPos ? { ...canvasPos } : { ...pos };
                state.originalObject = MojiQClone.deep(selectedObj);
                return true;
            }

            // オブジェクト内のヒットテスト（アノテーション以外の部分）
            if (DrawingRenderer.hitTest(pos, selectedObj, 10)) {
                // 移動開始
                state.isMoving = true;
                state.dragStartPos = { ...pos };
                state.dragStartPosCanvas = canvasPos ? { ...canvasPos } : { ...pos };
                state.originalObject = MojiQClone.deep(selectedObj);
                // 複数選択時は全オブジェクトの元の状態を保存
                if (selectedIndices.length > 1) {
                    state.originalObjects = {};
                    const objects = DrawingObjects.getPageObjects(pageNum);
                    for (const idx of selectedIndices) {
                        state.originalObjects[idx] = MojiQClone.deep(objects[idx]);
                    }
                }
                return true;
            }
        }

        // 複数選択されているオブジェクトのいずれかをクリックした場合（移動開始）
        if (!isMultiSelect && selectedIndices.length > 1) {
            const objects = DrawingObjects.getPageObjects(pageNum);

            // 複数選択時の削除ボタンのヒットテスト
            if (DrawingRenderer.hitTestMultiSelectDeleteButton &&
                DrawingRenderer.hitTestMultiSelectDeleteButton(pos, objects, selectedIndices)) {
                // 選択されたオブジェクトのIDを先に取得（インデックスは削除ごとに変わるため）
                const idsToDelete = selectedIndices.map(idx => objects[idx]?.id).filter(id => id != null);
                // IDで削除（削除順序は関係なくなる）
                for (const id of idsToDelete) {
                    DrawingObjects.removeObjectById(pageNum, id);
                }
                // 選択状態をクリア
                DrawingObjects.deselectObject(pageNum);
                if (redrawCallback) redrawCallback();
                if (saveHistoryCallback) saveHistoryCallback();
                return true;
            }

            for (const idx of selectedIndices) {
                if (DrawingRenderer.hitTest(pos, objects[idx], 10)) {
                    // 移動開始
                    state.isMoving = true;
                    state.dragStartPos = { ...pos };
                    state.dragStartPosCanvas = canvasPos ? { ...canvasPos } : { ...pos };
                    // 全オブジェクトの元の状態を保存
                    state.originalObjects = {};
                    for (const i of selectedIndices) {
                        state.originalObjects[i] = MojiQClone.deep(objects[i]);
                    }
                    return true;
                }
            }
        }

        // 新しいオブジェクトの選択
        const hitIndex = DrawingRenderer.hitTestAll(pos, pageNum, 10);

        if (hitIndex >= 0) {
            const hitObj = DrawingObjects.getPageObjects(pageNum)[hitIndex];

            // ダブルクリックでテキストオブジェクトの場合は選択と編集を同時に行う
            if (doubleClicked && hitObj.type === 'text') {
                DrawingObjects.selectObject(pageNum, hitIndex);
                if (redrawCallback) redrawCallback(false);
                if (editTextCallback) {
                    editTextCallback(hitObj, hitIndex, pageNum);
                }
                return true;
            }

            // ダブルクリックでアノテーション（コメント・指示）部分の場合は選択と編集を同時に行う
            if (doubleClicked && hitObj.annotation && DrawingRenderer.hitTestAnnotation(pos, hitObj, 10)) {
                DrawingObjects.selectObject(pageNum, hitIndex);
                if (redrawCallback) redrawCallback(false);
                if (editAnnotationCallback) {
                    editAnnotationCallback(hitObj, hitIndex, pageNum);
                }
                return true;
            }

            // Shift+クリックで複数選択
            if (isMultiSelect) {
                // 既に選択されている場合はトグル（選択解除）
                if (DrawingObjects.isSelected(pageNum, hitIndex)) {
                    DrawingObjects.removeFromSelection(pageNum, hitIndex);
                } else {
                    // 選択に追加
                    DrawingObjects.addToSelection(pageNum, hitIndex);
                }
                // 複数選択時は移動しない（選択のみ）
                if (redrawCallback) redrawCallback(false);
                return true;
            }

            // 通常クリックで単一選択
            DrawingObjects.selectObject(pageNum, hitIndex);

            // アノテーション部分をクリックした場合はアノテーションのみ移動
            if (hitObj.annotation && DrawingRenderer.hitTestAnnotation(pos, hitObj, 10)) {
                state.isMovingAnnotation = true;
            } else {
                state.isMoving = true;
            }
            state.dragStartPos = { ...pos };
                    state.dragStartPosCanvas = canvasPos ? { ...canvasPos } : { ...pos };
            state.originalObject = MojiQClone.deep(
                DrawingObjects.getSelectedObject(pageNum)
            );

            // 選択時は履歴を保存しない（選択ハンドルが含まれるため）
            if (redrawCallback) redrawCallback(false);
            return true;
        }

        // 選択解除（Shiftキーを押していない場合のみ）
        if (!isMultiSelect && selectedIndices.length > 0) {
            DrawingObjects.deselectObject(pageNum);
            // 選択解除時は履歴を保存しない
            if (redrawCallback) redrawCallback(false);
        }

        // 空白領域をクリックした場合、マーキー選択を開始
        state.isMarqueeSelecting = true;
        state.marqueeStartPos = { ...pos };
        state.marqueeCurrentPos = { ...pos };
        state.dragStartPosCanvas = canvasPos ? { ...canvasPos } : { ...pos };

        return true;  // マーキー選択開始を示すためtrueを返す
    }

    /**
     * 選択中の移動（マウスムーブ）
     */
    function moveSelect(pos) {
        if (!DrawingObjects || !DrawingRenderer) return false;

        const pageNum = state.currentPageNum;

        // マーキー選択中
        if (state.isMarqueeSelecting && state.marqueeStartPos) {
            state.marqueeCurrentPos = { ...pos };
            // 再描画をリクエスト（マーキー矩形のプレビュー描画のため）
            if (redrawCallback) redrawCallback(false);
            return true;
        }

        if (state.isResizing && state.activeHandle) {
            // リサイズ処理
            resizeObject(pos);
            return true;
        }

        // 引出線終端の移動
        if (state.isMovingLeaderEnd && state.dragStartPos) {
            // 見開きモード時は移動量ベースで処理
            const PdfManager = window.MojiQPdfManager;
            const isSpreadMode = PdfManager && PdfManager.isSpreadViewMode();
            const startPos = (isSpreadMode && state.dragStartPosCanvas) ? state.dragStartPosCanvas : state.dragStartPos;
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;

            const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
            if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                applyMoveLeaderEndByDelta(selectedIndex, dx, dy);
                if (redrawCallback) redrawCallback(false);
            }
            return true;
        }

        // 指示スタンプの引出線起点の移動
        if (state.isMovingStampLeaderStart && state.dragStartPos) {
            // 見開きモード時は移動量ベースで処理
            const PdfManager = window.MojiQPdfManager;
            const isSpreadMode = PdfManager && PdfManager.isSpreadViewMode();
            const startPos = (isSpreadMode && state.dragStartPosCanvas) ? state.dragStartPosCanvas : state.dragStartPos;
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;

            const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
            if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                applyMoveStampLeaderStartByDelta(selectedIndex, dx, dy);
                if (redrawCallback) redrawCallback(false);
            }
            return true;
        }

        // 指示スタンプの引出線終端の移動
        if (state.isMovingStampLeaderEnd && state.dragStartPos) {
            // 見開きモード時は移動量ベースで処理
            const PdfManager = window.MojiQPdfManager;
            const isSpreadMode = PdfManager && PdfManager.isSpreadViewMode();
            const startPos = (isSpreadMode && state.dragStartPosCanvas) ? state.dragStartPosCanvas : state.dragStartPos;
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;

            const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
            if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                applyMoveStampLeaderEndByDelta(selectedIndex, dx, dy);
                if (redrawCallback) redrawCallback(false);
            }
            return true;
        }

        // アノテーション（コメント・指示）のみ移動
        if (state.isMovingAnnotation && state.dragStartPos) {
            // 見開きモード時はキャンバス座標で移動量を計算
            const PdfManager = window.MojiQPdfManager;
            const isSpreadMode = PdfManager && PdfManager.isSpreadViewMode();
            const startPos = (isSpreadMode && state.dragStartPosCanvas) ? state.dragStartPosCanvas : state.dragStartPos;
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;

            const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
            if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                applyMoveAnnotationOnly(selectedIndex, dx, dy);
                if (redrawCallback) redrawCallback(false);
            }
            return true;
        }

        // fontLabelのテキスト部分のみ移動
        if (state.isMovingFontLabelText && state.dragStartPos) {
            // 見開きモード時はキャンバス座標で移動量を計算
            const PdfManager = window.MojiQPdfManager;
            const isSpreadMode = PdfManager && PdfManager.isSpreadViewMode();
            const startPos = (isSpreadMode && state.dragStartPosCanvas) ? state.dragStartPosCanvas : state.dragStartPos;
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;

            const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
            if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                applyMoveFontLabelText(selectedIndex, dx, dy);
                if (redrawCallback) redrawCallback(false);
            }
            return true;
        }

        // 回転操作
        if (state.isRotating && state.rotationCenter) {
            const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
            if (selectedIndex !== null && selectedIndex >= 0) {
                // 現在の角度を計算（中心からマウス位置への角度）
                const currentAngle = Math.atan2(
                    pos.y - state.rotationCenter.y,
                    pos.x - state.rotationCenter.x
                );
                // 角度の差分を計算
                let deltaAngle = currentAngle - state.rotationStartAngle;
                // 新しい回転角度
                let newRotation = (state.originalRotation || 0) + deltaAngle;

                // Shiftキーが押されている場合は15度スナップ
                if (window.MojiQStore && window.MojiQStore.get('keyboard.shiftKey')) {
                    const snapAngle = Math.PI / 12; // 15度
                    newRotation = Math.round(newRotation / snapAngle) * snapAngle;
                }

                // オブジェクトの回転を更新
                applyRotation(selectedIndex, newRotation);
                if (redrawCallback) redrawCallback(false);
            }
            return true;
        }

        if (state.isMoving && state.dragStartPos) {
            // 移動処理
            // 見開きモード時はキャンバス座標で移動量を計算
            const PdfManager = window.MojiQPdfManager;
            const isSpreadMode = PdfManager && PdfManager.isSpreadViewMode();
            const startPos = (isSpreadMode && state.dragStartPosCanvas) ? state.dragStartPosCanvas : state.dragStartPos;
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;

            const selectedIndices = DrawingObjects.getSelectedIndices(pageNum);

            // 複数選択時
            if (selectedIndices.length > 1 && state.originalObjects) {
                for (const idx of selectedIndices) {
                    applyMoveMulti(idx, dx, dy, state.originalObjects[idx]);
                }
                if (redrawCallback) redrawCallback(false);
            }
            // 単一選択時
            else {
                const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
                if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                    // 元の位置からの差分で移動
                    applyMove(selectedIndex, dx, dy);
                    // 移動中は履歴を保存しない（選択ハンドルが含まれるため）
                    if (redrawCallback) redrawCallback(false);
                }
            }
            return true;
        }

        // カーソルの更新
        updateCursor(pos);
        return false;
    }

    /**
     * 選択終了（マウスアップ）
     * @param {object} pos - マウス位置（見開きモード時はキャンバス座標）
     * @param {object} canvasPos - キャンバス座標（見開きモード用、省略可能）
     */
    function endSelect(pos, canvasPos) {
        if (!DrawingObjects) return;

        const pageNum = state.currentPageNum;

        // マーキー選択の完了処理
        if (state.isMarqueeSelecting && state.marqueeStartPos) {
            const startPos = state.marqueeStartPos;
            const endPos = state.marqueeCurrentPos || pos;

            // マーキー矩形の範囲を計算
            const minX = Math.min(startPos.x, endPos.x);
            const maxX = Math.max(startPos.x, endPos.x);
            const minY = Math.min(startPos.y, endPos.y);
            const maxY = Math.max(startPos.y, endPos.y);

            // ドラッグ距離が小さい場合はマーキー選択をキャンセル
            const dragDistance = Math.sqrt(
                Math.pow(endPos.x - startPos.x, 2) + Math.pow(endPos.y - startPos.y, 2)
            );

            if (dragDistance > 5) {
                // マーキー矩形と交差するオブジェクトを検索
                const objects = DrawingObjects.getPageObjects(pageNum);
                const selectedIndices = [];

                for (let i = 0; i < objects.length; i++) {
                    const obj = objects[i];
                    const bounds = DrawingRenderer.getBounds(obj);

                    // バウンディングボックスがマーキー矩形と交差するかチェック
                    if (bounds &&
                        bounds.x + bounds.width >= minX &&
                        bounds.x <= maxX &&
                        bounds.y + bounds.height >= minY &&
                        bounds.y <= maxY) {
                        selectedIndices.push(i);
                    }
                }

                // 選択されたオブジェクトがある場合
                if (selectedIndices.length > 0) {
                    // 最初のオブジェクトを選択
                    DrawingObjects.selectObject(pageNum, selectedIndices[0]);
                    // 残りのオブジェクトを追加選択
                    for (let i = 1; i < selectedIndices.length; i++) {
                        DrawingObjects.addToSelection(pageNum, selectedIndices[i]);
                    }
                }
            }

            // マーキー選択状態をリセット
            state.isMarqueeSelecting = false;
            state.marqueeStartPos = null;
            state.marqueeCurrentPos = null;

            if (redrawCallback) redrawCallback(false);
            return;
        }

        // 引出線終端移動の完了処理
        if (state.isMovingLeaderEnd && state.dragStartPos) {
            const dx = pos.x - state.dragStartPos.x;
            const dy = pos.y - state.dragStartPos.y;
            const hasMoved = Math.abs(dx) > 1 || Math.abs(dy) > 1;

            if (hasMoved) {
                const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
                if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                    const currentObj = DrawingObjects.getSelectedObject(pageNum);
                    DrawingObjects.saveUndoState(pageNum, 'update', {
                        old: state.originalObject,
                        new: MojiQClone.deep(currentObj)
                    });
                }
            }
        }

        // アノテーション移動の完了処理
        if (state.isMovingAnnotation && state.dragStartPos) {
            // 見開きモード時はキャンバス座標で移動量を計算
            const PdfManager = window.MojiQPdfManager;
            const isSpreadMode = PdfManager && PdfManager.isSpreadViewMode();
            const startPos = (isSpreadMode && state.dragStartPosCanvas) ? state.dragStartPosCanvas : state.dragStartPos;
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;
            const hasMoved = Math.abs(dx) > 1 || Math.abs(dy) > 1;

            if (hasMoved) {
                const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
                if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                    const currentObj = DrawingObjects.getSelectedObject(pageNum);
                    DrawingObjects.saveUndoState(pageNum, 'update', {
                        old: state.originalObject,
                        new: MojiQClone.deep(currentObj)
                    });
                }
            }
        }

        // fontLabelのテキスト移動の完了処理
        if (state.isMovingFontLabelText && state.dragStartPos) {
            // 見開きモード時はキャンバス座標で移動量を計算
            const PdfManager = window.MojiQPdfManager;
            const isSpreadMode = PdfManager && PdfManager.isSpreadViewMode();
            const startPos = (isSpreadMode && state.dragStartPosCanvas) ? state.dragStartPosCanvas : state.dragStartPos;
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;
            const hasMoved = Math.abs(dx) > 1 || Math.abs(dy) > 1;

            if (hasMoved) {
                const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
                if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                    const currentObj = DrawingObjects.getSelectedObject(pageNum);
                    DrawingObjects.saveUndoState(pageNum, 'update', {
                        old: state.originalObject,
                        new: MojiQClone.deep(currentObj)
                    });
                }
            }
        }

        // 指示スタンプの引出線起点移動の完了処理
        if (state.isMovingStampLeaderStart && state.dragStartPos) {
            const dx = pos.x - state.dragStartPos.x;
            const dy = pos.y - state.dragStartPos.y;
            const hasMoved = Math.abs(dx) > 1 || Math.abs(dy) > 1;

            if (hasMoved) {
                const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
                if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                    const currentObj = DrawingObjects.getSelectedObject(pageNum);
                    DrawingObjects.saveUndoState(pageNum, 'update', {
                        old: state.originalObject,
                        new: MojiQClone.deep(currentObj)
                    });
                }
            }
        }

        // 指示スタンプの引出線終端移動の完了処理
        if (state.isMovingStampLeaderEnd && state.dragStartPos) {
            const dx = pos.x - state.dragStartPos.x;
            const dy = pos.y - state.dragStartPos.y;
            const hasMoved = Math.abs(dx) > 1 || Math.abs(dy) > 1;

            if (hasMoved) {
                const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
                if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                    const currentObj = DrawingObjects.getSelectedObject(pageNum);
                    DrawingObjects.saveUndoState(pageNum, 'update', {
                        old: state.originalObject,
                        new: MojiQClone.deep(currentObj)
                    });
                }
            }
        }

        // 回転操作の完了処理
        if (state.isRotating && state.rotationCenter) {
            const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
            if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                const currentObj = DrawingObjects.getSelectedObject(pageNum);
                // 回転角度が変わった場合のみUndo状態を保存
                const originalRotation = state.originalRotation || 0;
                const currentRotation = currentObj.rotation || 0;
                if (Math.abs(currentRotation - originalRotation) > 0.001) {
                    DrawingObjects.saveUndoState(pageNum, 'update', {
                        old: state.originalObject,
                        new: MojiQClone.deep(currentObj)
                    });
                }
            }
        }

        if ((state.isMoving || state.isResizing) && state.dragStartPos) {
            // 実際に移動/リサイズがあったかチェック
            // 見開きモード時はキャンバス座標で移動量を計算
            const PdfManager = window.MojiQPdfManager;
            const isSpreadMode = PdfManager && PdfManager.isSpreadViewMode();
            const startPos = (isSpreadMode && state.dragStartPosCanvas) ? state.dragStartPosCanvas : state.dragStartPos;
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;
            const hasMoved = Math.abs(dx) > 1 || Math.abs(dy) > 1;

            if (hasMoved) {
                const selectedIndices = DrawingObjects.getSelectedIndices(pageNum);
                const objects = DrawingObjects.getPageObjects(pageNum);

                // 複数選択時
                if (selectedIndices.length > 1 && state.originalObjects) {
                    for (const idx of selectedIndices) {
                        if (state.originalObjects[idx]) {
                            DrawingObjects.saveUndoState(pageNum, 'update', {
                                old: state.originalObjects[idx],
                                new: MojiQClone.deep(objects[idx])
                            });
                        }
                    }
                }
                // 単一選択時
                else {
                    const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);
                    if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
                        const currentObj = DrawingObjects.getSelectedObject(pageNum);
                        DrawingObjects.saveUndoState(pageNum, 'update', {
                            old: state.originalObject,
                            new: MojiQClone.deep(currentObj)
                        });
                    }
                }

                // 見開きモードでは見開き全体を1ページとして扱うため、ページ跨ぎ処理は不要
            }
        }

        // 状態リセット
        state.isSelecting = false;
        state.isMoving = false;
        state.isResizing = false;
        state.isRotating = false;          // 回転状態もリセット
        state.isMovingAnnotation = false;  // アノテーション移動状態もリセット
        state.isMovingLeaderEnd = false;   // 引出線終端移動状態もリセット
        state.isMovingStampLeaderStart = false;  // 指示スタンプ引出線起点移動状態もリセット
        state.isMovingStampLeaderEnd = false;    // 指示スタンプ引出線終端移動状態もリセット
        state.isMovingFontLabelText = false;     // fontLabelテキスト移動状態もリセット
        state.isResizingAnnotationFont = false;  // アノテーション文字サイズ変更状態もリセット
        state.isMarqueeSelecting = false;  // マーキー選択状態もリセット
        state.marqueeStartPos = null;
        state.marqueeCurrentPos = null;
        state.activeHandle = null;
        state.dragStartPos = null;
        state.dragStartPosCanvas = null;   // 見開きモード用キャンバス座標もリセット
        state.originalBounds = null;
        state.originalObject = null;
        state.originalObjects = null;  // 複数選択時の元オブジェクト群もリセット
        state.originalErasers = null;  // リンクされた消しゴムの元の状態もリセット
        state.rotationCenter = null;       // 回転中心をリセット
        state.rotationStartAngle = null;   // 回転開始角度をリセット
        state.originalRotation = null;     // 元の回転角度をリセット
        state.wheelStartY = null;          // ホイール開始位置をリセット
        state.accumulatedWheelDelta = 0;   // 累積ホイールデルタをリセット

        if (state.canvas) {
            state.canvas.style.cursor = 'move';
        }
    }

    // 指示スタンプの種類リスト
    const INSTRUCTION_STAMP_TYPES = [
        'toruStamp', 'torutsumeStamp', 'torumamaStamp',
        'zenkakuakiStamp', 'nibunakiStamp', 'shibunakiStamp', 'kaigyouStamp'
    ];

    /**
     * テキスト関連オブジェクトのホイールによるサイズ変更対象かどうかを判定
     * @param {object} obj - オブジェクト
     * @param {{x: number, y: number}} pos - カーソル位置
     * @returns {string|null} 対象の種類（'annotation', 'text', 'fontLabel', 'instructionStamp'）またはnull
     */
    function getTextResizeTarget(obj, pos) {
        if (!obj) return null;

        // アノテーション（コメント・指示）
        if (obj.annotation && DrawingRenderer.hitTestAnnotation(pos, obj, 10)) {
            return 'annotation';
        }

        // テキストオブジェクト
        if (obj.type === 'text' && DrawingRenderer.hitTest(pos, obj, 10)) {
            return 'text';
        }

        // fontLabel（フォント指定枠線）のテキスト部分
        if (obj.type === 'fontLabel' && DrawingRenderer.hitTestFontLabelText &&
            DrawingRenderer.hitTestFontLabelText(pos, obj, 10)) {
            return 'fontLabel';
        }

        // 指示スタンプ（トル、トルツメ、トルママ、全角アキ、二分アキ、四分アキ、改行）
        if (INSTRUCTION_STAMP_TYPES.includes(obj.type) && DrawingRenderer.hitTest(pos, obj, 10)) {
            return 'instructionStamp';
        }

        return null;
    }

    /**
     * テキスト関連オブジェクト上でのホイールイベント処理
     * テキスト上でホイール操作すると文字サイズを変更
     * @param {WheelEvent} e - ホイールイベント
     * @param {{x: number, y: number}} pos - キャンバス上の座標
     * @returns {boolean} イベントを処理したかどうか
     */
    function handleAnnotationWheelResize(e, pos) {
        if (!DrawingObjects || !DrawingRenderer) return false;

        const pageNum = state.currentPageNum;
        const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);

        // 選択中のオブジェクトがない場合は処理しない
        if (selectedIndex === null || selectedIndex < 0) return false;

        const selectedObj = DrawingObjects.getSelectedObject(pageNum);
        if (!selectedObj) return false;

        // 対象の種類を判定
        const targetType = getTextResizeTarget(selectedObj, pos);
        if (!targetType) return false;

        // ホイールドラッグによる文字サイズ変更開始
        if (!state.isResizingAnnotationFont) {
            state.isResizingAnnotationFont = true;
            state.originalObject = MojiQClone.deep(selectedObj);
            state.accumulatedWheelDelta = 0;
        }

        // ホイールの移動量を累積
        state.accumulatedWheelDelta += e.deltaY;

        // 一定量以上累積したらフォントサイズを変更（deltaY 100で約1pxの変化）
        const fontSizeStep = 1;
        const deltaThreshold = 50;  // より敏感に反応

        if (Math.abs(state.accumulatedWheelDelta) >= deltaThreshold) {
            const direction = state.accumulatedWheelDelta > 0 ? -1 : 1;  // ホイール下で縮小、上で拡大
            const steps = Math.floor(Math.abs(state.accumulatedWheelDelta) / deltaThreshold);
            const deltaSize = direction * fontSizeStep * steps;

            applyFontSizeChange(selectedIndex, deltaSize, targetType);
            if (redrawCallback) redrawCallback(false);

            // 使用した分のデルタを減算（余りのみ保持）
            const usedDelta = deltaThreshold * steps;
            if (state.accumulatedWheelDelta > 0) {
                state.accumulatedWheelDelta -= usedDelta;
            } else {
                state.accumulatedWheelDelta += usedDelta;
            }
        }

        return true;
    }

    /**
     * 文字サイズ変更終了
     * マウスダウン時に呼び出す
     */
    function endAnnotationFontResize() {
        if (!state.isResizingAnnotationFont) return;

        const pageNum = state.currentPageNum;
        const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);

        if (selectedIndex !== null && selectedIndex >= 0 && state.originalObject) {
            const currentObj = DrawingObjects.getSelectedObject(pageNum);

            // オブジェクトの種類に応じてサイズを比較
            let origSize = null;
            let newSize = null;

            if (state.originalObject.annotation) {
                origSize = state.originalObject.annotation.fontSize;
                newSize = currentObj.annotation ? currentObj.annotation.fontSize : null;
            } else if (state.originalObject.size !== undefined && INSTRUCTION_STAMP_TYPES.includes(state.originalObject.type)) {
                // 指示スタンプの場合
                origSize = state.originalObject.size;
                newSize = currentObj.size;
            } else if (state.originalObject.fontSize !== undefined) {
                origSize = state.originalObject.fontSize;
                newSize = currentObj.fontSize;
            }

            // 実際にサイズが変更された場合のみUndo履歴を保存
            if (origSize !== newSize) {
                DrawingObjects.saveUndoState(pageNum, 'update', {
                    old: state.originalObject,
                    new: MojiQClone.deep(currentObj)
                });
            }
        }

        state.isResizingAnnotationFont = false;
        state.originalObject = null;
        state.accumulatedWheelDelta = 0;
    }

    /**
     * 文字サイズを変更
     * @param {number} index - オブジェクトインデックス
     * @param {number} deltaSize - フォントサイズの変化量
     * @param {string} targetType - 対象の種類（'annotation', 'text', 'fontLabel', 'instructionStamp'）
     */
    function applyFontSizeChange(index, deltaSize, targetType) {
        const pageNum = state.currentPageNum;
        const objects = DrawingObjects.getPageObjects(pageNum);

        if (index < 0 || index >= objects.length) return;

        const obj = objects[index];

        if (targetType === 'annotation' && obj.annotation) {
            // アノテーションの文字サイズ変更
            const currentFontSize = obj.annotation.fontSize || 16;
            const newFontSize = Math.max(6, Math.min(200, currentFontSize + deltaSize));
            obj.annotation.fontSize = newFontSize;
        } else if (targetType === 'text' && obj.type === 'text') {
            // テキストオブジェクトの文字サイズ変更
            const currentFontSize = obj.fontSize || 16;
            const newFontSize = Math.max(6, Math.min(200, currentFontSize + deltaSize));
            obj.fontSize = newFontSize;
        } else if (targetType === 'fontLabel' && obj.type === 'fontLabel') {
            // fontLabelの文字サイズ変更
            const currentFontSize = obj.fontSize || 12;
            const newFontSize = Math.max(6, Math.min(200, currentFontSize + deltaSize));
            obj.fontSize = newFontSize;
        } else if (targetType === 'instructionStamp' && INSTRUCTION_STAMP_TYPES.includes(obj.type)) {
            // 指示スタンプのサイズ変更
            const currentSize = obj.size || 28;
            const newSize = Math.max(10, Math.min(200, currentSize + deltaSize));
            obj.size = newSize;
        }
    }


    /**
     * オブジェクトの移動を適用
     */
    function applyMove(index, dx, dy) {
        const pageNum = state.currentPageNum;
        const objects = DrawingObjects.getPageObjects(pageNum);

        if (index < 0 || index >= objects.length) return;

        const obj = objects[index];
        const orig = state.originalObject;

        // 元の位置からの移動
        if (orig.startPos) {
            obj.startPos = { x: orig.startPos.x + dx, y: orig.startPos.y + dy };
        }
        if (orig.endPos) {
            obj.endPos = { x: orig.endPos.x + dx, y: orig.endPos.y + dy };
        }
        if (orig.points) {
            obj.points = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        }

        // 引出線の処理（指示スタンプ・fontLabel・labeledRectの場合は起点を固定、終端を自動計算）
        if (orig.leaderLine) {
            // 指示スタンプ・fontLabel・text・labeledRectは起点を固定して終端を自動計算
            const leaderLineTypes = ['toruStamp', 'torutsumeStamp', 'torumamaStamp', 'zenkakuakiStamp', 'nibunakiStamp', 'shibunakiStamp', 'kaigyouStamp', 'fontLabel', 'text', 'labeledRect'];
            if (leaderLineTypes.includes(obj.type)) {
                const DrawingModes = window.MojiQDrawingModes;
                // 起点は固定
                const leaderStart = orig.leaderLine.start;
                // 終端を自動計算
                let newEnd = { x: orig.leaderLine.end.x + dx, y: orig.leaderLine.end.y + dy };
                if (obj.type === 'labeledRect') {
                    // labeledRectの場合：枠線の中心に向かって引出線を引き、枠線との交点を終端とする
                    newEnd = getLabeledRectLeaderEndPos(obj, leaderStart);
                } else if (DrawingModes && DrawingModes.getStampLeaderEndPos) {
                    newEnd = DrawingModes.getStampLeaderEndPos(obj, leaderStart);
                }
                obj.leaderLine = {
                    start: leaderStart,
                    end: newEnd
                };
            } else {
                // その他のオブジェクトは引出線全体を移動
                obj.leaderLine = {
                    start: { x: orig.leaderLine.start.x + dx, y: orig.leaderLine.start.y + dy },
                    end: { x: orig.leaderLine.end.x + dx, y: orig.leaderLine.end.y + dy }
                };
            }
        }

        // アノテーション（コメント・指示）も移動（引出線開始点を再計算）
        if (orig.annotation) {
            obj.annotation = recalculateAnnotationLeaderLine(obj, orig.annotation, dx, dy);
        }

        // fontLabelのテキスト位置も移動
        if (orig.textX !== undefined && orig.textY !== undefined) {
            obj.textX = orig.textX + dx;
            obj.textY = orig.textY + dy;
        }

        // リンクされた消しゴムオブジェクトも移動
        moveLinkedErasers(obj.id, dx, dy, orig);
    }

    /**
     * オブジェクトに回転を適用
     * @param {number} index - オブジェクトのインデックス
     * @param {number} rotation - 回転角度（ラジアン）
     */
    function applyRotation(index, rotation) {
        const pageNum = state.currentPageNum;
        const objects = DrawingObjects.getPageObjects(pageNum);

        if (index < 0 || index >= objects.length) return;

        const obj = objects[index];
        const originalObj = state.originalObject;
        const originalRotation = state.originalRotation || 0;

        // 回転角度の差分
        const deltaRotation = rotation - originalRotation;

        obj.rotation = rotation;

        // 引出線がある場合、元の座標から回転を適用
        if (obj.leaderLine && originalObj && originalObj.leaderLine) {
            // 回転中心を計算
            let cx, cy;
            if (obj.type === 'fontLabel' || obj.type === 'text') {
                // fontLabelとtextはバウンディングボックスの中心を回転中心とする
                const DrawingRenderer = window.MojiQDrawingRenderer;
                if (DrawingRenderer && DrawingRenderer.getShapeBoundsOnly) {
                    const shapeBounds = DrawingRenderer.getShapeBoundsOnly(originalObj);
                    cx = shapeBounds.x + shapeBounds.width / 2;
                    cy = shapeBounds.y + shapeBounds.height / 2;
                } else {
                    cx = obj.startPos.x;
                    cy = obj.startPos.y;
                }
            } else if (obj.startPos) {
                // その他のスタンプはstartPosを回転中心とする
                cx = obj.startPos.x;
                cy = obj.startPos.y;
            } else {
                return;
            }

            const cos = Math.cos(deltaRotation);
            const sin = Math.sin(deltaRotation);

            // 引出線の起点を回転
            const origStartX = originalObj.leaderLine.start.x;
            const origStartY = originalObj.leaderLine.start.y;
            const dxStart = origStartX - cx;
            const dyStart = origStartY - cy;
            obj.leaderLine.start.x = cx + dxStart * cos - dyStart * sin;
            obj.leaderLine.start.y = cy + dxStart * sin + dyStart * cos;

            // 引出線の終点を回転
            const origEndX = originalObj.leaderLine.end.x;
            const origEndY = originalObj.leaderLine.end.y;
            const dxEnd = origEndX - cx;
            const dyEnd = origEndY - cy;
            obj.leaderLine.end.x = cx + dxEnd * cos - dyEnd * sin;
            obj.leaderLine.end.y = cy + dxEnd * sin + dyEnd * cos;
        }
    }

    /**
     * アノテーション引出線の開始点と終端を再計算するヘルパー関数
     * 図形の移動後、引出線の開始点（図形側）と終端（テキスト側）を最適な位置に再計算する
     * @param {object} obj - 移動後のオブジェクト
     * @param {object} origAnnotation - 元のアノテーション
     * @param {number} dx - X方向の移動量
     * @param {number} dy - Y方向の移動量
     * @returns {object} 新しいアノテーションオブジェクト
     */
    function recalculateAnnotationLeaderLine(obj, origAnnotation, dx, dy) {
        if (!origAnnotation.leaderLine) {
            return {
                ...origAnnotation,
                x: origAnnotation.x + dx,
                y: origAnnotation.y + dy,
                leaderLine: null
            };
        }

        const DrawingModes = window.MojiQDrawingModes;

        // 移動後のアノテーション（テキスト位置を更新）
        const movedAnnotation = {
            ...origAnnotation,
            x: origAnnotation.x + dx,
            y: origAnnotation.y + dy
        };

        // 1. まず図形側の開始点を仮の終端位置から計算
        //    （テキストの中心を仮の終端とする）
        let tempEnd = {
            x: origAnnotation.leaderLine.end.x + dx,
            y: origAnnotation.leaderLine.end.y + dy
        };

        let newStart = tempEnd;
        if (DrawingModes && DrawingModes.getLeaderStartPos) {
            newStart = DrawingModes.getLeaderStartPos(
                obj.type,
                obj.startPos,
                obj.endPos,
                tempEnd
            );
        } else {
            // フォールバック: 単純に平行移動
            newStart = {
                x: origAnnotation.leaderLine.start.x + dx,
                y: origAnnotation.leaderLine.start.y + dy
            };
        }

        // 2. 次にテキスト側の終端を、図形側の開始点から計算
        let newEnd = tempEnd;
        if (DrawingModes && DrawingModes.getLeaderEndPos) {
            newEnd = DrawingModes.getLeaderEndPos(movedAnnotation, newStart);
        }

        // 3. 終端が変わった場合、開始点も再計算（より正確な位置を求める）
        if (DrawingModes && DrawingModes.getLeaderStartPos) {
            newStart = DrawingModes.getLeaderStartPos(
                obj.type,
                obj.startPos,
                obj.endPos,
                newEnd
            );
        }

        return {
            ...movedAnnotation,
            leaderLine: {
                start: newStart,
                end: newEnd
            }
        };
    }

    /**
     * アノテーション（コメント・指示）のみを移動
     * 引出線の開始点（図形側）と終端（テキスト側）を自動的に最適な位置に再計算する
     * @param {number} index - オブジェクトインデックス
     * @param {number} dx - X方向の移動量
     * @param {number} dy - Y方向の移動量
     */
    function applyMoveAnnotationOnly(index, dx, dy) {
        const pageNum = state.currentPageNum;
        const objects = DrawingObjects.getPageObjects(pageNum);

        if (index < 0 || index >= objects.length) return;

        const obj = objects[index];
        const orig = state.originalObject;

        if (!orig || !orig.annotation) return;

        // 回転がある場合、移動量を逆回転してローカル座標系に変換
        let localDx = dx;
        let localDy = dy;
        if (obj.rotation) {
            const cos = Math.cos(-obj.rotation);
            const sin = Math.sin(-obj.rotation);
            localDx = dx * cos - dy * sin;
            localDy = dx * sin + dy * cos;
        }

        if (!orig.annotation.leaderLine) {
            obj.annotation = {
                ...orig.annotation,
                x: orig.annotation.x + localDx,
                y: orig.annotation.y + localDy,
                leaderLine: null
            };
            return;
        }

        const DrawingModes = window.MojiQDrawingModes;

        // 移動後のアノテーション（テキスト位置を更新）
        const movedAnnotation = {
            ...orig.annotation,
            x: orig.annotation.x + localDx,
            y: orig.annotation.y + localDy
        };

        // 1. まず図形側の開始点を仮の終端位置から計算
        let tempEnd = {
            x: orig.annotation.leaderLine.end.x + localDx,
            y: orig.annotation.leaderLine.end.y + localDy
        };

        let newStart = orig.annotation.leaderLine.start;
        if (DrawingModes && DrawingModes.getLeaderStartPos) {
            newStart = DrawingModes.getLeaderStartPos(
                obj.type,
                obj.startPos,
                obj.endPos,
                tempEnd
            );
        }

        // 2. 次にテキスト側の終端を、図形側の開始点から計算
        let newEnd = tempEnd;
        if (DrawingModes && DrawingModes.getLeaderEndPos) {
            newEnd = DrawingModes.getLeaderEndPos(movedAnnotation, newStart);
        }

        // 3. 終端が変わった場合、開始点も再計算（より正確な位置を求める）
        if (DrawingModes && DrawingModes.getLeaderStartPos) {
            newStart = DrawingModes.getLeaderStartPos(
                obj.type,
                obj.startPos,
                obj.endPos,
                newEnd
            );
        }

        obj.annotation = {
            ...movedAnnotation,
            leaderLine: {
                start: newStart,
                end: newEnd
            }
        };
    }

    /**
     * fontLabelのテキスト部分のみ移動を適用
     * @param {number} index - オブジェクトインデックス
     * @param {number} dx - X方向の移動量
     * @param {number} dy - Y方向の移動量
     */
    function applyMoveFontLabelText(index, dx, dy) {
        const pageNum = state.currentPageNum;
        const objects = DrawingObjects.getPageObjects(pageNum);

        if (index < 0 || index >= objects.length) return;

        const obj = objects[index];
        const orig = state.originalObject;

        if (!orig || obj.type !== 'fontLabel') return;

        // 回転がある場合、移動量を逆回転してローカル座標系に変換
        let localDx = dx;
        let localDy = dy;
        if (obj.rotation) {
            const cos = Math.cos(-obj.rotation);
            const sin = Math.sin(-obj.rotation);
            localDx = dx * cos - dy * sin;
            localDy = dx * sin + dy * cos;
        }

        // テキスト位置のみ移動（枠線は動かさない）
        obj.textX = orig.textX + localDx;
        obj.textY = orig.textY + localDy;
    }

    /**
     * 引出線終端の移動を適用（移動量ベース）
     * 終端位置を移動し、起点は図形の輪郭に自動追従させる
     * @param {number} index - オブジェクトインデックス
     * @param {number} dx - X方向の移動量
     * @param {number} dy - Y方向の移動量
     */
    function applyMoveLeaderEndByDelta(index, dx, dy) {
        const pageNum = state.currentPageNum;
        const objects = DrawingObjects.getPageObjects(pageNum);

        if (index < 0 || index >= objects.length) return;

        const obj = objects[index];
        const orig = state.originalObject;

        if (!orig || !orig.annotation || !orig.annotation.leaderLine) return;

        // 回転がある場合、移動量を逆回転してローカル座標系に変換
        let localDx = dx;
        let localDy = dy;
        if (obj.rotation) {
            const cos = Math.cos(-obj.rotation);
            const sin = Math.sin(-obj.rotation);
            localDx = dx * cos - dy * sin;
            localDy = dx * sin + dy * cos;
        }

        // 新しい終端位置（元の位置 + 移動量）
        const newEnd = {
            x: orig.annotation.leaderLine.end.x + localDx,
            y: orig.annotation.leaderLine.end.y + localDy
        };

        // 図形タイプに応じて引出線の起点を再計算
        const DrawingModes = window.MojiQDrawingModes;
        let newStart = orig.annotation.leaderLine.start;

        if (DrawingModes && DrawingModes.getLeaderStartPos) {
            // 図形の情報を取得して、新しいターゲット位置に基づいて起点を再計算
            newStart = DrawingModes.getLeaderStartPos(
                obj.type,
                obj.startPos,
                obj.endPos,
                newEnd
            );
        }

        // テキスト位置も終端に合わせて更新（終端がテキストの基準点）
        const origTextOffsetX = orig.annotation.x - orig.annotation.leaderLine.end.x;
        const origTextOffsetY = orig.annotation.y - orig.annotation.leaderLine.end.y;

        obj.annotation = {
            ...orig.annotation,
            x: newEnd.x + origTextOffsetX,
            y: newEnd.y + origTextOffsetY,
            leaderLine: {
                start: newStart,
                end: newEnd
            }
        };
    }

    /**
     * 指示スタンプの引出線起点の移動を適用（移動量ベース）
     * @param {number} index - オブジェクトインデックス
     * @param {number} dx - X方向の移動量
     * @param {number} dy - Y方向の移動量
     */
    function applyMoveStampLeaderStartByDelta(index, dx, dy) {
        const pageNum = state.currentPageNum;
        const objects = DrawingObjects.getPageObjects(pageNum);

        if (index < 0 || index >= objects.length) return;

        const obj = objects[index];
        const orig = state.originalObject;

        if (!orig || !orig.leaderLine) return;

        // 回転がある場合、移動量を逆回転してローカル座標系に変換
        let localDx = dx;
        let localDy = dy;
        if (obj.rotation) {
            const cos = Math.cos(-obj.rotation);
            const sin = Math.sin(-obj.rotation);
            localDx = dx * cos - dy * sin;
            localDy = dx * sin + dy * cos;
        }

        // 新しい起点位置（元の位置 + 移動量）
        obj.leaderLine = {
            start: {
                x: orig.leaderLine.start.x + localDx,
                y: orig.leaderLine.start.y + localDy
            },
            end: orig.leaderLine.end
        };
    }

    /**
     * 指示スタンプの引出線終端の移動を適用（移動量ベース）
     * スタンプ本体も終端に合わせて移動
     * @param {number} index - オブジェクトインデックス
     * @param {number} dx - X方向の移動量
     * @param {number} dy - Y方向の移動量
     */
    function applyMoveStampLeaderEndByDelta(index, dx, dy) {
        const pageNum = state.currentPageNum;
        const objects = DrawingObjects.getPageObjects(pageNum);

        if (index < 0 || index >= objects.length) return;

        const obj = objects[index];
        const orig = state.originalObject;

        if (!orig || !orig.leaderLine) return;

        // 回転がある場合、移動量を逆回転してローカル座標系に変換
        let localDx = dx;
        let localDy = dy;
        if (obj.rotation) {
            const cos = Math.cos(-obj.rotation);
            const sin = Math.sin(-obj.rotation);
            localDx = dx * cos - dy * sin;
            localDy = dx * sin + dy * cos;
        }

        // 新しい終端位置（元の位置 + 移動量）
        const newEnd = {
            x: orig.leaderLine.end.x + localDx,
            y: orig.leaderLine.end.y + localDy
        };

        // 終端からスタンプ位置へのオフセットを維持
        const origOffsetX = orig.startPos.x - orig.leaderLine.end.x;
        const origOffsetY = orig.startPos.y - orig.leaderLine.end.y;

        // 引出線の終端を更新
        obj.leaderLine = {
            start: orig.leaderLine.start,
            end: newEnd
        };

        // スタンプ本体の位置も終端に合わせて更新
        obj.startPos = {
            x: newEnd.x + origOffsetX,
            y: newEnd.y + origOffsetY
        };
    }

    /**
     * 複数選択時のオブジェクト移動を適用
     * @param {number} index - オブジェクトインデックス
     * @param {number} dx - X方向の移動量
     * @param {number} dy - Y方向の移動量
     * @param {object} orig - 元のオブジェクト状態
     */
    function applyMoveMulti(index, dx, dy, orig) {
        const pageNum = state.currentPageNum;
        const objects = DrawingObjects.getPageObjects(pageNum);

        if (index < 0 || index >= objects.length || !orig) return;

        const obj = objects[index];

        // 元の位置からの移動
        if (orig.startPos) {
            obj.startPos = { x: orig.startPos.x + dx, y: orig.startPos.y + dy };
        }
        if (orig.endPos) {
            obj.endPos = { x: orig.endPos.x + dx, y: orig.endPos.y + dy };
        }
        if (orig.points) {
            obj.points = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        }

        // 引出線の処理（指示スタンプ・fontLabelの場合は起点を固定、終端を自動計算）
        if (orig.leaderLine) {
            // 指示スタンプ・fontLabel・textの場合は起点を固定して終端を自動計算
            const leaderLineTypes = ['toruStamp', 'torutsumeStamp', 'torumamaStamp', 'zenkakuakiStamp', 'nibunakiStamp', 'shibunakiStamp', 'kaigyouStamp', 'fontLabel', 'text'];
            if (leaderLineTypes.includes(obj.type)) {
                const DrawingModes = window.MojiQDrawingModes;
                // 起点は固定
                const leaderStart = orig.leaderLine.start;
                // 終端をスタンプ/ラベルのバウンディングボックスから自動計算
                let newEnd = { x: orig.leaderLine.end.x + dx, y: orig.leaderLine.end.y + dy };
                if (DrawingModes && DrawingModes.getStampLeaderEndPos) {
                    newEnd = DrawingModes.getStampLeaderEndPos(obj, leaderStart);
                }
                obj.leaderLine = {
                    start: leaderStart,
                    end: newEnd
                };
            } else {
                // その他のオブジェクトは引出線全体を移動
                obj.leaderLine = {
                    start: { x: orig.leaderLine.start.x + dx, y: orig.leaderLine.start.y + dy },
                    end: { x: orig.leaderLine.end.x + dx, y: orig.leaderLine.end.y + dy }
                };
            }
        }

        // アノテーション（コメント・指示）も移動（引出線開始点を再計算）
        if (orig.annotation) {
            obj.annotation = recalculateAnnotationLeaderLine(obj, orig.annotation, dx, dy);
        }

        // fontLabelのテキスト位置も移動
        if (orig.textX !== undefined && orig.textY !== undefined) {
            obj.textX = orig.textX + dx;
            obj.textY = orig.textY + dy;
        }

        // リンクされた消しゴムオブジェクトも移動
        moveLinkedErasers(obj.id, dx, dy, orig);
    }

    /**
     * リンクされた消しゴムオブジェクトを移動
     */
    function moveLinkedErasers(objectId, dx, dy, origObject) {
        const pageNum = state.currentPageNum;
        const objects = DrawingObjects.getPageObjects(pageNum);

        // このオブジェクトにリンクされた消しゴムオブジェクトを検索
        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            if (obj.type === 'eraser' && obj.linkedObjectIds && obj.linkedObjectIds.includes(objectId)) {
                // 消しゴムオブジェクトの元の状態を取得（初回のみ保存）
                if (!state.originalErasers) {
                    state.originalErasers = {};
                }
                if (!state.originalErasers[obj.id]) {
                    state.originalErasers[obj.id] = MojiQClone.deep(obj);
                }

                const origEraser = state.originalErasers[obj.id];
                // 消しゴムオブジェクトのpointsを移動
                if (origEraser.points) {
                    obj.points = origEraser.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                }
            }
        }
    }

    /**
     * リサイズ処理
     */
    function resizeObject(pos) {
        const pageNum = state.currentPageNum;
        const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);

        if (selectedIndex === null || selectedIndex < 0) return;

        const objects = DrawingObjects.getPageObjects(pageNum);
        const obj = objects[selectedIndex];
        const orig = state.originalObject;
        const origBounds = state.originalBounds;
        const handle = state.activeHandle;

        if (!orig || !origBounds || !handle) return;

        // 新しいバウンディングボックスを計算
        let newX = origBounds.x;
        let newY = origBounds.y;
        let newW = origBounds.width;
        let newH = origBounds.height;

        const dx = pos.x - state.dragStartPos.x;
        const dy = pos.y - state.dragStartPos.y;

        // ハンドルに応じてサイズ変更
        if (handle.includes('l')) {
            newX += dx;
            newW -= dx;
        }
        if (handle.includes('r')) {
            newW += dx;
        }
        if (handle.includes('t')) {
            newY += dy;
            newH -= dy;
        }
        if (handle.includes('b')) {
            newH += dy;
        }

        // 最小サイズ
        newW = Math.max(10, newW);
        newH = Math.max(10, newH);

        // スケール係数
        const scaleX = newW / origBounds.width;
        const scaleY = newH / origBounds.height;

        // オブジェクトの座標を更新
        switch (obj.type) {
            case 'line':
            case 'arrow':
            case 'doubleArrow':
            case 'doubleArrowAnnotated':
            case 'rect':
            case 'ellipse':
            case 'semicircle':
            case 'chevron':
            case 'lshape':
            case 'zshape':
            case 'bracket':
            case 'rectSymbolStamp':
            case 'triangleSymbolStamp':
                obj.startPos = {
                    x: newX + (orig.startPos.x - origBounds.x) * scaleX,
                    y: newY + (orig.startPos.y - origBounds.y) * scaleY
                };
                obj.endPos = {
                    x: newX + (orig.endPos.x - origBounds.x) * scaleX,
                    y: newY + (orig.endPos.y - origBounds.y) * scaleY
                };
                break;

            case 'image':
                // 画像はアスペクト比を保持してリサイズ
                const origImgW = orig.endPos.x - orig.startPos.x;
                const origImgH = orig.endPos.y - orig.startPos.y;
                const imgAspect = origImgW / origImgH;

                // 均一スケール（アスペクト比保持）
                const uniformScale = Math.max(scaleX, scaleY);
                const newImgW = origImgW * uniformScale;
                const newImgH = origImgH * uniformScale;

                // ハンドル位置に応じて開始位置を調整
                let imgStartX, imgStartY;

                if (handle.includes('l')) {
                    // 左側ハンドル: 右端を固定
                    imgStartX = orig.endPos.x - newImgW;
                } else if (handle.includes('r')) {
                    // 右側ハンドル: 左端を固定
                    imgStartX = orig.startPos.x;
                } else {
                    // 中央ハンドル: 中央を維持
                    const centerX = (orig.startPos.x + orig.endPos.x) / 2;
                    imgStartX = centerX - newImgW / 2;
                }

                if (handle.includes('t')) {
                    // 上側ハンドル: 下端を固定
                    imgStartY = orig.endPos.y - newImgH;
                } else if (handle.includes('b')) {
                    // 下側ハンドル: 上端を固定
                    imgStartY = orig.startPos.y;
                } else {
                    // 中央ハンドル: 中央を維持
                    const centerY = (orig.startPos.y + orig.endPos.y) / 2;
                    imgStartY = centerY - newImgH / 2;
                }

                obj.startPos = { x: imgStartX, y: imgStartY };
                obj.endPos = { x: imgStartX + newImgW, y: imgStartY + newImgH };
                break;

            case 'doneStamp':
                // 済スタンプは中心位置とサイズでリサイズ
                obj.startPos = {
                    x: newX + (orig.startPos.x - origBounds.x) * scaleX,
                    y: newY + (orig.startPos.y - origBounds.y) * scaleY
                };
                // サイズをスケール（縦横比を維持）
                obj.size = (orig.size || 28) * Math.min(scaleX, scaleY);
                break;

            case 'rubyStamp':
                // ルビスタンプは中心位置とサイズでリサイズ
                obj.startPos = {
                    x: newX + (orig.startPos.x - origBounds.x) * scaleX,
                    y: newY + (orig.startPos.y - origBounds.y) * scaleY
                };
                // サイズをスケール（縦横比を維持）
                obj.size = (orig.size || 28) * Math.min(scaleX, scaleY);
                break;

            case 'fontLabel':
                obj.startPos = {
                    x: newX + (orig.startPos.x - origBounds.x) * scaleX,
                    y: newY + (orig.startPos.y - origBounds.y) * scaleY
                };
                obj.endPos = {
                    x: newX + (orig.endPos.x - origBounds.x) * scaleX,
                    y: newY + (orig.endPos.y - origBounds.y) * scaleY
                };
                // テキスト位置もスケーリング
                if (orig.textX !== undefined && orig.textY !== undefined) {
                    obj.textX = newX + (orig.textX - origBounds.x) * scaleX;
                    obj.textY = newY + (orig.textY - origBounds.y) * scaleY;
                }
                break;

            case 'pen':
            case 'marker':
            case 'eraser':
            case 'polyline':
                if (orig.points) {
                    obj.points = orig.points.map(p => ({
                        x: newX + (p.x - origBounds.x) * scaleX,
                        y: newY + (p.y - origBounds.y) * scaleY
                    }));
                }
                break;

            case 'text':
                obj.startPos = {
                    x: newX + (orig.startPos.x - origBounds.x) * scaleX,
                    y: newY + (orig.startPos.y - origBounds.y) * scaleY
                };
                // フォントサイズもスケール
                obj.fontSize = (orig.fontSize || 16) * Math.min(scaleX, scaleY);
                // 引出線もスケーリング
                if (orig.leaderLine) {
                    obj.leaderLine = {
                        start: {
                            x: newX + (orig.leaderLine.start.x - origBounds.x) * scaleX,
                            y: newY + (orig.leaderLine.start.y - origBounds.y) * scaleY
                        },
                        end: {
                            x: newX + (orig.leaderLine.end.x - origBounds.x) * scaleX,
                            y: newY + (orig.leaderLine.end.y - origBounds.y) * scaleY
                        }
                    };
                }
                break;

            case 'toruStamp':
            case 'torutsumeStamp':
            case 'torumamaStamp':
            case 'zenkakuakiStamp':
            case 'nibunakiStamp':
            case 'shibunakiStamp':
            case 'kaigyouStamp':
                // 指示スタンプは中心位置とサイズでリサイズ
                obj.startPos = {
                    x: newX + (orig.startPos.x - origBounds.x) * scaleX,
                    y: newY + (orig.startPos.y - origBounds.y) * scaleY
                };
                // サイズをスケール（縦横比を維持）
                obj.size = (orig.size || 28) * Math.min(scaleX, scaleY);
                // 引出線もスケーリング
                if (orig.leaderLine) {
                    obj.leaderLine = {
                        start: {
                            x: newX + (orig.leaderLine.start.x - origBounds.x) * scaleX,
                            y: newY + (orig.leaderLine.start.y - origBounds.y) * scaleY
                        },
                        end: {
                            x: newX + (orig.leaderLine.end.x - origBounds.x) * scaleX,
                            y: newY + (orig.leaderLine.end.y - origBounds.y) * scaleY
                        }
                    };
                }
                break;
        }

        // アノテーション（コメント・指示）もスケーリング
        if (orig.annotation) {
            obj.annotation = {
                ...orig.annotation,
                x: newX + (orig.annotation.x - origBounds.x) * scaleX,
                y: newY + (orig.annotation.y - origBounds.y) * scaleY,
                leaderLine: orig.annotation.leaderLine ? {
                    start: {
                        x: newX + (orig.annotation.leaderLine.start.x - origBounds.x) * scaleX,
                        y: newY + (orig.annotation.leaderLine.start.y - origBounds.y) * scaleY
                    },
                    end: {
                        x: newX + (orig.annotation.leaderLine.end.x - origBounds.x) * scaleX,
                        y: newY + (orig.annotation.leaderLine.end.y - origBounds.y) * scaleY
                    }
                } : null
            };
        }

        // リンクされた消しゴムオブジェクトもスケーリング
        scaleLinkedErasers(obj.id, newX, newY, scaleX, scaleY, origBounds);

        // リサイズ中は履歴を保存しない（選択ハンドルが含まれるため）
        if (redrawCallback) redrawCallback(false);
    }

    /**
     * リンクされた消しゴムオブジェクトをスケーリング
     */
    function scaleLinkedErasers(objectId, newX, newY, scaleX, scaleY, origBounds) {
        const pageNum = state.currentPageNum;
        const objects = DrawingObjects.getPageObjects(pageNum);

        // このオブジェクトにリンクされた消しゴムオブジェクトを検索
        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            if (obj.type === 'eraser' && obj.linkedObjectIds && obj.linkedObjectIds.includes(objectId)) {
                // 消しゴムオブジェクトの元の状態を取得（初回のみ保存）
                if (!state.originalErasers) {
                    state.originalErasers = {};
                }
                if (!state.originalErasers[obj.id]) {
                    state.originalErasers[obj.id] = MojiQClone.deep(obj);
                }

                const origEraser = state.originalErasers[obj.id];
                // 消しゴムオブジェクトのpointsをスケーリング
                if (origEraser.points) {
                    obj.points = origEraser.points.map(p => ({
                        x: newX + (p.x - origBounds.x) * scaleX,
                        y: newY + (p.y - origBounds.y) * scaleY
                    }));
                    obj.lineWidth = (origEraser.lineWidth || 10) * Math.min(scaleX, scaleY);
                }
            }
        }
    }

    /**
     * カーソルの更新
     */
    function updateCursor(pos) {
        if (!state.canvas || !DrawingObjects || !DrawingRenderer) return;

        const pageNum = state.currentPageNum;
        const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);

        if (selectedIndex !== null && selectedIndex >= 0) {
            const selectedObj = DrawingObjects.getSelectedObject(pageNum);
            const bounds = DrawingRenderer.getBounds(selectedObj);

            // 引出線終端ハンドルのカーソル（リサイズハンドルより優先）
            if (selectedObj.annotation && DrawingRenderer.hitTestLeaderEndHandle(pos, selectedObj)) {
                state.canvas.style.cursor = 'crosshair';
                return;
            }

            // 指示スタンプの引出線ハンドルのカーソル
            if (selectedObj.leaderLine) {
                if (DrawingRenderer.hitTestStampLeaderStartHandle(pos, selectedObj) ||
                    DrawingRenderer.hitTestStampLeaderEndHandle(pos, selectedObj)) {
                    state.canvas.style.cursor = 'crosshair';
                    return;
                }
            }

            // 回転ハンドルのカーソル（画像オブジェクトのみ回転可能）
            const rotation = selectedObj.rotation || 0;
            if (selectedObj.type === 'image' && DrawingRenderer.hitTestRotationHandle) {
                const shapeBoundsForRotation = DrawingRenderer.getShapeBoundsOnly ? DrawingRenderer.getShapeBoundsOnly(selectedObj) : bounds;
                if (DrawingRenderer.hitTestRotationHandle(pos, shapeBoundsForRotation, rotation)) {
                    state.canvas.style.cursor = ROTATION_CURSOR;
                    return;
                }
            }

            // リサイズハンドルのヒットテスト（図形のみのバウンディングボックスを使用）
            const shapeBoundsForHandle = DrawingRenderer.getShapeBoundsOnly ? DrawingRenderer.getShapeBoundsOnly(selectedObj) : bounds;
            const handle = DrawingRenderer.hitTestHandle(pos, shapeBoundsForHandle, rotation);

            if (handle) {
                // リサイズカーソル
                if (handle === 'tl' || handle === 'br') {
                    state.canvas.style.cursor = 'nwse-resize';
                } else if (handle === 'tr' || handle === 'bl') {
                    state.canvas.style.cursor = 'nesw-resize';
                } else if (handle === 'tm' || handle === 'bm') {
                    state.canvas.style.cursor = 'ns-resize';
                } else if (handle === 'ml' || handle === 'mr') {
                    state.canvas.style.cursor = 'ew-resize';
                }
                return;
            }

            // アノテーション部分のカーソル
            if (selectedObj.annotation && DrawingRenderer.hitTestAnnotation(pos, selectedObj, 10)) {
                state.canvas.style.cursor = 'move';
                return;
            }

            if (DrawingRenderer.hitTest(pos, selectedObj, 10)) {
                state.canvas.style.cursor = 'move';
                return;
            }
        }

        // オブジェクト上にカーソルがあるか
        const hitIndex = DrawingRenderer.hitTestAll(pos, pageNum, 10);
        if (hitIndex >= 0) {
            state.canvas.style.cursor = 'pointer';
        } else {
            state.canvas.style.cursor = 'move';
        }
    }

    /**
     * 選択中のオブジェクトを削除
     */
    function deleteSelected() {
        if (!DrawingObjects) return false;

        // 現在のページ番号をDrawingObjectsから取得（ページ移動後の状態を確実に反映）
        const pageNum = DrawingObjects.getCurrentPage();
        const selectedIndices = DrawingObjects.getSelectedIndices(pageNum);

        if (selectedIndices.length > 0) {
            // 逆順で削除（インデックスがずれないように）
            const sortedIndices = [...selectedIndices].sort((a, b) => b - a);
            for (const idx of sortedIndices) {
                DrawingObjects.removeObject(pageNum, idx);
            }
            // 削除後は選択状態を明示的にクリア
            DrawingObjects.deselectObject(pageNum);
            // drawing-select内部の状態もリセット
            resetState();

            if (redrawCallback) redrawCallback(true);
            return true;
        }
        return false;
    }

    /**
     * 選択中のオブジェクトを前面へ
     */
    function bringToFront() {
        if (!DrawingObjects) return false;

        // 現在のページ番号をDrawingObjectsから取得（ページ移動後の状態を確実に反映）
        const pageNum = DrawingObjects.getCurrentPage();
        const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);

        if (selectedIndex !== null && selectedIndex >= 0) {
            DrawingObjects.bringToFront(pageNum, selectedIndex);
            if (redrawCallback) redrawCallback();
            return true;
        }
        return false;
    }

    /**
     * 選択中のオブジェクトを背面へ
     */
    function sendToBack() {
        if (!DrawingObjects) return false;

        // 現在のページ番号をDrawingObjectsから取得（ページ移動後の状態を確実に反映）
        const pageNum = DrawingObjects.getCurrentPage();
        const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);

        if (selectedIndex !== null && selectedIndex >= 0) {
            DrawingObjects.sendToBack(pageNum, selectedIndex);
            if (redrawCallback) redrawCallback();
            return true;
        }
        return false;
    }

    /**
     * 選択中のオブジェクトの色を変更
     */
    function setSelectedColor(color) {
        if (!DrawingObjects) return false;

        // 現在のページ番号をDrawingObjectsから取得（ページ移動後の状態を確実に反映）
        const pageNum = DrawingObjects.getCurrentPage();
        const selectedIndices = DrawingObjects.getSelectedIndices(pageNum);

        if (selectedIndices.length > 0) {
            const objects = DrawingObjects.getPageObjects(pageNum);

            // 選択されている全オブジェクトの色を変更
            for (const idx of selectedIndices) {
                const obj = objects[idx];
                if (!obj) continue;

                // 更新するプロパティを準備
                const updateProps = { color: color };

                // アノテーション（コメント・引出線）がある場合、その色も更新
                if (obj.annotation) {
                    updateProps.annotation = {
                        ...obj.annotation,
                        color: color
                    };
                }

                DrawingObjects.updateObject(pageNum, idx, updateProps);
            }

            if (redrawCallback) redrawCallback();
            return true;
        }
        return false;
    }

    /**
     * 選択中のオブジェクトの線幅を変更
     */
    function setSelectedLineWidth(lineWidth) {
        if (!DrawingObjects) return false;

        // 現在のページ番号をDrawingObjectsから取得（ページ移動後の状態を確実に反映）
        const pageNum = DrawingObjects.getCurrentPage();
        const selectedIndices = DrawingObjects.getSelectedIndices(pageNum);

        if (selectedIndices.length > 0) {
            // 選択されている全オブジェクトの線幅を変更
            for (const idx of selectedIndices) {
                DrawingObjects.updateObject(pageNum, idx, { lineWidth: lineWidth });
            }
            if (redrawCallback) redrawCallback();
            return true;
        }
        return false;
    }

    /**
     * 選択状態かどうか
     */
    function hasSelection() {
        if (!DrawingObjects) return false;

        // 現在のページ番号をDrawingObjectsから取得（ページ移動後の状態を確実に反映）
        const pageNum = DrawingObjects.getCurrentPage();
        const selectedIndices = DrawingObjects.getSelectedIndices(pageNum);
        return selectedIndices.length > 0;
    }

    /**
     * 操作中かどうか
     */
    function isOperating() {
        return state.isMoving || state.isResizing || state.isMovingAnnotation || state.isMovingLeaderEnd ||
               state.isMovingStampLeaderStart || state.isMovingStampLeaderEnd || state.isMovingFontLabelText ||
               state.isResizingAnnotationFont || state.isMarqueeSelecting;
    }

    /**
     * マーキー選択中かどうか
     */
    function isMarqueeSelecting() {
        return state.isMarqueeSelecting;
    }

    /**
     * マーキー選択の矩形範囲を取得
     * @returns {object|null} { x, y, width, height } または null
     */
    function getMarqueeRect() {
        if (!state.isMarqueeSelecting || !state.marqueeStartPos || !state.marqueeCurrentPos) {
            return null;
        }

        const startPos = state.marqueeStartPos;
        const endPos = state.marqueeCurrentPos;

        return {
            x: Math.min(startPos.x, endPos.x),
            y: Math.min(startPos.y, endPos.y),
            width: Math.abs(endPos.x - startPos.x),
            height: Math.abs(endPos.y - startPos.y)
        };
    }

    /**
     * 操作状態をリセット（タブ切り替え時などに呼び出す）
     */
    function resetState() {
        state.isSelecting = false;
        state.isMoving = false;
        state.isResizing = false;
        state.isMovingAnnotation = false;
        state.isMovingLeaderEnd = false;
        state.isMovingStampLeaderStart = false;
        state.isMovingStampLeaderEnd = false;
        state.isMovingFontLabelText = false;
        state.isResizingAnnotationFont = false;
        state.isMarqueeSelecting = false;
        state.marqueeStartPos = null;
        state.marqueeCurrentPos = null;
        state.activeHandle = null;
        state.dragStartPos = null;
        state.dragStartPosCanvas = null;   // 見開きモード用キャンバス座標もリセット
        state.originalBounds = null;
        state.originalObject = null;
        state.originalObjects = null;
        state.originalErasers = null;
        state.wheelStartY = null;
        state.accumulatedWheelDelta = 0;

        if (state.canvas) {
            state.canvas.style.cursor = 'move';
        }
    }

    /**
     * 現在のページ番号を取得（選択オブジェクトのあるページ）
     */
    function getCurrentPageNum() {
        return state.currentPageNum;
    }

    /**
     * 選択中のオブジェクトをカット（クリップボードにコピーして削除）
     * @returns {boolean} カットに成功したかどうか
     */
    function cutSelected() {
        if (!DrawingObjects) return false;

        const pageNum = DrawingObjects.getCurrentPage();
        const selectedIndices = DrawingObjects.getSelectedIndices(pageNum);

        if (selectedIndices.length === 0) {
            return false;
        }

        // 選択されたオブジェクトをクリップボードにコピー
        const objects = DrawingObjects.getPageObjects(pageNum);
        clipboard.objects = [];
        clipboard.isCut = true;
        clipboard.sourcePageNum = pageNum;

        // 選択されたオブジェクトのIDを収集
        const selectedIds = new Set();
        for (const idx of selectedIndices) {
            if (objects[idx] && objects[idx].id) {
                selectedIds.add(objects[idx].id);
            }
        }

        // 選択されたオブジェクトに関連する消しゴムオブジェクトのインデックスを収集
        const relatedEraserIndices = new Set();
        objects.forEach((obj, idx) => {
            if (obj.type === 'eraser' && obj.linkedObjectIds) {
                // この消しゴムが選択されたオブジェクトに関連しているかチェック
                const hasRelatedObject = obj.linkedObjectIds.some(id => selectedIds.has(id));
                if (hasRelatedObject) {
                    relatedEraserIndices.add(idx);
                }
            }
        });

        // インデックス順にコピー（後で削除時にずれないよう逆順で削除するため）
        const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
        const selectedIndicesSet = new Set(selectedIndices);
        for (const idx of sortedIndices) {
            clipboard.objects.push(MojiQClone.deep(objects[idx]));
        }

        // 関連する消しゴムオブジェクトもコピー（選択オブジェクトと一緒に）
        for (const idx of relatedEraserIndices) {
            if (!selectedIndicesSet.has(idx)) {
                clipboard.objects.push(MojiQClone.deep(objects[idx]));
            }
        }

        // 削除対象のインデックスをマージ
        const allIndicesToDelete = new Set([...selectedIndices, ...relatedEraserIndices]);

        // 選択されたオブジェクトと関連消しゴムを削除（逆順で削除してインデックスずれを防ぐ）
        const reverseIndices = [...allIndicesToDelete].sort((a, b) => b - a);
        for (const idx of reverseIndices) {
            DrawingObjects.removeObject(pageNum, idx);
        }

        // 選択状態をクリア
        DrawingObjects.deselectObject(pageNum);
        resetState();

        if (redrawCallback) redrawCallback(true);
        return true;
    }

    /**
     * クリップボードの内容をペースト
     * @returns {boolean} ペーストに成功したかどうか
     */
    function pasteFromClipboard() {
        if (!DrawingObjects) return false;

        if (clipboard.objects.length === 0) {
            return false;
        }

        const pageNum = DrawingObjects.getCurrentPage();

        // 選択解除
        DrawingObjects.deselectObject(pageNum);

        // ペースト位置のオフセット（同じ位置に重ならないよう少しずらす）
        const offset = clipboard.isCut ? 0 : 20;

        const newIndices = [];
        // 元のIDと新しいIDのマッピング（消しゴムのlinkedObjectIds更新用）
        const idMapping = {};

        for (const obj of clipboard.objects) {
            // オブジェクトを深くコピー
            const newObj = MojiQClone.deep(obj);

            // 元のIDを保存
            const oldId = newObj.id;

            // 新しいIDを生成（重複を避けるため）
            delete newObj.id;

            // ペースト位置をオフセット（コピーの場合のみ）
            if (offset !== 0) {
                applyOffsetToObject(newObj, offset, offset);
            }

            // オブジェクトを追加
            const newId = DrawingObjects.addObject(pageNum, newObj);

            // IDマッピングを記録
            if (oldId) {
                idMapping[oldId] = newId;
            }

            const newIndex = DrawingObjects.findIndexById(pageNum, newId);
            if (newIndex >= 0) {
                newIndices.push(newIndex);
            }
        }

        // 消しゴムオブジェクトのlinkedObjectIdsを新しいIDに更新
        const objects = DrawingObjects.getPageObjects(pageNum);
        for (const index of newIndices) {
            const obj = objects[index];
            if (obj && obj.type === 'eraser' && obj.linkedObjectIds) {
                obj.linkedObjectIds = obj.linkedObjectIds.map(oldId => {
                    return idMapping[oldId] || oldId;
                });
            }
        }

        // ペーストしたオブジェクトを選択状態にする
        if (newIndices.length > 0) {
            DrawingObjects.selectObject(pageNum, newIndices[0]);
            for (let i = 1; i < newIndices.length; i++) {
                DrawingObjects.addToSelection(pageNum, newIndices[i]);
            }
        }

        // カットの場合はクリップボードをクリア（1回だけペースト可能）
        if (clipboard.isCut) {
            clipboard.objects = [];
            clipboard.isCut = false;
            clipboard.sourcePageNum = null;
        }

        if (redrawCallback) redrawCallback(true);
        return true;
    }

    /**
     * オブジェクトの座標をオフセットする
     * @param {object} obj - オブジェクト
     * @param {number} dx - X方向のオフセット
     * @param {number} dy - Y方向のオフセット
     */
    function applyOffsetToObject(obj, dx, dy) {
        if (obj.startPos) {
            obj.startPos.x += dx;
            obj.startPos.y += dy;
        }
        if (obj.endPos) {
            obj.endPos.x += dx;
            obj.endPos.y += dy;
        }
        if (obj.points) {
            obj.points = obj.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        }
        if (obj.annotation) {
            obj.annotation.x += dx;
            obj.annotation.y += dy;
            if (obj.annotation.leaderLine) {
                obj.annotation.leaderLine.start.x += dx;
                obj.annotation.leaderLine.start.y += dy;
                obj.annotation.leaderLine.end.x += dx;
                obj.annotation.leaderLine.end.y += dy;
            }
        }
        if (obj.leaderLine) {
            obj.leaderLine.start.x += dx;
            obj.leaderLine.start.y += dy;
            obj.leaderLine.end.x += dx;
            obj.leaderLine.end.y += dy;
        }
        if (obj.textX !== undefined) {
            obj.textX += dx;
        }
        if (obj.textY !== undefined) {
            obj.textY += dy;
        }
    }

    /**
     * クリップボードにオブジェクトがあるかどうか
     * @returns {boolean}
     */
    function hasClipboard() {
        return clipboard.objects.length > 0;
    }

    // --- 公開API ---
    return {
        init: init,
        setCurrentPage: setCurrentPage,
        getCurrentPageNum: getCurrentPageNum,
        startSelect: startSelect,
        moveSelect: moveSelect,
        endSelect: endSelect,
        deleteSelected: deleteSelected,
        bringToFront: bringToFront,
        sendToBack: sendToBack,
        setSelectedColor: setSelectedColor,
        setSelectedLineWidth: setSelectedLineWidth,
        hasSelection: hasSelection,
        isOperating: isOperating,
        isMarqueeSelecting: isMarqueeSelecting,
        getMarqueeRect: getMarqueeRect,
        updateCursor: updateCursor,
        resetState: resetState,
        handleAnnotationWheelResize: handleAnnotationWheelResize,
        endAnnotationFontResize: endAnnotationFontResize,
        cutSelected: cutSelected,
        pasteFromClipboard: pasteFromClipboard,
        hasClipboard: hasClipboard
    };
})();
