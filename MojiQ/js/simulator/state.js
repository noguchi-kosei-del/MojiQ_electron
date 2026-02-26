/**
 * Simulator State Management
 * 状態管理モジュール - 全モジュールで共有される状態と定数
 */
window.SimulatorState = (function() {
    'use strict';

    // --- 定数 ---
    const MM_PER_PT = 0.3528;
    const HANDLE_SIZE = 10;
    const densityOptions = [
        { val: 'loose', label: 'ゆったり' },
        { val: 'standard', label: '標準' },
        { val: 'tight', label: '文字大きめ' },
        { val: 'none', label: '余白なし' }
    ];

    // --- 状態変数 ---
    let state = {
        // キャリブレーション
        pixelsPerMm: 1.0,
        isCalibrated: false,

        // ページごとのグリッド状態
        pageGridStates: {},

        // グリッド操作用
        currentMode: null,
        startPos: { x: 0, y: 0 },
        currentPos: { x: 0, y: 0 },
        isDrawing: false,
        snapshot: null,

        // 現在の状態
        currentPageNum: 1,
        totalPages: 1,
        currentSimZoom: 1.0,

        // パン操作用
        isSimPanning: false,
        simPanStart: { x: 0, y: 0 },
        simScrollStart: { left: 0, top: 0 },
        isSpacePressed: false,
        isShiftPressed: false,

        // グリッド調整用
        isGridAdjusting: false,
        pendingGridState: null,
        restorableGridState: null,
        isGridMoving: false,
        dragOffset: { x: 0, y: 0 },
        isResizing: false,
        activeHandle: null,

        // UI状態
        wheelMode: 'chars',
        ptStep: 1.0,
        lastValidDensity: 'standard',
        bubbleZones: [],
        isDensityMenuOpen: false,

        // Undo/Redo用スタック
        undoStacks: {},
        redoStacks: {},

        // デバイスピクセル比
        dpr: Math.min(3, Math.max(2, window.devicePixelRatio || 1))
    };

    // --- 公開API ---
    return {
        // 定数
        MM_PER_PT: MM_PER_PT,
        HANDLE_SIZE: HANDLE_SIZE,
        densityOptions: densityOptions,

        // 状態取得
        get: function(key) {
            return state[key];
        },

        // 状態設定
        set: function(key, value) {
            state[key] = value;
            // currentPageNumの変更はStoreにも同期
            if (key === 'currentPageNum' && window.MojiQStore) {
                MojiQStore.set('page.currentPageNum', value);
            }
            if (key === 'totalPages' && window.MojiQStore) {
                MojiQStore.set('page.totalPages', value);
            }
        },

        // 複数の状態を一括取得
        getAll: function() {
            return { ...state };
        },

        // 複数の状態を一括設定
        setMultiple: function(updates) {
            Object.assign(state, updates);
        },

        // ページグリッド状態の取得（後方互換性のため、選択中のグリッドを返す）
        getPageGridState: function(pageNum) {
            const pageData = state.pageGridStates[pageNum];
            if (!pageData) return null;
            // 新形式（配列）
            if (Array.isArray(pageData.grids)) {
                const idx = pageData.selectedIndex;
                if (idx !== null && idx >= 0 && idx < pageData.grids.length) {
                    return pageData.grids[idx];
                }
                return null;
            }
            // 旧形式（単一オブジェクト）の場合はそのまま返す
            return pageData;
        },

        // ページグリッド状態の設定（後方互換性のため）
        setPageGridState: function(pageNum, gridState) {
            const pageData = state.pageGridStates[pageNum];
            if (pageData && Array.isArray(pageData.grids)) {
                const idx = pageData.selectedIndex;
                if (idx !== null && idx >= 0 && idx < pageData.grids.length) {
                    pageData.grids[idx] = gridState;
                }
            } else {
                // 旧形式または新規
                state.pageGridStates[pageNum] = gridState;
            }
        },

        // ページグリッド状態の削除
        deletePageGridState: function(pageNum) {
            delete state.pageGridStates[pageNum];
        },

        // ===== 複数グリッド対応API =====

        // ページの全グリッド取得
        getPageGrids: function(pageNum) {
            const pageData = state.pageGridStates[pageNum];
            if (!pageData) return [];
            if (Array.isArray(pageData.grids)) {
                return pageData.grids;
            }
            // 旧形式を配列に変換
            return pageData ? [pageData] : [];
        },

        // ページのグリッドデータ初期化
        initPageGridData: function(pageNum) {
            if (!state.pageGridStates[pageNum] || !Array.isArray(state.pageGridStates[pageNum].grids)) {
                const oldData = state.pageGridStates[pageNum];
                state.pageGridStates[pageNum] = {
                    grids: oldData ? [oldData] : [],
                    selectedIndex: oldData ? 0 : null
                };
            }
        },

        // グリッド追加
        addGrid: function(pageNum, gridState) {
            this.initPageGridData(pageNum);
            const pageData = state.pageGridStates[pageNum];
            pageData.grids.push(gridState);
            pageData.selectedIndex = pageData.grids.length - 1;
            return pageData.selectedIndex;
        },

        // グリッド削除（選択中のグリッド）
        removeSelectedGrid: function(pageNum) {
            const pageData = state.pageGridStates[pageNum];
            if (!pageData || !Array.isArray(pageData.grids)) return false;
            const idx = pageData.selectedIndex;
            if (idx === null || idx < 0 || idx >= pageData.grids.length) return false;

            pageData.grids.splice(idx, 1);
            if (pageData.grids.length === 0) {
                pageData.selectedIndex = null;
            } else if (idx >= pageData.grids.length) {
                pageData.selectedIndex = pageData.grids.length - 1;
            }
            return true;
        },

        // グリッド選択
        selectGrid: function(pageNum, index) {
            const pageData = state.pageGridStates[pageNum];
            if (!pageData || !Array.isArray(pageData.grids)) return false;
            if (index < 0 || index >= pageData.grids.length) return false;
            pageData.selectedIndex = index;
            return true;
        },

        // 選択解除
        deselectGrid: function(pageNum) {
            const pageData = state.pageGridStates[pageNum];
            if (pageData && Array.isArray(pageData.grids)) {
                pageData.selectedIndex = null;
            }
        },

        // 選択中インデックス取得
        getSelectedIndex: function(pageNum) {
            const pageData = state.pageGridStates[pageNum];
            if (!pageData || !Array.isArray(pageData.grids)) return null;
            return pageData.selectedIndex;
        },

        // 選択中グリッド取得
        getSelectedGrid: function(pageNum) {
            const pageData = state.pageGridStates[pageNum];
            if (!pageData || !Array.isArray(pageData.grids)) return null;
            const idx = pageData.selectedIndex;
            if (idx === null || idx < 0 || idx >= pageData.grids.length) return null;
            return pageData.grids[idx];
        },

        // 全グリッドクリア（単一ページ）
        clearAllGrids: function(pageNum) {
            state.pageGridStates[pageNum] = {
                grids: [],
                selectedIndex: null
            };
        },

        // 全データリセット（PDF新規読み込み時用）
        resetAllData: function() {
            // 全ページのグリッド状態をクリア
            state.pageGridStates = {};
            // 全ページのUndo/Redoスタックをクリア
            state.undoStacks = {};
            state.redoStacks = {};
            // グリッド調整状態をリセット
            state.isGridAdjusting = false;
            state.pendingGridState = null;
            state.restorableGridState = null;
            state.isGridMoving = false;
            state.isResizing = false;
            state.isDrawing = false;
            // バブルゾーンをクリア
            state.bubbleZones = [];
        },

        // ページデータ全体取得（Undo/Redo用）
        getPageData: function(pageNum) {
            return state.pageGridStates[pageNum]
                ? MojiQClone.deep(state.pageGridStates[pageNum])
                : null;
        },

        // ページデータ全体設定（Undo/Redo用）
        setPageData: function(pageNum, data) {
            state.pageGridStates[pageNum] = data ? MojiQClone.deep(data) : null;
        },

        // Undoスタック操作
        getUndoStack: function(pageNum) {
            if (!state.undoStacks[pageNum]) {
                state.undoStacks[pageNum] = [];
            }
            return state.undoStacks[pageNum];
        },

        pushUndoStack: function(pageNum, item) {
            if (!state.undoStacks[pageNum]) {
                state.undoStacks[pageNum] = [];
            }
            state.undoStacks[pageNum].push(item);
            // スタックサイズ制限（最大20件）
            if (state.undoStacks[pageNum].length > 20) {
                state.undoStacks[pageNum].shift();
            }
        },

        popUndoStack: function(pageNum) {
            if (!state.undoStacks[pageNum]) return null;
            return state.undoStacks[pageNum].pop();
        },

        clearUndoStack: function(pageNum) {
            state.undoStacks[pageNum] = [];
        },

        // Redoスタック操作
        getRedoStack: function(pageNum) {
            if (!state.redoStacks[pageNum]) {
                state.redoStacks[pageNum] = [];
            }
            return state.redoStacks[pageNum];
        },

        pushRedoStack: function(pageNum, item) {
            if (!state.redoStacks[pageNum]) {
                state.redoStacks[pageNum] = [];
            }
            state.redoStacks[pageNum].push(item);
        },

        popRedoStack: function(pageNum) {
            if (!state.redoStacks[pageNum]) return null;
            return state.redoStacks[pageNum].pop();
        },

        clearRedoStack: function(pageNum) {
            state.redoStacks[pageNum] = [];
        },

        // バブルゾーン操作
        clearBubbleZones: function() {
            state.bubbleZones = [];
        },

        addBubbleZone: function(zone) {
            state.bubbleZones.push(zone);
        },

        getBubbleZones: function() {
            return state.bubbleZones;
        },

        // ===== ページ番号シフト関数（ページ挿入・削除時） =====

        /**
         * ページ挿入時にページ番号をシフト
         * @param {number} insertIndex - 挿入位置（0始まり）
         * @param {number} count - 挿入するページ数（デフォルト: 1）
         */
        shiftPageNumbersAfterInsert: function(insertIndex, count) {
            count = count || 1;
            const insertPageNum = insertIndex + 1;
            const newPageGridStates = {};
            const newUndoStacks = {};
            const newRedoStacks = {};

            for (const pageNumStr in state.pageGridStates) {
                const pageNum = parseInt(pageNumStr);
                if (pageNum >= insertPageNum) {
                    // 挿入位置以降のページは番号を+count
                    newPageGridStates[pageNum + count] = state.pageGridStates[pageNum];
                } else {
                    // 挿入位置より前のページはそのまま
                    newPageGridStates[pageNum] = state.pageGridStates[pageNum];
                }
            }

            for (const pageNumStr in state.undoStacks) {
                const pageNum = parseInt(pageNumStr);
                if (pageNum >= insertPageNum) {
                    newUndoStacks[pageNum + count] = state.undoStacks[pageNum];
                } else {
                    newUndoStacks[pageNum] = state.undoStacks[pageNum];
                }
            }

            for (const pageNumStr in state.redoStacks) {
                const pageNum = parseInt(pageNumStr);
                if (pageNum >= insertPageNum) {
                    newRedoStacks[pageNum + count] = state.redoStacks[pageNum];
                } else {
                    newRedoStacks[pageNum] = state.redoStacks[pageNum];
                }
            }

            state.pageGridStates = newPageGridStates;
            state.undoStacks = newUndoStacks;
            state.redoStacks = newRedoStacks;
        },

        /**
         * ページ削除時にページ番号をシフト
         * @param {number} deleteIndex - 削除位置（0始まり）
         */
        shiftPageNumbersAfterDelete: function(deleteIndex) {
            const deletePageNum = deleteIndex + 1;
            const newPageGridStates = {};
            const newUndoStacks = {};
            const newRedoStacks = {};

            for (const pageNumStr in state.pageGridStates) {
                const pageNum = parseInt(pageNumStr);
                if (pageNum === deletePageNum) {
                    // 削除されるページはスキップ
                    continue;
                } else if (pageNum > deletePageNum) {
                    // 削除位置より後のページは番号を-1
                    newPageGridStates[pageNum - 1] = state.pageGridStates[pageNum];
                } else {
                    // 削除位置より前のページはそのまま
                    newPageGridStates[pageNum] = state.pageGridStates[pageNum];
                }
            }

            for (const pageNumStr in state.undoStacks) {
                const pageNum = parseInt(pageNumStr);
                if (pageNum === deletePageNum) {
                    continue;
                } else if (pageNum > deletePageNum) {
                    newUndoStacks[pageNum - 1] = state.undoStacks[pageNum];
                } else {
                    newUndoStacks[pageNum] = state.undoStacks[pageNum];
                }
            }

            for (const pageNumStr in state.redoStacks) {
                const pageNum = parseInt(pageNumStr);
                if (pageNum === deletePageNum) {
                    continue;
                } else if (pageNum > deletePageNum) {
                    newRedoStacks[pageNum - 1] = state.redoStacks[pageNum];
                } else {
                    newRedoStacks[pageNum] = state.redoStacks[pageNum];
                }
            }

            state.pageGridStates = newPageGridStates;
            state.undoStacks = newUndoStacks;
            state.redoStacks = newRedoStacks;
        }
    };
})();
