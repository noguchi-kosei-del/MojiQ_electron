/* js/viewer-mode.js - ビューワーモード制御 */

window.MojiQViewerMode = (function() {
    let isActive = false;
    let wasDarkMode = false;
    let previousZoom = 1;
    let state = null;
    let renderPageCallback = null;

    // DOM要素
    let viewerModeBtn = null;
    let navHint = null;
    let closeBtn = null;

    // タイマー
    let hintHideTimer = null;
    let closeBtnHideTimer = null;
    let zoomAnimationId = null;
    const HINT_SHOW_DURATION = 3000;
    const CLOSE_BTN_FADE_DELAY = 3000;
    const ZOOM_ANIMATION_DURATION = 300; // ズームアニメーション時間(ms)

    // 連打対策用
    let isNavigating = false;
    let lastNavigateTime = 0;
    const NAVIGATE_COOLDOWN_MS = 150; // 連打防止間隔

    // イベントハンドラ参照
    let boundHandlers = {
        wheel: null,
        keydown: null,
        viewerBtnClick: null,
        closeBtnClick: null,
        mousemove: null
    };

    /**
     * 初期化
     * @param {object} appState - アプリケーション状態への参照
     * @param {Function} renderPage - ページレンダリング関数
     */
    function init(appState, renderPage) {
        state = appState;
        renderPageCallback = renderPage;

        viewerModeBtn = document.getElementById('viewerModeBtn');

        // UI要素の作成
        createUIElements();

        // ボタンイベント
        if (viewerModeBtn) {
            boundHandlers.viewerBtnClick = () => toggle();
            viewerModeBtn.addEventListener('click', boundHandlers.viewerBtnClick);
        }
    }

    /**
     * UI要素の作成
     */
    function createUIElements() {
        // ナビゲーションヒント
        navHint = document.createElement('div');
        navHint.className = 'viewer-nav-hint';
        navHint.textContent = 'escまたは×ボタンで閲覧モード解除';
        document.body.appendChild(navHint);

        // 閉じるボタン（右上角）
        closeBtn = document.createElement('button');
        closeBtn.className = 'viewer-close-btn';
        closeBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        `;
        closeBtn.title = '閲覧モードを終了';
        document.body.appendChild(closeBtn);

        // 閉じるボタンのクリックイベント
        boundHandlers.closeBtnClick = () => exit();
        closeBtn.addEventListener('click', boundHandlers.closeBtnClick);
    }

    /**
     * ビューワーモードの切り替え
     */
    function toggle() {
        if (isActive) {
            exit();
        } else {
            enter();
        }
    }

    /**
     * ビューワーモードに入る
     */
    function enter() {
        if (isActive) return;
        if (!state || state.pdfDocs.length === 0) return;

        isActive = true;

        // 開いているドロップダウンを閉じる
        if (window._spreadBindingDropdownClose) {
            window._spreadBindingDropdownClose();
        }
        if (window._savePdfDropdownClose) {
            window._savePdfDropdownClose();
        }

        // 現在のダークモード状態を保存
        wasDarkMode = document.body.classList.contains('dark-mode');

        // ダークモードを有効化
        if (!wasDarkMode) {
            document.body.classList.add('dark-mode');
            // ダークモードアイコンを更新
            const darkModeIcon = document.getElementById('darkModeHeaderIcon');
            if (darkModeIcon) {
                darkModeIcon.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                `;
            }
        }

        // ビューワーモードクラスを追加
        document.body.classList.add('viewer-mode');

        // 現在のズーム値を保存
        if (state) {
            previousZoom = state.currentZoom || 1;
        }

        // ナビゲーションヒントと閉じるボタンを表示
        showNavHint();
        showCloseBtn();

        // イベントリスナー登録
        setupEventListeners();

        // UIフェードアウトと同時にズームイン
        fitToScreen();
    }

    /**
     * 閉じるボタンを表示
     */
    function showCloseBtn() {
        if (!closeBtn) return;
        closeBtn.classList.add('show');
        resetCloseBtnTimer();
    }

    /**
     * 閉じるボタンを非表示
     */
    function hideCloseBtn() {
        if (!closeBtn) return;
        closeBtn.classList.remove('show');
    }

    /**
     * 閉じるボタンの非表示タイマーをリセット
     */
    function resetCloseBtnTimer() {
        if (closeBtnHideTimer) {
            clearTimeout(closeBtnHideTimer);
        }
        closeBtnHideTimer = setTimeout(() => {
            hideCloseBtn();
        }, CLOSE_BTN_FADE_DELAY);
    }

    /**
     * アニメーション付きズーム
     * @param {number} targetZoom - 目標ズーム値
     * @param {Function} [onComplete] - 完了時コールバック
     * @param {boolean} [skipScrollAdjust=false] - スクロール調整をスキップするか
     */
    function animateZoom(targetZoom, onComplete, skipScrollAdjust) {
        if (zoomAnimationId) {
            cancelAnimationFrame(zoomAnimationId);
            zoomAnimationId = null;
        }

        const startZoom = state.currentZoom;
        const startTime = performance.now();

        function easeOutCubic(t) {
            return 1 - Math.pow(1 - t, 3);
        }

        function step(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / ZOOM_ANIMATION_DURATION, 1);
            const easedProgress = easeOutCubic(progress);

            const currentZoom = startZoom + (targetZoom - startZoom) * easedProgress;

            // skipScrollAdjustがtrueの場合、setZoomを使用してスクロール調整をスキップ
            if (skipScrollAdjust && window.MojiQZoom && typeof window.MojiQZoom.setZoom === 'function') {
                window.MojiQZoom.setZoom(currentZoom);
            } else if (window.MojiQZoom && typeof window.MojiQZoom.performZoom === 'function') {
                window.MojiQZoom.performZoom(currentZoom);
            } else if (state) {
                state.currentZoom = currentZoom;
            }

            if (progress < 1) {
                zoomAnimationId = requestAnimationFrame(step);
            } else {
                zoomAnimationId = null;
                if (onComplete) onComplete();
            }
        }

        zoomAnimationId = requestAnimationFrame(step);
    }

    /**
     * 画面にフィットするようにズーム
     */
    function fitToScreen() {
        if (!state || !state.baseCSSExtent || state.baseCSSExtent.width === 0) return;

        // 画面全体のサイズを取得
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        const pageWidth = state.baseCSSExtent.width;
        const pageHeight = state.baseCSSExtent.height;

        // 画面いっぱいに表示するズーム倍率を計算
        const scaleX = screenWidth / pageWidth;
        const scaleY = screenHeight / pageHeight;
        const fitScale = Math.min(scaleX, scaleY); // 画面いっぱいに表示

        // アニメーション付きでズームを適用し、完了後に中央配置
        // スクロール調整をスキップして、完了時にまとめて正しい位置に設定
        const canvasArea = document.getElementById('sharedCanvasArea');
        animateZoom(fitScale, () => {
            // アニメーション完了後にスクロール位置をリセット
            // CSSでflexboxの中央配置を使用しているため、スクロールは(0, 0)でOK
            if (canvasArea) {
                canvasArea.scrollLeft = 0;
                canvasArea.scrollTop = 0;
            }
        }, true); // skipScrollAdjust = true
    }

    /**
     * ビューワーモードを終了
     */
    function exit() {
        if (!isActive) return;

        isActive = false;

        // ビューワーモードクラスを削除
        document.body.classList.remove('viewer-mode');

        // ダークモードを元に戻す
        if (!wasDarkMode) {
            document.body.classList.remove('dark-mode');
            // ダークモードアイコンを更新
            const darkModeIcon = document.getElementById('darkModeHeaderIcon');
            if (darkModeIcon) {
                darkModeIcon.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="5"/>
                        <line x1="12" y1="1" x2="12" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="23"/>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                        <line x1="1" y1="12" x2="3" y2="12"/>
                        <line x1="21" y1="12" x2="23" y2="12"/>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                `;
            }
        }

        // タイマーをクリア
        clearTimeout(hintHideTimer);
        clearTimeout(closeBtnHideTimer);

        // 連打対策フラグをリセット
        isNavigating = false;
        lastNavigateTime = 0;

        // 閉じるボタンを非表示
        hideCloseBtn();

        // イベントリスナー解除
        cleanupEventListeners();

        // アニメーション付きで元のズームに戻す
        animateZoom(previousZoom);
    }

    /**
     * イベントリスナーのセットアップ
     */
    function setupEventListeners() {
        // ホイールスクロールでページ移動
        boundHandlers.wheel = (e) => {
            if (!isActive) return;

            e.preventDefault();

            // ナビゲーション中は無視（wheelイベントは連続で発火するため）
            if (isNavigating) return;

            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (Math.abs(delta) < 10) return;

            // スクロール方向に応じてページ移動（右開き仕様）
            const direction = delta > 0 ? 1 : -1;
            navigatePage(direction);
        };

        // キーボードでページ移動
        boundHandlers.keydown = (e) => {
            if (!isActive) return;

            // 見開きモードかつ左綴じの場合はキー方向を反転
            const PdfManager = window.MojiQPdfManager;
            const isLeftBinding = PdfManager && PdfManager.isSpreadViewMode() &&
                                  PdfManager.getSpreadBindingDirection() === 'left';
            // ユーザー設定による反転（通常モードと同じロジック）
            const isUserInverted = window.MojiQSettings && window.MojiQSettings.getArrowKeyInverted();
            // 両方の反転を組み合わせる（XOR: 一方だけtrueなら反転）
            const shouldInvert = isLeftBinding !== isUserInverted;

            const isCtrlOrMeta = e.ctrlKey || e.metaKey;

            // Ctrl+矢印キー: 最初/最後のページへジャンプ
            if (isCtrlOrMeta && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
                                 e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    if (shouldInvert) {
                        goToPage(1); // 反転: 最初のページ
                    } else {
                        goToPage(state.totalPages); // 通常: 最後のページ
                    }
                } else {
                    if (shouldInvert) {
                        goToPage(state.totalPages); // 反転: 最後のページ
                    } else {
                        goToPage(1); // 通常: 最初のページ
                    }
                }
                return;
            }

            switch (e.key) {
                case 'Escape':
                    exit();
                    break;
                case 'ArrowLeft':
                case 'ArrowUp':
                    e.preventDefault();
                    if (shouldInvert) {
                        navigatePage(-1); // 反転: 前ページ
                    } else {
                        navigatePage(1); // 通常: 次ページ
                    }
                    break;
                case 'ArrowRight':
                case 'ArrowDown':
                    e.preventDefault();
                    if (shouldInvert) {
                        navigatePage(1); // 反転: 次ページ
                    } else {
                        navigatePage(-1); // 通常: 前ページ
                    }
                    break;
                case 'Home':
                    e.preventDefault();
                    if (shouldInvert) {
                        goToPage(1); // 反転: 最初のページ
                    } else {
                        goToPage(state.totalPages); // 通常: 最後のページ
                    }
                    break;
                case 'End':
                    e.preventDefault();
                    if (shouldInvert) {
                        goToPage(state.totalPages); // 反転: 最後のページ
                    } else {
                        goToPage(1); // 通常: 最初のページ
                    }
                    break;
            }
        };

        // マウス移動で閉じるボタンを表示
        boundHandlers.mousemove = (e) => {
            if (!isActive) return;
            // 画面右上領域でのマウス移動を検出（右上から150px以内）
            if (e.clientX > window.innerWidth - 150 && e.clientY < 150) {
                showCloseBtn();
            }
        };

        document.addEventListener('wheel', boundHandlers.wheel, { passive: false });
        document.addEventListener('keydown', boundHandlers.keydown);
        document.addEventListener('mousemove', boundHandlers.mousemove);
    }

    /**
     * イベントリスナーのクリーンアップ
     */
    function cleanupEventListeners() {
        document.removeEventListener('wheel', boundHandlers.wheel);
        document.removeEventListener('keydown', boundHandlers.keydown);
        document.removeEventListener('mousemove', boundHandlers.mousemove);
    }

    /**
     * ページ移動
     * @param {number} direction - 移動方向 (1: 次, -1: 前)
     */
    function navigatePage(direction) {
        if (!state) return;

        // 連打対策: クールダウン中は無視
        const now = performance.now();
        if (now - lastNavigateTime < NAVIGATE_COOLDOWN_MS) {
            return;
        }

        // ナビゲーション中は無視
        if (isNavigating) {
            return;
        }

        const PdfManager = window.MojiQPdfManager;

        // 見開きモードの場合
        if (PdfManager && PdfManager.isSpreadViewMode()) {
            const currentIndex = PdfManager.getCurrentSpreadIndex();
            const mapping = PdfManager.getSpreadMapping();
            const maxIndex = mapping ? mapping.length - 1 : 0;

            // 境界チェック: 移動できない場合は何もしない
            if (direction > 0 && currentIndex >= maxIndex) {
                return; // 既に最後の見開き
            }
            if (direction < 0 && currentIndex <= 0) {
                return; // 既に最初の見開き
            }

            lastNavigateTime = now;
            isNavigating = true;

            if (direction > 0) {
                // 次の見開きへ（右開き仕様: prevSpreadが次へ進む）
                PdfManager.prevSpread();
            } else {
                // 前の見開きへ（右開き仕様: nextSpreadが前へ戻る）
                PdfManager.nextSpread();
            }
            // ズームアニメーション完了を待ってフラグをリセット
            setTimeout(() => {
                isNavigating = false;
            }, ZOOM_ANIMATION_DURATION + 50);
            return;
        }

        // 単ページモードの場合
        if (!renderPageCallback) {
            return;
        }

        const targetPage = state.currentPageNum + direction;

        // 境界チェック: 移動できない場合は何もしない
        if (targetPage < 1 || targetPage > state.totalPages) {
            return;
        }

        lastNavigateTime = now;
        isNavigating = true;

        renderPageCallback(targetPage);

        // ズームアニメーション完了を待ってフラグをリセット
        setTimeout(() => {
            isNavigating = false;
        }, ZOOM_ANIMATION_DURATION + 50);
    }

    /**
     * 特定ページへ移動
     * @param {number} pageNum - ページ番号
     */
    function goToPage(pageNum) {
        if (!state) return;

        const PdfManager = window.MojiQPdfManager;

        // 見開きモードの場合
        if (PdfManager && PdfManager.isSpreadViewMode()) {
            const mapping = PdfManager.getSpreadMapping();
            if (mapping && mapping.length > 0) {
                if (pageNum === 1) {
                    // 最初の見開きへ
                    PdfManager.renderSpreadView(0);
                } else if (pageNum === state.totalPages) {
                    // 最後の見開きへ
                    PdfManager.renderSpreadView(mapping.length - 1);
                }
            }
            return;
        }

        // 単ページモードの場合
        if (!renderPageCallback) return;

        if (pageNum >= 1 && pageNum <= state.totalPages) {
            renderPageCallback(pageNum);
        }
    }

    /**
     * ナビゲーションヒントを表示
     */
    function showNavHint() {
        if (!navHint) return;

        navHint.classList.add('show');

        clearTimeout(hintHideTimer);
        hintHideTimer = setTimeout(() => {
            navHint.classList.remove('show');
        }, HINT_SHOW_DURATION);
    }

    /**
     * ビューワーモードがアクティブかどうか
     * @returns {boolean}
     */
    function isViewerActive() {
        return isActive;
    }

    /**
     * クリーンアップ
     */
    function cleanup() {
        if (zoomAnimationId) {
            cancelAnimationFrame(zoomAnimationId);
            zoomAnimationId = null;
        }
        exit();

        if (viewerModeBtn && boundHandlers.viewerBtnClick) {
            viewerModeBtn.removeEventListener('click', boundHandlers.viewerBtnClick);
        }

        if (closeBtn && boundHandlers.closeBtnClick) {
            closeBtn.removeEventListener('click', boundHandlers.closeBtnClick);
        }

        if (navHint && navHint.parentNode) {
            navHint.parentNode.removeChild(navHint);
        }

        if (closeBtn && closeBtn.parentNode) {
            closeBtn.parentNode.removeChild(closeBtn);
        }
    }

    return {
        init,
        toggle,
        enter,
        exit,
        isActive: isViewerActive,
        fitToScreen,
        cleanup
    };
})();
