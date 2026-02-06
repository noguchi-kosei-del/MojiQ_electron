/* js/zoom.js - ズーム制御 */

window.MojiQZoom = (function() {
    let zoomInBtn = null;
    let zoomOutBtn = null;
    let zoomLabel = null;
    let canvasWrapper = null;
    let canvasArea = null;
    let state = null;

    // イベントリスナー参照（cleanup用）
    let boundHandlers = {
        zoomInClick: null,
        zoomOutClick: null,
        wheelHandler: null,
        gestureHandler: null,
        zoomShortcutHandler: null
    };

    /**
     * 初期化
     * @param {object} elements - DOM要素
     * @param {object} appState - アプリケーション状態への参照
     */
    function init(elements, appState) {
        zoomInBtn = elements.zoomInBtn;
        zoomOutBtn = elements.zoomOutBtn;
        zoomLabel = elements.zoomLabel;
        canvasWrapper = elements.canvasWrapper;
        canvasArea = elements.canvasArea;
        state = appState;

        setupEventListeners();
        setupShortcutListeners();
    }

    /**
     * ズーム表示の更新
     */
    function updateZoomDisplay() {
        const zoomText = Math.round(state.currentZoom * 100) + "%";
        if (zoomLabel) {
            zoomLabel.textContent = zoomText;
        }

        // Simulatorのズームラベルも同期更新
        const simZoomLabel = document.getElementById('sim-zoomLabel');
        if (simZoomLabel) {
            simZoomLabel.textContent = zoomText;
        }

        if (state.baseCSSExtent.width > 0) {
            const w = (state.baseCSSExtent.width * state.currentZoom) + "px";
            const h = (state.baseCSSExtent.height * state.currentZoom) + "px";
            canvasWrapper.style.width = w;
            canvasWrapper.style.height = h;
        }
    }

    /**
     * ズーム実行
     * @param {number} newZoom - 新しいズーム値
     */
    function performZoom(newZoom) {
        const oldZoom = state.currentZoom;
        const nextZoom = Math.min(Math.max(newZoom, 0.1), 5.0);
        if (oldZoom === nextZoom) return;

        const rect = canvasArea.getBoundingClientRect();
        const offsetX = rect.width / 2;
        const offsetY = rect.height / 2;
        const scrollLeft = canvasArea.scrollLeft;
        const scrollTop = canvasArea.scrollTop;

        state.currentZoom = nextZoom;
        updateZoomDisplay();

        const ratio = state.currentZoom / oldZoom;
        canvasArea.scrollLeft = (scrollLeft + offsetX) * ratio - offsetX;
        canvasArea.scrollTop = (scrollTop + offsetY) * ratio - offsetY;
    }

    /**
     * ズームをリセット
     */
    function resetZoom() {
        state.currentZoom = 1.0;
        updateZoomDisplay();
    }

    /**
     * イベントリスナーのセットアップ
     */
    function setupEventListeners() {
        // ハンドラを保存しながらリスナーを登録
        boundHandlers.zoomInClick = () => performZoom(state.currentZoom + 0.1);
        boundHandlers.zoomOutClick = () => performZoom(state.currentZoom - 0.1);
        if (zoomInBtn) zoomInBtn.addEventListener('click', boundHandlers.zoomInClick);
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', boundHandlers.zoomOutClick);

        // ズーム: マウスホイール制御
        boundHandlers.wheelHandler = (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                const direction = e.deltaY < 0 ? 1 : -1;
                const step = 0.05;
                performZoom(state.currentZoom + (direction * step));
            }
        };
        window.addEventListener('wheel', boundHandlers.wheelHandler, { passive: false });

        // ズーム: ジェスチャー制御
        boundHandlers.gestureHandler = (e) => {
            e.preventDefault();
            if (e.type === 'gesturechange' && e.scale && e.scale !== 1) {
                const direction = e.scale > 1 ? 1 : -1;
                performZoom(state.currentZoom + (direction * 0.02));
            }
        };
        document.addEventListener('gesturestart', boundHandlers.gestureHandler);
        document.addEventListener('gesturechange', boundHandlers.gestureHandler);
        document.addEventListener('gestureend', boundHandlers.gestureHandler);
    }

    /**
     * ショートカットイベントのセットアップ
     */
    function setupShortcutListeners() {
        // ズーム: ショートカットイベントハンドラ (shortcuts.js連携)
        boundHandlers.zoomShortcutHandler = (e) => {
            const action = e.detail.action;
            if (action === 'in') {
                performZoom(state.currentZoom + 0.1);
            } else if (action === 'out') {
                performZoom(state.currentZoom - 0.1);
            } else if (action === 'reset') {
                state.currentZoom = 1.0;
                updateZoomDisplay();
            }
        };
        window.addEventListener('mojiq:zoom', boundHandlers.zoomShortcutHandler);
    }

    /**
     * イベントリスナーをクリーンアップ
     */
    function cleanup() {
        if (zoomInBtn) zoomInBtn.removeEventListener('click', boundHandlers.zoomInClick);
        if (zoomOutBtn) zoomOutBtn.removeEventListener('click', boundHandlers.zoomOutClick);

        window.removeEventListener('wheel', boundHandlers.wheelHandler);
        window.removeEventListener('mojiq:zoom', boundHandlers.zoomShortcutHandler);

        document.removeEventListener('gesturestart', boundHandlers.gestureHandler);
        document.removeEventListener('gesturechange', boundHandlers.gestureHandler);
        document.removeEventListener('gestureend', boundHandlers.gestureHandler);

        // 参照をクリア
        for (const key in boundHandlers) {
            boundHandlers[key] = null;
        }
    }

    /**
     * 現在のズーム値を取得
     * @returns {number}
     */
    function getZoom() {
        return state.currentZoom;
    }

    /**
     * ズーム値を設定
     * @param {number} zoom - ズーム値
     */
    function setZoom(zoom) {
        state.currentZoom = zoom;
        updateZoomDisplay();
    }

    return {
        init,
        cleanup,  // メモリリーク対策: イベントリスナー解除
        performZoom,
        resetZoom,
        updateZoomDisplay,
        getZoom,
        setZoom
    };
})();
