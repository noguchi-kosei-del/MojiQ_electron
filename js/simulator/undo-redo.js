/**
 * Simulator Undo/Redo
 * 履歴管理モジュール
 */
window.SimulatorUndoRedo = (function() {
    'use strict';

    const State = window.SimulatorState;
    const DOM = window.SimulatorDOM;

    // 状態をUndo用に保存（ページ全体のデータを保存）
    function saveStateForUndo() {
        const currentPageNum = State.get('currentPageNum');

        // ページデータ全体を保存
        const currentState = State.getPageData(currentPageNum);

        State.pushUndoStack(currentPageNum, currentState);

        // Redo履歴をクリア（新しい操作が行われたため）
        State.clearRedoStack(currentPageNum);

        updateUndoRedoButtons();
    }

    // Undo実行（複数グリッド対応）
    function performUndo() {
        const currentPageNum = State.get('currentPageNum');
        const undoStack = State.getUndoStack(currentPageNum);

        if (undoStack.length === 0) return;

        const ctx = DOM.getCtx();
        const canvas = DOM.getCanvas();
        const adjustMessage = DOM.get('adjustMessage');
        const sizeTooltip = DOM.get('sizeTooltip');

        // 現在の状態をRedoスタックに保存
        const currentState = State.getPageData(currentPageNum);
        State.pushRedoStack(currentPageNum, currentState);

        // Undoスタックから前の状態を取得
        const prevState = State.popUndoStack(currentPageNum);

        // 状態を復元
        State.setPageData(currentPageNum, prevState);

        // 調整モードを解除
        State.set('pendingGridState', null);
        State.set('isGridAdjusting', false);
        adjustMessage.style.display = 'none';
        sizeTooltip.style.display = 'none';

        // キャンバスをクリアして全グリッドを再描画
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        window.SimulatorGridDrawing.drawAllGrids(currentPageNum);

        if (window.SimulatorUI) {
            window.SimulatorUI.updateDashboardValues();
        }

        updateUndoRedoButtons();
    }

    // Redo実行（複数グリッド対応）
    function performRedo() {
        const currentPageNum = State.get('currentPageNum');
        const redoStack = State.getRedoStack(currentPageNum);

        if (redoStack.length === 0) return;

        const ctx = DOM.getCtx();
        const canvas = DOM.getCanvas();
        const adjustMessage = DOM.get('adjustMessage');
        const sizeTooltip = DOM.get('sizeTooltip');

        // 現在の状態をUndoスタックに保存
        const currentState = State.getPageData(currentPageNum);
        State.pushUndoStack(currentPageNum, currentState);

        // Redoスタックから次の状態を取得
        const nextState = State.popRedoStack(currentPageNum);

        // 状態を復元
        State.setPageData(currentPageNum, nextState);

        // 調整モードを解除
        State.set('pendingGridState', null);
        State.set('isGridAdjusting', false);
        adjustMessage.style.display = 'none';
        sizeTooltip.style.display = 'none';

        // キャンバスをクリアして全グリッドを再描画
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        window.SimulatorGridDrawing.drawAllGrids(currentPageNum);

        if (window.SimulatorUI) {
            window.SimulatorUI.updateDashboardValues();
        }

        updateUndoRedoButtons();
    }

    // Undo/Redoボタンの状態更新
    function updateUndoRedoButtons() {
        const simUndoBtn = DOM.get('simUndoBtn');
        const currentPageNum = State.get('currentPageNum');
        const undoStack = State.getUndoStack(currentPageNum);

        const canUndo = undoStack && undoStack.length > 0;

        if (simUndoBtn) {
            simUndoBtn.disabled = !canUndo;
        }

        // ヘッダーのクリアボタン状態も更新（グリッドの有無が変わった可能性があるため）
        if (window.MojiQPageManager) {
            window.MojiQPageManager.updatePageControls();
        }
    }

    function init() {
        const simUndoBtn = DOM.get('simUndoBtn');

        // 「元に戻す」ボタン
        if (simUndoBtn) {
            simUndoBtn.addEventListener('click', () => {
                performUndo();
            });
        }

        // Ctrl+Z / Ctrl+Shift+Z ショートカット
        // 統合モード: グリッド調整中またはグリッドモード時のみ反応
        window.addEventListener('mojiq:history', (e) => {
            const currentMode = State.get('currentMode');
            const isGridAdjusting = State.get('isGridAdjusting');
            // グリッドモードまたはグリッド調整中のみ反応
            if (currentMode !== 'grid' && !isGridAdjusting) return;

            if (e.detail.action === 'undo') {
                performUndo();
            } else if (e.detail.action === 'redo') {
                performRedo();
            }
        });
    }

    return {
        init: init,
        saveStateForUndo: saveStateForUndo,
        performUndo: performUndo,
        performRedo: performRedo,
        updateUndoRedoButtons: updateUndoRedoButtons
    };
})();
