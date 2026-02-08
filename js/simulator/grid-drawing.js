/**
 * Simulator Grid Drawing
 * グリッド描画モジュール
 */
window.SimulatorGridDrawing = (function() {
    'use strict';

    const State = window.SimulatorState;
    const DOM = window.SimulatorDOM;

    // ヘルパー関数: ハンドル位置の取得（枠線の外側に配置）
    const HANDLE_OFFSET = 8; // ハンドルの外側オフセット
    function getHandleRects(state) {
        if (!state) return null;
        const pixelsPerMm = State.get('pixelsPerMm');
        const cellSize = state.ptSize * State.MM_PER_PT * pixelsPerMm;
        const isHorizontal = state.writingMode === 'horizontal';
        const width = (isHorizontal ? state.chars : state.lines) * cellSize;
        const height = (isHorizontal ? state.lines : state.chars) * cellSize;

        const x1 = state.startPos.x - HANDLE_OFFSET;
        const x2 = state.startPos.x + width / 2;
        const x3 = state.startPos.x + width + HANDLE_OFFSET;
        const y1 = state.startPos.y - HANDLE_OFFSET;
        const y2 = state.startPos.y + height / 2;
        const y3 = state.startPos.y + height + HANDLE_OFFSET;
        return {
            tl: { x: x1, y: y1 }, tm: { x: x2, y: y1 }, tr: { x: x3, y: y1 },
            ml: { x: x1, y: y2 }, mr: { x: x3, y: y2 },
            bl: { x: x1, y: y3 }, bm: { x: x2, y: y3 }, br: { x: x3, y: y3 }
        };
    }

    // ヘルパー関数: グリッド辺・角のヒット判定（ハンドルは枠線の外側）
    function checkHandleHit(pos, state) {
        if (!state) return null;
        const pixelsPerMm = State.get('pixelsPerMm');
        const cellSize = state.ptSize * State.MM_PER_PT * pixelsPerMm;
        const isHorizontal = state.writingMode === 'horizontal';
        const width = (isHorizontal ? state.chars : state.lines) * cellSize;
        const height = (isHorizontal ? state.lines : state.chars) * cellSize;

        const left = state.startPos.x;
        const right = state.startPos.x + width;
        const top = state.startPos.y;
        const bottom = state.startPos.y + height;

        const cornerThreshold = 12; // 角のヒット判定範囲

        // 角の判定（外側に配置されたハンドル位置で判定）
        const handleLeft = left - HANDLE_OFFSET;
        const handleRight = right + HANDLE_OFFSET;
        const handleTop = top - HANDLE_OFFSET;
        const handleBottom = bottom + HANDLE_OFFSET;

        if (Math.abs(pos.x - handleLeft) < cornerThreshold && Math.abs(pos.y - handleTop) < cornerThreshold) return 'tl';
        if (Math.abs(pos.x - handleRight) < cornerThreshold && Math.abs(pos.y - handleTop) < cornerThreshold) return 'tr';
        if (Math.abs(pos.x - handleLeft) < cornerThreshold && Math.abs(pos.y - handleBottom) < cornerThreshold) return 'bl';
        if (Math.abs(pos.x - handleRight) < cornerThreshold && Math.abs(pos.y - handleBottom) < cornerThreshold) return 'br';

        // 辺の判定（枠線上で判定）
        const edgeThreshold = 8;
        if (Math.abs(pos.x - left) < edgeThreshold && pos.y > top && pos.y < bottom) return 'ml';
        if (Math.abs(pos.x - right) < edgeThreshold && pos.y > top && pos.y < bottom) return 'mr';
        if (Math.abs(pos.y - top) < edgeThreshold && pos.x > left && pos.x < right) return 'tm';
        if (Math.abs(pos.y - bottom) < edgeThreshold && pos.x > left && pos.x < right) return 'bm';

        return null;
    }

    // ヘルパー関数: 点が矩形内かどうか
    function isPointInRect(point, rectStart, width, height) {
        return point.x >= rectStart.x && point.x <= rectStart.x + width &&
               point.y >= rectStart.y && point.y <= rectStart.y + height;
    }

    // 全グリッドを描画（確定済みグリッド）
    function drawAllGrids(pageNum, excludeIndex) {
        const grids = State.getPageGrids(pageNum);
        const selectedIdx = State.getSelectedIndex(pageNum);

        grids.forEach((grid, idx) => {
            if (excludeIndex !== undefined && idx === excludeIndex) return;
            // 確定済みグリッドを描画（調整中でない状態で描画）
            drawFixedGrid(grid, false);
        });
    }

    // グリッド状態の復元（複数グリッド対応）
    function restoreGridState(num) {
        const ctx = DOM.getCtx();
        const canvas = DOM.getCanvas();
        const gridLinesInput = DOM.get('gridLinesInput');
        const gridCharsInput = DOM.get('gridCharsInput');
        const fontSizeInput = DOM.get('fontSizeInput');
        const gridTextInput = DOM.get('gridTextInput');
        const adjustMessage = DOM.get('adjustMessage');
        const sizeTooltip = DOM.get('sizeTooltip');

        // ページデータ初期化
        State.initPageGridData(num);

        // 全確定グリッドを描画
        drawAllGrids(num);

        // 選択中のグリッドがあれば調整モードに入る
        const selectedGrid = State.getSelectedGrid(num);

        if (selectedGrid) {
            const pendingGridState = MojiQClone.deep(selectedGrid);
            State.set('pendingGridState', pendingGridState);
            State.set('isGridAdjusting', true);

            gridLinesInput.value = pendingGridState.lines;
            gridCharsInput.value = pendingGridState.chars;
            fontSizeInput.value = pendingGridState.ptSize;
            if (pendingGridState.textData) gridTextInput.value = pendingGridState.textData;

            const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
            State.set('snapshot', snapshot);

            drawFixedGrid(pendingGridState, true);
            if (window.SimulatorUI) {
                window.SimulatorUI.updateFixedTooltip(pendingGridState, null);
            }

            adjustMessage.classList.add('active');

            if (window.SimulatorUI) {
                window.SimulatorUI.updateDensityUIState();
                window.SimulatorUI.updateWritingModeIcon();
                window.SimulatorUI.updateDashboardHighlight();
                window.SimulatorUI.updateDashboardValues();
            }

            // 削除ボタンを有効化
            if (window.SimulatorTools) {
                window.SimulatorTools.updateDeleteButtonState();
            }
        } else {
            State.set('pendingGridState', null);
            State.set('isGridAdjusting', false);
            adjustMessage.classList.remove('active');
            sizeTooltip.style.display = 'none';

            const currentMode = State.get('currentMode');
            // 統合モード: currentModeで判定
            if (currentMode === 'grid') {
                canvas.style.cursor = 'crosshair';
            } else {
                canvas.style.cursor = 'default';
            }

            // 削除ボタンを無効化
            if (window.SimulatorTools) {
                window.SimulatorTools.updateDeleteButtonState();
            }
        }
    }

    // グリッドのヒットテスト（クリック位置がどのグリッドか判定）
    function hitTestGrids(pageNum, pos) {
        const grids = State.getPageGrids(pageNum);
        const pixelsPerMm = State.get('pixelsPerMm');

        // 逆順でチェック（後から描画されたものが上にあるため）
        for (let i = grids.length - 1; i >= 0; i--) {
            const grid = grids[i];
            const cellSize = grid.ptSize * State.MM_PER_PT * pixelsPerMm;
            const isHorizontal = grid.writingMode === 'horizontal';
            const w = (isHorizontal ? grid.chars : grid.lines) * cellSize;
            const h = (isHorizontal ? grid.lines : grid.chars) * cellSize;

            if (isPointInRect(pos, grid.startPos, w, h)) {
                return i;
            }
        }
        return -1;
    }

    // グリッド描画
    function drawFixedGrid(state, isAdjusting) {
        const isCalibrated = State.get('isCalibrated');
        if (!isCalibrated) return;

        const ctx = DOM.getCtx();
        const pixelsPerMm = State.get('pixelsPerMm');
        const { startPos, lines, chars, ptSize, writingMode } = state;
        const cellSize = ptSize * State.MM_PER_PT * pixelsPerMm;
        const isHorizontal = writingMode === 'horizontal';
        const width = (isHorizontal ? chars : lines) * cellSize;
        const height = (isHorizontal ? lines : chars) * cellSize;

        // グリッド全体の透明度を設定
        ctx.save();
        ctx.globalAlpha = 0.7;

        // 背景塗りつぶし
        ctx.save();
        ctx.fillStyle = isAdjusting ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.05)";
        ctx.fillRect(startPos.x, startPos.y, width, height);
        ctx.restore();

        // 外枠
        ctx.beginPath();
        ctx.rect(startPos.x, startPos.y, width, height);
        ctx.strokeStyle = state.isLocked ? "#fbc02d" : (isAdjusting ? "#00bcd4" : "#008000");
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 内部グリッド
        ctx.beginPath();
        const hLineCount = isHorizontal ? lines : chars;
        const vLineCount = isHorizontal ? chars : lines;

        for (let i = 1; i < hLineCount; i++) {
            const y = startPos.y + i * cellSize;
            ctx.moveTo(startPos.x, y);
            ctx.lineTo(startPos.x + width, y);
        }
        for (let i = 1; i < vLineCount; i++) {
            const x = startPos.x + i * cellSize;
            ctx.moveTo(x, startPos.y);
            ctx.lineTo(x, startPos.y + height);
        }
        ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // テキスト描画
        if (state.textData && state.textData.trim().length > 0) {
            ctx.save();
            const textLines = state.textData.split(/\r\n|\n/);
            const fontSize = cellSize * 0.85;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // 句読点（右上に移動）
            const punctuationChars = ['、', '。', '，', '．', '｡', '､'];

            if (isHorizontal) {
                // 半角記号（組み合わせて1セルに収める）
                const halfWidthSymbols = ['!', '?', '？', '！'];

                for (let lineIdx = 0; lineIdx < textLines.length && lineIdx < lines; lineIdx++) {
                    const lineText = textLines[lineIdx];

                    // 半角記号のペアを検出して結合したトークン配列を作成
                    const tokens = [];
                    let i = 0;
                    while (i < lineText.length) {
                        const char = lineText[i];
                        const nextChar = lineText[i + 1];

                        // 連続する半角記号を1トークンとして結合
                        if (halfWidthSymbols.includes(char) && nextChar && halfWidthSymbols.includes(nextChar)) {
                            tokens.push(char + nextChar);
                            i += 2;
                        } else {
                            tokens.push(char);
                            i++;
                        }
                    }

                    for (let tokenIdx = 0; tokenIdx < tokens.length && tokenIdx < chars; tokenIdx++) {
                        const token = tokens[tokenIdx];
                        const cx = startPos.x + tokenIdx * cellSize + cellSize / 2;
                        const cy = startPos.y + lineIdx * cellSize + cellSize / 2;

                        if (token.length === 2) {
                            // 半角記号ペア: 横並びで1セルに描画
                            ctx.save();
                            const halfWidth = fontSize * 0.3;
                            ctx.fillText(token[0], cx - halfWidth, cy);
                            ctx.fillText(token[1], cx + halfWidth, cy);
                            ctx.restore();
                        } else if (punctuationChars.includes(token)) {
                            // 横書き時：句読点は左下に移動（セルの左下隅付近に配置）
                            ctx.save();
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'bottom';
                            const punctX = startPos.x + tokenIdx * cellSize + cellSize * 0.1;
                            const punctY = startPos.y + (lineIdx + 1) * cellSize - cellSize * 0.1;
                            ctx.fillText(token, punctX, punctY);
                            ctx.restore();
                        } else {
                            ctx.fillText(token, cx, cy);
                        }
                    }
                }
            } else {
                // 縦書き時に回転が必要な文字（長音、三点リーダー、括弧類など）
                const needsRotation = ['ー', '−', '―', '…', '(', ')', '（', '）', '[', ']', '「', '」', '～', '〜', '＝', '='];
                // 句読点（右上に移動）- 中点「・」は中央配置のため含めない
                const punctuationChars = ['、', '。', '，', '．', '｡', '､'];
                // 半角記号（組み合わせて1セルに収める）
                const halfWidthSymbols = ['!', '?', '？', '！'];

                for (let lineIdx = 0; lineIdx < textLines.length && lineIdx < lines; lineIdx++) {
                    const lineText = textLines[lineIdx];
                    const colX = startPos.x + (lines - 1 - lineIdx) * cellSize;

                    // 半角記号のペアを検出して結合したトークン配列を作成
                    const tokens = [];
                    let i = 0;
                    while (i < lineText.length) {
                        const char = lineText[i];
                        const nextChar = lineText[i + 1];

                        // 連続する半角記号を1トークンとして結合
                        if (halfWidthSymbols.includes(char) && nextChar && halfWidthSymbols.includes(nextChar)) {
                            tokens.push(char + nextChar);
                            i += 2;
                        } else {
                            tokens.push(char);
                            i++;
                        }
                    }

                    for (let tokenIdx = 0; tokenIdx < tokens.length && tokenIdx < chars; tokenIdx++) {
                        const token = tokens[tokenIdx];
                        const cx = colX + cellSize / 2;
                        const cy = startPos.y + tokenIdx * cellSize + cellSize / 2;

                        if (token.length === 2) {
                            // 半角記号ペア: 横並びで1セルに描画（フォントサイズ維持）
                            ctx.save();
                            // 半角文字なので2文字横並びでほぼ全角1文字分
                            const halfWidth = fontSize * 0.3;
                            ctx.fillText(token[0], cx - halfWidth, cy);
                            ctx.fillText(token[1], cx + halfWidth, cy);
                            ctx.restore();
                        } else if (needsRotation.includes(token)) {
                            // 90度回転して描画
                            ctx.save();
                            ctx.translate(cx, cy);
                            ctx.rotate(Math.PI / 2);
                            ctx.fillText(token, 0, 0);
                            ctx.restore();
                        } else if (punctuationChars.includes(token)) {
                            // 句読点は右上に移動（セルの右上隅付近に配置）
                            ctx.save();
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'bottom';
                            const punctX = colX + cellSize - cellSize * 0.25;
                            const punctY = startPos.y + tokenIdx * cellSize + cellSize * 0.25;
                            ctx.fillText(token, punctX, punctY);
                            ctx.restore();
                        } else {
                            ctx.fillText(token, cx, cy);
                        }
                    }
                }
            }
            ctx.restore();
        }

        // 角のリサイズハンドル描画（調整中かつ非ロック時のみ）
        // ハンドルは枠線の外側に配置
        if (isAdjusting && !state.isLocked) {
            ctx.save();
            const handleSize = 8;
            const handleOffset = handleSize; // ハンドルの中心を枠線の外側に配置
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = "#00bcd4";
            ctx.lineWidth = 1.5;

            // 4つの角にハンドルを描画（外側に配置）
            const corners = [
                { x: startPos.x - handleOffset, y: startPos.y - handleOffset },                    // 左上
                { x: startPos.x + width + handleOffset, y: startPos.y - handleOffset },            // 右上
                { x: startPos.x - handleOffset, y: startPos.y + height + handleOffset },           // 左下
                { x: startPos.x + width + handleOffset, y: startPos.y + height + handleOffset }    // 右下
            ];

            for (const corner of corners) {
                ctx.fillRect(corner.x - handleSize / 2, corner.y - handleSize / 2, handleSize, handleSize);
                ctx.strokeRect(corner.x - handleSize / 2, corner.y - handleSize / 2, handleSize, handleSize);
            }
            ctx.restore();
        }

        // バブルUI描画
        if (isAdjusting) {
            drawComicBubble(ctx, state, startPos.x, startPos.y, width, height);
        }

        // グリッド全体の透明度設定を元に戻す
        ctx.restore();
    }

    // バブルUI描画（プレースホルダー）
    function drawComicBubble(ctx, state, gridX, gridY, gridW, gridH) {
        State.clearBubbleZones();
        // 必要に応じてバブルUI描画ロジックをここに記述
    }

    // グリッド再計算
    function recalculateGrid() {
        const pendingGridState = State.get('pendingGridState');
        if (!pendingGridState || !pendingGridState.constraint) return;

        const ctx = DOM.getCtx();
        const densitySelect = DOM.get('densitySelect');
        const gridLinesInput = DOM.get('gridLinesInput');
        const gridCharsInput = DOM.get('gridCharsInput');
        const fontSizeInput = DOM.get('fontSizeInput');
        const pixelsPerMm = State.get('pixelsPerMm');
        const snapshot = State.get('snapshot');

        const rectW = pendingGridState.constraint.rawW;
        const rectH = pendingGridState.constraint.rawH;

        const density = densitySelect ? densitySelect.value : 'standard';
        let marginRatio = 0.25;
        if (density === 'loose') marginRatio = 0.35;
        if (density === 'tight') marginRatio = 0.15;
        if (density === 'none') marginRatio = 0.0;

        const safeW = rectW * (1 - marginRatio);
        const safeH = rectH * (1 - marginRatio);

        // テキストから行数・文字数を計算
        let lines = 1;
        let chars = 1;
        const text = pendingGridState.textData;
        if (text && text.trim().length > 0) {
            const halfWidthSymbols = ['!', '?', '？', '！'];
            const textLines = text.split(/\r\n|\n/);
            lines = textLines.length;
            for (let l = 0; l < textLines.length; l++) {
                const line = textLines[l];
                let tokenCount = 0;
                let i = 0;
                while (i < line.length) {
                    const char = line[i];
                    const nextChar = line[i + 1];
                    if (halfWidthSymbols.includes(char) && nextChar && halfWidthSymbols.includes(nextChar)) {
                        tokenCount++;
                        i += 2;
                    } else {
                        tokenCount++;
                        i++;
                    }
                }
                if (tokenCount > chars) chars = tokenCount;
            }
        }

        const isHorizontal = pendingGridState.writingMode === 'horizontal';
        // 制約エリア内に収まるセルサイズを計算（行数・文字数の大きい方に合わせる）
        const mainCount = isHorizontal ? lines : chars;
        const crossCount = isHorizontal ? chars : lines;
        const mainDim = isHorizontal ? safeH : safeW;
        const crossDim = isHorizontal ? safeW : safeH;

        let newCellSize = Math.min(mainDim / mainCount, crossDim / crossCount);

        const computedPt = newCellSize / pixelsPerMm / State.MM_PER_PT;
        pendingGridState.ptSize = Math.round(computedPt * 10) / 10;
        fontSizeInput.value = pendingGridState.ptSize;

        pendingGridState.lines = lines;
        pendingGridState.chars = chars;

        const w = (isHorizontal ? chars : lines) * newCellSize;
        const h = (isHorizontal ? lines : chars) * newCellSize;

        pendingGridState.startPos.x = pendingGridState.centerPos.x - w / 2;
        pendingGridState.startPos.y = pendingGridState.centerPos.y - h / 2;

        State.set('pendingGridState', pendingGridState);

        ctx.putImageData(snapshot, 0, 0);
        drawFixedGrid(pendingGridState, true);

        if (window.SimulatorUI) {
            window.SimulatorUI.updateDashboardValues();
        }
    }

    return {
        init: function() {
            // 初期化（必要に応じて）
        },
        restoreGridState: restoreGridState,
        drawFixedGrid: drawFixedGrid,
        drawComicBubble: drawComicBubble,
        recalculateGrid: recalculateGrid,
        getHandleRects: getHandleRects,
        checkHandleHit: checkHandleHit,
        isPointInRect: isPointInRect,
        drawAllGrids: drawAllGrids,
        hitTestGrids: hitTestGrids
    };
})();
