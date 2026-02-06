/* js/page-manager.js - ページ操作・履歴管理 */

window.MojiQPageManager = (function() {
    let mojiqCanvas = null;
    let ctx = null;
    let clearBtn = null;
    let undoBtn = null;
    let redoBtn = null;
    let state = null;
    let dpr = 1;

    const MAX_HISTORY_STACK = 50;

    // コールバック
    let toggleAppLockCallback = null;

    // Image読み込み競合防止用のカウンターとロック
    let undoRedoOperationId = 0;
    let isUndoRedoInProgress = false;  // Undo/Redo処理中フラグ

    /**
     * 初期化
     * @param {object} elements - DOM要素
     * @param {object} appState - アプリケーション状態への参照
     * @param {object} callbacks - コールバック関数群
     */
    function init(elements, appState, callbacks) {
        mojiqCanvas = elements.mojiqCanvas;
        ctx = elements.ctx;
        clearBtn = elements.clearBtn;
        undoBtn = elements.undoBtn;
        redoBtn = elements.redoBtn;
        state = appState;
        dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));

        toggleAppLockCallback = callbacks.toggleAppLock;

        setupEventListeners();
        setupShortcutListeners();
    }

    /**
     * ページキー取得
     * @param {object} mapItem - ページマッピングアイテム
     * @returns {string}
     */
    function getPageKey(mapItem) {
        return `${mapItem.docIndex}-${mapItem.pageNum}`;
    }

    /**
     * 現在のキャンバスを履歴に保存
     */
    function saveCurrentCanvasToHistory() {
        if (!state.currentPageNum) return;

        // 見開きモードの場合はspread_Nキーをそのまま使用
        let pageKey;
        if (typeof state.currentPageNum === 'string' && state.currentPageNum.startsWith('spread_')) {
            pageKey = state.currentPageNum;
        } else {
            const mapItem = state.pageMapping[state.currentPageNum - 1];
            if (!mapItem) return;
            pageKey = getPageKey(mapItem);
        }

        if (!state.pageDrawingHistory[pageKey]) state.pageDrawingHistory[pageKey] = [];
        const dataURL = mojiqCanvas.toDataURL('image/png');
        const stack = state.pageDrawingHistory[pageKey];
        if (stack.length > 0 && stack[stack.length - 1] === dataURL) return;
        stack.push(dataURL);
        if (stack.length > MAX_HISTORY_STACK) stack.shift();
        state.pageRedoHistory[pageKey] = [];
        updatePageControls();
    }

    /**
     * アンドゥ実行
     */
    async function performUndo() {
        // 処理中の場合は無視（連打対策）
        if (isUndoRedoInProgress) return;

        // オブジェクト管理のundoを実行
        if (window.MojiQDrawingObjects && MojiQDrawingObjects.canUndo(state.currentPageNum)) {
            MojiQDrawingObjects.undo(state.currentPageNum);
            // オブジェクトから再描画
            if (window.MojiQDrawing) {
                MojiQDrawing.redrawCanvas();
            }
            updatePageControls();
            return;
        }

        // フォールバック: ページ履歴からのundo
        const mapItem = state.pageMapping[state.currentPageNum - 1];
        const pageKey = getPageKey(mapItem);
        if (!state.pageDrawingHistory[pageKey] || state.pageDrawingHistory[pageKey].length <= 1) return;
        const popped = state.pageDrawingHistory[pageKey].pop();
        if (!state.pageRedoHistory[pageKey]) state.pageRedoHistory[pageKey] = [];
        state.pageRedoHistory[pageKey].push(popped);

        const prevData = state.pageDrawingHistory[pageKey].slice(-1)[0];

        // 競合防止: 処理中フラグを立てて、Promiseで順序を保証
        isUndoRedoInProgress = true;
        const currentOperationId = ++undoRedoOperationId;

        try {
            await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    // 新しい操作が開始されていた場合は描画をスキップ
                    if (currentOperationId !== undoRedoOperationId) {
                        resolve();
                        return;
                    }
                    ctx.clearRect(0, 0, state.baseCSSExtent.width, state.baseCSSExtent.height);
                    ctx.drawImage(img, 0, 0, state.baseCSSExtent.width, state.baseCSSExtent.height);
                    resolve();
                };
                img.onerror = () => {
                    console.warn('Undo image load failed');
                    resolve();  // エラーでも処理を継続
                };
                img.src = prevData;
            });
        } finally {
            isUndoRedoInProgress = false;
        }
        updatePageControls();
    }

    /**
     * リドゥ実行
     */
    async function performRedo() {
        // 処理中の場合は無視（連打対策）
        if (isUndoRedoInProgress) return;

        // オブジェクト管理のredoを実行
        if (window.MojiQDrawingObjects && MojiQDrawingObjects.canRedo(state.currentPageNum)) {
            MojiQDrawingObjects.redo(state.currentPageNum);
            // オブジェクトから再描画
            if (window.MojiQDrawing) {
                MojiQDrawing.redrawCanvas();
            }
            updatePageControls();
            return;
        }

        // フォールバック: ページ履歴からのredo
        const mapItem = state.pageMapping[state.currentPageNum - 1];
        if (!mapItem) return;
        const pageKey = getPageKey(mapItem);

        if (!state.pageRedoHistory[pageKey] || state.pageRedoHistory[pageKey].length === 0) return;

        const popped = state.pageRedoHistory[pageKey].pop();

        if (!state.pageDrawingHistory[pageKey]) state.pageDrawingHistory[pageKey] = [];
        state.pageDrawingHistory[pageKey].push(popped);

        // 競合防止: 処理中フラグを立てて、Promiseで順序を保証
        isUndoRedoInProgress = true;
        const currentOperationId = ++undoRedoOperationId;

        try {
            await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    // 新しい操作が開始されていた場合は描画をスキップ
                    if (currentOperationId !== undoRedoOperationId) {
                        resolve();
                        return;
                    }
                    ctx.clearRect(0, 0, state.baseCSSExtent.width, state.baseCSSExtent.height);
                    ctx.drawImage(img, 0, 0, state.baseCSSExtent.width, state.baseCSSExtent.height);
                    resolve();
                };
                img.onerror = () => {
                    console.warn('Redo image load failed');
                    resolve();  // エラーでも処理を継続
                };
                img.src = popped;
            });
        } finally {
            isUndoRedoInProgress = false;
        }

        updatePageControls();
    }

    /**
     * ページコントロールの更新
     */
    function updatePageControls() {
        if (!state || !state.pageMapping) return;
        const mapItem = state.pageMapping[state.currentPageNum - 1];
        if (!mapItem) return;
        const pageKey = getPageKey(mapItem);

        // 統合モード: 両方のundo/redo状態を統合
        // オブジェクト管理のundo/redo状態
        const objCanUndo = window.MojiQDrawingObjects && MojiQDrawingObjects.canUndo(state.currentPageNum);
        const objCanRedo = window.MojiQDrawingObjects && MojiQDrawingObjects.canRedo(state.currentPageNum);

        const pageCanUndo = state.pageDrawingHistory[pageKey] && state.pageDrawingHistory[pageKey].length > 1;
        const pageCanRedo = state.pageRedoHistory[pageKey] && state.pageRedoHistory[pageKey].length > 0;

        // シミュレーターのundo/redo状態
        const simCanUndo = window.SimulatorState &&
            window.SimulatorState.getUndoStack(state.currentPageNum).length > 0;
        const simCanRedo = window.SimulatorState &&
            window.SimulatorState.getRedoStack(state.currentPageNum).length > 0;

        undoBtn.disabled = !(objCanUndo || pageCanUndo || simCanUndo);
        redoBtn.disabled = !(objCanRedo || pageCanRedo || simCanRedo);

        // クリアボタン: オブジェクトまたはグリッドがある場合に有効化
        if (clearBtn) {
            const hasObjects = window.MojiQDrawingObjects &&
                MojiQDrawingObjects.getPageObjects(state.currentPageNum).length > 0;
            const hasGrids = window.SimulatorState &&
                window.SimulatorState.getPageGrids(state.currentPageNum).length > 0;
            clearBtn.disabled = !(hasObjects || hasGrids);
        }

        // 保存ボタン: 描画オブジェクトがある場合に有効化
        if (window.MojiQPdfManager && window.MojiQPdfManager.updateSaveButtonState) {
            window.MojiQPdfManager.updateSaveButtonState();
        }
    }

    /**
     * 白紙ページを挿入
     * @param {number} offset - 0=前, 1=後
     */
    async function insertBlankPage(offset) {
        if (state.totalPages === 0) return;

        // 見開きモード時は現在表示中の見開きからページ番号を取得
        let effectivePageNum = state.currentPageNum;
        if (MojiQPdfManager.isSpreadViewMode()) {
            const currentSpread = MojiQPdfManager.getCurrentSpread();
            if (currentSpread) {
                // 右ページ（右綴じでは先のページ）を基準にする。なければ左ページ
                effectivePageNum = currentSpread.rightPage || currentSpread.leftPage || state.currentPageNum;
            }
        }

        // 現在のページのPDFサイズを取得（キャンバスサイズではなく、元のPDFのサイズを使用）
        let pageWidth, pageHeight;
        const currentMapItem = state.pageMapping[effectivePageNum - 1];

        if (!currentMapItem) {
            pageWidth = 595;
            pageHeight = 842;
        } else if (currentMapItem.docIndex === -1) {
            // 現在のページが白紙ページの場合は、そのサイズを使用
            pageWidth = currentMapItem.width;
            pageHeight = currentMapItem.height;
        } else if (currentMapItem.docIndex === -2) {
            // 画像ページの場合は、画像のサイズを使用
            pageWidth = currentMapItem.width;
            pageHeight = currentMapItem.height;
        } else {
            // PDFページの場合は、元のPDFのviewportサイズを取得
            const targetDoc = state.pdfDocs[currentMapItem.docIndex];
            const page = await targetDoc.getPage(currentMapItem.pageNum);
            const viewport = page.getViewport({ scale: 1 });
            pageWidth = viewport.width;
            pageHeight = viewport.height;
        }

        const blankPageObj = { docIndex: -1, pageNum: 1, width: pageWidth, height: pageHeight };

        const insertIndex = (effectivePageNum > 0 ? effectivePageNum - 1 : 0) + offset;

        // 挿入位置以降のページ番号に紐づいた描画データをシフト
        if (window.MojiQDrawingObjects) {
            MojiQDrawingObjects.shiftPageNumbersAfterInsert(insertIndex);
        }

        // SimulatorStateのグリッドデータもシフト
        if (window.SimulatorState) {
            SimulatorState.shiftPageNumbersAfterInsert(insertIndex);
        }

        state.pageMapping.splice(insertIndex, 0, blankPageObj);
        state.totalPages = state.pageMapping.length;

        if (state.totalPages > 0 && toggleAppLockCallback) {
            toggleAppLockCallback(false);
        }

        let targetPage = effectivePageNum;
        if (offset === 1) {
            targetPage = effectivePageNum + 1;
        }
        if (targetPage < 1) targetPage = 1;

        // ページ番号がずれるためレンダリングキャッシュをクリア
        if (MojiQPdfManager.clearPageCache) {
            MojiQPdfManager.clearPageCache();
        }

        if (MojiQPdfManager.isSpreadViewMode()) {
            // 見開きモード中: 見開きを再構築
            await MojiQPdfManager.rebuildSpreadAfterPageChange(targetPage);
        } else {
            MojiQPdfManager.renderPage(targetPage);
        }

        const positionText = offset === 0 ? '前' : '後';
        MojiQModal.showAlert(`白紙ページを現在のページの${positionText}に追加しました。`, '追加完了');
    }

    /**
     * 現在のページを削除
     */
    async function deleteCurrentPage() {
        if (MojiQPdfManager.isSpreadViewMode()) {
            // 見開きモード時の削除処理
            const currentSpread = MojiQPdfManager.getCurrentSpread();
            if (!currentSpread) return;

            // 見開き内の実ページ（白紙でないページ）を収集
            const realPages = [];
            if (currentSpread.leftPage && !currentSpread.leftBlank) {
                realPages.push(currentSpread.leftPage);
            }
            if (currentSpread.rightPage && !currentSpread.rightBlank) {
                realPages.push(currentSpread.rightPage);
            }
            if (realPages.length === 0) return;

            // 実ページが1つ以下（白紙除外後のtotalPagesが1以下）の場合は削除不可
            const spreadBlankCount = state.pageMapping.filter(m => m.isSpreadBlank).length;
            const realTotalPages = state.totalPages - spreadBlankCount;
            if (realTotalPages <= 1) return;

            // 削除対象のページ番号を決定
            let effectivePageNum;
            if (realPages.length === 1) {
                effectivePageNum = realPages[0];
            } else {
                // 複数の実ページがある場合、右綴じなら右ページ、左綴じなら左ページをデフォルトに
                const bindingDir = MojiQPdfManager.getSpreadBindingDirection();
                if (bindingDir === 'right') {
                    effectivePageNum = currentSpread.rightPage;
                } else {
                    effectivePageNum = currentSpread.leftPage;
                }
            }

            if (!effectivePageNum) return;

            if (await MojiQModal.showConfirm('このページを削除しますか？')) {
                const deleteIndex = effectivePageNum - 1;

                // 削除位置以降のページ番号に紐づいた描画データをシフト
                if (window.MojiQDrawingObjects) {
                    MojiQDrawingObjects.shiftPageNumbersAfterDelete(deleteIndex);
                }

                // SimulatorStateのグリッドデータもシフト
                if (window.SimulatorState) {
                    SimulatorState.shiftPageNumbersAfterDelete(deleteIndex);
                }

                state.pageMapping.splice(deleteIndex, 1);
                state.totalPages = state.pageMapping.length;
                if (effectivePageNum > state.totalPages) effectivePageNum = state.totalPages;
                state.currentPageNum = effectivePageNum;

                // ページ番号がずれるためレンダリングキャッシュをクリア
                if (MojiQPdfManager.clearPageCache) {
                    MojiQPdfManager.clearPageCache();
                }

                // 見開きモード中: 見開きを再構築
                await MojiQPdfManager.rebuildSpreadAfterPageChange(state.currentPageNum);
            }
        } else {
            // 通常モード時の削除処理
            if (state.totalPages <= 1) return;
            if (await MojiQModal.showConfirm('このページを削除しますか？')) {
                const deleteIndex = state.currentPageNum - 1;

                // 削除位置以降のページ番号に紐づいた描画データをシフト
                if (window.MojiQDrawingObjects) {
                    MojiQDrawingObjects.shiftPageNumbersAfterDelete(deleteIndex);
                }

                // SimulatorStateのグリッドデータもシフト
                if (window.SimulatorState) {
                    SimulatorState.shiftPageNumbersAfterDelete(deleteIndex);
                }

                state.pageMapping.splice(deleteIndex, 1);
                state.totalPages = state.pageMapping.length;
                let newPageNum = state.currentPageNum;
                if (newPageNum > state.totalPages) newPageNum = state.totalPages;
                state.currentPageNum = newPageNum;

                // ページ番号がずれるためレンダリングキャッシュをクリア
                if (MojiQPdfManager.clearPageCache) {
                    MojiQPdfManager.clearPageCache();
                }

                MojiQPdfManager.renderPage(state.currentPageNum);
            }
        }
    }

    /**
     * 描画をクリア
     */
    async function clearDrawing() {
        if (await MojiQModal.showConfirm('描画を消去しますか？')) {
            ctx.clearRect(0, 0, state.baseCSSExtent.width, state.baseCSSExtent.height);

            // オブジェクト配列もクリア
            if (window.MojiQDrawingObjects) {
                MojiQDrawingObjects.clearPageObjects(state.currentPageNum);
            }

            saveCurrentCanvasToHistory();
        }
    }

    /**
     * イベントリスナーのセットアップ
     */
    function setupEventListeners() {
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
            // 描画オブジェクトとグリッドの有無を確認
            const hasObjects = window.MojiQDrawingObjects &&
                MojiQDrawingObjects.getPageObjects(state.currentPageNum).length > 0;
            const hasGrids = window.SimulatorState &&
                window.SimulatorState.getPageGrids(state.currentPageNum).length > 0;

            if (!hasObjects && !hasGrids) return;

            // 確認メッセージを作成
            let message = '';
            if (hasObjects && hasGrids) {
                message = '描画とグリッドをすべて消去しますか？';
            } else if (hasObjects) {
                message = '描画を消去しますか？';
            } else {
                message = 'グリッドを消去しますか？';
            }

            if (await MojiQModal.showConfirm(message)) {
                // 描画をクリア
                if (hasObjects) {
                    ctx.clearRect(0, 0, state.baseCSSExtent.width, state.baseCSSExtent.height);
                    MojiQDrawingObjects.clearPageObjects(state.currentPageNum);
                    saveCurrentCanvasToHistory();
                }
                // グリッドをクリア
                if (hasGrids) {
                    window.dispatchEvent(new CustomEvent('mojiq:clear', { detail: { confirmed: true } }));
                }
            }
            });
        }
        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                // 統合モード: 描画オブジェクトのundoを実行
                performUndo();
            });
        }
        if (redoBtn) {
            redoBtn.addEventListener('click', () => {
                // 統合モード: 描画オブジェクトのredoを実行
                performRedo();
            });
        }
    }

    /**
     * ショートカットイベントのセットアップ
     */
    function setupShortcutListeners() {
        // 線幅変更 (Ctrl + [ / ]) - ペン・マーカー・消しゴム共通ロジック
        window.addEventListener('mojiq:linewidth', (e) => {
            const lineWidthRange = document.getElementById('lineWidth');

            // 現在の値を取得（1pxずつ変更）
            let currentWidth = parseFloat(lineWidthRange.value) || 1;
            const step = 1;
            const minWidth = 1;
            const maxWidth = parseFloat(lineWidthRange.max) || 100;

            if (e.detail.action === 'increase') {
                // 次の整数へ（例: 2.5 → 3、3 → 4）
                currentWidth = Math.min(Math.floor(currentWidth) + step, maxWidth);
            } else if (e.detail.action === 'decrease') {
                // 前の整数へ（例: 2.5 → 2、3 → 2）
                currentWidth = Math.max(Math.ceil(currentWidth) - step, minWidth);
            }

            lineWidthRange.value = currentWidth;

            // 消しゴムモードの場合は state.eraserSize も更新
            if (state.currentMode === 'eraser') {
                state.eraserSize = currentWidth;
            }

            // ツール別線幅設定を保存
            const lineWidthTools = ['draw', 'marker', 'eraser', 'line', 'arrow', 'doubleArrow', 'doubleArrowAnnotated', 'lineAnnotated', 'rect', 'rectAnnotated', 'ellipse', 'ellipseAnnotated', 'polyline'];
            if (lineWidthTools.includes(state.currentMode) && window.MojiQSettings) {
                const baseToolName = state.currentMode.replace('Annotated', '');
                MojiQSettings.setToolLineWidth(baseToolName, currentWidth);
            }

            MojiQCanvasContext.initContext();
            MojiQCanvasContext.updateLineWidthDisplay();

            // 選択モードで選択中のオブジェクトがあれば線幅を適用
            if (state.currentMode === 'select' && window.MojiQDrawingSelect && MojiQDrawingSelect.hasSelection()) {
                MojiQDrawingSelect.setSelectedLineWidth(currentWidth);
            }
        });

        // アンドゥ / リドゥ (Ctrl+Z / Ctrl+Shift+Z)
        window.addEventListener('mojiq:history', (e) => {
            if (e.detail.action === 'undo') {
                performUndo();
            } else if (e.detail.action === 'redo') {
                performRedo();
            }
        });

        // カット (Ctrl+X)
        window.addEventListener('mojiq:cut', (e) => {
            const DrawingSelect = window.MojiQDrawingSelect;
            if (DrawingSelect && DrawingSelect.hasSelection()) {
                DrawingSelect.cutSelected();
            }
        });

        // ペースト (Ctrl+V)
        window.addEventListener('mojiq:paste', (e) => {
            const DrawingSelect = window.MojiQDrawingSelect;
            if (DrawingSelect && DrawingSelect.hasClipboard()) {
                DrawingSelect.pasteFromClipboard();
            }
        });

        // 全消去 (Ctrl + Delete) - 統合モードでは常に動作
        window.addEventListener('mojiq:clear', (e) => {
            // confirmed: trueの場合は既に処理済みなのでスキップ
            if (e.detail && e.detail.confirmed) return;
            clearBtn.click();
        });

        // ページスライド用変数（page-navigateとpage-slideで共有）
        let slidingPage = null;
        let slidingSpreadIndex = null;

        // ページナビゲーション
        window.addEventListener('mojiq:page-navigate', async (e) => {
            const action = e.detail.action;

            if (state.totalPages === 0) return;

            // ビューワーモード中は専用ハンドラに任せる
            if (window.MojiQViewerMode && MojiQViewerMode.isActive()) {
                return;
            }

            // 見開きモード時は専用の処理
            const PdfManager = window.MojiQPdfManager;
            if (PdfManager && PdfManager.isSpreadViewMode()) {
                // 長押し用のslidingSpreadIndexを移動後の値で初期化
                // page-slideイベントはこの値から継続してスライドする
                switch (action) {
                    case 'next':
                        PdfManager.prevSpread(); // 右開き仕様: next = 次の見開きへ
                        slidingSpreadIndex = PdfManager.getCurrentSpreadIndex();
                        break;
                    case 'prev':
                        PdfManager.nextSpread(); // 右開き仕様: prev = 前の見開きへ
                        slidingSpreadIndex = PdfManager.getCurrentSpreadIndex();
                        break;
                    case 'last':
                        // 最後の見開きへ
                        const mapping = PdfManager.getSpreadMapping();
                        if (mapping && mapping.length > 0) {
                            const lastIndex = mapping.length - 1;
                            // キャッシュから高速表示
                            if (PdfManager.displaySpreadFromCache) {
                                PdfManager.displaySpreadFromCache(lastIndex);
                            }
                            slidingSpreadIndex = lastIndex;
                        }
                        break;
                    case 'first':
                        // 最初の見開きへ
                        // キャッシュから高速表示
                        if (PdfManager.displaySpreadFromCache) {
                            PdfManager.displaySpreadFromCache(0);
                        }
                        slidingSpreadIndex = 0;
                        break;
                }
                return;
            }

            let targetPage = state.currentPageNum;

            switch (action) {
                case 'next':
                    if (state.currentPageNum < state.totalPages) targetPage++;
                    break;
                case 'prev':
                    if (state.currentPageNum > 1) targetPage--;
                    break;
                case 'last':
                    targetPage = state.totalPages;
                    break;
                case 'first':
                    targetPage = 1;
                    break;
            }

            if (targetPage !== state.currentPageNum) {
                await MojiQPdfManager.renderPage(targetPage);
                // 方向キー操作時にページ番号バブルを表示
                if (window.MojiQNavigation && MojiQNavigation.showBubbleTemporarily) {
                    MojiQNavigation.showBubbleTemporarily(targetPage);
                }
            }
        });

        // ページスライド（長押し中はスライダーのみ動かす）
        window.addEventListener('mojiq:page-slide', (e) => {
            const action = e.detail.action;
            const PdfManager = window.MojiQPdfManager;

            // 見開きモードの場合
            if (PdfManager && PdfManager.isSpreadViewMode()) {
                const mapping = PdfManager.getSpreadMapping();
                if (!mapping || mapping.length === 0) return;

                // 初回は現在の見開きインデックスから開始
                if (slidingSpreadIndex === null) {
                    slidingSpreadIndex = PdfManager.getCurrentSpreadIndex();
                }

                switch (action) {
                    case 'next':
                        // 右開き仕様: next = 次の見開きへ = インデックスを増やす
                        if (slidingSpreadIndex < mapping.length - 1) slidingSpreadIndex++;
                        break;
                    case 'prev':
                        // 右開き仕様: prev = 前の見開きへ = インデックスを減らす
                        if (slidingSpreadIndex > 0) slidingSpreadIndex--;
                        break;
                }

                // スライダーとページ表示のみ更新（実際のページレンダリングはしない）
                const spread = mapping[slidingSpreadIndex];
                if (spread && window.MojiQNavigation) {
                    // ページ表示を更新
                    let pageDisplay = '';
                    if (spread.rightPage === null) {
                        pageDisplay = `${spread.leftPage} / ${state.totalPages}`;
                    } else {
                        pageDisplay = `${spread.leftPage}-${spread.rightPage} / ${state.totalPages}`;
                    }
                    const navPageCount = document.getElementById('navPageCount');
                    if (navPageCount) {
                        navPageCount.textContent = pageDisplay;
                    }
                    // スライダーとバブルを更新（見開きモード用）
                    MojiQNavigation.updateSpreadDisplay(slidingSpreadIndex + 1, mapping.length);
                }
                return;
            }

            // 単ページモードの場合
            if (state.totalPages === 0) return;

            // 初回はcurrentPageNumから開始
            if (slidingPage === null) {
                slidingPage = state.currentPageNum;
            }

            switch (action) {
                case 'next':
                    if (slidingPage < state.totalPages) slidingPage++;
                    break;
                case 'prev':
                    if (slidingPage > 1) slidingPage--;
                    break;
            }

            // スライダーとページ表示のみ更新（実際のページレンダリングはしない）
            if (window.MojiQNavigation) {
                MojiQNavigation.updatePageDisplay(slidingPage, state.totalPages);
            }
        });

        // ページ確定（長押し終了時）
        window.addEventListener('mojiq:page-confirm', () => {
            const PdfManager = window.MojiQPdfManager;

            // 見開きモードの場合
            if (PdfManager && PdfManager.isSpreadViewMode()) {
                if (slidingSpreadIndex !== null && slidingSpreadIndex !== PdfManager.getCurrentSpreadIndex()) {
                    PdfManager.renderSpreadView(slidingSpreadIndex);
                }
                slidingSpreadIndex = null;
                return;
            }

            // 単ページモードの場合
            if (slidingPage !== null && slidingPage !== state.currentPageNum) {
                MojiQPdfManager.renderPage(slidingPage);
            }
            slidingPage = null;
        });
    }

    return {
        init,
        saveCurrentCanvasToHistory,
        performUndo,
        performRedo,
        updatePageControls,
        insertBlankPage,
        deleteCurrentPage,
        clearDrawing,
        getPageKey
    };
})();
