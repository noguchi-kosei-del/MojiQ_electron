/**
 * Simulator Main Entry Point
 * メインエントリポイント - 全モジュールの初期化と連携
 */
window.addEventListener('load', () => {
    'use strict';

    const State = window.SimulatorState;
    const DOM = window.SimulatorDOM;

    // DOM要素の初期化
    if (!DOM.init()) {
        console.warn('Simulator: Canvas element not found');
        return;
    }

    const ctx = DOM.getCtx();
    const canvas = DOM.getCanvas();

    // キャンバス初期設定
    function initCanvas() {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (window.SimulatorUI) {
            window.SimulatorUI.updateStepVisuals();
        }
    }
    initCanvas();

    // 各モジュールの初期化
    if (window.SimulatorGridDrawing) window.SimulatorGridDrawing.init();
    if (window.SimulatorZoom) window.SimulatorZoom.init();
    if (window.SimulatorEventHandlers) window.SimulatorEventHandlers.init();
    if (window.SimulatorTools) window.SimulatorTools.init();
    if (window.SimulatorUndoRedo) window.SimulatorUndoRedo.init();
    if (window.SimulatorUI) window.SimulatorUI.init();
    if (window.SimulatorKeyboard) window.SimulatorKeyboard.init();

    // --- メインスクリプトからの呼び出し ---
    window.syncSimulatorFromScript = (pageNum) => {
        // ページ変更時にグリッド選択を解除
        if (window.SimulatorTools) {
            window.SimulatorTools.deselectCurrentGrid();
        }

        State.set('currentPageNum', pageNum);

        if (window.MojiQScript) {
            const mapping = window.MojiQScript.getPageMapping();
            State.set('totalPages', mapping.length);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        window.SimulatorGridDrawing.restoreGridState(pageNum);
    };


});
