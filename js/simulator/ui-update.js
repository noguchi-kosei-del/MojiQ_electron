/**
 * Simulator UI Update
 * UI更新モジュール
 */
window.SimulatorUI = (function() {
    'use strict';

    const State = window.SimulatorState;
    const DOM = window.SimulatorDOM;

    // 縦書き/横書きアイコン更新
    function updateWritingModeIcon() {
        const pendingGridState = State.get('pendingGridState');
        const iconWritingMode = DOM.get('iconWritingMode');
        if (!pendingGridState || !iconWritingMode) return;

        const isH = pendingGridState.writingMode === 'horizontal';
        iconWritingMode.textContent = isH ? 'A→' : 'A↓';

        // サイドバーの横方向ボタンも同期
        const btnHorizontalMode = DOM.get('btnHorizontalMode');
        if (btnHorizontalMode) {
            if (isH) {
                btnHorizontalMode.classList.add('active');
                btnHorizontalMode.style.background = '#2e7d32';
                btnHorizontalMode.style.color = '#fff';
            } else {
                btnHorizontalMode.classList.remove('active');
                btnHorizontalMode.style.background = '#fff';
                btnHorizontalMode.style.color = '#2e7d32';
            }
        }
    }

    // ステップボタンビジュアル更新
    function updateStepVisuals() {
        const ptStep = State.get('ptStep');
        document.querySelectorAll('.step-btn').forEach(el => {
            const s = parseFloat(el.dataset.step);
            if (Math.abs(s - ptStep) < 0.001) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    // メッセージ重なりチェック
    function checkMessageOverlap(startPos, w, h) {
        const adjustMessage = DOM.get('adjustMessage');
        const canvas = DOM.getCanvas();

        const msgRect = adjustMessage.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const gridScreenY = canvasRect.top + startPos.y;

        if (gridScreenY < msgRect.bottom + 20) {
            adjustMessage.classList.add('bottom-pos');
        } else {
            adjustMessage.classList.remove('bottom-pos');
        }
    }

    // ダッシュボード数値更新
    function updateDashboardValues() {
        const pendingGridState = State.get('pendingGridState');
        const monPt = DOM.get('monPt');

        if (!monPt) return;

        if (!pendingGridState) {
            monPt.textContent = '-';
            return;
        }

        monPt.textContent = pendingGridState.ptSize;
    }

    // Density UI状態更新
    function updateDensityUIState() {
        const pendingGridState = State.get('pendingGridState');
        const recommendControls = DOM.get('recommendControls');

        // recommendControlsが存在しない場合は何もしない
        if (!recommendControls) return;

        if (!pendingGridState || !pendingGridState.constraint) {
            recommendControls.classList.add('disabled');
        } else {
            recommendControls.classList.remove('disabled');
        }
    }

    // ロックモード切り替え
    function toggleLockMode() {
        const pendingGridState = State.get('pendingGridState');
        if (!pendingGridState) return;

        pendingGridState.isLocked = !pendingGridState.isLocked;
        State.set('pendingGridState', pendingGridState);

        const ctx = DOM.getCtx();
        const snapshot = State.get('snapshot');
        ctx.putImageData(snapshot, 0, 0);
        window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);
    }

    // ホイールモード設定
    function setWheelMode(mode) {
        State.set('wheelMode', mode);
    }

    // ダッシュボードドラッグ機能
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    function initDashboardDrag() {
        const adjustMessage = DOM.get('adjustMessage');
        if (!adjustMessage) return;

        // マウスダウン
        adjustMessage.addEventListener('mousedown', (e) => {
            // バッジやボタンなどのクリックは除外
            if (e.target.closest('.spec-badge, .key-cap, .step-btn, .mode-btn, .toggle-switch')) return;

            isDragging = true;
            adjustMessage.classList.add('dragging');

            const rect = adjustMessage.getBoundingClientRect();
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            // 初回ドラッグ時、transform: translateX(-50%)を考慮した実際の位置を取得
            if (!adjustMessage.classList.contains('dragged')) {
                initialLeft = rect.left;
                initialTop = rect.top;
                // transform解除して絶対位置に切り替え
                adjustMessage.classList.add('dragged');
                adjustMessage.style.left = initialLeft + 'px';
                adjustMessage.style.top = initialTop + 'px';
            } else {
                initialLeft = parseInt(adjustMessage.style.left, 10) || rect.left;
                initialTop = parseInt(adjustMessage.style.top, 10) || rect.top;
            }

            e.preventDefault();
        });

        // マウスムーブ（document上でリッスン）
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            let newLeft = initialLeft + deltaX;
            let newTop = initialTop + deltaY;

            // 画面外に出ないよう制限
            const rect = adjustMessage.getBoundingClientRect();
            const maxLeft = window.innerWidth - rect.width;
            const maxTop = window.innerHeight - rect.height;

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            adjustMessage.style.left = newLeft + 'px';
            adjustMessage.style.top = newTop + 'px';
        });

        // マウスアップ（document上でリッスン）
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                adjustMessage.classList.remove('dragging');
            }
        });

        // タッチ対応
        adjustMessage.addEventListener('touchstart', (e) => {
            if (e.target.closest('.spec-badge, .key-cap, .step-btn, .mode-btn, .toggle-switch')) return;

            isDragging = true;
            adjustMessage.classList.add('dragging');

            const touch = e.touches[0];
            const rect = adjustMessage.getBoundingClientRect();
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;

            if (!adjustMessage.classList.contains('dragged')) {
                initialLeft = rect.left;
                initialTop = rect.top;
                adjustMessage.classList.add('dragged');
                adjustMessage.style.left = initialLeft + 'px';
                adjustMessage.style.top = initialTop + 'px';
            } else {
                initialLeft = parseInt(adjustMessage.style.left, 10) || rect.left;
                initialTop = parseInt(adjustMessage.style.top, 10) || rect.top;
            }
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - dragStartX;
            const deltaY = touch.clientY - dragStartY;

            let newLeft = initialLeft + deltaX;
            let newTop = initialTop + deltaY;

            const rect = adjustMessage.getBoundingClientRect();
            const maxLeft = window.innerWidth - rect.width;
            const maxTop = window.innerHeight - rect.height;

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            adjustMessage.style.left = newLeft + 'px';
            adjustMessage.style.top = newTop + 'px';
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (isDragging) {
                isDragging = false;
                adjustMessage.classList.remove('dragging');
            }
        });
    }

    // ダッシュボード位置をリセット（非表示時に位置を初期化）
    function resetDashboardPosition() {
        const adjustMessage = DOM.get('adjustMessage');
        if (!adjustMessage) return;

        adjustMessage.classList.remove('dragged', 'dragging');
        adjustMessage.style.left = '';
        adjustMessage.style.top = '';
    }

    function init() {
        const btnWritingMode = DOM.get('btnWritingMode');
        const btnHorizontalMode = DOM.get('btnHorizontalMode');
        const dashDensityToggle = DOM.get('dashDensityToggle');
        const dashDensitySelector = DOM.get('dashDensitySelector');
        const densitySelect = DOM.get('densitySelect');
        const gridTextInput = DOM.get('gridTextInput');
        const gridLinesInput = DOM.get('gridLinesInput');
        const gridCharsInput = DOM.get('gridCharsInput');
        const ctx = DOM.getCtx();

        // 初期化
        updateStepVisuals();
        initDashboardDrag();

        // 横方向ボタン（サイドバー内）
        if (btnHorizontalMode) {
            btnHorizontalMode.addEventListener('click', () => {
                const isActive = btnHorizontalMode.classList.toggle('active');
                // ボタンの見た目を切り替え
                if (isActive) {
                    btnHorizontalMode.style.background = '#2e7d32';
                    btnHorizontalMode.style.color = '#fff';
                } else {
                    btnHorizontalMode.style.background = '#fff';
                    btnHorizontalMode.style.color = '#2e7d32';
                }

                // グリッド調整中であれば即座に反映
                const pendingGridState = State.get('pendingGridState');
                if (pendingGridState) {
                    const newMode = isActive ? 'horizontal' : 'vertical';
                    pendingGridState.writingMode = newMode;

                    if (pendingGridState.constraint) {
                        const c = pendingGridState.constraint;
                        [c.w, c.h] = [c.h, c.w];
                        [c.rawW, c.rawH] = [c.rawH, c.rawW];
                        State.set('pendingGridState', pendingGridState);
                        updateWritingModeIcon();
                        window.SimulatorGridDrawing.recalculateGrid();
                    } else {
                        const pixelsPerMm = State.get('pixelsPerMm');
                        const cellSize = pendingGridState.ptSize * State.MM_PER_PT * pixelsPerMm;
                        const isHorizontal = newMode === 'horizontal';
                        const w = (isHorizontal ? pendingGridState.chars : pendingGridState.lines) * cellSize;
                        const h = (isHorizontal ? pendingGridState.lines : pendingGridState.chars) * cellSize;
                        pendingGridState.startPos.x = pendingGridState.centerPos.x - w / 2;
                        pendingGridState.startPos.y = pendingGridState.centerPos.y - h / 2;
                        State.set('pendingGridState', pendingGridState);
                        updateWritingModeIcon();
                        const snapshot = State.get('snapshot');
                        if (snapshot) {
                            ctx.putImageData(snapshot, 0, 0);
                            window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);
                        }
                        updateDashboardValues();
                    }
                }
            });
        }

        // 削除ボタン（テキスト全消去）
        const btnClearText = DOM.get('btnClearText');
        if (btnClearText && gridTextInput) {
            btnClearText.addEventListener('click', () => {
                gridTextInput.value = '';

                // グリッド調整中であればテキストをクリアして1x1に戻す
                const pendingGridState = State.get('pendingGridState');
                if (pendingGridState) {
                    pendingGridState.textData = '';
                    pendingGridState.lines = 1;
                    pendingGridState.chars = 1;
                    gridLinesInput.value = 1;
                    gridCharsInput.value = 1;

                    if (pendingGridState.constraint) {
                        State.set('pendingGridState', pendingGridState);
                        window.SimulatorGridDrawing.recalculateGrid();
                    } else {
                        const pixelsPerMm = State.get('pixelsPerMm');
                        const cellSize = pendingGridState.ptSize * State.MM_PER_PT * pixelsPerMm;
                        const isHorizontal = pendingGridState.writingMode === 'horizontal';
                        const w = (isHorizontal ? 1 : 1) * cellSize;
                        const h = (isHorizontal ? 1 : 1) * cellSize;
                        pendingGridState.startPos.x = pendingGridState.centerPos.x - w / 2;
                        pendingGridState.startPos.y = pendingGridState.centerPos.y - h / 2;
                        State.set('pendingGridState', pendingGridState);
                        const snapshot = State.get('snapshot');
                        if (snapshot) {
                            ctx.putImageData(snapshot, 0, 0);
                            window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);
                        }
                        updateDashboardValues();
                    }
                }
            });
        }

        // 縦書き/横書き切り替え
        if (btnWritingMode) {
            btnWritingMode.addEventListener('click', () => {
                const pendingGridState = State.get('pendingGridState');
                if (!pendingGridState) return;

                pendingGridState.writingMode = (pendingGridState.writingMode === 'horizontal') ? 'vertical' : 'horizontal';

                if (pendingGridState.constraint) {
                    const c = pendingGridState.constraint;
                    [c.w, c.h] = [c.h, c.w];
                    [c.rawW, c.rawH] = [c.rawH, c.rawW];
                    State.set('pendingGridState', pendingGridState);
                    updateWritingModeIcon();
                    window.SimulatorGridDrawing.recalculateGrid();
                } else {
                    const pixelsPerMm = State.get('pixelsPerMm');
                    const cellSize = pendingGridState.ptSize * State.MM_PER_PT * pixelsPerMm;
                    const isHorizontal = pendingGridState.writingMode === 'horizontal';
                    const w = (isHorizontal ? pendingGridState.chars : pendingGridState.lines) * cellSize;
                    const h = (isHorizontal ? pendingGridState.lines : pendingGridState.chars) * cellSize;
                    pendingGridState.startPos.x = pendingGridState.centerPos.x - w / 2;
                    pendingGridState.startPos.y = pendingGridState.centerPos.y - h / 2;
                    State.set('pendingGridState', pendingGridState);
                    updateWritingModeIcon();
                    const snapshot = State.get('snapshot');
                    ctx.putImageData(snapshot, 0, 0);
                    window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);
                    checkMessageOverlap(pendingGridState.startPos, w, h);
                    updateDashboardValues();
                }
            });
        }

        // Densityトグル
        if (dashDensityToggle && densitySelect) {
            dashDensityToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    densitySelect.value = State.get('lastValidDensity') || 'standard';
                } else {
                    State.set('lastValidDensity', densitySelect.value);
                    densitySelect.value = 'none';
                }
                window.SimulatorGridDrawing.recalculateGrid();
                updateDashboardValues();
            });
        }

        // Densityセレクタ
        if (dashDensitySelector && densitySelect) {
            dashDensitySelector.querySelectorAll('.mode-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    dashDensitySelector.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    if (dashDensityToggle && densitySelect.value === 'none') dashDensityToggle.checked = true;
                    densitySelect.value = btn.dataset.val;
                    State.set('lastValidDensity', btn.dataset.val);
                    window.SimulatorGridDrawing.recalculateGrid();
                    updateDashboardValues();
                });
            });
        }

        // ステップボタン
        document.querySelectorAll('.step-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                State.set('ptStep', parseFloat(e.target.dataset.step));
                updateStepVisuals();
                setWheelMode('pt');
            });
        });

        // セリフ自動計測（テキスト入力時の自動計算）
        // 入力された文字数と行数に応じてグリッドサイズを自動調整
        if (gridTextInput) {
            gridTextInput.addEventListener('input', () => {
                const text = gridTextInput.value;
                if (!text || text.trim().length === 0) return;

                // 半角記号（組み合わせて1セルに収める）
                const halfWidthSymbols = ['!', '?', '？', '！'];

                // テキストを行に分割し、各行のトークン数を計算
                const textLines = text.split(/\r\n|\n/);
                const lineCount = textLines.length;
                let maxChars = 1;
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
                    if (tokenCount > maxChars) maxChars = tokenCount;
                }

                gridLinesInput.value = lineCount;
                gridCharsInput.value = maxChars;

                const isGridAdjusting = State.get('isGridAdjusting');
                const pendingGridState = State.get('pendingGridState');

                if (isGridAdjusting && pendingGridState) {
                    pendingGridState.lines = lineCount;
                    pendingGridState.chars = maxChars;
                    pendingGridState.textData = text;
                    State.set('pendingGridState', pendingGridState);

                    if (pendingGridState.constraint) {
                        window.SimulatorGridDrawing.recalculateGrid();
                    } else {
                        const pixelsPerMm = State.get('pixelsPerMm');
                        const cellSize = pendingGridState.ptSize * State.MM_PER_PT * pixelsPerMm;
                        const isHorizontal = pendingGridState.writingMode === 'horizontal';
                        const w = (isHorizontal ? maxChars : lineCount) * cellSize;
                        const h = (isHorizontal ? lineCount : maxChars) * cellSize;
                        pendingGridState.startPos.x = pendingGridState.centerPos.x - w / 2;
                        pendingGridState.startPos.y = pendingGridState.centerPos.y - h / 2;
                        State.set('pendingGridState', pendingGridState);
                        const snapshot = State.get('snapshot');
                        ctx.putImageData(snapshot, 0, 0);
                        window.SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);
                        checkMessageOverlap(pendingGridState.startPos, w, h);
                        updateDashboardValues();
                    }
                }
            });
        }
    }

    return {
        init: init,
        updateWritingModeIcon: updateWritingModeIcon,
        updateStepVisuals: updateStepVisuals,
        checkMessageOverlap: checkMessageOverlap,
        updateDashboardValues: updateDashboardValues,
        updateDensityUIState: updateDensityUIState,
        toggleLockMode: toggleLockMode,
        setWheelMode: setWheelMode,
        resetDashboardPosition: resetDashboardPosition
    };
})();
