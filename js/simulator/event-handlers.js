/**
 * Simulator Event Handlers
 * マウス/タッチイベント処理モジュール
 */
window.SimulatorEventHandlers = (function() {
    'use strict';

    const State = window.SimulatorState;
    const DOM = window.SimulatorDOM;

    // 座標取得
    // 注意: イベントはmojiqCanvas(whiteboard)で受け取るが、座標はsim-whiteboardと同じサイズなので
    // どちらのキャンバスを基準にしても同じ結果になる
    function getPos(e) {
        // mojiqCanvas（イベントを受け取るキャンバス）を使用
        const canvas = DOM.getMojiqCanvas() || DOM.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX !== undefined ? e.clientX : e.changedTouches[0].clientX;
        const cy = e.clientY !== undefined ? e.clientY : e.changedTouches[0].clientY;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (cx - rect.left) * scaleX,
            y: (cy - rect.top) * scaleY
        };
    }

    // 既存グリッドを選択して調整モードに入る
    function selectExistingGrid(index) {
        const ctx = DOM.getCtx();
        const canvas = DOM.getCanvas();
        const currentPageNum = State.get('currentPageNum');
        const adjustMessage = DOM.get('adjustMessage');
        const gridLinesInput = DOM.get('gridLinesInput');
        const gridCharsInput = DOM.get('gridCharsInput');
        const fontSizeInput = DOM.get('fontSizeInput');
        const gridTextInput = DOM.get('gridTextInput');

        // 選択インデックスを更新
        State.selectGrid(currentPageNum, index);

        // キャンバスをクリアして再描画
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 選択中グリッド以外を確定表示で描画
        window.SimulatorGridDrawing.drawAllGrids(currentPageNum, index);

        // 選択中グリッドを調整モードで表示
        const selectedGrid = State.getSelectedGrid(currentPageNum);
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

            window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);

            adjustMessage.classList.add('active');

            if (window.SimulatorUI) {
                window.SimulatorUI.updateDensityUIState();
                window.SimulatorUI.updateWritingModeIcon();
                window.SimulatorUI.updateDashboardValues();
            }

            // 削除ボタンを有効化
            if (window.SimulatorTools) {
                window.SimulatorTools.updateDeleteButtonState();
            }
        }
    }

    // 描画開始
    function startDraw(e) {
        if (e.type === 'touchstart') e.preventDefault();

        // 統合モード: currentModeがcalibrationまたはgridの場合のみ動作
        const currentMode = State.get('currentMode');
        if (currentMode !== 'calibration' && currentMode !== 'grid') return;

        const isCalibrated = State.get('isCalibrated');
        if (!isCalibrated && currentMode === 'grid') return;

        const pos = getPos(e);
        const isGridAdjusting = State.get('isGridAdjusting');
        const bubbleZones = State.getBubbleZones();
        const pendingGridState = State.get('pendingGridState');
        const canvas = DOM.getCanvas();
        const ctx = DOM.getCtx();
        const canvasArea = DOM.get('canvasArea');

        // バブルUI判定
        if (isGridAdjusting && bubbleZones.length > 0) {
            for (const zone of bubbleZones) {
                if (pos.x >= zone.x && pos.x <= zone.x + zone.w &&
                    pos.y >= zone.y && pos.y <= zone.y + zone.h) {

                    const wheelMode = State.get('wheelMode');
                    if (wheelMode === zone.mode) {
                        if (window.SimulatorUI) window.SimulatorUI.toggleLockMode();
                    } else {
                        if (pendingGridState.isLocked && window.SimulatorUI) {
                            window.SimulatorUI.toggleLockMode();
                        }
                        if (window.SimulatorUI) window.SimulatorUI.setWheelMode(zone.mode);
                    }

                    const snapshot = State.get('snapshot');
                    ctx.putImageData(snapshot, 0, 0);
                    window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);
                    return;
                }
            }
        }

        // パン操作（縮尺合わせモード中はShiftキーで直線を引くので除外）
        const isLeftClick = (e.button === 0 || e.type === 'touchstart');
        const isMiddleClick = (e.button === 1);
        const isSpacePressed = State.get('isSpacePressed');
        const isShiftPressed = State.get('isShiftPressed');

        // 縮尺合わせモード中はShiftキーでパン操作をしない（直線描画用に予約）
        const shouldPanWithShift = isShiftPressed && isLeftClick && currentMode !== 'calibration';

        if ((isSpacePressed && isLeftClick) || shouldPanWithShift || isMiddleClick) {
            e.preventDefault();
            e.stopPropagation();

            State.set('isSimPanning', true);
            State.set('simPanStart', {
                x: e.clientX !== undefined ? e.clientX : e.touches[0].clientX,
                y: e.clientY !== undefined ? e.clientY : e.touches[0].clientY
            });
            State.set('simScrollStart', { left: canvasArea.scrollLeft, top: canvasArea.scrollTop });
            canvas.style.cursor = 'grabbing';
            return;
        }

        // グリッド調整中の操作
        if (isGridAdjusting) {
            const handle = window.SimulatorGridDrawing.checkHandleHit(pos, pendingGridState);
            // ロック状態でなければリサイズ開始
            if ((State.get('isResizing') || handle) && !pendingGridState.isLocked) {
                State.set('isResizing', true);
                State.set('activeHandle', handle);
                return;
            }

            const pixelsPerMm = State.get('pixelsPerMm');
            const cellSize = pendingGridState.ptSize * State.MM_PER_PT * pixelsPerMm;
            const isHorizontal = pendingGridState.writingMode === 'horizontal';
            const w = (isHorizontal ? pendingGridState.chars : pendingGridState.lines) * cellSize;
            const h = (isHorizontal ? pendingGridState.lines : pendingGridState.chars) * cellSize;

            if (window.SimulatorGridDrawing.isPointInRect(pos, pendingGridState.startPos, w, h)) {
                State.set('isGridMoving', true);
                State.set('dragOffset', { x: pos.x - pendingGridState.startPos.x, y: pos.y - pendingGridState.startPos.y });
                return;
            } else {
                // 他のグリッドをクリックしたか確認
                const currentPageNum = State.get('currentPageNum');
                const hitIdx = window.SimulatorGridDrawing.hitTestGrids(currentPageNum, pos);

                if (hitIdx >= 0) {
                    // 現在のグリッドを確定してから別のグリッドを選択
                    if (window.SimulatorTools) window.SimulatorTools.confirmGrid(e);
                    selectExistingGrid(hitIdx);
                    return;
                }

                if (window.SimulatorTools) window.SimulatorTools.confirmGrid(e);
                return;
            }
        }

        // グリッド調整中でないとき、既存グリッドをクリックしたか判定
        if (currentMode === 'grid') {
            const currentPageNum = State.get('currentPageNum');
            const hitIdx = window.SimulatorGridDrawing.hitTestGrids(currentPageNum, pos);

            if (hitIdx >= 0) {
                selectExistingGrid(hitIdx);
                return;
            }
        }

        // 新規描画開始
        State.set('isDrawing', true);
        State.set('startPos', { ...pos });
        State.set('currentPos', { ...pos });

        if (currentMode === 'grid') {
            const gridLinesInput = DOM.get('gridLinesInput');
            const gridCharsInput = DOM.get('gridCharsInput');
            const fontSizeInput = DOM.get('fontSizeInput');
            const gridTextInput = DOM.get('gridTextInput');

            const pt = parseFloat(fontSizeInput.value) || 16;
            const text = gridTextInput.value;

            // テキストから行数・文字数を自動計算
            let lines = 1;
            let chars = 1;
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
            gridLinesInput.value = lines;
            gridCharsInput.value = chars;

            // 横方向ボタンの状態を参照
            const btnHorizontalMode = DOM.get('btnHorizontalMode');
            const writingMode = (btnHorizontalMode && btnHorizontalMode.classList.contains('active')) ? 'horizontal' : 'vertical';

            const newPendingGridState = {
                centerPos: { ...pos },
                startPos: { ...pos },
                lines: lines,
                chars: chars,
                ptSize: pt,
                textData: text,
                constraint: null,
                isDrag: false,
                writingMode: writingMode,
                isLocked: false
            };
            State.set('pendingGridState', newPendingGridState);
            if (window.SimulatorUI) window.SimulatorUI.updateWritingModeIcon();
        }

        State.set('snapshot', ctx.getImageData(0, 0, canvas.width, canvas.height));
    }

    // 描画中
    function moveDraw(e) {
        // 統合モード: currentModeがcalibrationまたはgridの場合のみ動作
        const currentMode = State.get('currentMode');
        if (currentMode !== 'calibration' && currentMode !== 'grid') return;

        const canvas = DOM.getCanvas();
        const ctx = DOM.getCtx();
        const canvasArea = DOM.get('canvasArea');

        // パン操作中
        if (State.get('isSimPanning')) {
            e.preventDefault();
            e.stopPropagation();

            const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
            const clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
            const simPanStart = State.get('simPanStart');
            const simScrollStart = State.get('simScrollStart');

            const dx = clientX - simPanStart.x;
            const dy = clientY - simPanStart.y;

            canvasArea.scrollLeft = simScrollStart.left - dx;
            canvasArea.scrollTop = simScrollStart.top - dy;
            return;
        }

        const pos = getPos(e);
        const isGridAdjusting = State.get('isGridAdjusting');
        const bubbleZones = State.getBubbleZones();
        const pendingGridState = State.get('pendingGridState');

        // カーソル制御
        if (isGridAdjusting && bubbleZones.length > 0) {
            let onBubble = false;
            for (const zone of bubbleZones) {
                if (pos.x >= zone.x && pos.x <= zone.x + zone.w &&
                    pos.y >= zone.y && pos.y <= zone.y + zone.h) {
                    onBubble = true;
                    break;
                }
            }
            if (onBubble) {
                canvas.style.cursor = 'pointer';
                return;
            }
        }

        if (isGridAdjusting) {
            const snapshot = State.get('snapshot');
            const pixelsPerMm = State.get('pixelsPerMm');

            if (State.get('isResizing')) {
                if (pendingGridState.isLocked) return;

                const activeHandle = State.get('activeHandle');
                const oldCellSize = pendingGridState.ptSize * State.MM_PER_PT * pixelsPerMm;
                const isHorizontal = pendingGridState.writingMode === 'horizontal';
                const gridW = (isHorizontal ? pendingGridState.chars : pendingGridState.lines) * oldCellSize;
                const gridH = (isHorizontal ? pendingGridState.lines : pendingGridState.chars) * oldCellSize;

                let currentL = pendingGridState.startPos.x;
                let currentR = pendingGridState.startPos.x + gridW;
                let currentT = pendingGridState.startPos.y;
                let currentB = pendingGridState.startPos.y + gridH;

                if (activeHandle.includes('l')) currentL = Math.min(pos.x, currentR - 10);
                if (activeHandle.includes('r')) currentR = Math.max(pos.x, currentL + 10);
                if (activeHandle.includes('t')) currentT = Math.min(pos.y, currentB - 10);
                if (activeHandle.includes('b')) currentB = Math.max(pos.y, currentT + 10);

                const newW = currentR - currentL;
                const newH = currentB - currentT;

                // 新しいセルサイズを計算（行数/列数は維持）
                const lines = pendingGridState.lines;
                const chars = pendingGridState.chars;
                const newCellSizeW = isHorizontal ? newW / chars : newW / lines;
                const newCellSizeH = isHorizontal ? newH / lines : newH / chars;
                const newCellSize = Math.min(newCellSizeW, newCellSizeH);

                // 新しいポイントサイズを計算
                const newPt = newCellSize / pixelsPerMm / State.MM_PER_PT;
                pendingGridState.ptSize = Math.round(newPt * 10) / 10;

                // 新しいグリッドサイズを計算
                const finalW = (isHorizontal ? chars : lines) * newCellSize;
                const finalH = (isHorizontal ? lines : chars) * newCellSize;

                // startPosを更新（ドラッグした辺/角を基準に）
                if (activeHandle.includes('l')) {
                    pendingGridState.startPos.x = currentR - finalW;
                } else {
                    pendingGridState.startPos.x = currentL;
                }
                if (activeHandle.includes('t')) {
                    pendingGridState.startPos.y = currentB - finalH;
                } else {
                    pendingGridState.startPos.y = currentT;
                }

                // centerPosを更新
                pendingGridState.centerPos = {
                    x: pendingGridState.startPos.x + finalW / 2,
                    y: pendingGridState.startPos.y + finalH / 2
                };

                // constraintも更新
                if (!pendingGridState.constraint) {
                    pendingGridState.constraint = { w: finalW, h: finalH, rawW: finalW, rawH: finalH };
                } else {
                    pendingGridState.constraint.rawW = finalW;
                    pendingGridState.constraint.rawH = finalH;
                }

                State.set('pendingGridState', pendingGridState);

                // 直接再描画（recalculateGridは使わない）
                const fontSizeInput = DOM.get('fontSizeInput');
                fontSizeInput.value = pendingGridState.ptSize;
                ctx.putImageData(snapshot, 0, 0);
                window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);

                if (window.SimulatorUI) {
                    window.SimulatorUI.updateDashboardValues();
                }
                return;
            } else if (State.get('isGridMoving')) {
                canvas.style.cursor = 'move';
                const dragOffset = State.get('dragOffset');
                const newStartX = pos.x - dragOffset.x;
                const newStartY = pos.y - dragOffset.y;
                pendingGridState.startPos = { x: newStartX, y: newStartY };

                const cellSize = pendingGridState.ptSize * State.MM_PER_PT * pixelsPerMm;
                const isHorizontal = pendingGridState.writingMode === 'horizontal';
                const w = (isHorizontal ? pendingGridState.chars : pendingGridState.lines) * cellSize;
                const h = (isHorizontal ? pendingGridState.lines : pendingGridState.chars) * cellSize;
                pendingGridState.centerPos = { x: newStartX + w / 2, y: newStartY + h / 2 };

                State.set('pendingGridState', pendingGridState);

                ctx.putImageData(snapshot, 0, 0);
                window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);
                return;
            }

            // ハンドルカーソル
            const handle = window.SimulatorGridDrawing.checkHandleHit(pos, pendingGridState);
            if (handle) {
                if (handle === 'tl' || handle === 'br') canvas.style.cursor = 'nwse-resize';
                else if (handle === 'tr' || handle === 'bl') canvas.style.cursor = 'nesw-resize';
                else if (handle === 'tm' || handle === 'bm') canvas.style.cursor = 'ns-resize';
                else if (handle === 'ml' || handle === 'mr') canvas.style.cursor = 'ew-resize';
            } else {
                const cellSize = pendingGridState.ptSize * State.MM_PER_PT * pixelsPerMm;
                const isHorizontal = pendingGridState.writingMode === 'horizontal';
                const w = (isHorizontal ? pendingGridState.chars : pendingGridState.lines) * cellSize;
                const h = (isHorizontal ? pendingGridState.lines : pendingGridState.chars) * cellSize;
                if (window.SimulatorGridDrawing.isPointInRect(pos, pendingGridState.startPos, w, h)) {
                    canvas.style.cursor = 'move';
                } else {
                    canvas.style.cursor = currentMode === 'calibration' ? 'crosshair' : 'default';
                }
            }
            return;
        }

        if (!State.get('isDrawing')) return;
        if (e.type === 'touchmove') e.preventDefault();
        State.set('currentPos', pos);

        // currentModeは関数の先頭で既に取得済み
        const snapshot = State.get('snapshot');
        const startPos = State.get('startPos');

        if (currentMode === 'calibration') {
            ctx.putImageData(snapshot, 0, 0);
            ctx.beginPath();
            ctx.moveTo(startPos.x, startPos.y);

            // Shiftキーで水平・垂直の直線に制限
            const isShiftPressed = State.get('isShiftPressed');
            let endX = pos.x;
            let endY = pos.y;
            if (isShiftPressed) {
                const dx = Math.abs(pos.x - startPos.x);
                const dy = Math.abs(pos.y - startPos.y);
                if (dx > dy) {
                    // 水平方向に固定
                    endY = startPos.y;
                } else {
                    // 垂直方向に固定
                    endX = startPos.x;
                }
            }

            ctx.lineTo(endX, endY);
            ctx.strokeStyle = '#ff9800';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Shiftキーで制限された座標を保存
            if (isShiftPressed) {
                State.set('currentPos', { x: endX, y: endY });
            }
        } else if (currentMode === 'grid') {
            ctx.putImageData(snapshot, 0, 0);
            const w = pos.x - startPos.x;
            const h = pos.y - startPos.y;
            ctx.save();
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = '#4caf50';
            ctx.strokeRect(startPos.x, startPos.y, w, h);
            ctx.fillStyle = 'rgba(76, 175, 80, 0.1)';
            ctx.fillRect(startPos.x, startPos.y, w, h);
            ctx.restore();
        }
    }

    // 描画終了
    function endDraw(e) {
        if (e.type === 'touchend') e.preventDefault();

        const canvas = DOM.getCanvas();
        const ctx = DOM.getCtx();
        const currentMode = State.get('currentMode');

        // パン終了
        if (State.get('isSimPanning')) {
            State.set('isSimPanning', false);
            const isGridAdjusting = State.get('isGridAdjusting');
            const isSpacePressed = State.get('isSpacePressed');
            const isShiftPressed = State.get('isShiftPressed');
            if (isSpacePressed || isShiftPressed) {
                canvas.style.cursor = 'grab';
            } else {
                canvas.style.cursor = ((currentMode === 'grid' || currentMode === 'calibration') && !isGridAdjusting) ? 'crosshair' : 'default';
            }
            return;
        }

        const pendingGridState = State.get('pendingGridState');
        const snapshot = State.get('snapshot');

        // リサイズ終了
        if (State.get('isResizing')) {
            State.set('isResizing', false);
            State.set('activeHandle', null);
            if (pendingGridState) {
                ctx.putImageData(snapshot, 0, 0);
                window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);
            }
            return;
        }

        // 移動終了
        if (State.get('isGridMoving')) {
            State.set('isGridMoving', false);
            if (pendingGridState) {
                ctx.putImageData(snapshot, 0, 0);
                window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);
            }
            return;
        }

        if (State.get('isGridAdjusting')) return;
        if (!State.get('isDrawing')) return;
        State.set('isDrawing', false);

        // キャリブレーション完了処理
        if (currentMode === 'calibration') {
            const canvasArea = DOM.get('canvasArea');
            const calibrationGuide = DOM.get('calibrationGuide');
            const calibrateBtn = DOM.get('calibrateBtn');
            const gridBtn = DOM.get('gridBtn');
            const scaleDisplay = DOM.get('scaleDisplay');

            document.body.classList.remove('is-calibrating');
            canvasArea.classList.remove('calibration-mode');
            calibrationGuide.classList.remove('visible');
            ctx.putImageData(snapshot, 0, 0);

            const startPos = State.get('startPos');
            const currentPos = State.get('currentPos');
            const distPx = Math.hypot(currentPos.x - startPos.x, currentPos.y - startPos.y);

            if (distPx < 10) {
                calibrateBtn.classList.remove('active');
                return;
            }

            // パン状態とShiftキー状態をリセット（Shift+ドラッグで縮尺合わせした場合の対策）
            State.set('isSimPanning', false);
            State.set('isShiftPressed', false);

            setTimeout(async () => {
                const userMm = await MojiQModal.showPrompt("実際の長さ(mm)を入力:", "180", "縮尺設定");
                if (userMm && !isNaN(userMm)) {
                    const pixelsPerMm = distPx / parseFloat(userMm);
                    State.set('pixelsPerMm', pixelsPerMm);
                    State.set('isCalibrated', true);
                    scaleDisplay.textContent = `設定済 (1mm=${pixelsPerMm.toFixed(1)}px)`;
                    // UIロック解除
                    if (window.SimulatorTools) {
                        window.SimulatorTools.updateCalibrationLockState();
                    }
                    // アプリ全体のロックも解除（PDFを読み込まずにsimulatorで計測した場合用）
                    if (window.unlockApp) {
                        window.unlockApp();
                    }
                    if (gridBtn) {
                        gridBtn.click();
                    }
                } else {
                    calibrateBtn.classList.remove('active');
                }
            }, 100);
            return;
        }

        // グリッド作成完了処理
        if (currentMode === 'grid') {
            const isCalibrated = State.get('isCalibrated');
            if (!isCalibrated) return;

            const startPos = State.get('startPos');
            const currentPos = State.get('currentPos');
            const dist = Math.hypot(currentPos.x - startPos.x, currentPos.y - startPos.y);
            ctx.putImageData(snapshot, 0, 0);

            const gridLinesInput = DOM.get('gridLinesInput');
            const gridCharsInput = DOM.get('gridCharsInput');
            const fontSizeInput = DOM.get('fontSizeInput');
            const densitySelect = DOM.get('densitySelect');
            const adjustMessage = DOM.get('adjustMessage');
            const pixelsPerMm = State.get('pixelsPerMm');

            // クリック（短距離）ならテキストから生成
            if (dist < 10) {
                // pendingGridState.lines/charsはstartDrawで既にテキストから計算済み
                gridLinesInput.value = pendingGridState.lines;
                gridCharsInput.value = pendingGridState.chars;

                const cellSize = pendingGridState.ptSize * State.MM_PER_PT * pixelsPerMm;
                const isHorizontal = pendingGridState.writingMode === 'horizontal';
                const w = (isHorizontal ? pendingGridState.chars : pendingGridState.lines) * cellSize;
                const h = (isHorizontal ? pendingGridState.lines : pendingGridState.chars) * cellSize;
                const clickX = pendingGridState.centerPos.x;
                const clickY = pendingGridState.centerPos.y;

                pendingGridState.startPos.x = clickX - (w / 2);
                pendingGridState.startPos.y = clickY - (h / 2);
                pendingGridState.constraint = null;
                pendingGridState.isDrag = false;
                if (window.SimulatorUI) window.SimulatorUI.setWheelMode('pt');
                window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);
            } else {
                // ドラッグ範囲から計算
                const rectW = Math.abs(currentPos.x - startPos.x);
                const rectH = Math.abs(currentPos.y - startPos.y);
                const rectX = Math.min(startPos.x, currentPos.x);
                const rectY = Math.min(startPos.y, currentPos.y);

                const density = densitySelect ? densitySelect.value : 'standard';
                let marginRatio = 0.25;
                if (density === 'loose') marginRatio = 0.35;
                if (density === 'tight') marginRatio = 0.15;
                if (density === 'none') marginRatio = 0.0;

                const safeW = rectW * (1 - marginRatio);
                const safeH = rectH * (1 - marginRatio);
                const pt = parseFloat(fontSizeInput.value) || 16;
                const cellSize = pt * State.MM_PER_PT * pixelsPerMm;

                // テキストから行数・文字数を自動計算
                const gridTextInput = DOM.get('gridTextInput');
                const text = gridTextInput ? gridTextInput.value : '';
                let lines = 1;
                let chars = 1;
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

                gridLinesInput.value = lines;
                gridCharsInput.value = chars;

                // 横方向ボタンの状態を参照
                const btnHMode = DOM.get('btnHorizontalMode');
                const dragWritingMode = (btnHMode && btnHMode.classList.contains('active')) ? 'horizontal' : 'vertical';
                const isH = dragWritingMode === 'horizontal';

                const gridW = (isH ? chars : lines) * cellSize;
                const gridH = (isH ? lines : chars) * cellSize;
                const centerX = rectX + rectW / 2;
                const centerY = rectY + rectH / 2;

                const newPendingGridState = {
                    centerPos: { x: centerX, y: centerY },
                    startPos: { x: centerX - gridW / 2, y: centerY - gridH / 2 },
                    lines: lines,
                    chars: chars,
                    ptSize: pt,
                    textData: text,
                    constraint: { w: safeW, h: safeH, rawW: rectW, rawH: rectH },
                    isDrag: true,
                    writingMode: dragWritingMode,
                    isLocked: false
                };
                State.set('pendingGridState', newPendingGridState);

                if (window.SimulatorUI) {
                    window.SimulatorUI.updateWritingModeIcon();
                    window.SimulatorUI.setWheelMode('chars');
                }
                window.SimulatorGridDrawing.recalculateGrid();
            }

            State.set('isGridAdjusting', true);
            adjustMessage.classList.add('active');

            const updatedPendingGridState = State.get('pendingGridState');
            const cellSize = updatedPendingGridState.ptSize * State.MM_PER_PT * pixelsPerMm;
            const isHorizontal = updatedPendingGridState.writingMode === 'horizontal';
            const w = (isHorizontal ? updatedPendingGridState.chars : updatedPendingGridState.lines) * cellSize;
            const h = (isHorizontal ? updatedPendingGridState.lines : updatedPendingGridState.chars) * cellSize;

            if (window.SimulatorUI) {
                window.SimulatorUI.updateDensityUIState();
                window.SimulatorUI.updateDashboardValues();
            }

            // 削除ボタンを有効化
            if (window.SimulatorTools) {
                window.SimulatorTools.updateDeleteButtonState();
            }
        }
    }

    // ホイール操作
    function handleWheel(e) {
        // 統合モード: currentModeがcalibrationまたはgridの場合のみ動作
        const currentMode = State.get('currentMode');
        if (currentMode !== 'calibration' && currentMode !== 'grid') return;
        if (e.target.closest('.sidebar') || e.target.closest('.bottom-nav-bar')) return;

        const isGridAdjusting = State.get('isGridAdjusting');

        // ホイールによるpt変更は無効化
    }

    function init() {
        const canvas = DOM.getCanvas();
        const canvasArea = DOM.get('canvasArea');
        // イベントはwhiteboardキャンバスで受け取る（sim-whiteboardはpointer-events: none）
        const mojiqCanvas = DOM.getMojiqCanvas();

        if (mojiqCanvas) {
            mojiqCanvas.addEventListener('mousedown', startDraw);
            mojiqCanvas.addEventListener('mousemove', moveDraw);
            mojiqCanvas.addEventListener('mouseup', endDraw);
            mojiqCanvas.addEventListener('touchstart', startDraw, { passive: false });
            mojiqCanvas.addEventListener('touchmove', moveDraw, { passive: false });
            mojiqCanvas.addEventListener('touchend', endDraw, { passive: false });
        }

        if (canvasArea) {
            canvasArea.addEventListener('mousedown', (e) => {
                if (e.target === canvasArea && State.get('isGridAdjusting')) {
                    if (window.SimulatorTools) window.SimulatorTools.confirmGrid(e);
                }
            });
        }

        window.addEventListener('wheel', handleWheel, { passive: false });
    }

    return {
        init: init,
        getPos: getPos,
        selectExistingGrid: selectExistingGrid
    };
})();
