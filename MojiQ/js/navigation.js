/* js/navigation.js - ナビゲーションバー制御 */

window.MojiQNavigation = (function() {
    let bottomNavBar = null;
    let pageSlider = null;
    let sliderBubble = null;
    let navPrevBtn = null;
    let navNextBtn = null;
    let canvasArea = null;
    let state = null;
    let renderPageCallback = null;

    let navBarHideTimer = null;
    const FADE_DELAY_MS = 3000;

    // ユーザー非表示/トグルボタン状態
    let isUserHidden = false;
    let navBarToggleBtn = null;

    let isDragging = false;

    // イベントリスナー参照（cleanup用）
    let boundHandlers = {
        canvasAreaMousemove: null,
        canvasAreaTouchstart: null,
        canvasAreaWheel: null,
        navBarMouseenter: null,
        navBarMouseleave: null,
        sliderInput: null,
        sliderChange: null,
        sliderMousedown: null,
        sliderTouchstart: null,
        documentMouseup: null,
        documentTouchend: null,
        prevBtnClick: null,
        nextBtnClick: null,
        navBarWheel: null,
        toggleBtnClick: null
    };

    /**
     * 初期化
     * @param {object} elements - DOM要素
     * @param {object} appState - アプリケーション状態への参照
     * @param {Function} renderPage - ページレンダリング関数
     */
    function init(elements, appState, renderPage) {
        bottomNavBar = elements.bottomNavBar;
        pageSlider = elements.pageSlider;
        sliderBubble = document.getElementById('sliderBubble');
        navPrevBtn = elements.navPrevBtn;
        navNextBtn = elements.navNextBtn;
        canvasArea = elements.canvasArea;
        state = appState;
        renderPageCallback = renderPage;

        // HTMLに定義されたトグルボタンを取得
        navBarToggleBtn = document.getElementById('navBarToggleBtn');

        setupEventListeners();

        // 保存された設定を復元
        restoreSavedState();
    }

    /**
     * 保存された設定を復元
     */
    function restoreSavedState() {
        const savedHidden = localStorage.getItem('mojiq_pagebar_hidden');
        if (savedHidden === 'true') {
            // ページバーを非表示状態で初期化（赤色アイコン）
            isUserHidden = true;
            bottomNavBar.classList.add('user-hidden');
            if (navBarToggleBtn) {
                navBarToggleBtn.querySelector('.nav-toggle-hide').style.display = 'none';
                navBarToggleBtn.querySelector('.nav-toggle-show').style.display = '';
                navBarToggleBtn.title = 'ページバーを表示';
                navBarToggleBtn.classList.add('hidden-state');
            }
        }
    }

    /**
     * ナビゲーションバーを表示
     */
    function showNavBar() {
        if (isUserHidden) return;
        bottomNavBar.classList.remove('fade-out');
        if (bottomNavBar.style.display !== 'flex') {
            bottomNavBar.style.display = 'flex';
        }
    }

    /**
     * ナビゲーションバーのタイマーをリセット
     */
    function resetNavBarTimer() {
        if (state.pdfDocs.length === 0) return;
        if (state.interactionState !== 0) return;
        if (isUserHidden) return;

        showNavBar();
        clearTimeout(navBarHideTimer);

        navBarHideTimer = setTimeout(() => {
            bottomNavBar.classList.add('fade-out');
        }, FADE_DELAY_MS);
    }

    /**
     * 入力に応じてナビゲーションバーを表示
     * フローティングバーの位置（bottom: 30px, height: 36px）のみを検出
     */
    function handleInputForNavBar(e) {
        if (state.interactionState !== 0 || state.isPanning) return;
        // タッチイベントの安全なアクセス（touches配列が空の場合に対応）
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches.length > 0 ? e.touches[0].clientY : 0);
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches.length > 0 ? e.touches[0].clientX : 0);

        // フローティングバーの位置を計算（CSS: bottom: 30px, height: 36px, width: 70%, max-width: 600px, 中央配置）
        const barBottom = 30;
        const barHeight = 36;
        const barTop = window.innerHeight - barBottom - barHeight;
        const barBottomY = window.innerHeight - barBottom;

        // 幅の計算（70%だがmax-width: 600px）
        const barWidth = Math.min(window.innerWidth * 0.7, 600);
        const barLeft = (window.innerWidth - barWidth) / 2;
        const barRight = barLeft + barWidth;

        // マウス位置がフローティングバーの領域内かチェック
        if (clientY >= barTop && clientY <= barBottomY && clientX >= barLeft && clientX <= barRight) {
            resetNavBarTimer();
        }
    }

    /**
     * バブルの位置と内容を更新
     * @param {number} val - 現在のページ番号
     */
    function updateSliderBubblePosition(val) {
        if (!sliderBubble) return;

        const min = parseInt(pageSlider.min, 10) || 1;
        const max = parseInt(pageSlider.max, 10) || 1;
        const thumbWidth = 16;

        // 総ページ数も表示（例: 1/24）
        sliderBubble.textContent = `${val}/${max}`;

        if (max <= min) {
            // RTL: 右端に配置、LTR: 左端に配置
            if (isSliderRTL()) {
                sliderBubble.style.left = `calc(100% - ${thumbWidth / 2}px)`;
            } else {
                sliderBubble.style.left = `calc(${thumbWidth / 2}px)`;
            }
            return;
        }

        const percent = (val - min) / (max - min);
        if (isSliderRTL()) {
            // RTL: 右から左へ（右綴じ）
            sliderBubble.style.left = `calc(${(1 - percent) * 100}% - ${thumbWidth / 2}px + ${percent * thumbWidth}px)`;
        } else {
            // LTR: 左から右へ（左綴じ）
            sliderBubble.style.left = `calc(${percent * 100}% - ${thumbWidth / 2}px + ${(1 - percent) * thumbWidth}px)`;
        }
    }

    /**
     * バブルを表示（ボタン/スクロール/キー操作用）
     * @param {number} pageNum - 表示するページ番号
     */
    function showBubbleTemporarily(pageNum) {
        if (!sliderBubble || isDragging) return;

        updateSliderBubblePosition(pageNum);
        sliderBubble.classList.add('visible');
        // 自動非表示は行わない（常に表示）
    }

    /**
     * ドラッグ開始
     */
    function startSliderDrag() {
        isDragging = true;
        // ドラッグ開始時にバブルを表示（大きく）
        if (sliderBubble && pageSlider) {
            updateSliderBubblePosition(pageSlider.value);
            sliderBubble.classList.add('visible', 'dragging');
        }
    }

    /**
     * ドラッグ終了
     */
    function endSliderDrag() {
        isDragging = false;

        // ドラッグ終了時にバブルを通常サイズに戻す
        if (sliderBubble && pageSlider) {
            sliderBubble.classList.remove('dragging');
            updateSliderBubblePosition(pageSlider.value);
            sliderBubble.classList.add('visible');
        }
    }

    /**
     * サムネイルキャッシュをクリア（互換性のため空関数を維持）
     */
    function clearThumbnailCache() {
        // サムネイル機能削除のため何もしない
    }

    /**
     * ページ表示の更新
     * @param {number} pageNum - 現在のページ番号
     * @param {number} totalPages - 総ページ数
     */
    function updatePageDisplay(pageNum, totalPages) {
        pageSlider.max = totalPages;
        pageSlider.value = pageNum;
        // バブルの位置と内容を更新（表示も行う）
        updateSliderBubblePosition(pageNum);
        if (sliderBubble) {
            sliderBubble.classList.add('visible');
        }
    }

    /**
     * 見開きモード用のページ表示更新
     * @param {number} spreadIndex - 現在の見開きインデックス（1始まり）
     * @param {number} totalSpreads - 総見開き数
     */
    function updateSpreadDisplay(spreadIndex, totalSpreads) {
        pageSlider.max = totalSpreads;
        pageSlider.value = spreadIndex;
        // バブルの位置と内容を更新（表示も行う）
        updateSliderBubblePosition(spreadIndex);
        if (sliderBubble) {
            sliderBubble.classList.add('visible');
        }
    }

    /**
     * 指定ページへ移動（見開きモード対応）
     * @param {number} targetValue - スライダーの値（ページ番号または見開きインデックス）
     */
    async function navigateToPage(targetValue) {
        const PdfManager = window.MojiQPdfManager;
        if (PdfManager && PdfManager.isSpreadViewMode()) {
            // 見開きモード時はスプレッドインデックスとして扱う
            const spreadIndex = targetValue - 1;
            // キャッシュから高速表示（displaySpreadFromCacheは内部でspreadCacheReadyをチェック）
            if (PdfManager.displaySpreadFromCache) {
                PdfManager.displaySpreadFromCache(spreadIndex);
            }
        } else if (renderPageCallback) {
            await renderPageCallback(targetValue);
        }
    }

    /**
     * イベントリスナーのセットアップ
     */
    function setupEventListeners() {
        // ハンドラを保存しながらリスナーを登録
        boundHandlers.canvasAreaMousemove = (e) => {
            handleInputForNavBar(e);
        };
        boundHandlers.canvasAreaTouchstart = handleInputForNavBar;
        canvasArea.addEventListener('mousemove', boundHandlers.canvasAreaMousemove);
        canvasArea.addEventListener('touchstart', boundHandlers.canvasAreaTouchstart);

        // キャンバスエリア上でのホイールスクロールでページ移動
        boundHandlers.canvasAreaWheel = async (e) => {
            // PDFまたは画像が読み込まれていない場合は何もしない
            if (state.pdfDocs.length === 0) return;

            // ビューワーモード中はviewer-mode.jsで処理するため無視
            if (window.MojiQViewerMode && window.MojiQViewerMode.isActive()) return;

            // 描画中やパン操作中は無視（ただしpreventDefaultは呼ばない = ブラウザのデフォルト動作を許可）
            if (state.interactionState !== 0 || state.isPanning) return;

            // ページ移動処理を行う場合のみpreventDefault
            e.preventDefault();

            let delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (Math.abs(delta) < 1) return;

            // スクロール方向設定を反映（反転設定時はdeltaを反転）
            if (window.MojiQSettings && window.MojiQSettings.getScrollDirection() === 'inverted') {
                delta = -delta;
            }

            // 選択ツールの操作状態をリセット（ドラッグ中などの状態をクリア）
            const DrawingSelect = window.MojiQDrawingSelect;
            if (DrawingSelect) {
                DrawingSelect.resetState();
            }

            // オブジェクト選択状態を解除
            const DrawingObjects = window.MojiQDrawingObjects;
            if (DrawingObjects) {
                DrawingObjects.deselectObject(state.currentPageNum);
            }

            // ページ移動前に現在のページのキャッシュを無効化（描画オブジェクトが正しく表示されるように）
            const PdfManager = window.MojiQPdfManager;
            if (PdfManager && PdfManager.invalidatePageCache) {
                PdfManager.invalidatePageCache(state.currentPageNum);
            }

            if (PdfManager && PdfManager.isSpreadViewMode()) {
                // 見開きモード時
                if (delta > 0) {
                    PdfManager.prevSpread();
                } else {
                    PdfManager.nextSpread();
                }
            } else {
                const direction = delta > 0 ? 1 : -1;
                const targetPage = state.currentPageNum + direction;

                if (targetPage >= 1 && targetPage <= state.totalPages && renderPageCallback) {
                    await renderPageCallback(targetPage);
                    showBubbleTemporarily(targetPage);
                }
            }

            resetNavBarTimer();
        };
        canvasArea.addEventListener('wheel', boundHandlers.canvasAreaWheel, { passive: false });

        boundHandlers.navBarMouseenter = () => {
            showNavBar();
            clearTimeout(navBarHideTimer);
        };
        boundHandlers.navBarMouseleave = () => {
            resetNavBarTimer();
        };
        bottomNavBar.addEventListener('mouseenter', boundHandlers.navBarMouseenter);
        bottomNavBar.addEventListener('mouseleave', boundHandlers.navBarMouseleave);

        // スライダードラッグ開始
        boundHandlers.sliderMousedown = (e) => {
            startSliderDrag();
        };
        boundHandlers.sliderTouchstart = (e) => {
            startSliderDrag();
        };
        pageSlider.addEventListener('mousedown', boundHandlers.sliderMousedown);
        pageSlider.addEventListener('touchstart', boundHandlers.sliderTouchstart, { passive: true });

        // スライダードラッグ終了時にページ移動を実行
        boundHandlers.documentMouseup = async () => {
            if (isDragging) {
                const targetPage = parseInt(pageSlider.value, 10);
                endSliderDrag();
                // ドラッグ終了後にページ移動を実行
                await navigateToPage(targetPage);
            }
        };
        boundHandlers.documentTouchend = async () => {
            if (isDragging) {
                const targetPage = parseInt(pageSlider.value, 10);
                endSliderDrag();
                // ドラッグ終了後にページ移動を実行
                await navigateToPage(targetPage);
            }
        };
        document.addEventListener('mouseup', boundHandlers.documentMouseup);
        document.addEventListener('touchend', boundHandlers.documentTouchend);

        // スライダーイベント
        boundHandlers.sliderInput = (e) => {
            // ドラッグ中はバブルの位置のみ更新
            if (isDragging) {
                updateSliderBubblePosition(e.target.value);
            }
        };
        // changeイベントはドラッグ中は無視し、クリック操作のみ処理
        boundHandlers.sliderChange = async (e) => {
            // ドラッグ中はmouseup/touchendで処理するため、ここでは何もしない
            if (isDragging) return;
            await navigateToPage(parseInt(e.target.value, 10));
        };
        pageSlider.addEventListener('input', boundHandlers.sliderInput);
        pageSlider.addEventListener('change', boundHandlers.sliderChange);

        // ページめくりボタン (右開き仕様)
        // 左(◀ Prev)ボタンを押すと「次へ進む (+1)」
        boundHandlers.prevBtnClick = async () => {
            const PdfManager = window.MojiQPdfManager;
            if (PdfManager && PdfManager.isSpreadViewMode()) {
                // 見開きモード時
                PdfManager.prevSpread();
            } else if (state.currentPageNum < state.totalPages && renderPageCallback) {
                const newPage = state.currentPageNum + 1;
                await renderPageCallback(newPage);
                showBubbleTemporarily(newPage);
            }
        };
        // 右(▶ Next)ボタンを押すと「前へ戻る (-1)」
        boundHandlers.nextBtnClick = async () => {
            const PdfManager = window.MojiQPdfManager;
            if (PdfManager && PdfManager.isSpreadViewMode()) {
                // 見開きモード時
                PdfManager.nextSpread();
            } else if (state.currentPageNum > 1 && renderPageCallback) {
                const newPage = state.currentPageNum - 1;
                await renderPageCallback(newPage);
                showBubbleTemporarily(newPage);
            }
        };
        navPrevBtn.addEventListener('click', boundHandlers.prevBtnClick);
        navNextBtn.addEventListener('click', boundHandlers.nextBtnClick);

        // フローティングバーでのホイールスクロール制御
        boundHandlers.navBarWheel = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (state.pdfDocs.length === 0) return;

            // ビューワーモード中はviewer-mode.jsで処理するため無視
            if (window.MojiQViewerMode && window.MojiQViewerMode.isActive()) return;

            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (Math.abs(delta) < 1) return;

            // ページ移動前に現在のページのキャッシュを無効化
            const PdfManager = window.MojiQPdfManager;
            if (PdfManager && PdfManager.invalidatePageCache) {
                PdfManager.invalidatePageCache(state.currentPageNum);
            }

            if (PdfManager && PdfManager.isSpreadViewMode()) {
                // 見開きモード時
                if (delta > 0) {
                    PdfManager.prevSpread();
                } else {
                    PdfManager.nextSpread();
                }
            } else {
                const direction = delta > 0 ? 1 : -1;
                const targetPage = state.currentPageNum + direction;

                if (targetPage >= 1 && targetPage <= state.totalPages && renderPageCallback) {
                    await renderPageCallback(targetPage);
                    showBubbleTemporarily(targetPage);
                }
            }

            resetNavBarTimer();
        };
        bottomNavBar.addEventListener('wheel', boundHandlers.navBarWheel, { passive: false });

        // 非表示/表示トグル
        if (navBarToggleBtn) {
            boundHandlers.toggleBtnClick = () => {
                if (isUserHidden) {
                    userShowNavBar();
                } else {
                    userHideNavBar();
                }
                // クリック後にフォーカスを外す（スペースキーでの誤操作防止）
                navBarToggleBtn.blur();
            };
            navBarToggleBtn.addEventListener('click', boundHandlers.toggleBtnClick);
        }
    }

    /**
     * イベントリスナーをクリーンアップ
     */
    function cleanup() {
        clearTimeout(navBarHideTimer);
        clearThumbnailCache();

        if (navBarToggleBtn) {
            navBarToggleBtn.removeEventListener('click', boundHandlers.toggleBtnClick);
        }

        if (canvasArea) {
            canvasArea.removeEventListener('mousemove', boundHandlers.canvasAreaMousemove);
            canvasArea.removeEventListener('touchstart', boundHandlers.canvasAreaTouchstart);
            canvasArea.removeEventListener('wheel', boundHandlers.canvasAreaWheel);
        }
        if (bottomNavBar) {
            bottomNavBar.removeEventListener('mouseenter', boundHandlers.navBarMouseenter);
            bottomNavBar.removeEventListener('mouseleave', boundHandlers.navBarMouseleave);
            bottomNavBar.removeEventListener('wheel', boundHandlers.navBarWheel);
        }
        if (pageSlider) {
            pageSlider.removeEventListener('input', boundHandlers.sliderInput);
            pageSlider.removeEventListener('change', boundHandlers.sliderChange);
            pageSlider.removeEventListener('mousedown', boundHandlers.sliderMousedown);
            pageSlider.removeEventListener('touchstart', boundHandlers.sliderTouchstart);
        }
        document.removeEventListener('mouseup', boundHandlers.documentMouseup);
        document.removeEventListener('touchend', boundHandlers.documentTouchend);
        if (navPrevBtn) {
            navPrevBtn.removeEventListener('click', boundHandlers.prevBtnClick);
        }
        if (navNextBtn) {
            navNextBtn.removeEventListener('click', boundHandlers.nextBtnClick);
        }

        // 参照をクリア
        for (const key in boundHandlers) {
            boundHandlers[key] = null;
        }
    }

    /**
     * ナビゲーションバーを隠す
     */
    function hideNavBar() {
        bottomNavBar.classList.add('fade-out');
        clearTimeout(navBarHideTimer);
    }

    /**
     * ユーザー操作でページバーを非表示にする
     */
    function userHideNavBar() {
        isUserHidden = true;
        clearTimeout(navBarHideTimer);
        bottomNavBar.classList.add('user-hidden');
        // アイコン切り替え: 目→目斜線（赤色）
        if (navBarToggleBtn) {
            navBarToggleBtn.querySelector('.nav-toggle-hide').style.display = 'none';
            navBarToggleBtn.querySelector('.nav-toggle-show').style.display = '';
            navBarToggleBtn.title = 'ページバーを表示';
            navBarToggleBtn.classList.add('hidden-state');
        }
        // 設定を保存
        localStorage.setItem('mojiq_pagebar_hidden', 'true');
    }

    /**
     * ユーザー操作でページバーを再表示する
     */
    function userShowNavBar() {
        isUserHidden = false;
        bottomNavBar.classList.remove('user-hidden');
        // アイコン切り替え: 目斜線→目（通常色）
        if (navBarToggleBtn) {
            navBarToggleBtn.querySelector('.nav-toggle-hide').style.display = '';
            navBarToggleBtn.querySelector('.nav-toggle-show').style.display = 'none';
            navBarToggleBtn.title = 'ページバーを隠す';
            navBarToggleBtn.classList.remove('hidden-state');
        }
        showNavBar();
        resetNavBarTimer();
        // 設定を保存
        localStorage.setItem('mojiq_pagebar_hidden', 'false');
    }

    /**
     * スライダーの向きがRTL（右から左）かどうかを判定
     * @returns {boolean} - RTLならtrue
     */
    function isSliderRTL() {
        return pageSlider && pageSlider.dir === 'rtl';
    }

    /**
     * スライダーの向きを設定（綴じ方向に応じて変更）
     * @param {string} direction - 'right'（右綴じ=RTL）または 'left'（左綴じ=LTR）
     */
    function setSliderDirection(direction) {
        if (!pageSlider) return;

        if (direction === 'left') {
            // 左綴じ: 左から右へ（LTR）
            pageSlider.dir = 'ltr';
            pageSlider.style.direction = 'ltr';
        } else {
            // 右綴じ: 右から左へ（RTL）- デフォルト
            pageSlider.dir = 'rtl';
            pageSlider.style.direction = 'rtl';
        }
    }

    return {
        init,
        cleanup,  // メモリリーク対策: イベントリスナー解除
        showNavBar,
        resetNavBarTimer,
        hideNavBar,
        updatePageDisplay,
        updateSpreadDisplay,  // 見開きモード用の表示更新
        clearThumbnailCache,  // PDF変更時にキャッシュクリア
        showBubbleTemporarily,  // ボタン/スクロール/キー操作時のバブル表示
        setSliderDirection,  // スライダーの向きを設定
        userHideNavBar,  // ユーザー操作でページバーを非表示
        userShowNavBar   // ユーザー操作でページバーを再表示
    };
})();
