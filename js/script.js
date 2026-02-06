/* js/script.js - メインエントリーポイント */

/**
 * ウィンドウコントロール、カスタムメニューバー、基本UIの初期化
 * DOM Cacheの初期化に依存しないため、最初に実行される
 */
function initWindowControlsAndMenuBar() {
    const customMenuBar = document.getElementById('customMenuBar');
    const windowControls = document.getElementById('windowControls');

    // Electron環境の場合のみウィンドウコントロールを表示
    if (window.electronAPI && window.electronAPI.isElectron) {
        // Electron環境クラスを追加（CSS調整用）
        document.body.classList.add('electron-app');

        if (windowControls) {
            windowControls.style.display = 'flex';
        }

        // ウィンドウコントロールボタン
        const minimizeBtn = document.getElementById('minimizeBtn');
        const maximizeBtn = document.getElementById('maximizeBtn');
        const closeBtn = document.getElementById('closeBtn');

        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.electronAPI.windowMinimize();
            });
        }

        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.electronAPI.windowMaximize();
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.electronAPI.windowClose();
            });
        }
    }

    // --- カスタムメニューバー ---
    if (customMenuBar) {
        const menuItems = customMenuBar.querySelectorAll('.menu-item');
        let openMenu = null;

        // メニューアイテムの状態更新関数
        function updateEditMenuState() {
            const undoItem = customMenuBar.querySelector('[data-action="undo"]');
            const redoItem = customMenuBar.querySelector('[data-action="redo"]');
            const clearItem = customMenuBar.querySelector('[data-action="clear-all"]');
            const undoBtn = document.getElementById('undoBtn');
            const redoBtn = document.getElementById('redoBtn');
            const clearBtn = document.getElementById('clearBtn');

            if (undoItem && undoBtn) {
                undoItem.classList.toggle('disabled', undoBtn.disabled);
            }
            if (redoItem && redoBtn) {
                redoItem.classList.toggle('disabled', redoBtn.disabled);
            }
            if (clearItem && clearBtn) {
                clearItem.classList.toggle('disabled', clearBtn.disabled);
            }
        }

        menuItems.forEach(item => {
            const label = item.querySelector('.menu-label');

            label.addEventListener('click', (e) => {
                e.stopPropagation();
                if (openMenu === item) {
                    closeAllMenus();
                } else {
                    closeAllMenus();
                    item.classList.add('open');
                    openMenu = item;
                    // 編集メニューを開いた時に状態を更新
                    if (item.dataset.menu === 'edit') {
                        updateEditMenuState();
                    }
                }
            });

            label.addEventListener('mouseenter', () => {
                if (openMenu && openMenu !== item) {
                    closeAllMenus();
                    item.classList.add('open');
                    openMenu = item;
                    // 編集メニューを開いた時に状態を更新
                    if (item.dataset.menu === 'edit') {
                        updateEditMenuState();
                    }
                }
            });
        });

        function closeAllMenus() {
            menuItems.forEach(item => item.classList.remove('open'));
            openMenu = null;
        }

        document.addEventListener('click', (e) => {
            if (!customMenuBar.contains(e.target)) {
                closeAllMenus();
            }
        });

        const menuDropdownItems = customMenuBar.querySelectorAll('.menu-dropdown-item');
        menuDropdownItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                closeAllMenus();
                handleMenuAction(action);
            });
        });

        function handleMenuAction(action) {
            switch (action) {
                case 'open-pdf':
                    const pdfUpload = document.getElementById('pdfUpload');
                    if (pdfUpload) pdfUpload.click();
                    break;
                case 'save-pdf':
                    const savePdfBtn = document.getElementById('savePdfBtn');
                    if (savePdfBtn && !savePdfBtn.disabled) savePdfBtn.click();
                    break;
                case 'save-pdf-as':
                    if (window.electronAPI && window.electronAPI.showSaveDialog) {
                        const savePdfBtn2 = document.getElementById('savePdfBtn');
                        if (savePdfBtn2 && !savePdfBtn2.disabled) savePdfBtn2.click();
                    }
                    break;
                case 'quit':
                    if (window.electronAPI && window.electronAPI.windowClose) {
                        window.electronAPI.windowClose();
                    }
                    break;
                case 'undo':
                    const undoBtn = document.getElementById('undoBtn');
                    if (undoBtn && !undoBtn.disabled) undoBtn.click();
                    break;
                case 'redo':
                    const redoBtn = document.getElementById('redoBtn');
                    if (redoBtn && !redoBtn.disabled) redoBtn.click();
                    break;
                case 'clear-all':
                    const clearBtn = document.getElementById('clearBtn');
                    if (clearBtn && !clearBtn.disabled) clearBtn.click();
                    break;
                case 'cut':
                    window.dispatchEvent(new CustomEvent('mojiq:cut', { detail: {} }));
                    break;
                case 'paste':
                    window.dispatchEvent(new CustomEvent('mojiq:paste', { detail: {} }));
                    break;
                case 'zoom-in':
                    const zoomInBtn = document.getElementById('zoomInBtn');
                    if (zoomInBtn) zoomInBtn.click();
                    break;
                case 'zoom-out':
                    const zoomOutBtn = document.getElementById('zoomOutBtn');
                    if (zoomOutBtn) zoomOutBtn.click();
                    break;
                case 'zoom-100':
                case 'zoom-fit':
                    // MojiQZoomのresetZoom機能を使用
                    if (window.MojiQZoom) {
                        window.MojiQZoom.resetZoom();
                    }
                    break;
                case 'toggle-devtools':
                    if (window.electronAPI && window.electronAPI.toggleDevTools) {
                        window.electronAPI.toggleDevTools();
                    }
                    break;
                case 'toggle-text-layer':
                    if (window.MojiQTextLayerManager) {
                        MojiQTextLayerManager.toggle();
                    }
                    break;
                case 'print':
                    if (window.MojiQPrintManager) {
                        window.MojiQPrintManager.printPdf();
                    }
                    break;
            }
        }
    }

    // --- ハンバーガーメニュー（スライドメニュー） ---
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const slideMenu = document.getElementById('slideMenu');
    const slideMenuOverlay = document.getElementById('slideMenuOverlay');
    const modeTabs = document.querySelector('.mode-tabs');
    const menuLockableItems = document.querySelectorAll('.menu-lockable');

    if (hamburgerBtn && slideMenu) {
        function toggleSlideMenu() {
            const isOpen = slideMenu.classList.contains('open');
            if (isOpen) {
                slideMenu.classList.remove('open');
                if (slideMenuOverlay) slideMenuOverlay.classList.remove('visible');
                hamburgerBtn.classList.remove('active');
                if (modeTabs) modeTabs.classList.remove('menu-locked');
                menuLockableItems.forEach(item => item.classList.remove('menu-locked'));
            } else {
                // 他のドロップダウンを閉じる
                if (window._savePdfDropdownClose) {
                    window._savePdfDropdownClose();
                }
                if (window._spreadBindingDropdownClose) {
                    window._spreadBindingDropdownClose();
                }
                slideMenu.classList.add('open');
                if (slideMenuOverlay) slideMenuOverlay.classList.add('visible');
                hamburgerBtn.classList.add('active');
                if (modeTabs) modeTabs.classList.add('menu-locked');
                menuLockableItems.forEach(item => item.classList.add('menu-locked'));
            }
        }

        function closeSlideMenu() {
            slideMenu.classList.remove('open');
            if (slideMenuOverlay) slideMenuOverlay.classList.remove('visible');
            hamburgerBtn.classList.remove('active');
            if (modeTabs) modeTabs.classList.remove('menu-locked');
            menuLockableItems.forEach(item => item.classList.remove('menu-locked'));
        }

        hamburgerBtn.addEventListener('click', toggleSlideMenu);
        if (slideMenuOverlay) {
            slideMenuOverlay.addEventListener('click', closeSlideMenu);
        }

        // メニュー項目のクリック処理
        const slideMenuItems = document.querySelectorAll('.slide-menu-item');
        slideMenuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const href = item.getAttribute('href');
                if (href) {
                    // 全画面サイズでウィンドウを開く
                    const width = screen.width;
                    const height = screen.height;
                    window.open(href, '_blank', `width=${width},height=${height},left=0,top=0`);
                }
                e.preventDefault();
            });
        });
    }


    // --- ダークモード切り替え ---
    const darkModeHeaderBtn = document.getElementById('darkModeHeaderBtn');
    const darkModeHeaderIcon = document.getElementById('darkModeHeaderIcon');

    if (darkModeHeaderBtn && darkModeHeaderIcon) {
        function applyDarkMode(isDark) {
            if (isDark) {
                document.body.classList.add('dark-mode');
                darkModeHeaderIcon.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                `;
                darkModeHeaderBtn.title = 'ライトモードに切り替え';
            } else {
                document.body.classList.remove('dark-mode');
                darkModeHeaderIcon.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" overflow="visible">
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
                darkModeHeaderBtn.title = 'ダークモードに切り替え';
            }
            if (window.electronAPI && window.electronAPI.setNativeTheme) {
                window.electronAPI.setNativeTheme(isDark);
            }
        }

        function toggleDarkMode() {
            const isDark = document.body.classList.contains('dark-mode');
            const newMode = !isDark;
            applyDarkMode(newMode);
            localStorage.setItem('mojiq_dark_mode', newMode ? 'true' : 'false');
        }

        // 初期状態の復元
        const savedMode = localStorage.getItem('mojiq_dark_mode');
        if (savedMode === 'true') {
            applyDarkMode(true);
        }

        darkModeHeaderBtn.addEventListener('click', toggleDarkMode);
    }

    // --- ワークスペース変更（UI反転） ---
    const workspaceFlipBtn = document.getElementById('workspaceFlipBtn');
    const workspaceFlipIcon = document.getElementById('workspaceFlipIcon');
    if (workspaceFlipBtn && workspaceFlipIcon) {
        function applyWorkspaceFlip(isFlipped) {
            if (isFlipped) {
                document.body.classList.add('workspace-flipped');
                // 反転時アイコン: 左三角（白抜き）、右三角（塗り）
                workspaceFlipIcon.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1">
                        <polygon points="2,12 10,4 10,20" fill="none" stroke="currentColor" stroke-width="1.5"/>
                        <polygon points="22,12 14,4 14,20" fill="currentColor" stroke="currentColor"/>
                    </svg>
                `;
            } else {
                document.body.classList.remove('workspace-flipped');
                // 通常時アイコン: 左三角（塗り）、右三角（白抜き）
                workspaceFlipIcon.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1">
                        <polygon points="2,12 10,4 10,20" fill="currentColor" stroke="currentColor"/>
                        <polygon points="22,12 14,4 14,20" fill="none" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                `;
            }
        }

        function toggleWorkspaceFlip() {
            const isFlipped = document.body.classList.contains('workspace-flipped');
            const newState = !isFlipped;
            applyWorkspaceFlip(newState);
            localStorage.setItem('mojiq_workspace_flipped', newState ? 'true' : 'false');
        }

        // 初期状態の復元
        const savedFlipState = localStorage.getItem('mojiq_workspace_flipped');
        if (savedFlipState === 'true') {
            applyWorkspaceFlip(true);
        }

        workspaceFlipBtn.addEventListener('click', toggleWorkspaceFlip);
    }

    // --- PDF読み込み前のボタンロック（初期状態） ---
    const pdfRequiredButtons = document.querySelectorAll('.pdf-required');
    pdfRequiredButtons.forEach(btn => btn.classList.add('locked'));

    // --- 保存メニュー項目の初期状態（無効） ---
    const saveMenuItem = document.querySelector('[data-action="save-pdf"]');
    const saveAsMenuItem = document.querySelector('[data-action="save-pdf-as"]');
    if (saveMenuItem) saveMenuItem.classList.add('disabled');
    if (saveAsMenuItem) saveAsMenuItem.classList.add('disabled');

    // --- アプリ終了時の確認（Electron IPC経由） ---
    // DOM Cache初期化前に設定して、エラー時でもウィンドウを閉じられるようにする
    if (window.electronAPI && window.electronAPI.onCheckUnsavedChanges) {
        window.electronAPI.onCheckUnsavedChanges(() => {
            // 保存後に変更があれば終了確認を表示
            // MojiQPdfManager.hasChanges()を優先して使用（保存後の変更追跡）
            const hasChanges = window.MojiQPdfManager &&
                typeof window.MojiQPdfManager.hasChanges === 'function' &&
                window.MojiQPdfManager.hasChanges();
            window.electronAPI.respondUnsavedChanges(hasChanges);
        });
    }

    // --- 「保存する」選択時：保存後に終了 ---
    if (window.electronAPI && window.electronAPI.onSaveAndQuit) {
        window.electronAPI.onSaveAndQuit(async () => {
            // PDF保存処理を実行
            if (window.MojiQPdfManager && typeof window.MojiQPdfManager.savePdf === 'function') {
                try {
                    await window.MojiQPdfManager.savePdf();
                    // 保存完了後にアプリを終了
                    window.electronAPI.saveCompletedQuit();
                } catch (error) {
                    console.error('保存中にエラーが発生しました:', error);
                    // エラー時は終了しない（ユーザーが再度操作できるように）
                }
            } else {
                // PDF Managerが利用できない場合は、そのまま終了
                window.electronAPI.saveCompletedQuit();
            }
        });
    }

    // --- アプリ終了ショートカット (Ctrl+Q) ---
    window.addEventListener('mojiq:quit', () => {
        if (window.electronAPI && window.electronAPI.windowClose) {
            // Electron環境: ウィンドウを閉じる（終了確認はmain.jsで処理）
            window.electronAPI.windowClose();
        } else {
            // ブラウザ環境: ページを閉じようとする（確認ダイアログが出る場合がある）
            window.close();
        }
    });
}

window.addEventListener('load', () => {
    // --- ウィンドウコントロールとメニューバーの初期化（最初に実行） ---
    initWindowControlsAndMenuBar();

    // --- メイン要素取得（DOM Cacheを使用） ---
    if (!MojiQDOMCache.init()) {
        console.error('MojiQScript: Failed to initialize DOM cache');
        return;
    }

    const { mojiqCanvas, bgCanvas, simCanvas, canvasWrapper, canvasArea, ctx, simCtx, dpr } = MojiQDOMCache.getCanvasElements();
    const initialMessage = document.getElementById('initialMessage');

    // --- DOM要素取得 ---
    const elements = {
        // キャンバス関連
        mojiqCanvas,
        bgCanvas,
        simCanvas,
        canvasWrapper,
        canvasArea,
        ctx,
        simCtx,
        initialMessage,

        // UI要素
        colorPicker: document.getElementById('colorPicker'),
        lineWidthRange: document.getElementById('lineWidth'),
        clearBtn: document.getElementById('clearBtn'),

        // PDF操作
        pdfUpload: document.getElementById('pdfUpload'),
        insertPdfUpload: document.getElementById('insertPdfUpload'),

        // ズーム関連
        zoomInBtn: document.getElementById('zoomInBtn'),
        zoomOutBtn: document.getElementById('zoomOutBtn'),
        zoomLabel: document.getElementById('zoomLabel'),

        // ツールボタン
        selectBtn: document.getElementById('selectBtn'),
        handBtn: document.getElementById('handBtn'),
        drawBtn: document.getElementById('drawBtn'),
        markerBtn: document.getElementById('markerBtn'),
        rectBtn: document.getElementById('rectBtn'),
        rectAnnotatedBtn: document.getElementById('rectAnnotatedBtn'),
        labeledRectBtn: document.getElementById('labeledRectBtn'),
        ellipseBtn: document.getElementById('ellipseBtn'),
        ellipseAnnotatedBtn: document.getElementById('ellipseAnnotatedBtn'),
        semicircleBtn: document.getElementById('semicircleBtn'),
        chevronBtn: document.getElementById('chevronBtn'),
        lshapeBtn: document.getElementById('lshapeBtn'),
        zshapeBtn: document.getElementById('zshapeBtn'),
        bracketBtn: document.getElementById('bracketBtn'),
        lineBtn: document.getElementById('lineBtn'),
        lineAnnotatedBtn: document.getElementById('lineAnnotatedBtn'),
        arrowBtn: document.getElementById('arrowBtn'),
        doubleArrowBtn: document.getElementById('doubleArrowBtn'),
        doubleArrowAnnotatedBtn: document.getElementById('doubleArrowAnnotatedBtn'),
        polylineBtn: document.getElementById('polylineBtn'),
        textBtn: document.getElementById('textBtn'),
        imgInsertBtn: document.getElementById('imgInsertBtn'),
        imageInput: document.getElementById('imageInput'),
        eraserBtn: document.getElementById('eraserBtn'),
        doneStampBtn: document.getElementById('doneStampBtn'),
        rubyStampBtn: document.getElementById('rubyStampBtn'),
        toruStampBtn: document.getElementById('toruStampBtn'),
        torutsumeStampBtn: document.getElementById('torutsumeStampBtn'),
        torumamaStampBtn: document.getElementById('torumamaStampBtn'),
        zenkakuakiStampBtn: document.getElementById('zenkakuakiStampBtn'),
        nibunakiStampBtn: document.getElementById('nibunakiStampBtn'),
        shibunakiStampBtn: document.getElementById('shibunakiStampBtn'),
        kaigyouStampBtn: document.getElementById('kaigyouStampBtn'),

        fontSizeInput: document.getElementById('fontSizeInput'),
        savePdfBtn: document.getElementById('savePdfBtn'),
        undoBtn: document.getElementById('undoBtn'),
        redoBtn: document.getElementById('redoBtn'),

        stampContainer: document.getElementById('stampContainer'),
        useLeaderLineCheckbox: document.getElementById('useLeaderLine'),

        // モーダル関連
        fontModal: document.getElementById('fontModal'),
        modalFontNameInput: document.getElementById('modalFontNameInput'),
        modalFontColorInput: document.getElementById('modalFontColorInput'),
        fontModalCancelBtn: document.getElementById('fontModalCancelBtn'),
        fontModalAddBtn: document.getElementById('fontModalAddBtn'),

        textModal: document.getElementById('textModal'),
        modalTextInput: document.getElementById('modalTextInput'),
        modalVerticalCheck: document.getElementById('modalVerticalCheck'),
        modalFontSizeRow: document.getElementById('modalFontSizeRow'),
        modalFontSizeInput: document.getElementById('modalFontSizeInput'),
        modalCancelBtn: document.getElementById('modalCancelBtn'),
        modalOkBtn: document.getElementById('modalOkBtn'),

        leftSidebar: document.getElementById('leftSidebar'),

        // ナビゲーションバー
        bottomNavBar: document.getElementById('bottomNavBar'),
        pageSlider: document.getElementById('pageSlider'),
        navPrevBtn: document.getElementById('navPrevBtn'),
        navNextBtn: document.getElementById('navNextBtn')
    };

    // --- アプリケーション状態 ---
    const appState = {
        currentMode: 'select',
        activeStampText: null,
        selectedFontInfo: null,
        activeFontBtn: null,
        interactionState: 0,
        pendingImage: null,

        isDeleteMode: false,
        isEditMode: false,
        editingTargetBtn: null,

        eraserSize: 2,
        savedLineWidth: 2,

        currentZoom: 1.0,
        baseCSSExtent: { width: 0, height: 0 },

        // 移動ツール用
        isPanning: false,
        isSpacePressed: false,
        isShiftPressed: false,
        panStart: { x: 0, y: 0 },
        scrollStart: { left: 0, top: 0 },

        autoColors: ['#FF0000', '#FF00FF', '#00C400', '#FF6A00', '#0066FF', '#AA00FF', '#FF0070', '#0099E0'],
        fontCount: 0,

        // PDF管理・ページ管理
        pdfDocs: [],
        currentPageNum: 0,
        totalPages: 0,
        pageDrawingHistory: {},
        pageRedoHistory: {},
        pageMapping: [],

        // チェックボックス状態のゲッター
        get useLeaderLine() {
            return elements.useLeaderLineCheckbox.checked;
        },
        // アノテーション付きモードかどうかをモード名で判定
        get annotationMode() {
            return this.currentMode === 'rectAnnotated' ||
                   this.currentMode === 'ellipseAnnotated' ||
                   this.currentMode === 'lineAnnotated' ||
                   this.currentMode === 'doubleArrowAnnotated';
        }
    };

    // --- Store連携（コア基盤との同期） ---
    if (window.MojiQStore && window.MojiQLegacyBridge) {
        // 初期状態をStoreに同期
        MojiQStore.batch({
            'page.currentPageNum': appState.currentPageNum,
            'page.totalPages': appState.totalPages,
            'page.pageMapping': appState.pageMapping,
            'drawing.currentMode': appState.currentMode,
            'canvas.currentZoom': appState.currentZoom,
            'drawing.isPanning': appState.isPanning,
            'drawing.isSpacePressed': appState.isSpacePressed,
            'drawing.isShiftPressed': appState.isShiftPressed,
            'app.isLocked': true
        });

        // LegacyBridgeを有効化
        MojiQLegacyBridge.activate();

        // Storeの変更を監視してappStateに反映
        MojiQStore.subscribe('page.currentPageNum', (value) => {
            if (appState.currentPageNum !== value) {
                appState.currentPageNum = value;
            }
        });

        MojiQStore.subscribe('page.totalPages', (value) => {
            if (appState.totalPages !== value) {
                appState.totalPages = value;
            }
        });
    }

    // --- UIロック制御 ---
    function toggleAppLock(isLocked) {
        if (isLocked) {
            document.body.classList.add('app-locked');
            elements.leftSidebar.classList.add('ui-disabled');
        } else {
            document.body.classList.remove('app-locked');
            elements.leftSidebar.classList.remove('ui-disabled');
            document.getElementById('ui-group-mojiq-right').classList.remove('ui-disabled');

            // lock.jsのunlock関数も呼び出してスタイルを確実にリセット
            if (typeof window.unlockApp === 'function') {
                window.unlockApp();
            }
        }

    }
    toggleAppLock(true); // 初期状態はロック

    // 統合モードの初期化（一度だけ実行）
    if (window.initIntegratedMode) window.initIntegratedMode();

    // --- テキスト描画関数 ---
    function executeTextDrawing(info, text, isVertical, fontSizeFromModal) {
        const { isLeader, startX, startY, endX, endY, drawTextOnly } = info;

        // アノテーションモードで図形にコメントを追加する場合
        if (drawTextOnly && MojiQDrawing && MojiQDrawing.getLastAddedObjectId()) {
            const dx = endX - startX;
            const padding = 11;
            const angle = Math.atan2(endY - startY, endX - startX);
            const textX = endX + Math.cos(angle) * padding;
            const textY = endY + Math.sin(angle) * padding;
            const align = dx < 0 ? 'right' : 'left';

            // DrawingObjectsにアノテーション情報を保存
            // モーダルから渡されたフォントサイズを優先、なければ左側バーの値を使用
            const fontSize = (fontSizeFromModal && fontSizeFromModal >= 8 && fontSizeFromModal <= 100)
                ? fontSizeFromModal
                : parseInt(elements.fontSizeInput.value, 10);

            // アノテーション情報を作成
            const annotation = {
                text: text,
                x: textX,
                y: textY,
                align: align,
                isVertical: isVertical,
                color: elements.colorPicker.value,
                fontSize: fontSize,
                leaderLine: {
                    start: { x: startX, y: startY },
                    end: { x: endX, y: endY }
                }
            };

            // 引出線の終端をテキストのバウンディングボックスに合わせて再計算
            if (MojiQDrawingModes && MojiQDrawingModes.getLeaderEndPos) {
                const leaderStart = { x: startX, y: startY };
                const newEnd = MojiQDrawingModes.getLeaderEndPos(annotation, leaderStart);
                annotation.leaderLine.end = newEnd;
            }

            MojiQDrawing.addAnnotationToLastObject({
                annotation: annotation
            });

            // キャンバスを再描画（オブジェクトベースで描画）
            MojiQDrawing.redrawCanvas();
            return;
        }

        // テキストをオブジェクトとして保存
        // モーダルから渡されたフォントサイズを優先、なければ左側バーの値を使用
        const fontSize = (fontSizeFromModal && fontSizeFromModal >= 8 && fontSizeFromModal <= 100)
            ? fontSizeFromModal
            : parseInt(elements.fontSizeInput.value, 10);
        const color = elements.colorPicker.value;
        let textX = endX;
        let textY = endY;
        let align = 'left';

        const shouldAdjustPos = isLeader || drawTextOnly;
        if (shouldAdjustPos) {
            const dx = endX - startX;
            const padding = 11;
            const angle = Math.atan2(endY - startY, endX - startX);
            textX = endX + Math.cos(angle) * padding;
            textY = endY + Math.sin(angle) * padding;
            if (dx < 0) align = 'right';
        }

        // テキストオブジェクトを作成
        const textObj = {
            type: 'text',
            text: text,
            startPos: { x: textX, y: textY },
            fontSize: fontSize,
            color: color,
            align: align,
            isVertical: isVertical
        };

        // 引出線がある場合は追加
        if (!drawTextOnly && (appState.currentMode === 'text' && isLeader)) {
            const leaderStart = { x: startX, y: startY };
            let leaderEnd = { x: endX, y: endY };

            // 引出線終端をテキストのバウンディングボックスから自動計算
            if (MojiQDrawingModes && MojiQDrawingModes.getStampLeaderEndPos) {
                leaderEnd = MojiQDrawingModes.getStampLeaderEndPos(textObj, leaderStart);
            }

            textObj.leaderLine = {
                start: leaderStart,
                end: leaderEnd
            };
        }

        // DrawingObjectsに保存（見開きモード時は正しいページに保存されるようにsaveObjectToPageを使用）
        MojiQDrawing.saveObjectToPage(textObj);

        // キャンバスを再描画
        MojiQDrawing.redrawCanvas();
    }


    // --- 各モジュールの初期化 ---
    function safeInit(moduleName, initFn) {
        try {
            initFn();
        } catch (e) {
            console.error(`[MojiQ] ${moduleName} の初期化に失敗:`, e);
        }
    }

    // Canvas Context
    safeInit('CanvasContext', () => {
        MojiQCanvasContext.init(ctx, {
            colorPicker: elements.colorPicker,
            lineWidthRange: elements.lineWidthRange
        }, appState);
    });

    // Navigation
    safeInit('Navigation', () => {
        MojiQNavigation.init({
            bottomNavBar: elements.bottomNavBar,
            pageSlider: elements.pageSlider,
            navPrevBtn: elements.navPrevBtn,
            navNextBtn: elements.navNextBtn,
            canvasArea: elements.canvasArea
        }, appState, (pageNum) => MojiQPdfManager.renderPage(pageNum));
    });

    // Zoom
    safeInit('Zoom', () => {
        MojiQZoom.init({
            zoomInBtn: elements.zoomInBtn,
            zoomOutBtn: elements.zoomOutBtn,
            zoomLabel: elements.zoomLabel,
            canvasWrapper: elements.canvasWrapper,
            canvasArea: elements.canvasArea
        }, appState);
    });

    // Viewer Mode
    safeInit('ViewerMode', () => {
        MojiQViewerMode.init(appState, (pageNum) => MojiQPdfManager.renderPage(pageNum));
    });

    // Mode Controller
    MojiQModeController.init({
        selectBtn: elements.selectBtn,
        handBtn: elements.handBtn,
        drawBtn: elements.drawBtn,
        markerBtn: elements.markerBtn,
        rectBtn: elements.rectBtn,
        rectAnnotatedBtn: elements.rectAnnotatedBtn,
        labeledRectBtn: elements.labeledRectBtn,
        ellipseBtn: elements.ellipseBtn,
        ellipseAnnotatedBtn: elements.ellipseAnnotatedBtn,
        semicircleBtn: elements.semicircleBtn,
        chevronBtn: elements.chevronBtn,
        lshapeBtn: elements.lshapeBtn,
        zshapeBtn: elements.zshapeBtn,
        bracketBtn: elements.bracketBtn,
        lineBtn: elements.lineBtn,
        lineAnnotatedBtn: elements.lineAnnotatedBtn,
        arrowBtn: elements.arrowBtn,
        doubleArrowBtn: elements.doubleArrowBtn,
        doubleArrowAnnotatedBtn: elements.doubleArrowAnnotatedBtn,
        polylineBtn: elements.polylineBtn,
        textBtn: elements.textBtn,
        imgInsertBtn: elements.imgInsertBtn,
        eraserBtn: elements.eraserBtn,
        doneStampBtn: elements.doneStampBtn,
        rubyStampBtn: elements.rubyStampBtn,
        toruStampBtn: elements.toruStampBtn,
        torutsumeStampBtn: elements.torutsumeStampBtn,
        torumamaStampBtn: elements.torumamaStampBtn,
        zenkakuakiStampBtn: elements.zenkakuakiStampBtn,
        nibunakiStampBtn: elements.nibunakiStampBtn,
        shibunakiStampBtn: elements.shibunakiStampBtn,
        kaigyouStampBtn: elements.kaigyouStampBtn,
        imageInput: elements.imageInput,
        mojiqCanvas: elements.mojiqCanvas,
        stampContainer: elements.stampContainer,
        lineWidthRange: elements.lineWidthRange,
        colorPicker: elements.colorPicker
    }, appState);

    // テキストオブジェクト更新関数（IDを使用）
    function updateTextObject(pageNum, objectId, newProps) {
        const objects = MojiQDrawingObjects.getPageObjects(pageNum);

        // IDでオブジェクトを検索
        const index = MojiQDrawingObjects.findIndexById(pageNum, objectId);

        if (index < 0) {
            // 選択状態を解除して再描画
            MojiQDrawingObjects.deselectObject(pageNum);
            MojiQDrawing.redrawCanvas();
            return;
        }

        // オブジェクトがテキストタイプか確認
        if (objects[index].type !== 'text') {
            MojiQDrawingObjects.deselectObject(pageNum);
            MojiQDrawing.redrawCanvas();
            return;
        }

        MojiQDrawingObjects.updateObject(pageNum, index, newProps);

        // 選択状態を維持したまま再描画
        MojiQDrawing.redrawCanvas();
    }

    // アノテーション更新関数（IDを使用）
    function updateAnnotation(pageNum, objectId, newProps) {
        const objects = MojiQDrawingObjects.getPageObjects(pageNum);

        // IDでオブジェクトを検索
        const index = MojiQDrawingObjects.findIndexById(pageNum, objectId);

        if (index < 0) {
            // 選択状態を解除して再描画
            MojiQDrawingObjects.deselectObject(pageNum);
            MojiQDrawing.redrawCanvas();
            return;
        }

        const obj = objects[index];

        // オブジェクトがアノテーションを持っているか確認
        if (!obj.annotation) {
            MojiQDrawingObjects.deselectObject(pageNum);
            MojiQDrawing.redrawCanvas();
            return;
        }

        // アノテーションのプロパティを更新
        const updatedAnnotation = {
            ...obj.annotation,
            text: newProps.text,
            isVertical: newProps.isVertical
        };
        // fontSizeが指定されている場合は更新
        if (newProps.fontSize !== undefined) {
            updatedAnnotation.fontSize = newProps.fontSize;
        }

        MojiQDrawingObjects.updateObject(pageNum, index, {
            annotation: updatedAnnotation
        });

        // 選択状態を維持したまま再描画
        MojiQDrawing.redrawCanvas();
    }

    // Modal
    MojiQModal.init({
        textModal: elements.textModal,
        modalTextInput: elements.modalTextInput,
        modalVerticalCheck: elements.modalVerticalCheck,
        modalFontSizeRow: elements.modalFontSizeRow,
        modalFontSizeInput: elements.modalFontSizeInput,
        modalCancelBtn: elements.modalCancelBtn,
        modalOkBtn: elements.modalOkBtn,
        fontModal: elements.fontModal,
        modalFontNameInput: elements.modalFontNameInput,
        modalFontColorInput: elements.modalFontColorInput,
        fontModalCancelBtn: elements.fontModalCancelBtn,
        fontModalAddBtn: elements.fontModalAddBtn,
        fontSizeInput: elements.fontSizeInput
    }, ctx, appState, {
        saveHistory: () => MojiQPageManager.saveCurrentCanvasToHistory(),
        executeTextDrawing: executeTextDrawing,
        createFontStamp: (name, color) => MojiQStamps.addFontStamp(name, color),
        updateTextObject: updateTextObject,  // テキストオブジェクト更新コールバック
        updateAnnotation: updateAnnotation   // アノテーション更新コールバックを追加
    });

    // Stamps
    MojiQStamps.init({
        stampContainer: elements.stampContainer,
        fontSizeInput: elements.fontSizeInput,
        colorPicker: elements.colorPicker,
        lineWidthRange: elements.lineWidthRange
    }, ctx, appState);

    // JSON Folder Browser (Electron環境のみ)
    if (window.electronAPI && window.electronAPI.isElectron) {
        MojiQJsonFolderBrowser.init({
            onJsonFileSelect: (data, fileName) => {
                // MojiQStampsの既存のプリセット読み込みロジックを再利用
                // presetDataでラップされている形式にも対応
                const presetData = data.presetData || data;

                let sizes = [];
                const fontSizeStats = presetData.fontSizeStats;
                if (fontSizeStats) {
                    if (Array.isArray(fontSizeStats.sizes)) {
                        sizes = fontSizeStats.sizes;
                    } else if (Array.isArray(fontSizeStats)) {
                        sizes = fontSizeStats;
                    }
                }

                let fonts = [];
                const presets = presetData.presets;
                if (presets) {
                    Object.keys(presets).forEach(key => {
                        const group = presets[key];
                        if (Array.isArray(group)) {
                            group.forEach(item => {
                                if (item.name) {
                                    fonts.push({
                                        name: item.name,
                                        subName: item.subName || null,
                                        color: item.color || null
                                    });
                                }
                            });
                        }
                    });
                } else if (presetData.fonts) {
                    fonts = presetData.fonts;
                } else if (Array.isArray(presetData)) {
                    fonts = presetData;
                }

                if (sizes.length > 0 || fonts.length > 0) {
                    MojiQStamps.appendStampButtons(sizes, fonts);
                }
            }
        });
    }

    // Drawing
    MojiQDrawing.init({
        mojiqCanvas: elements.mojiqCanvas,
        ctx: ctx,
        simCtx: simCtx,
        canvasArea: elements.canvasArea
    }, appState, {
        saveHistory: () => MojiQPageManager.saveCurrentCanvasToHistory(),
        handleInputRequest: (drawingInfo) => MojiQModal.handleInputRequest(drawingInfo),
        putFontLabel: (start, end, fontInfo) => MojiQStamps.putFontLabel(start, end, fontInfo),
        getCurrentPage: () => appState.currentPageNum,
        editText: (textObj, index, pageNum) => MojiQModal.openTextEditModal(textObj, index, pageNum),  // テキスト編集コールバック
        editAnnotation: (obj, index, pageNum) => MojiQModal.openAnnotationEditModal(obj, index, pageNum)  // アノテーション編集コールバック
    });

    // Stamps用のオブジェクト保存コールバックを設定
    MojiQStamps.setSaveObjectCallback((fontLabelData) => {
        MojiQDrawing.saveObjectToPage(fontLabelData);
        MojiQDrawing.redrawCanvas();
    });

    // PDF Manager
    safeInit('PdfManager', () => {
        MojiQPdfManager.init({
            mojiqCanvas: elements.mojiqCanvas,
            bgCanvas: elements.bgCanvas,
            simCanvas: elements.simCanvas,
            canvasWrapper: elements.canvasWrapper,
            canvasArea: elements.canvasArea,
            ctx: ctx,
            pdfUpload: elements.pdfUpload,
            insertPdfUpload: elements.insertPdfUpload,
            savePdfBtn: elements.savePdfBtn,
            initialMessage: elements.initialMessage
        }, appState, {
            toggleAppLock: toggleAppLock
        });
    });

    // Page Manager
    safeInit('PageManager', () => {
        MojiQPageManager.init({
            mojiqCanvas: elements.mojiqCanvas,
            ctx: ctx,
            clearBtn: elements.clearBtn,
            undoBtn: elements.undoBtn,
            redoBtn: elements.redoBtn
        }, appState, {
            toggleAppLock: toggleAppLock
        });
    });

    // --- fontSizeInputのマウスホイール対応 ---
    if (elements.fontSizeInput) {
        elements.fontSizeInput.addEventListener('wheel', (e) => {
            e.preventDefault();
            const min = parseInt(elements.fontSizeInput.min, 10) || 1;
            const max = parseInt(elements.fontSizeInput.max, 10) || 100;
            const currentValue = parseInt(elements.fontSizeInput.value, 10) || 16;
            const step = e.deltaY < 0 ? 1 : -1;
            const newValue = Math.min(max, Math.max(min, currentValue + step));
            elements.fontSizeInput.value = newValue;
            // inputイベントを発火させて他の連携処理を実行
            elements.fontSizeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }, { passive: false });
    }

    // --- グローバルAPI公開 ---
    window.MojiQScript = {
        renderPage: (pageNum) => MojiQPdfManager.renderPage(pageNum),
        getCurrentPage: () => appState.currentPageNum,
        getPageMapping: () => appState.pageMapping,
        getPdfDocs: () => appState.pdfDocs,
        performZoom: (zoom) => MojiQZoom.performZoom(zoom),
        getZoom: () => appState.currentZoom,
        setZoom: (zoom) => MojiQZoom.setZoom(zoom),
        resetZoom: () => MojiQZoom.resetZoom()
    };

    // --- テキストレイヤー表示ボタン ---
    const textLayerBtn = document.getElementById('textLayerBtn');
    if (textLayerBtn) {
        textLayerBtn.addEventListener('click', () => {
            if (window.MojiQTextLayerManager) {
                MojiQTextLayerManager.toggle();
            }
        });
    }

    // --- ページ編集ボタン（見開き＋削除ドロップダウン付き） ---
    const spreadViewBtn = document.getElementById('spreadViewBtn');
    const spreadBindingDropdown = document.getElementById('spreadBindingDropdown');
    const spreadBindingDropdownOverlay = document.getElementById('spreadBindingDropdownOverlay');

    if (spreadViewBtn && spreadBindingDropdown) {
        // ドロップダウン内の各ボタン
        const bindingRightBtn = document.getElementById('bindingRightBtn');
        const bindingLeftBtn = document.getElementById('bindingLeftBtn');

        function updateSelectionState() {
            const isSpreadMode = MojiQPdfManager.isSpreadViewMode();
            const bindingDirection = MojiQPdfManager.getSpreadBindingDirection();

            if (bindingRightBtn) bindingRightBtn.classList.remove('selected');
            if (bindingLeftBtn) bindingLeftBtn.classList.remove('selected');

            if (isSpreadMode) {
                if (bindingDirection === 'right') {
                    if (bindingRightBtn) bindingRightBtn.classList.add('selected');
                } else {
                    if (bindingLeftBtn) bindingLeftBtn.classList.add('selected');
                }
            }
        }

        function closeSpreadBindingDropdown() {
            MojiQDropdownPositioner.close(spreadBindingDropdown, spreadBindingDropdownOverlay);
        }

        spreadViewBtn.addEventListener('click', () => {
            MojiQDropdownPositioner.toggle(spreadViewBtn, spreadBindingDropdown, spreadBindingDropdownOverlay, {
                onBeforeOpen: () => {
                    // PDF保存ドロップダウンを閉じる
                    if (window._savePdfDropdownClose) {
                        window._savePdfDropdownClose();
                    }
                    updateSelectionState();
                }
            });
        });

        if (spreadBindingDropdownOverlay) {
            spreadBindingDropdownOverlay.addEventListener('click', closeSpreadBindingDropdown);
        }

        // 右綴じボタン
        if (bindingRightBtn) {
            bindingRightBtn.addEventListener('click', async () => {
                closeSpreadBindingDropdown();

                const isSpreadMode = MojiQPdfManager.isSpreadViewMode();
                const currentDirection = MojiQPdfManager.getSpreadBindingDirection();

                // 既に見開きモードで同じ綴じ方向の場合は何もしない
                if (isSpreadMode && currentDirection === 'right') {
                    return;
                }

                // 確認ダイアログを表示
                const confirmed = await MojiQElectron.showConfirm(
                    '「右綴じ」に変更しますがよろしいですか？<br><br><span style="color: red;">※単ページには戻せません。作業履歴もリセットされます。</span>',
                    '見開き表示の変更',
                    { html: true }
                );
                if (!confirmed) return;

                MojiQPdfManager.setSpreadBindingDirection('right');
                // 見開きモードをONにする（既にONなら再生成）
                if (isSpreadMode) {
                    await MojiQPdfManager.toggleSpreadViewMode();
                    await MojiQPdfManager.toggleSpreadViewMode();
                } else {
                    await MojiQPdfManager.toggleSpreadViewMode();
                }
                spreadViewBtn.classList.add('active');
            });
        }

        // 左綴じボタン
        if (bindingLeftBtn) {
            bindingLeftBtn.addEventListener('click', async () => {
                closeSpreadBindingDropdown();

                const isSpreadMode = MojiQPdfManager.isSpreadViewMode();
                const currentDirection = MojiQPdfManager.getSpreadBindingDirection();

                // 既に見開きモードで同じ綴じ方向の場合は何もしない
                if (isSpreadMode && currentDirection === 'left') {
                    return;
                }

                // 確認ダイアログを表示
                const confirmed = await MojiQElectron.showConfirm(
                    '「左綴じ」に変更しますがよろしいですか？<br><br><span style="color: red;">※単ページには戻せません。作業履歴もリセットされます。</span>',
                    '見開き表示の変更',
                    { html: true }
                );
                if (!confirmed) return;

                MojiQPdfManager.setSpreadBindingDirection('left');
                // 見開きモードをONにする（既にONなら再生成）
                if (isSpreadMode) {
                    await MojiQPdfManager.toggleSpreadViewMode();
                    await MojiQPdfManager.toggleSpreadViewMode();
                } else {
                    await MojiQPdfManager.toggleSpreadViewMode();
                }
                spreadViewBtn.classList.add('active');
            });
        }

        // 現在のページを削除ボタン
        const dropdownDeletePage = document.getElementById('dropdownDeletePage');
        if (dropdownDeletePage) {
            dropdownDeletePage.addEventListener('click', () => {
                closeSpreadBindingDropdown();
                MojiQPageManager.deleteCurrentPage();
            });
        }

        // グローバルにアクセス可能にする
        window._spreadBindingDropdownClose = closeSpreadBindingDropdown;
    }

    // --- PDF保存ボタン（上書き保存＋名前を付けて保存ドロップダウン付き） ---
    const savePdfBtn = document.getElementById('savePdfBtn');
    const savePdfDropdown = document.getElementById('savePdfDropdown');
    const savePdfDropdownOverlay = document.getElementById('savePdfDropdownOverlay');

    if (savePdfBtn && savePdfDropdown) {
        const overwriteSaveBtn = document.getElementById('overwriteSaveBtn');
        const saveAsNewBtn = document.getElementById('saveAsNewBtn');

        function updateSaveDropdownState() {
            // 上書き保存の有効/無効を更新
            // ファイルパスが設定されていれば有効（変更がなくても上書き保存可能に）
            const canOverwrite = MojiQPdfManager.canOverwriteSave();
            if (overwriteSaveBtn) {
                overwriteSaveBtn.disabled = !canOverwrite;
            }
        }

        function closeSavePdfDropdown() {
            MojiQDropdownPositioner.close(savePdfDropdown, savePdfDropdownOverlay, savePdfBtn);
        }

        // 保存ボタンのクリックでドロップダウン表示
        savePdfBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            MojiQDropdownPositioner.toggle(savePdfBtn, savePdfDropdown, savePdfDropdownOverlay, {
                onBeforeOpen: () => {
                    // ページ編集ドロップダウンを閉じる
                    if (window._spreadBindingDropdownClose) {
                        window._spreadBindingDropdownClose();
                    }
                    updateSaveDropdownState();
                }
            });
        });

        if (savePdfDropdownOverlay) {
            savePdfDropdownOverlay.addEventListener('click', closeSavePdfDropdown);
        }

        // 上書き保存ボタン
        if (overwriteSaveBtn) {
            overwriteSaveBtn.addEventListener('click', () => {
                closeSavePdfDropdown();
                // 上書き保存可能な場合のみ実行
                if (MojiQPdfManager.canOverwriteSave()) {
                    MojiQPdfManager.savePdf();
                }
            });
        }

        // 名前を付けて保存ボタン
        if (saveAsNewBtn) {
            saveAsNewBtn.addEventListener('click', () => {
                closeSavePdfDropdown();
                MojiQPdfManager.saveAsNew();
            });
        }

        // グローバルにアクセス可能にする
        window._savePdfDropdownClose = closeSavePdfDropdown;
    }

    // --- 校正指示スタンプUI ---
    MojiQProofreadingUI.init();

    // --- サイドバー折り畳み機能 ---
    const leftSidebar = document.getElementById('leftSidebar');
    const rightSidebar = document.getElementById('rightSidebar');
    const leftSidebarToggle = document.getElementById('leftSidebarToggle');
    const rightSidebarToggle = document.getElementById('rightSidebarToggle');

    function toggleSidebar(sidebar, toggleBtn, side) {
        const isCollapsed = sidebar.classList.toggle('collapsed');
        if (side === 'left') {
            toggleBtn.textContent = isCollapsed ? '»' : '«';
            toggleBtn.title = isCollapsed ? 'サイドバーを展開' : 'サイドバーを折り畳む';
        } else {
            toggleBtn.textContent = isCollapsed ? '«' : '»';
            toggleBtn.title = isCollapsed ? 'サイドバーを展開' : 'サイドバーを折り畳む';
        }
    }

    // 左サイドバーのトグル
    if (leftSidebarToggle && leftSidebar) {
        leftSidebarToggle.addEventListener('click', () => {
            toggleSidebar(leftSidebar, leftSidebarToggle, 'left');
        });
    }

    // 右サイドバーのトグル
    if (rightSidebarToggle && rightSidebar) {
        rightSidebarToggle.addEventListener('click', () => {
            toggleSidebar(rightSidebar, rightSidebarToggle, 'right');
        });
    }

    // --- メモ機能 ---
    const memoToggleBtn = document.getElementById('memoToggleBtn');
    const memoDropdown = document.getElementById('memoDropdown');
    const memoTextarea = document.getElementById('memoTextarea');
    const memoClearBtn = document.getElementById('memoClearBtn');

    if (memoToggleBtn && memoDropdown) {
        memoToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = memoDropdown.classList.toggle('open');
            memoToggleBtn.classList.toggle('open', isOpen);
        });

        if (memoTextarea) {
            memoTextarea.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        if (memoClearBtn && memoTextarea) {
            memoClearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                memoTextarea.value = '';
                memoTextarea.focus();
            });
        }
    }

    // --- ツールバー折り畳み機能 ---
    const toolBarVertical = document.getElementById('toolBarVertical');
    const toolbarToggle = document.getElementById('toolbarToggle');

    function toggleToolbar() {
        const isCollapsed = toolBarVertical.classList.toggle('collapsed');
        toolbarToggle.textContent = isCollapsed ? '»' : '«';
        toolbarToggle.title = isCollapsed ? 'ツールバーを展開' : 'ツールバーを折り畳む';
    }

    if (toolbarToggle && toolBarVertical) {
        toolbarToggle.addEventListener('click', () => {
            toggleToolbar();
        });
    }

    // 注意: アプリ終了時の確認とダークモードの初期化はinitWindowControlsAndMenuBar()で実行済み

});

/**
 * グローバルクリーンアップ関数
 * 全モジュールのイベントリスナーを解除してメモリリークを防止
 */
window.MojiQCleanup = function() {
    'use strict';

    // 各モジュールのcleanup関数を呼び出し
    if (window.MojiQDrawing && typeof window.MojiQDrawing.cleanup === 'function') {
        window.MojiQDrawing.cleanup();
    }
    if (window.MojiQModeController && typeof window.MojiQModeController.cleanup === 'function') {
        window.MojiQModeController.cleanup();
    }
    if (window.MojiQNavigation && typeof window.MojiQNavigation.cleanup === 'function') {
        window.MojiQNavigation.cleanup();
    }
    if (window.MojiQZoom && typeof window.MojiQZoom.cleanup === 'function') {
        window.MojiQZoom.cleanup();
    }
    if (window.MojiQPdfManager && typeof window.MojiQPdfManager.cleanup === 'function') {
        window.MojiQPdfManager.cleanup();
    }
    if (window.MojiQModal && typeof window.MojiQModal.cleanup === 'function') {
        window.MojiQModal.cleanup();
    }
    if (window.MojiQStamps && typeof window.MojiQStamps.cleanup === 'function') {
        window.MojiQStamps.cleanup();
    }
    if (window.MojiQShortcuts && typeof window.MojiQShortcuts.cleanup === 'function') {
        window.MojiQShortcuts.cleanup();
    }
    if (window.MojiQEvents && typeof window.MojiQEvents.clear === 'function') {
        window.MojiQEvents.clear();
    }


};
