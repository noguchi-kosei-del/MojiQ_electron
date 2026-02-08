/**
 * Simulator Tools
 * ツールボタン処理モジュール
 */
window.SimulatorTools = (function() {
    'use strict';

    const State = window.SimulatorState;
    const DOM = window.SimulatorDOM;

    // 縮尺合わせモード解除
    function exitCalibrationMode() {
        const calibrateBtn = DOM.get('calibrateBtn');
        const canvasArea = DOM.get('canvasArea');
        const calibrationGuide = DOM.get('calibrationGuide');
        const ctx = DOM.getCtx();

        if (calibrateBtn) calibrateBtn.classList.remove('active');
        document.body.classList.remove('is-calibrating');
        canvasArea.classList.remove('calibration-mode');
        calibrationGuide.classList.remove('visible');

        const currentMode = State.get('currentMode');
        if (currentMode === 'calibration') {
            State.set('isDrawing', false);
            // パン状態をリセット（Shift+ドラッグでパン操作した場合の対策）
            State.set('isSimPanning', false);
            const snapshot = State.get('snapshot');
            if (snapshot) {
                ctx.putImageData(snapshot, 0, 0);
                State.set('snapshot', null);
            }
            // MojiQのキャンバスカーソルをデフォルトに戻す
            const mojiqCanvas = DOM.getMojiqCanvas();
            if (mojiqCanvas) {
                mojiqCanvas.style.cursor = 'default';
            }
        }
    }

    // グリッド確定処理（グリッドを保存せずキャンバスをクリアして終了）
    function confirmGrid(e) {
        const isGridAdjusting = State.get('isGridAdjusting');
        if (!isGridAdjusting) return;

        const ctx = DOM.getCtx();
        const canvas = DOM.getCanvas();
        const adjustMessage = DOM.get('adjustMessage');
        const sizeTooltip = DOM.get('sizeTooltip');
        const currentMode = State.get('currentMode');

        // キャンバスをクリア（グリッドは保存しない）
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        State.set('isGridAdjusting', false);
        State.set('isGridMoving', false);
        State.set('pendingGridState', null);
        adjustMessage.classList.remove('active');
        sizeTooltip.style.display = 'none';
        canvas.style.cursor = 'default';
        if (currentMode === 'grid') {
            canvas.style.cursor = 'crosshair';
        }

        updateDeleteButtonState();
    }

    // グリッド消去（選択中のグリッドのみ、または全グリッド）
    function clearSimulatorGrid(deleteAll) {
        const ctx = DOM.getCtx();
        const canvas = DOM.getCanvas();
        const adjustMessage = DOM.get('adjustMessage');
        const sizeTooltip = DOM.get('sizeTooltip');
        const currentPageNum = State.get('currentPageNum');
        const currentMode = State.get('currentMode');

        if (deleteAll) {
            // 全グリッド削除
            State.clearAllGrids(currentPageNum);
        } else {
            // 選択中グリッド削除（または調整中のグリッドをキャンセル）
            const selectedIdx = State.getSelectedIndex(currentPageNum);
            if (selectedIdx !== null && selectedIdx >= 0) {
                State.removeSelectedGrid(currentPageNum);
            }
        }

        State.set('pendingGridState', null);
        State.set('isGridAdjusting', false);
        State.set('isGridMoving', false);
        State.set('isResizing', false);

        adjustMessage.classList.remove('active');
        sizeTooltip.style.display = 'none';

        // キャンバスをクリアして残りのグリッドを再描画
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        window.SimulatorGridDrawing.drawAllGrids(currentPageNum);

        if (window.SimulatorUI) window.SimulatorUI.updateDashboardValues();

        if (currentMode === 'grid') {
            canvas.style.cursor = 'crosshair';
        } else {
            canvas.style.cursor = 'default';
        }

        updateDeleteButtonState();
    }

    // 選択中グリッドを削除（Deleteキー用）
    function deleteSelectedGrid() {
        const currentPageNum = State.get('currentPageNum');
        const isGridAdjusting = State.get('isGridAdjusting');

        if (!isGridAdjusting) return false;

        // Undo保存
        if (window.SimulatorUndoRedo) window.SimulatorUndoRedo.saveStateForUndo();

        // 選択中グリッドを削除
        clearSimulatorGrid(false);

        if (window.SimulatorUndoRedo) window.SimulatorUndoRedo.updateUndoRedoButtons();

        return true;
    }

    // Undo履歴に保存せずにクリア（全グリッド削除）
    function clearSimulatorGridWithoutUndo() {
        const ctx = DOM.getCtx();
        const canvas = DOM.getCanvas();
        const adjustMessage = DOM.get('adjustMessage');
        const sizeTooltip = DOM.get('sizeTooltip');
        const currentPageNum = State.get('currentPageNum');
        const currentMode = State.get('currentMode');

        State.clearAllGrids(currentPageNum);
        State.set('pendingGridState', null);
        State.set('isGridAdjusting', false);
        State.set('isGridMoving', false);
        State.set('isResizing', false);

        adjustMessage.classList.remove('active');
        sizeTooltip.style.display = 'none';

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (window.SimulatorUI) window.SimulatorUI.updateDashboardValues();

        if (currentMode === 'grid') {
            canvas.style.cursor = 'crosshair';
        } else {
            canvas.style.cursor = 'default';
        }
    }

    // グリッド選択を解除（他の操作を行う前に呼び出す汎用関数）
    function deselectCurrentGrid() {
        const isGridAdjusting = State.get('isGridAdjusting');
        if (!isGridAdjusting) return;

        // 調整中の場合は確定してから解除
        confirmGrid();
    }

    // 削除ボタンの有効/無効を更新
    function updateDeleteButtonState() {
        const deleteGridBtn = DOM.get('deleteGridBtn');
        const isGridAdjusting = State.get('isGridAdjusting');
        const isCalibrated = State.get('isCalibrated');

        if (deleteGridBtn) {
            // 縮尺設定が完了していない、または調整中でない場合は無効
            deleteGridBtn.disabled = !isCalibrated || !isGridAdjusting;
        }

        // ヘッダーのクリアボタン状態も更新
        if (window.MojiQPageManager) {
            window.MojiQPageManager.updatePageControls();
        }
    }

    // 縮尺設定前のUIロック状態を更新
    function updateCalibrationLockState() {
        const isCalibrated = State.get('isCalibrated');
        const gridBtn = DOM.get('gridBtn');
        const fontSizeInput = DOM.get('fontSizeInput');
        const gridTextInput = DOM.get('gridTextInput');
        const gridLinesInput = DOM.get('gridLinesInput');
        const gridCharsInput = DOM.get('gridCharsInput');

        // グリッドボタン
        if (gridBtn) {
            gridBtn.disabled = !isCalibrated;
            gridBtn.title = isCalibrated ? '写植グリッド' : '先に「縮尺合わせ」を行ってください';
        }

        // 写植グリッド設定エリア
        const gridSettingsArea = document.getElementById('gridSettingsArea');
        if (gridSettingsArea) {
            if (isCalibrated) {
                gridSettingsArea.classList.remove('disabled-lock');
            } else {
                gridSettingsArea.classList.add('disabled-lock');
            }
        }

        // 個別入力のdisabled状態
        if (gridTextInput) gridTextInput.disabled = !isCalibrated;
        if (gridLinesInput) gridLinesInput.disabled = !isCalibrated;
        if (gridCharsInput) gridCharsInput.disabled = !isCalibrated;

        // 文字サイズ入力
        // 注意: fontSizeInput.parentElementは#ui-group-mojiq-leftを指すため、
        // 親要素へのdisabled-lockは追加しない（サイドバー全体がロックされてしまう）
        if (fontSizeInput) {
            fontSizeInput.disabled = !isCalibrated;
        }
    }

    function init() {
        const calibrateBtn = DOM.get('calibrateBtn');
        const gridBtn = DOM.get('gridBtn');
        const deleteGridBtn = DOM.get('deleteGridBtn');
        const simClearBtn = DOM.get('simClearBtn');
        const simSavePdfBtn = DOM.get('simSavePdfBtn');
        const canvas = DOM.getCanvas();
        const canvasArea = DOM.get('canvasArea');
        const calibrationGuide = DOM.get('calibrationGuide');

        // 縮尺合わせボタン
        if (calibrateBtn) {
            calibrateBtn.addEventListener('click', () => {
                const currentMode = State.get('currentMode');
                if (currentMode === 'calibration') {
                    exitCalibrationMode();
                    State.set('currentMode', null);
                    canvas.style.cursor = 'default';
                    // MojiQのキャンバスカーソルもデフォルトに戻す
                    const mojiqCanvas = DOM.getMojiqCanvas();
                    if (mojiqCanvas) {
                        mojiqCanvas.style.cursor = 'default';
                    }
                    return;
                }

                State.set('restorableGridState', null);
                if (State.get('isGridAdjusting')) confirmGrid();

                if (gridBtn) gridBtn.classList.remove('active');
                calibrateBtn.classList.add('active');

                State.set('currentMode', 'calibration');
                canvas.style.cursor = 'crosshair';
                // MojiQのキャンバスカーソルもcrosshairに変更
                const mojiqCanvas = DOM.getMojiqCanvas();
                if (mojiqCanvas) {
                    mojiqCanvas.style.cursor = 'crosshair';
                }
                document.body.classList.add('is-calibrating');
                canvasArea.classList.add('calibration-mode');
                calibrationGuide.classList.add('visible');
            });
        }

        // グリッドボタン
        if (gridBtn) {
            gridBtn.addEventListener('click', () => {
                State.set('restorableGridState', null);
                if (State.get('isGridAdjusting')) confirmGrid();
                exitCalibrationMode();

                // パン状態を強制リセット（縮尺合わせからの遷移時対策）
                State.set('isSimPanning', false);
                State.set('isShiftPressed', false);

                gridBtn.classList.add('active');

                State.set('currentMode', 'grid');
                canvas.style.cursor = 'crosshair';
            });
        }

        // 削除ボタン
        if (deleteGridBtn) {
            deleteGridBtn.addEventListener('click', () => {
                deleteSelectedGrid();
            });
        }

        // クリアボタン（全グリッド削除）
        if (simClearBtn) {
            simClearBtn.addEventListener('click', async () => {
                if (await MojiQModal.showConfirm('このページのグリッドを全て消去しますか？')) {
                    if (window.SimulatorUndoRedo) window.SimulatorUndoRedo.saveStateForUndo();
                    clearSimulatorGrid(true);
                }
            });
        }

        // PDF保存ボタン
        if (simSavePdfBtn) {
            simSavePdfBtn.addEventListener('click', () => {
                MojiQModal.showAlert("メイン画面の「PDFとして保存」を使用してください。\n(現在統合中です)", 'お知らせ');
            });
        }

        // ヘッダーボタンからの全グリッド削除（確認済みで呼ばれる）
        window.addEventListener('mojiq:clear', (e) => {
            const confirmed = e.detail && e.detail.confirmed;
            if (!confirmed) return;  // 確認済みでない場合は無視（page-managerで確認する）
            if (window.SimulatorUndoRedo) window.SimulatorUndoRedo.saveStateForUndo();
            clearSimulatorGrid(true);
        });

        // Deleteキーで選択中グリッド削除
        window.addEventListener('keydown', (e) => {
            // 統合モード: グリッド調整中のみ反応
            if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey) {
                const isGridAdjusting = State.get('isGridAdjusting');
                if (isGridAdjusting) {
                    e.preventDefault();
                    deleteSelectedGrid();
                }
            }
        });

        // タブ切り替え時に縮尺合わせモードを解除
        window.addEventListener('mojiq:exit-calibration', () => {
            exitCalibrationMode();
        });

        // 初期状態で削除ボタンを無効化
        updateDeleteButtonState();
        // 初期状態でキャリブレーション前のUIをロック
        updateCalibrationLockState();
    }

    return {
        init: init,
        exitCalibrationMode: exitCalibrationMode,
        confirmGrid: confirmGrid,
        clearSimulatorGrid: clearSimulatorGrid,
        clearSimulatorGridWithoutUndo: clearSimulatorGridWithoutUndo,
        deleteSelectedGrid: deleteSelectedGrid,
        deselectCurrentGrid: deselectCurrentGrid,
        updateDeleteButtonState: updateDeleteButtonState,
        updateCalibrationLockState: updateCalibrationLockState
    };
})();
