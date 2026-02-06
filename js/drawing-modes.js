/**
 * MojiQ Drawing Modes - 描画モード別処理モジュール
 * 各描画モード（ペン、マーカー、消しゴム、図形等）の処理を担当
 */
window.MojiQDrawingModes = (function() {
    'use strict';

    const Constants = window.MojiQConstants;
    const Utils = window.MojiQUtils;

    // ========================================
    // モード別の描画中処理 (draw)
    // ========================================

    /**
     * マーカー描画中の処理
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {Array} points - ポイント配列
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     */
    function drawMarker(ctx, points, pos, snapshot) {
        points.push({ x: pos.x, y: pos.y });
        ctx.putImageData(snapshot, 0, 0);

        if (window.MojiQCanvasContext) {
            MojiQCanvasContext.initContext();
        }

        ctx.beginPath();

        // 配列が空の場合は処理をスキップ
        if (!points || points.length === 0) {
            return;
        }

        if (points.length < 3) {
            const b = points[0];
            ctx.beginPath();
            ctx.arc(b.x, b.y, ctx.lineWidth / 2, 0, Math.PI * 2, true);
            ctx.fill();
            ctx.closePath();
        } else {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);

            let i;
            for (i = 1; i < points.length - 2; i++) {
                const c = (points[i].x + points[i + 1].x) / 2;
                const d = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, c, d);
            }
            ctx.quadraticCurveTo(
                points[i].x, points[i].y,
                points[i + 1].x, points[i + 1].y
            );
            ctx.stroke();
        }
    }

    /**
     * ペン描画中の処理
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {Array} points - ポイント配列
     * @param {{x: number, y: number}} pos - 現在位置
     */
    function drawPen(ctx, points, pos) {
        points.push({ x: pos.x, y: pos.y });
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    }

    /**
     * 消しゴム描画中の処理
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {CanvasRenderingContext2D} simCtx - シミュレーターコンテキスト
     * @param {Array} points - ポイント配列
     * @param {{x: number, y: number}} pos - 現在位置
     */
    function drawEraser(ctx, points, pos, simCtx) {
        points.push({ x: pos.x, y: pos.y });
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);

        // Simulatorキャンバスも同時に消去
        if (simCtx) {
            simCtx.lineTo(pos.x, pos.y);
            simCtx.stroke();
            simCtx.beginPath();
            simCtx.moveTo(pos.x, pos.y);
        }
    }

    /**
     * 矩形描画中の処理
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     */
    function drawRect(ctx, startPos, pos, snapshot) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();
        const w = pos.x - startPos.x;
        const h = pos.y - startPos.y;
        ctx.rect(startPos.x, startPos.y, w, h);
        ctx.stroke();
    }

    /**
     * ラベル付き枠線描画中の処理（描画中は通常の枠線と同じ）
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     */
    function drawLabeledRect(ctx, startPos, pos, snapshot) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();
        const w = pos.x - startPos.x;
        const h = pos.y - startPos.y;
        ctx.rect(startPos.x, startPos.y, w, h);
        ctx.stroke();
    }

    /**
     * 楕円描画中の処理
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     */
    function drawEllipse(ctx, startPos, pos, snapshot) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();
        const w = Math.abs(pos.x - startPos.x);
        const h = Math.abs(pos.y - startPos.y);
        const cx = startPos.x + (pos.x - startPos.x) / 2;
        const cy = startPos.y + (pos.y - startPos.y) / 2;
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);
        ctx.stroke();
    }

    /**
     * 半円描画中の処理
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     */
    function drawSemicircle(ctx, startPos, pos, snapshot) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();
        const w = Math.abs(pos.x - startPos.x);
        const h = Math.abs(pos.y - startPos.y);
        const cx = startPos.x + (pos.x - startPos.x) / 2;
        const cy = startPos.y + (pos.y - startPos.y) / 2;

        // 縦横の比率で弧の向きを決定
        if (h > w) {
            // 縦に長い場合: 縦向きの弧（右側の弧）
            ctx.ellipse(cx, cy, w / 2, h / 2, 0, -0.5 * Math.PI, 0.5 * Math.PI);
        } else {
            // 横に長い場合: 横向きの弧（上側の弧）
            ctx.ellipse(cx, cy, w / 2, h / 2, 0, Math.PI, 2 * Math.PI);
        }
        ctx.stroke();
    }

    /**
     * くの字描画中の処理
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     * @param {boolean} isCtrlPressed - Ctrlキーが押されているか
     */
    function drawChevron(ctx, startPos, pos, snapshot, isCtrlPressed) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();

        const topY = Math.min(startPos.y, pos.y);
        const bottomY = Math.max(startPos.y, pos.y);
        const leftX = Math.min(startPos.x, pos.x);
        const rightX = Math.max(startPos.x, pos.x);
        const midY = (topY + bottomY) / 2;
        const midX = (leftX + rightX) / 2;

        // Ctrlキーで頂点位置を下に変更
        if (isCtrlPressed) {
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
    }

    /**
     * L字描画中の処理
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     */
    function drawLshape(ctx, startPos, pos, snapshot) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();

        const dx = pos.x - startPos.x; // ドラッグ方向（正=右、負=左）
        const dy = pos.y - startPos.y; // ドラッグ方向（正=下、負=上）

        const topY = Math.min(startPos.y, pos.y);
        const bottomY = Math.max(startPos.y, pos.y);
        const leftX = Math.min(startPos.x, pos.x);
        const rightX = Math.max(startPos.x, pos.x);

        // ドラッグ方向で4つの向きを決定
        if (dx >= 0 && dy >= 0) {
            // 右下にドラッグ: L（標準形、左上が角）
            ctx.moveTo(leftX, bottomY);
            ctx.lineTo(leftX, topY);
            ctx.lineTo(rightX, topY);
        } else if (dx < 0 && dy >= 0) {
            // 左下にドラッグ: ⌐（右上が角）
            ctx.moveTo(rightX, bottomY);
            ctx.lineTo(rightX, topY);
            ctx.lineTo(leftX, topY);
        } else if (dx >= 0 && dy < 0) {
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
    }

    /**
     * Z字描画中の処理（L字の終端からさらに90度の線が伸びる形状）
     * クランク形状: 縦線→横線→縦線（L字+逆L字の組み合わせ）
     * Ctrlキーで90度回転: 横線→縦線→横線
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     * @param {boolean} isCtrlPressed - Ctrlキーが押されているか
     */
    function drawZshape(ctx, startPos, pos, snapshot, isCtrlPressed) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();

        if (isCtrlPressed) {
            // Ctrl押下時: 横→縦→横の形状
            // ──┐
            //   │
            //   └──
            const dx = pos.x - startPos.x;
            const midX = startPos.x + dx / 2;

            ctx.moveTo(startPos.x, startPos.y);
            ctx.lineTo(midX, startPos.y);
            ctx.lineTo(midX, pos.y);
            ctx.lineTo(pos.x, pos.y);
        } else {
            // 通常時: 縦→横→縦の形状
            // │
            // └──┐
            //    │
            const dy = pos.y - startPos.y;
            const midY = startPos.y + dy / 2;

            ctx.moveTo(startPos.x, startPos.y);
            ctx.lineTo(startPos.x, midY);
            ctx.lineTo(pos.x, midY);
            ctx.lineTo(pos.x, pos.y);
        }
        ctx.stroke();
    }

    /**
     * コの字描画中の処理
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     */
    function drawBracket(ctx, startPos, pos, snapshot) {
        ctx.putImageData(snapshot, 0, 0);

        const w = Math.abs(pos.x - startPos.x);
        const h = Math.abs(pos.y - startPos.y);
        const dx = pos.x - startPos.x; // ドラッグ方向（正=右、負=左）
        const dy = pos.y - startPos.y; // ドラッグ方向（正=下、負=上）

        // セリフ（はみ出し部分）のサイズ
        const serifSize = Math.min(w, h) * 0.15;

        // 縦横の比率で向きを決定
        if (h > w) {
            // 縦に長い場合: 縦向きのコの字（⊐ または ⊏）
            const topY = Math.min(startPos.y, pos.y);
            const bottomY = Math.max(startPos.y, pos.y);
            const leftX = Math.min(startPos.x, pos.x);
            const rightX = Math.max(startPos.x, pos.x);

            if (dx >= 0) {
                // 右にドラッグ: ⊐の形（開口部が左側）
                // メインのコの字
                ctx.beginPath();
                ctx.moveTo(leftX, topY);
                ctx.lineTo(rightX, topY);
                ctx.lineTo(rightX, bottomY);
                ctx.lineTo(leftX, bottomY);
                ctx.stroke();
                // 上端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(leftX, topY);
                ctx.lineTo(leftX, topY - serifSize);
                ctx.stroke();
                // 下端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(leftX, bottomY);
                ctx.lineTo(leftX, bottomY + serifSize);
                ctx.stroke();
            } else {
                // 左にドラッグ: ⊏の形（開口部が右側）
                // メインのコの字
                ctx.beginPath();
                ctx.moveTo(rightX, topY);
                ctx.lineTo(leftX, topY);
                ctx.lineTo(leftX, bottomY);
                ctx.lineTo(rightX, bottomY);
                ctx.stroke();
                // 上端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(rightX, topY);
                ctx.lineTo(rightX, topY - serifSize);
                ctx.stroke();
                // 下端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(rightX, bottomY);
                ctx.lineTo(rightX, bottomY + serifSize);
                ctx.stroke();
            }
        } else {
            // 横に長い場合: 横向きのコの字（⊓ または ⊔）
            const leftX = Math.min(startPos.x, pos.x);
            const rightX = Math.max(startPos.x, pos.x);
            const topY = Math.min(startPos.y, pos.y);
            const bottomY = Math.max(startPos.y, pos.y);

            if (dy >= 0) {
                // 下にドラッグ: ⊔の形（開口部が上側）
                // メインのコの字
                ctx.beginPath();
                ctx.moveTo(leftX, topY);
                ctx.lineTo(leftX, bottomY);
                ctx.lineTo(rightX, bottomY);
                ctx.lineTo(rightX, topY);
                ctx.stroke();
                // 左端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(leftX, topY);
                ctx.lineTo(leftX - serifSize, topY);
                ctx.stroke();
                // 右端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(rightX, topY);
                ctx.lineTo(rightX + serifSize, topY);
                ctx.stroke();
            } else {
                // 上にドラッグ: ⊓の形（開口部が下側）
                // メインのコの字
                ctx.beginPath();
                ctx.moveTo(leftX, bottomY);
                ctx.lineTo(leftX, topY);
                ctx.lineTo(rightX, topY);
                ctx.lineTo(rightX, bottomY);
                ctx.stroke();
                // 左端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(leftX, bottomY);
                ctx.lineTo(leftX - serifSize, bottomY);
                ctx.stroke();
                // 右端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(rightX, bottomY);
                ctx.lineTo(rightX + serifSize, bottomY);
                ctx.stroke();
            }
        }
    }

    /**
     * 直線描画中の処理
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     * @param {boolean} isShiftPressed - Shiftキーが押されているか
     */
    function drawLine(ctx, startPos, pos, snapshot, isShiftPressed) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();

        let endX = pos.x;
        let endY = pos.y;

        // Shiftキーで水平・垂直の直線に制限
        if (isShiftPressed) {
            const dx = Math.abs(pos.x - startPos.x);
            const dy = Math.abs(pos.y - startPos.y);
            if (dx > dy) {
                endY = startPos.y;
            } else {
                endX = startPos.x;
            }
        }

        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }

    /**
     * テキストモード描画中の処理（引出線プレビュー）
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     */
    function drawTextPreview(ctx, startPos, pos, snapshot) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }

    /**
     * 画像配置プレビュー描画中の処理
     * @param {CanvasRenderingContext2D} ctx - コンテキスト
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} pos - 現在位置
     * @param {ImageData} snapshot - スナップショット
     * @param {HTMLImageElement} pendingImage - 配置する画像
     */
    function drawImagePreview(ctx, startPos, pos, snapshot, pendingImage) {
        ctx.putImageData(snapshot, 0, 0);

        // アスペクト比を保持して画像サイズを計算
        const imgAspect = pendingImage.naturalWidth / pendingImage.naturalHeight;
        const dragW = pos.x - startPos.x;
        const dragH = pos.y - startPos.y;
        let w, h;

        if (Math.abs(dragW / dragH) > imgAspect) {
            h = dragH;
            w = dragH * imgAspect * Math.sign(dragW);
        } else {
            w = dragW;
            h = dragW / imgAspect * Math.sign(dragH);
        }

        ctx.drawImage(pendingImage, startPos.x, startPos.y, w, h);

        // 点線の枠を描画
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(startPos.x, startPos.y, w, h);
        ctx.restore();
    }

    // ========================================
    // モード別の描画完了処理 (stopDrawing)
    // ========================================

    /**
     * ペンストロークの保存データを作成
     * @param {Array} points - ポイント配列
     * @param {string} color - 色
     * @param {number} lineWidth - 線幅
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizePenStroke(points, color, lineWidth) {
        if (points.length <= 1) return null;

        return {
            type: 'pen',
            points: [...points],
            color: color,
            lineWidth: lineWidth
        };
    }

    /**
     * マーカーストロークの保存データを作成
     * @param {Array} points - ポイント配列
     * @param {string} color - 色
     * @param {number} lineWidth - 線幅
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeMarkerStroke(points, color, lineWidth) {
        if (points.length <= 1) return null;

        return {
            type: 'marker',
            points: [...points],
            color: color,
            lineWidth: lineWidth,
            opacity: 0.3,
            compositeOp: 'multiply'
        };
    }

    /**
     * 消しゴムストロークの保存データを作成
     * @param {Array} points - ポイント配列
     * @param {number} eraserSize - 消しゴムサイズ
     * @param {number} pageNum - ページ番号
     * @param {Object} DrawingObjects - オブジェクト管理モジュール
     * @param {Object} DrawingRenderer - レンダラーモジュール
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeEraserStroke(points, eraserSize, pageNum, DrawingObjects, DrawingRenderer) {
        if (points.length <= 1) return null;

        const eraserStroke = {
            points: [...points],
            lineWidth: eraserSize
        };

        // 消しゴムストロークのバウンディングボックスを計算
        const eraserBounds = getEraserBounds(eraserStroke);

        // 交差するオブジェクトのIDを検出
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

            const objBounds = DrawingRenderer.getBounds(obj);
            if (Utils.boundsIntersect(eraserBounds, objBounds)) {
                linkedObjectIds.push(obj.id);
            }
        }

        return {
            type: 'eraser',
            points: [...points],
            lineWidth: eraserSize,
            linkedObjectIds: linkedObjectIds
        };
    }

    /**
     * 消しゴムストロークのバウンディングボックスを計算
     * @param {Object} eraserStroke - 消しゴムストローク
     * @returns {{x: number, y: number, width: number, height: number}}
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
     * 直線の保存データを作成
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} currentPos - 現在位置
     * @param {string} color - 色
     * @param {number} lineWidth - 線幅
     * @param {boolean} isShiftPressed - Shiftキーが押されているか
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeLine(startPos, currentPos, color, lineWidth, isShiftPressed) {
        let endX = currentPos.x;
        let endY = currentPos.y;

        if (isShiftPressed) {
            const dx = Math.abs(currentPos.x - startPos.x);
            const dy = Math.abs(currentPos.y - startPos.y);
            if (dx > dy) {
                endY = startPos.y;
            } else {
                endX = startPos.x;
            }
        }

        const dist = Utils.distance(startPos, { x: endX, y: endY });
        const minSize = Constants ? Constants.THRESHOLDS.MIN_SHAPE_SIZE : 5;

        if (dist <= minSize) return null;

        return {
            type: 'line',
            startPos: { ...startPos },
            endPos: { x: endX, y: endY },
            color: color,
            lineWidth: lineWidth
        };
    }

    /**
     * 矩形の保存データを作成
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} currentPos - 現在位置
     * @param {string} color - 色
     * @param {number} lineWidth - 線幅
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeRect(startPos, currentPos, color, lineWidth) {
        const w = Math.abs(currentPos.x - startPos.x);
        const h = Math.abs(currentPos.y - startPos.y);
        const minSize = Constants ? Constants.THRESHOLDS.MIN_SHAPE_SIZE : 5;

        if (w <= minSize || h <= minSize) return null;

        return {
            type: 'rect',
            startPos: { ...startPos },
            endPos: { ...currentPos },
            color: color,
            lineWidth: lineWidth
        };
    }

    /**
     * ラベル付き枠線の保存データを作成
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} currentPos - 現在位置
     * @param {string} color - 色
     * @param {number} lineWidth - 線幅
     * @param {string} label - ラベル文字（1文字）
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeLabeledRect(startPos, currentPos, color, lineWidth, label) {
        const w = Math.abs(currentPos.x - startPos.x);
        const h = Math.abs(currentPos.y - startPos.y);
        const minSize = Constants ? Constants.THRESHOLDS.MIN_SHAPE_SIZE : 5;

        if (w <= minSize || h <= minSize) return null;

        return {
            type: 'labeledRect',
            startPos: { ...startPos },
            endPos: { ...currentPos },
            color: color,
            lineWidth: lineWidth,
            label: label || ''
        };
    }

    /**
     * 楕円の保存データを作成
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} currentPos - 現在位置
     * @param {string} color - 色
     * @param {number} lineWidth - 線幅
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeEllipse(startPos, currentPos, color, lineWidth) {
        const w = Math.abs(currentPos.x - startPos.x);
        const h = Math.abs(currentPos.y - startPos.y);
        const minSize = Constants ? Constants.THRESHOLDS.MIN_SHAPE_SIZE : 5;

        if (w <= minSize || h <= minSize) return null;

        return {
            type: 'ellipse',
            startPos: { ...startPos },
            endPos: { ...currentPos },
            color: color,
            lineWidth: lineWidth
        };
    }

    /**
     * 半円の保存データを作成
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} currentPos - 現在位置
     * @param {string} color - 色
     * @param {number} lineWidth - 線幅
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeSemicircle(startPos, currentPos, color, lineWidth) {
        const w = Math.abs(currentPos.x - startPos.x);
        const h = Math.abs(currentPos.y - startPos.y);
        const minSize = Constants ? Constants.THRESHOLDS.MIN_SHAPE_SIZE : 5;

        if (w <= minSize && h <= minSize) return null;

        const orientation = h > w ? 'vertical' : 'horizontal';

        return {
            type: 'semicircle',
            startPos: { ...startPos },
            endPos: { ...currentPos },
            color: color,
            lineWidth: lineWidth,
            orientation: orientation
        };
    }

    /**
     * くの字の保存データを作成
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} currentPos - 現在位置
     * @param {string} color - 色
     * @param {number} lineWidth - 線幅
     * @param {boolean} isCtrlPressed - Ctrlキーが押されているか
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeChevron(startPos, currentPos, color, lineWidth, isCtrlPressed) {
        const w = Math.abs(currentPos.x - startPos.x);
        const h = Math.abs(currentPos.y - startPos.y);
        const minSize = Constants ? Constants.THRESHOLDS.MIN_SHAPE_SIZE : 5;

        if (w <= minSize && h <= minSize) return null;

        // Ctrlキーで頂点位置を下に変更
        // 通常時: 常にvertical（頂点右）、Ctrl時: horizontal（頂点下）
        const orientation = isCtrlPressed ? 'horizontal' : 'vertical';
        const flipped = false; // 常にfalse（方向はorientationで決定）

        return {
            type: 'chevron',
            startPos: { ...startPos },
            endPos: { ...currentPos },
            color: color,
            lineWidth: lineWidth,
            orientation: orientation,
            flipped: flipped
        };
    }

    /**
     * L字の保存データを作成
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} currentPos - 現在位置
     * @param {string} color - 色
     * @param {number} lineWidth - 線幅
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeLshape(startPos, currentPos, color, lineWidth) {
        const w = Math.abs(currentPos.x - startPos.x);
        const h = Math.abs(currentPos.y - startPos.y);
        const minSize = Constants ? Constants.THRESHOLDS.MIN_SHAPE_SIZE : 5;

        if (w <= minSize && h <= minSize) return null;

        const dx = currentPos.x - startPos.x;
        const dy = currentPos.y - startPos.y;

        // direction: 0=右下(L), 1=左下(⌐), 2=右上(Γ), 3=左上(⌝)
        let direction;
        if (dx >= 0 && dy >= 0) {
            direction = 0; // L（標準形、左上が角）
        } else if (dx < 0 && dy >= 0) {
            direction = 1; // ⌐（右上が角）
        } else if (dx >= 0 && dy < 0) {
            direction = 2; // Γ（左下が角）
        } else {
            direction = 3; // ⌝（右下が角）
        }

        return {
            type: 'lshape',
            startPos: { ...startPos },
            endPos: { ...currentPos },
            color: color,
            lineWidth: lineWidth,
            direction: direction
        };
    }

    /**
     * Z字の保存データを作成（クランク形状）
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} currentPos - 現在位置
     * @param {string} color - 色
     * @param {number} lineWidth - 線幅
     * @param {boolean} isCtrlPressed - Ctrlキーが押されているか（90度回転）
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeZshape(startPos, currentPos, color, lineWidth, isCtrlPressed) {
        const w = Math.abs(currentPos.x - startPos.x);
        const h = Math.abs(currentPos.y - startPos.y);
        const minSize = Constants ? Constants.THRESHOLDS.MIN_SHAPE_SIZE : 5;

        if (w <= minSize && h <= minSize) return null;

        return {
            type: 'zshape',
            startPos: { ...startPos },
            endPos: { ...currentPos },
            color: color,
            lineWidth: lineWidth,
            rotated: isCtrlPressed || false  // trueの場合は横→縦→横の形状
        };
    }

    /**
     * コの字の保存データを作成
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} currentPos - 現在位置
     * @param {string} color - 色
     * @param {number} lineWidth - 線幅
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeBracket(startPos, currentPos, color, lineWidth) {
        const w = Math.abs(currentPos.x - startPos.x);
        const h = Math.abs(currentPos.y - startPos.y);
        const minSize = Constants ? Constants.THRESHOLDS.MIN_SHAPE_SIZE : 5;

        if (w <= minSize && h <= minSize) return null;

        const orientation = h > w ? 'vertical' : 'horizontal';
        const dx = currentPos.x - startPos.x;
        const dy = currentPos.y - startPos.y;
        // 縦向きの場合は左にドラッグで反転、横向きの場合は下にドラッグで反転
        const flipped = (orientation === 'vertical') ? (dx < 0) : (dy >= 0);

        return {
            type: 'bracket',
            startPos: { ...startPos },
            endPos: { ...currentPos },
            color: color,
            lineWidth: lineWidth,
            orientation: orientation,
            flipped: flipped
        };
    }

    /**
     * 画像の保存データを作成
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} currentPos - 現在位置
     * @param {HTMLImageElement} pendingImage - 配置する画像
     * @returns {Object|null} 保存用オブジェクト
     */
    function finalizeImage(startPos, currentPos, pendingImage) {
        const imgAspect = pendingImage.naturalWidth / pendingImage.naturalHeight;
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

        const minSize = Constants ? Constants.THRESHOLDS.MIN_SHAPE_SIZE : 5;

        if (Math.abs(w) <= minSize || Math.abs(h) <= minSize) return null;

        return {
            type: 'image',
            startPos: { ...startPos },
            endPos: { x: startPos.x + w, y: startPos.y + h },
            imageData: pendingImage
        };
    }

    // ========================================
    // 引出線関連
    // ========================================

    /**
     * 引出線の開始位置を取得
     * @param {string} mode - 現在のモード
     * @param {{x: number, y: number}} startPos - 描画開始位置
     * @param {{x: number, y: number}} shapeEndPos - 図形終了位置
     * @param {{x: number, y: number}} targetPos - ターゲット位置
     * @returns {{x: number, y: number}} 引出線開始位置
     */
    function getLeaderStartPos(mode, startPos, shapeEndPos, targetPos) {
        // 矩形・画像: 4辺の中点から最も近い点を選択
        if (mode === 'rect' || mode === 'image' || mode === 'fontLabel') {
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
                const dist = Utils.distance(targetPos, p);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = p;
                }
            });

            return nearest;
        }

        if (mode === 'text') {
            return shapeEndPos;
        }

        if (mode === 'line' || mode === 'arrow' || mode === 'doubleArrow' || mode === 'doubleArrowAnnotated') {
            return {
                x: (startPos.x + shapeEndPos.x) / 2,
                y: (startPos.y + shapeEndPos.y) / 2
            };
        }

        // 楕円: 周辺上の点を計算
        if (mode === 'ellipse') {
            const w = Math.abs(shapeEndPos.x - startPos.x);
            const h = Math.abs(shapeEndPos.y - startPos.y);
            const cx = startPos.x + (shapeEndPos.x - startPos.x) / 2;
            const cy = startPos.y + (shapeEndPos.y - startPos.y) / 2;
            const rx = w / 2;
            const ry = h / 2;
            const dx = targetPos.x - cx;
            const dy = targetPos.y - cy;
            const angle = Math.atan2(dy, dx);
            return {
                x: cx + rx * Math.cos(angle),
                y: cy + ry * Math.sin(angle)
            };
        }

        // 半円: 楕円と同様の計算（弧の部分のみ）
        if (mode === 'semicircle') {
            const w = Math.abs(shapeEndPos.x - startPos.x);
            const h = Math.abs(shapeEndPos.y - startPos.y);
            const cx = startPos.x + (shapeEndPos.x - startPos.x) / 2;
            const cy = startPos.y + (shapeEndPos.y - startPos.y) / 2;
            const rx = w / 2;
            const ry = h / 2;
            const dx = targetPos.x - cx;
            const dy = targetPos.y - cy;
            const angle = Math.atan2(dy, dx);
            return {
                x: cx + rx * Math.cos(angle),
                y: cy + ry * Math.sin(angle)
            };
        }

        // くの字・L字・Z字・コの字: バウンディングボックスの中心を使用
        if (mode === 'chevron' || mode === 'lshape' || mode === 'zshape' || mode === 'bracket') {
            const minX = Math.min(startPos.x, shapeEndPos.x);
            const maxX = Math.max(startPos.x, shapeEndPos.x);
            const minY = Math.min(startPos.y, shapeEndPos.y);
            const maxY = Math.max(startPos.y, shapeEndPos.y);
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            // ターゲット方向へ向かうエッジ上の点を計算
            const candidates = [
                { x: centerX, y: minY }, { x: centerX, y: maxY },
                { x: minX, y: centerY }, { x: maxX, y: centerY }
            ];

            let nearest = candidates[0];
            let minDist = Infinity;

            candidates.forEach(p => {
                const dist = Utils.distance(targetPos, p);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = p;
                }
            });

            return nearest;
        }

        return shapeEndPos;
    }

    /**
     * アノテーションテキストのバウンディングボックスを計算
     * @param {object} annotation - アノテーションオブジェクト
     * @returns {object} バウンディングボックス { minX, maxX, minY, maxY, centerX, centerY }
     */
    function getAnnotationTextBounds(annotation) {
        if (!annotation || !annotation.text) {
            return null;
        }

        const ann = annotation;
        const fontSize = ann.fontSize || 16;
        const lines = ann.text.split('\n');

        let minX, maxX, minY, maxY;

        if (ann.isVertical) {
            // 縦書きの場合
            const lineHeight = fontSize * 1.1;
            const charCounts = lines.map(line => Array.from(line).length);
            const maxCharsInLine = Math.max(...charCounts, 1);
            const textHeight = maxCharsInLine * fontSize;
            const totalWidth = Math.max(lines.length, 1) * lineHeight;

            // 縦書き: textAlign='center', textBaseline='middle' で描画
            // 最初の文字の中心は ann.y + fontSize/2 なので、上端は ann.y
            minX = ann.x - totalWidth + fontSize / 2;
            maxX = ann.x + fontSize / 2;
            minY = ann.y;
            maxY = ann.y + textHeight;
        } else {
            // 横書きの場合
            const lineHeight = fontSize * 1.2;
            const charWidths = lines.map(line => {
                let width = 0;
                for (const char of line) {
                    if (char.charCodeAt(0) < 128) {
                        width += fontSize * 0.6;
                    } else {
                        width += fontSize;
                    }
                }
                return width;
            });
            const maxLineWidth = Math.max(...charWidths, fontSize);
            const textHeight = lines.length * lineHeight;

            if (ann.align === 'right') {
                minX = ann.x - maxLineWidth;
                maxX = ann.x;
            } else {
                minX = ann.x;
                maxX = ann.x + maxLineWidth;
            }
            minY = ann.y;
            maxY = ann.y + textHeight - (lineHeight - fontSize);
        }

        return {
            minX,
            maxX,
            minY,
            maxY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    /**
     * アノテーションテキスト側の引出線終端位置を計算
     * テキストのバウンディングボックスの4辺の中点から、図形の起点に最も近い点を選択
     * テキストとの間にマージンを設けて、線がテキストに被らないようにする
     * @param {object} annotation - アノテーションオブジェクト
     * @param {object} shapeStartPos - 図形側の引出線起点
     * @returns {object} 引出線終端位置 { x, y }
     */
    function getLeaderEndPos(annotation, shapeStartPos) {
        const bounds = getAnnotationTextBounds(annotation);
        if (!bounds) {
            // フォールバック: アノテーションの位置をそのまま返す
            return { x: annotation.x, y: annotation.y };
        }

        // テキストとの間隔（マージン）
        const margin = 6;

        // 4辺の中点を候補として用意（マージン分離す）
        const candidates = [
            { x: bounds.centerX, y: bounds.minY - margin, side: 'top' },     // 上
            { x: bounds.centerX, y: bounds.maxY + margin, side: 'bottom' },  // 下
            { x: bounds.minX - margin, y: bounds.centerY, side: 'left' },    // 左
            { x: bounds.maxX + margin, y: bounds.centerY, side: 'right' }    // 右
        ];

        // 図形の起点に最も近い点を選択
        let nearest = candidates[0];
        let minDist = Infinity;

        candidates.forEach(p => {
            const dist = Utils.distance(shapeStartPos, p);
            if (dist < minDist) {
                minDist = dist;
                nearest = p;
            }
        });

        return { x: nearest.x, y: nearest.y };
    }

    /**
     * 指示スタンプのバウンディングボックスを計算
     * 実際のテキスト幅に基づいて正確に計算
     * @param {object} obj - スタンプオブジェクト
     * @returns {object} バウンディングボックス { minX, maxX, minY, maxY, centerX, centerY }
     */
    function getInstructionStampBounds(obj) {
        if (!obj || !obj.startPos) return null;

        const x = obj.startPos.x;
        const y = obj.startPos.y;
        const size = obj.size || 28;
        const fontSize = size * 0.9;  // 実際の描画フォントサイズ

        // スタンプの種類に応じてテキスト文字数を取得
        let charCount;
        switch (obj.type) {
            case 'toruStamp':      // トル (2文字)
                charCount = 2;
                break;
            case 'torutsumeStamp': // トルツメ (4文字)
            case 'torumamaStamp':  // トルママ (4文字)
                charCount = 4;
                break;
            case 'zenkakuakiStamp': // 全角アキ (4文字)
            case 'nibunakiStamp':   // 二分アキ (4文字)
            case 'shibunakiStamp':  // 四分アキ (4文字)
                charCount = 4;
                break;
            case 'kaigyouStamp':   // 改行 (2文字)
                charCount = 2;
                break;
            default:
                charCount = 2;
        }

        // テキスト幅 = 文字数 × フォントサイズ（全角文字）
        const width = charCount * fontSize;
        const height = fontSize;

        const minX = x - width / 2;
        const maxX = x + width / 2;
        const minY = y - height / 2;
        const maxY = y + height / 2;

        return {
            minX,
            maxX,
            minY,
            maxY,
            centerX: x,
            centerY: y
        };
    }

    /**
     * fontLabel（文字サイズスタンプ）のテキスト部分のバウンディングボックスを計算
     * @param {object} obj - fontLabelオブジェクト
     * @returns {object} バウンディングボックス { minX, maxX, minY, maxY, centerX, centerY }
     */
    function getFontLabelTextBounds(obj) {
        if (!obj || obj.type !== 'fontLabel' || !obj.fontName) return null;

        const fontSize = obj.fontSize || 12;
        const text = obj.fontName;

        // テキスト幅を計算（全角文字と半角文字を考慮）
        let textWidth = 0;
        for (const char of text) {
            if (char.charCodeAt(0) < 128) {
                textWidth += fontSize * 0.6;
            } else {
                textWidth += fontSize;
            }
        }

        const textHeight = fontSize;
        const textX = obj.textX;
        const textY = obj.textY;
        const textAlign = obj.textAlign || 'left';
        const isBelow = obj.endPos.y > obj.startPos.y;

        let minX, maxX, minY, maxY;

        if (textAlign === 'right') {
            minX = textX - textWidth;
            maxX = textX;
        } else {
            minX = textX;
            maxX = textX + textWidth;
        }

        if (isBelow) {
            // textBaseline = 'top'
            minY = textY;
            maxY = textY + textHeight;
        } else {
            // textBaseline = 'bottom'
            minY = textY - textHeight;
            maxY = textY;
        }

        return {
            minX,
            maxX,
            minY,
            maxY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    /**
     * textオブジェクトのバウンディングボックスを計算
     * @param {object} obj - textオブジェクト
     * @returns {object} バウンディングボックス { minX, maxX, minY, maxY, centerX, centerY }
     */
    function getTextObjectBounds(obj) {
        if (!obj || obj.type !== 'text' || !obj.text) return null;

        const fontSize = obj.fontSize || 16;
        const lines = obj.text.split('\n');
        const x = obj.startPos.x;
        const y = obj.startPos.y;

        let minX, maxX, minY, maxY;

        if (obj.isVertical) {
            // 縦書きの場合
            const lineHeight = fontSize * 1.1;
            const charCounts = lines.map(line => Array.from(line).length);
            const maxCharsInLine = Math.max(...charCounts, 1);
            const textHeight = maxCharsInLine * fontSize;
            const totalWidth = Math.max(lines.length, 1) * lineHeight;

            minX = x - totalWidth + fontSize / 2;
            maxX = x + fontSize / 2;
            minY = y;
            maxY = y + textHeight;
        } else {
            // 横書きの場合
            const lineHeight = fontSize * 1.2;
            const charWidths = lines.map(line => {
                let width = 0;
                for (const char of line) {
                    if (char.charCodeAt(0) < 128) {
                        width += fontSize * 0.6;
                    } else {
                        width += fontSize;
                    }
                }
                return width;
            });
            const maxLineWidth = Math.max(...charWidths, fontSize);
            const textHeight = lines.length * lineHeight;

            if (obj.align === 'right') {
                minX = x - maxLineWidth;
                maxX = x;
            } else {
                minX = x;
                maxX = x + maxLineWidth;
            }
            minY = y;
            maxY = y + textHeight - (lineHeight - fontSize);
        }

        return {
            minX,
            maxX,
            minY,
            maxY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    /**
     * 指示スタンプ・fontLabel・text用の引出線終端位置を計算
     * スタンプ/ラベル/テキストのバウンディングボックスから、引出線起点に最も近い点を選択
     * @param {object} obj - スタンプまたはfontLabelまたはtextオブジェクト
     * @param {object} leaderStart - 引出線の起点（対象を指す側）
     * @returns {object} 引出線終端位置 { x, y }
     */
    function getStampLeaderEndPos(obj, leaderStart) {
        let bounds = null;

        // オブジェクトタイプに応じてバウンディングボックスを取得
        if (obj.type === 'fontLabel') {
            bounds = getFontLabelTextBounds(obj);
        } else if (obj.type === 'text') {
            bounds = getTextObjectBounds(obj);
        } else {
            bounds = getInstructionStampBounds(obj);
        }

        if (!bounds) {
            // フォールバック: startPosをそのまま返す
            return obj.startPos ? { x: obj.startPos.x, y: obj.startPos.y } : { x: 0, y: 0 };
        }

        // テキスト/スタンプとの間隔（マージン）- 指示スタンプは少し大きめのマージン
        const instructionStampTypes = ['toruStamp', 'torutsumeStamp', 'torumamaStamp', 'zenkakuakiStamp', 'nibunakiStamp', 'shibunakiStamp', 'kaigyouStamp'];
        const margin = instructionStampTypes.includes(obj.type) ? 8 : 6;

        // 4辺の中点を候補として用意（マージン分離す）
        const candidates = [
            { x: bounds.centerX, y: bounds.minY - margin },  // 上
            { x: bounds.centerX, y: bounds.maxY + margin },  // 下
            { x: bounds.minX - margin, y: bounds.centerY },  // 左
            { x: bounds.maxX + margin, y: bounds.centerY }   // 右
        ];

        // 引出線起点に最も近い点を選択
        let nearest = candidates[0];
        let minDist = Infinity;

        candidates.forEach(p => {
            const dist = Utils.distance(leaderStart, p);
            if (dist < minDist) {
                minDist = dist;
                nearest = p;
            }
        });

        return { x: nearest.x, y: nearest.y };
    }

    // ========================================
    // 公開API
    // ========================================

    return Object.freeze({
        // 描画中処理
        drawMarker,
        drawPen,
        drawEraser,
        drawRect,
        drawLabeledRect,
        drawEllipse,
        drawSemicircle,
        drawChevron,
        drawLshape,
        drawZshape,
        drawBracket,
        drawLine,
        drawTextPreview,
        drawImagePreview,

        // 描画完了処理
        finalizePenStroke,
        finalizeMarkerStroke,
        finalizeEraserStroke,
        finalizeLine,
        finalizeRect,
        finalizeLabeledRect,
        finalizeEllipse,
        finalizeSemicircle,
        finalizeChevron,
        finalizeLshape,
        finalizeZshape,
        finalizeBracket,
        finalizeImage,

        // ユーティリティ
        getEraserBounds,
        getLeaderStartPos,
        getLeaderEndPos,
        getAnnotationTextBounds,
        getInstructionStampBounds,
        getFontLabelTextBounds,
        getTextObjectBounds,
        getStampLeaderEndPos
    });
})();
