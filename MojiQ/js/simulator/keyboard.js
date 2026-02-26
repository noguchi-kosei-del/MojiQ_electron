/**
 * Simulator Keyboard Shortcuts
 * キーボードショートカット連携モジュール
 */
window.SimulatorKeyboard = (function() {
    'use strict';

    const State = window.SimulatorState;
    const DOM = window.SimulatorDOM;

    function init() {
        // 1. スペースキー (パン操作状態管理)
        window.addEventListener('mojiq:space', (e) => {
            State.set('isSpacePressed', e.detail.down);

            // 統合モード: calibrationまたはgridモード時のカーソル変更
            const currentMode = State.get('currentMode');
            if (currentMode === 'calibration' || currentMode === 'grid') {
                const canvas = DOM.getCanvas();
                if (canvas) {
                    const isSimPanning = State.get('isSimPanning');
                    if (e.detail.down) {
                        if (!isSimPanning) canvas.style.cursor = 'grab';
                    } else {
                        const isShiftPressed = State.get('isShiftPressed');
                        if (!isSimPanning && !isShiftPressed) {
                            const isGridAdjusting = State.get('isGridAdjusting');
                            canvas.style.cursor = ((currentMode === 'grid' || currentMode === 'calibration') && !isGridAdjusting) ? 'crosshair' : 'default';
                        }
                    }
                }
            }
        });

        // 1.5. Shiftキー (パン操作状態管理)
        window.addEventListener('mojiq:shift', (e) => {
            State.set('isShiftPressed', e.detail.down);

            // 統合モード: calibrationまたはgridモード時のカーソル変更
            const currentMode = State.get('currentMode');
            if (currentMode === 'calibration' || currentMode === 'grid') {
                const canvas = DOM.getCanvas();
                if (canvas) {
                    const isSimPanning = State.get('isSimPanning');

                    // 縮尺合わせモード中はShiftキーでカーソルを変えない
                    if (currentMode === 'calibration') {
                        return;
                    }

                    if (e.detail.down) {
                        if (!isSimPanning) canvas.style.cursor = 'grab';
                    } else {
                        const isSpacePressed = State.get('isSpacePressed');
                        if (!isSimPanning && !isSpacePressed) {
                            const isGridAdjusting = State.get('isGridAdjusting');
                            canvas.style.cursor = ((currentMode === 'grid' || currentMode === 'calibration') && !isGridAdjusting) ? 'crosshair' : 'default';
                        }
                    }
                }
            }
        });

        // 2. Simulator固有アクション ('Q'キーなど)
        window.addEventListener('mojiq:sim-action', (e) => {
            // 統合モード: グリッド調整中のみ反応
            const isGridAdjusting = State.get('isGridAdjusting');
            if (!isGridAdjusting) return;

            const dashDensityToggle = DOM.get('dashDensityToggle');

            if (e.detail.type === 'toggleDensity' && isGridAdjusting) {
                dashDensityToggle.checked = !dashDensityToggle.checked;
                dashDensityToggle.dispatchEvent(new Event('change'));
            }
        });

        // Ctrl++/-/0 ズームショートカット
        // 統合モード: 共通ズームを使用するため、ここでは何もしない
        // window.addEventListener('mojiq:zoom', ...) は shortcuts.js で処理

        // ページナビゲーション
        window.addEventListener('mojiq:page-navigate', (e) => {
            // script.js (MojiQScript) が存在する場合は、そちらがページ制御とSimulator同期を行うため
            // ここでは何もしない（二重動作防止）
            if (window.MojiQScript) return;

            const action = e.detail.action;
            const currentPageNum = State.get('currentPageNum');
            const totalPages = State.get('totalPages');

            // ページ情報がない場合は処理しない
            if (!totalPages || totalPages <= 0) return;

            let targetPage = currentPageNum;

            switch (action) {
                case 'next': // 方向キー左: 進む
                    if (currentPageNum < totalPages) targetPage++;
                    break;
                case 'prev': // 方向キー右: 戻る
                    if (currentPageNum > 1) targetPage--;
                    break;
                case 'last': // Ctrl+左: 最後のページ
                    targetPage = totalPages;
                    break;
                case 'first': // Ctrl+右: 最初のページ
                    targetPage = 1;
                    break;
            }

            // ページ移動が必要な場合、Simulator単独で表示を更新
            if (targetPage !== currentPageNum) {
                // グリッド選択中の場合は確定して解除
                if (window.SimulatorTools) {
                    window.SimulatorTools.deselectCurrentGrid();
                }

                State.set('currentPageNum', targetPage);

                // 画面をクリアして新しいページのグリッド設定を読み込む
                const ctx = DOM.getCtx();
                const canvas = DOM.getCanvas();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                window.SimulatorGridDrawing.restoreGridState(targetPage);
            }
        });

        // ページスライド（長押し中はスライダーのみ動かす）- Simulator単独用
        let slidingPage = null;
        window.addEventListener('mojiq:page-slide', (e) => {
            // script.js (MojiQScript) が存在する場合は、そちらが処理する
            if (window.MojiQScript) return;

            const action = e.detail.action;
            const currentPageNum = State.get('currentPageNum');
            const totalPages = State.get('totalPages');

            if (!totalPages || totalPages <= 0) return;

            // 初回はcurrentPageNumから開始
            if (slidingPage === null) {
                slidingPage = currentPageNum;
            }

            switch (action) {
                case 'next':
                    if (slidingPage < totalPages) slidingPage++;
                    break;
                case 'prev':
                    if (slidingPage > 1) slidingPage--;
                    break;
            }

            // スライダーとページ表示のみ更新
            if (window.MojiQNavigation) {
                MojiQNavigation.updatePageDisplay(slidingPage, totalPages);
            }
        });

        // ページ確定（長押し終了時）- Simulator単独用
        window.addEventListener('mojiq:page-confirm', () => {
            // script.js (MojiQScript) が存在する場合は、そちらが処理する
            if (window.MojiQScript) return;

            const currentPageNum = State.get('currentPageNum');

            if (slidingPage !== null && slidingPage !== currentPageNum) {
                // グリッド選択中の場合は確定して解除
                if (window.SimulatorTools) {
                    window.SimulatorTools.deselectCurrentGrid();
                }

                State.set('currentPageNum', slidingPage);

                const ctx = DOM.getCtx();
                const canvas = DOM.getCanvas();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                window.SimulatorGridDrawing.restoreGridState(slidingPage);
            }
            slidingPage = null;
        });
    }

    return {
        init: init
    };
})();
