/**
 * Simulator Zoom Controls
 * ズーム制御モジュール
 *
 * 注意: このモジュールはMojiQZoomのラッパーとして機能します。
 * ズームのコア機能はMojiQZoomで一元管理されています。
 */
window.SimulatorZoom = (function() {
    'use strict';

    const State = window.SimulatorState;
    const DOM = window.SimulatorDOM;

    /**
     * MojiQZoomを使用してズームを実行
     * @param {number} delta - ズーム変化量
     */
    function performZoom(delta) {
        if (window.MojiQZoom) {
            const currentZoom = MojiQZoom.getZoom();
            MojiQZoom.performZoom(currentZoom + delta);
        } else if (window.MojiQScript) {
            // フォールバック
            const currentZoom = MojiQScript.getZoom();
            MojiQScript.performZoom(currentZoom + delta);
        }
    }

    /**
     * ズームをリセット
     */
    function resetZoom() {
        if (window.MojiQZoom) {
            MojiQZoom.resetZoom();
        } else if (window.MojiQScript) {
            MojiQScript.resetZoom();
        }
    }

    /**
     * 初期化
     */
    function init() {
        const canvas = DOM.getCanvas();
        const canvasWrapper = DOM.get('canvasWrapper');

        // Ctrl+マウスホイールでズーム（calibration/gridモード時のみ）
        if (canvas) {
            canvas.addEventListener('wheel', (e) => {
                const currentMode = State.get('currentMode');
                if (currentMode !== 'calibration' && currentMode !== 'grid') return;
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const direction = e.deltaY < 0 ? 1 : -1;
                    performZoom(direction * 0.05);
                }
            }, { passive: false });
        }

        // リサイズ時のグリッド再描画
        if (canvasWrapper) {
            const resizeObserver = new ResizeObserver(() => {
                const pendingGridState = State.get('pendingGridState');
                const currentPageNum = State.get('currentPageNum');
                const pageGridState = State.getPageGridState(currentPageNum);

                if (pendingGridState || pageGridState) {
                    setTimeout(() => {
                        if (pendingGridState) {
                            if (window.SimulatorGridDrawing) {
                                SimulatorGridDrawing.drawFixedGrid(pendingGridState, true);
                            }
                        } else {
                            if (window.SimulatorGridDrawing) {
                                SimulatorGridDrawing.restoreGridState(currentPageNum);
                            }
                        }
                    }, 50);
                }
            });
            resizeObserver.observe(canvasWrapper);
        }
    }

    return {
        init: init,
        performZoom: performZoom,
        resetZoom: resetZoom
    };
})();
