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

    // overscroll margin 再計算用 ResizeObserver（cleanup用）
    let canvasResizeObserver = null;

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
        setupResizeObserver();
    }

    /**
     * .shared-canvas-area のサイズ変化（ウィンドウリサイズ等）に追従して
     * overscroll margin を再計算する。
     */
    function setupResizeObserver() {
        if (!canvasArea || typeof ResizeObserver === 'undefined') return;
        try {
            canvasResizeObserver = new ResizeObserver(() => {
                applyOverscrollMargin();
            });
            canvasResizeObserver.observe(canvasArea);
        } catch (e) {
            // ResizeObserver 非対応環境では window resize でフォールバック
            canvasResizeObserver = null;
        }
    }

    /**
     * ズーム時に画像/PDF がビューポートを溢れた場合、canvas-wrapper に
     * 動的なマージン（overscroll margin）を付与してスクロール可動範囲を
     * 拡張する。PsDesign の applyOverscrollMargin() と同じ思想。
     * @returns {{padX: number, padY: number}}
     */
    function applyOverscrollMargin() {
        if (!canvasWrapper || !canvasArea || !state) {
            return { padX: 0, padY: 0 };
        }

        const fraction = window.MojiQConstants?.ZOOM?.OVERSCROLL_FRACTION ?? 0.85;

        const baseW = state.baseCSSExtent?.width || 0;
        const baseH = state.baseCSSExtent?.height || 0;
        const visualW = baseW * state.currentZoom;
        const visualH = baseH * state.currentZoom;

        // .shared-canvas-area のクライアント領域（既存 padding 20px 込み）
        const availW = canvasArea.clientWidth;
        const availH = canvasArea.clientHeight;

        const overflowsX = visualW > availW;
        const overflowsY = visualH > availH;
        const padX = overflowsX ? Math.round(availW * fraction) : 0;
        const padY = overflowsY ? Math.round(availH * fraction) : 0;

        if (padX > 0 || padY > 0) {
            canvasWrapper.style.margin = `${padY}px ${padX}px`;
        } else {
            canvasWrapper.style.margin = '';
        }

        return { padX, padY };
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

        // ズーム後の視覚サイズに合わせて overscroll マージンを再計算
        applyOverscrollMargin();
    }

    /**
     * ズーム実行
     * @param {number} newZoom - 新しいズーム値
     */
    function performZoom(newZoom) {
        const oldZoom = state.currentZoom;
        // QA対策 #29: constants.jsからズーム制限値を取得
        const zoomLimits = window.MojiQConstants?.ZOOM || {};
        const minZoom = zoomLimits.MIN || 0.25;
        const maxZoom = zoomLimits.MAX || 4.0;
        const nextZoom = Math.min(Math.max(newZoom, minZoom), maxZoom);
        if (oldZoom === nextZoom) return;

        const rect = canvasArea.getBoundingClientRect();
        const offsetX = rect.width / 2;
        const offsetY = rect.height / 2;
        const scrollLeft = canvasArea.scrollLeft;
        const scrollTop = canvasArea.scrollTop;

        // overscroll margin の付与/剥離でビューポート中心が画像内のずれた点を
        // 指さないよう、ズーム前後のマージン値を比較して補正する
        const prevPadX = parseFloat(canvasWrapper.style.marginLeft) || 0;
        const prevPadY = parseFloat(canvasWrapper.style.marginTop) || 0;

        state.currentZoom = nextZoom;
        updateZoomDisplay();

        const newPadX = parseFloat(canvasWrapper.style.marginLeft) || 0;
        const newPadY = parseFloat(canvasWrapper.style.marginTop) || 0;

        const ratio = state.currentZoom / oldZoom;
        canvasArea.scrollLeft = (scrollLeft + offsetX - prevPadX) * ratio - offsetX + newPadX;
        canvasArea.scrollTop = (scrollTop + offsetY - prevPadY) * ratio - offsetY + newPadY;
    }

    /**
     * 指定した点に向かってズーム実行
     * @param {number} newZoom - 新しいズーム値
     * @param {number} clientX - マウスのクライアントX座標
     * @param {number} clientY - マウスのクライアントY座標
     */
    function performZoomToPoint(newZoom, clientX, clientY) {
        const oldZoom = state.currentZoom;
        const zoomLimits = window.MojiQConstants?.ZOOM || {};
        const minZoom = zoomLimits.MIN || 0.25;
        const maxZoom = zoomLimits.MAX || 4.0;
        const nextZoom = Math.min(Math.max(newZoom, minZoom), maxZoom);
        if (oldZoom === nextZoom) return;

        const rect = canvasArea.getBoundingClientRect();
        // マウス位置からcanvasArea内のオフセットを計算
        const offsetX = clientX - rect.left;
        const offsetY = clientY - rect.top;
        const scrollLeft = canvasArea.scrollLeft;
        const scrollTop = canvasArea.scrollTop;

        // overscroll margin の付与/剥離をスクロール位置に反映するための補正値
        const prevPadX = parseFloat(canvasWrapper.style.marginLeft) || 0;
        const prevPadY = parseFloat(canvasWrapper.style.marginTop) || 0;

        state.currentZoom = nextZoom;
        updateZoomDisplay();

        const newPadX = parseFloat(canvasWrapper.style.marginLeft) || 0;
        const newPadY = parseFloat(canvasWrapper.style.marginTop) || 0;

        const ratio = state.currentZoom / oldZoom;
        canvasArea.scrollLeft = (scrollLeft + offsetX - prevPadX) * ratio - offsetX + newPadX;
        canvasArea.scrollTop = (scrollTop + offsetY - prevPadY) * ratio - offsetY + newPadY;
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
                // Ctrl/Cmd + ホイール: 画面中央を基準にズーム
                e.preventDefault();
                e.stopPropagation();
                const direction = e.deltaY < 0 ? 1 : -1;
                const step = 0.05;
                performZoom(state.currentZoom + (direction * step));
            } else if (e.altKey) {
                // Alt + ホイール: ポインター位置に向かってズーム
                e.preventDefault();
                e.stopPropagation();
                const direction = e.deltaY < 0 ? 1 : -1;
                const step = 0.05;
                performZoomToPoint(state.currentZoom + (direction * step), e.clientX, e.clientY);
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

        if (canvasResizeObserver) {
            canvasResizeObserver.disconnect();
            canvasResizeObserver = null;
        }

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
        // QA対策 #29: ズーム値のバウンドチェック
        const zoomLimits = window.MojiQConstants?.ZOOM || {};
        const minZoom = zoomLimits.MIN || 0.25;
        const maxZoom = zoomLimits.MAX || 4.0;
        state.currentZoom = Math.min(Math.max(zoom, minZoom), maxZoom);
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
