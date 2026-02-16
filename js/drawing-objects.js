/**
 * MojiQ Drawing Objects - オブジェクト管理モジュール
 * 描画オブジェクトをページごとに管理し、選択・編集を可能にする
 */
window.MojiQDrawingObjects = (function() {
    'use strict';

    // --- 状態変数 ---
    let state = {
        // ページごとの描画オブジェクト
        pageObjects: {},  // pageObjects[pageNum] = { objects: [...], selectedIndex: null, selectedIndices: [] }

        // 編集中オブジェクト
        pendingObject: null,

        // 現在のページ番号
        currentPageNum: 1,

        // Undo/Redoスタック
        undoStacks: {},  // undoStacks[pageNum] = [...]
        redoStacks: {},  // redoStacks[pageNum] = [...]

        // QA対策 #38,#41: Undo/Redo処理中フラグ（連続操作・描画中操作防止）
        isUndoRedoProcessing: false,

        // オブジェクトIDカウンター
        idCounter: 0
    };

    // --- IDインデックス（O(1)検索用） ---
    // Map<string, number>: "pageNum-objectId" -> index
    const idIndex = new Map();

    /**
     * IDインデックスのキーを生成
     */
    function indexKey(pageNum, id) {
        return pageNum + '-' + id;
    }

    /**
     * IDインデックスを更新（オブジェクト追加時）
     */
    function addToIndex(pageNum, id, index) {
        idIndex.set(indexKey(pageNum, id), index);
    }

    /**
     * IDインデックスを更新（オブジェクト削除時）
     */
    function removeFromIndex(pageNum, id) {
        idIndex.delete(indexKey(pageNum, id));
    }

    /**
     * ページのインデックスを再構築
     */
    function rebuildPageIndex(pageNum) {
        const objects = state.pageObjects[pageNum]?.objects || [];
        // 該当ページのエントリを削除
        for (const key of idIndex.keys()) {
            if (key.startsWith(pageNum + '-')) {
                idIndex.delete(key);
            }
        }
        // 再構築
        objects.forEach((obj, index) => {
            if (obj.id) {
                addToIndex(pageNum, obj.id, index);
            }
        });
    }

    // --- ヘルパー関数 ---

    /**
     * 一意のIDを生成
     */
    function generateId() {
        state.idCounter++;
        return 'obj_' + Date.now() + '_' + state.idCounter;
    }

    /**
     * ページデータを初期化
     */
    function initPageData(pageNum) {
        if (!state.pageObjects[pageNum]) {
            state.pageObjects[pageNum] = {
                objects: [],
                selectedIndex: null,
                selectedIndices: []
            };
        }
        // 既存データにselectedIndicesがない場合は追加
        if (!state.pageObjects[pageNum].selectedIndices) {
            state.pageObjects[pageNum].selectedIndices = [];
        }
    }

    // --- 公開API ---
    return {
        /**
         * 現在のページ番号を設定
         */
        setCurrentPage: function(pageNum) {
            state.currentPageNum = pageNum;
            initPageData(pageNum);
            // Storeにも同期
            if (window.MojiQStore) {
                MojiQStore.set('page.currentPageNum', pageNum);
            }
        },

        /**
         * 現在のページ番号を取得
         */
        getCurrentPage: function() {
            return state.currentPageNum;
        },

        /**
         * ページの全オブジェクトを取得
         */
        getPageObjects: function(pageNum) {
            initPageData(pageNum);
            return state.pageObjects[pageNum].objects;
        },

        /**
         * オブジェクトを追加
         */
        addObject: function(pageNum, obj) {
            initPageData(pageNum);

            // オブジェクト数制限チェック（QA対策 #21）
            const limits = window.MojiQConstants?.OBJECT_LIMITS || {};
            const maxObjects = limits.MAX_PER_PAGE || 5000;
            const currentObjects = state.pageObjects[pageNum].objects;

            if (currentObjects.length >= maxObjects) {
                // 非同期でアラート表示（描画処理をブロックしない）
                setTimeout(() => {
                    if (window.MojiQModal) {
                        MojiQModal.showAlert(
                            `このページの描画オブジェクト数が上限(${maxObjects})に達しました。\n新しいオブジェクトを追加するには、不要なオブジェクトを削除してください。`,
                            '制限に達しました'
                        );
                    }
                }, 0);
                return null; // 追加失敗
            }

            // IDが無ければ生成
            if (!obj.id) {
                obj.id = generateId();
            }

            // zIndexが無ければ設定
            if (obj.zIndex === undefined) {
                const objects = state.pageObjects[pageNum].objects;
                obj.zIndex = objects.length > 0
                    ? Math.max(...objects.map(o => o.zIndex || 0)) + 1
                    : 0;
            }

            state.pageObjects[pageNum].objects.push(obj);

            // IDインデックスを更新
            const newIndex = state.pageObjects[pageNum].objects.length - 1;
            addToIndex(pageNum, obj.id, newIndex);

            // Undo用に保存
            this.saveUndoState(pageNum, 'add', obj);

            // ページキャッシュを無効化（描画オブジェクトが変更されたため）
            if (window.MojiQPdfManager && MojiQPdfManager.invalidatePageCache) {
                MojiQPdfManager.invalidatePageCache(pageNum);
            }

            // 変更フラグをセット（上書き保存時のスキップ判定用）
            if (window.MojiQPdfManager && MojiQPdfManager.markAsChanged) {
                MojiQPdfManager.markAsChanged();
            }

            return obj.id;
        },

        /**
         * オブジェクトを更新
         */
        updateObject: function(pageNum, index, newObj) {
            initPageData(pageNum);
            const objects = state.pageObjects[pageNum].objects;

            if (index >= 0 && index < objects.length) {
                const oldObj = MojiQClone.deep(objects[index]);
                objects[index] = { ...objects[index], ...newObj };

                // Undo用に保存
                this.saveUndoState(pageNum, 'update', { old: oldObj, new: objects[index] });

                // ページキャッシュを無効化（描画オブジェクトが変更されたため）
                if (window.MojiQPdfManager && MojiQPdfManager.invalidatePageCache) {
                    MojiQPdfManager.invalidatePageCache(pageNum);
                }

                // 変更フラグをセット（上書き保存時のスキップ判定用）
                if (window.MojiQPdfManager && MojiQPdfManager.markAsChanged) {
                    MojiQPdfManager.markAsChanged();
                }

                return true;
            }
            return false;
        },

        /**
         * IDでオブジェクトを更新
         */
        updateObjectById: function(pageNum, id, newObj) {
            const index = this.findIndexById(pageNum, id);
            if (index >= 0) {
                return this.updateObject(pageNum, index, newObj);
            }
            return false;
        },

        /**
         * オブジェクトを削除
         */
        removeObject: function(pageNum, index) {
            initPageData(pageNum);
            const objects = state.pageObjects[pageNum].objects;

            if (index >= 0 && index < objects.length) {
                const removed = objects.splice(index, 1)[0];

                // IDインデックスを更新（削除されたオブジェクトを削除し、それ以降のインデックスを再構築）
                if (removed.id) {
                    removeFromIndex(pageNum, removed.id);
                }
                // 削除後のインデックスがずれるので再構築
                rebuildPageIndex(pageNum);

                // 選択インデックスを調整（単一選択）
                const selectedIndex = state.pageObjects[pageNum].selectedIndex;
                if (selectedIndex !== null) {
                    if (selectedIndex === index) {
                        state.pageObjects[pageNum].selectedIndex = null;
                    } else if (selectedIndex > index) {
                        state.pageObjects[pageNum].selectedIndex--;
                    }
                }

                // 選択インデックスを調整（複数選択）
                const selectedIndices = state.pageObjects[pageNum].selectedIndices;
                const newIndices = [];
                for (const idx of selectedIndices) {
                    if (idx === index) {
                        // 削除されたインデックスはスキップ
                        continue;
                    } else if (idx > index) {
                        // 削除されたインデックスより後のものは-1
                        newIndices.push(idx - 1);
                    } else {
                        newIndices.push(idx);
                    }
                }
                state.pageObjects[pageNum].selectedIndices = newIndices;

                // Undo用に保存
                this.saveUndoState(pageNum, 'remove', { object: removed, index: index });

                // ページキャッシュを無効化（描画オブジェクトが変更されたため）
                if (window.MojiQPdfManager && MojiQPdfManager.invalidatePageCache) {
                    MojiQPdfManager.invalidatePageCache(pageNum);
                }

                // 変更フラグをセット（上書き保存時のスキップ判定用）
                if (window.MojiQPdfManager && MojiQPdfManager.markAsChanged) {
                    MojiQPdfManager.markAsChanged();
                }

                return removed;
            }
            return null;
        },

        /**
         * IDでオブジェクトを削除
         */
        removeObjectById: function(pageNum, id) {
            const index = this.findIndexById(pageNum, id);
            if (index >= 0) {
                return this.removeObject(pageNum, index);
            }
            return null;
        },

        /**
         * オブジェクトを選択（単一選択）
         */
        selectObject: function(pageNum, index) {
            initPageData(pageNum);
            const objects = state.pageObjects[pageNum].objects;

            if (index >= 0 && index < objects.length) {
                state.pageObjects[pageNum].selectedIndex = index;
                state.pageObjects[pageNum].selectedIndices = [index];
                return true;
            }
            return false;
        },

        /**
         * オブジェクトを選択に追加（複数選択用）
         */
        addToSelection: function(pageNum, index) {
            initPageData(pageNum);
            const objects = state.pageObjects[pageNum].objects;

            if (index >= 0 && index < objects.length) {
                const indices = state.pageObjects[pageNum].selectedIndices;
                if (!indices.includes(index)) {
                    indices.push(index);
                    indices.sort((a, b) => a - b);
                }
                // 単一選択インデックスも更新（最後に追加されたもの）
                state.pageObjects[pageNum].selectedIndex = index;
                return true;
            }
            return false;
        },

        /**
         * オブジェクトを選択から除外（複数選択用）
         */
        removeFromSelection: function(pageNum, index) {
            initPageData(pageNum);
            const indices = state.pageObjects[pageNum].selectedIndices;
            const pos = indices.indexOf(index);
            if (pos >= 0) {
                indices.splice(pos, 1);
                // 単一選択インデックスも更新
                if (indices.length > 0) {
                    state.pageObjects[pageNum].selectedIndex = indices[indices.length - 1];
                } else {
                    state.pageObjects[pageNum].selectedIndex = null;
                }
                return true;
            }
            return false;
        },

        /**
         * オブジェクトが選択されているかチェック
         */
        isSelected: function(pageNum, index) {
            initPageData(pageNum);
            return state.pageObjects[pageNum].selectedIndices.includes(index);
        },

        /**
         * 選択解除
         */
        deselectObject: function(pageNum) {
            initPageData(pageNum);
            state.pageObjects[pageNum].selectedIndex = null;
            state.pageObjects[pageNum].selectedIndices = [];
        },

        /**
         * 選択中のインデックスを取得（単一選択用、後方互換性）
         */
        getSelectedIndex: function(pageNum) {
            initPageData(pageNum);
            return state.pageObjects[pageNum].selectedIndex;
        },

        /**
         * 選択中の全インデックスを取得（複数選択用）
         */
        getSelectedIndices: function(pageNum) {
            initPageData(pageNum);
            return [...state.pageObjects[pageNum].selectedIndices];
        },

        /**
         * 選択中のオブジェクトを取得（単一選択用、後方互換性）
         */
        getSelectedObject: function(pageNum) {
            initPageData(pageNum);
            const selectedIndex = state.pageObjects[pageNum].selectedIndex;

            if (selectedIndex !== null && selectedIndex >= 0) {
                const objects = state.pageObjects[pageNum].objects;
                if (selectedIndex < objects.length) {
                    return objects[selectedIndex];
                }
            }
            return null;
        },

        /**
         * 選択中の全オブジェクトを取得（複数選択用）
         */
        getSelectedObjects: function(pageNum) {
            initPageData(pageNum);
            const objects = state.pageObjects[pageNum].objects;
            const indices = state.pageObjects[pageNum].selectedIndices;
            return indices.map(i => objects[i]).filter(obj => obj !== undefined);
        },

        /**
         * 複数選択されているかどうか
         */
        hasMultipleSelection: function(pageNum) {
            initPageData(pageNum);
            return state.pageObjects[pageNum].selectedIndices.length > 1;
        },

        /**
         * IDでオブジェクトを検索（O(1)）
         */
        findIndexById: function(pageNum, id) {
            initPageData(pageNum);
            // インデックスから検索
            const key = indexKey(pageNum, id);
            if (idIndex.has(key)) {
                return idIndex.get(key);
            }
            // フォールバック：線形検索（インデックスが古い場合）
            const objects = state.pageObjects[pageNum].objects;
            for (let i = 0; i < objects.length; i++) {
                if (objects[i].id === id) {
                    // インデックスを更新
                    addToIndex(pageNum, id, i);
                    return i;
                }
            }
            return -1;
        },

        /**
         * IDでオブジェクトを取得
         */
        getObjectById: function(pageNum, id) {
            const index = this.findIndexById(pageNum, id);
            if (index >= 0) {
                return state.pageObjects[pageNum].objects[index];
            }
            return null;
        },

        /**
         * オブジェクトを移動
         */
        moveObject: function(pageNum, index, dx, dy) {
            initPageData(pageNum);
            const objects = state.pageObjects[pageNum].objects;

            if (index >= 0 && index < objects.length) {
                const obj = objects[index];
                const oldObj = MojiQClone.deep(obj);

                // 座標を移動
                if (obj.startPos) {
                    obj.startPos.x += dx;
                    obj.startPos.y += dy;
                }
                if (obj.endPos) {
                    obj.endPos.x += dx;
                    obj.endPos.y += dy;
                }
                if (obj.points && obj.points.length > 0) {
                    obj.points.forEach(p => {
                        p.x += dx;
                        p.y += dy;
                    });
                }
                if (obj.leaderLine) {
                    if (obj.leaderLine.start) {
                        obj.leaderLine.start.x += dx;
                        obj.leaderLine.start.y += dy;
                    }
                    if (obj.leaderLine.end) {
                        obj.leaderLine.end.x += dx;
                        obj.leaderLine.end.y += dy;
                    }
                }

                return true;
            }
            return false;
        },

        /**
         * 編集中オブジェクトを設定
         */
        setPendingObject: function(obj) {
            state.pendingObject = obj;
        },

        /**
         * 編集中オブジェクトを取得
         */
        getPendingObject: function() {
            return state.pendingObject;
        },

        /**
         * 編集中オブジェクトをクリア
         */
        clearPendingObject: function() {
            state.pendingObject = null;
        },

        /**
         * ページの全オブジェクトをクリア
         */
        clearPageObjects: function(pageNum) {
            initPageData(pageNum);
            const oldObjects = [...state.pageObjects[pageNum].objects];

            state.pageObjects[pageNum] = {
                objects: [],
                selectedIndex: null,
                selectedIndices: []
            };

            // Undo用に保存
            if (oldObjects.length > 0) {
                this.saveUndoState(pageNum, 'clear', { objects: oldObjects });
            }
        },

        /**
         * オブジェクトを前面へ移動
         */
        bringToFront: function(pageNum, index) {
            initPageData(pageNum);
            const objects = state.pageObjects[pageNum].objects;

            if (index >= 0 && index < objects.length) {
                const maxZ = Math.max(...objects.map(o => o.zIndex || 0));
                objects[index].zIndex = maxZ + 1;
                return true;
            }
            return false;
        },

        /**
         * オブジェクトを背面へ移動
         */
        sendToBack: function(pageNum, index) {
            initPageData(pageNum);
            const objects = state.pageObjects[pageNum].objects;

            if (index >= 0 && index < objects.length) {
                const minZ = Math.min(...objects.map(o => o.zIndex || 0));
                objects[index].zIndex = minZ - 1;
                return true;
            }
            return false;
        },

        /**
         * ページデータ全体を取得（シリアライズ用）
         */
        getPageData: function(pageNum) {
            initPageData(pageNum);
            return MojiQClone.deep(state.pageObjects[pageNum]);
        },

        /**
         * ページデータ全体を設定（デシリアライズ用）
         */
        setPageData: function(pageNum, data) {
            state.pageObjects[pageNum] = data
                ? MojiQClone.deep(data)
                : { objects: [], selectedIndex: null };
        },

        // --- Undo/Redo ---

        /**
         * Undo状態を保存
         */
        saveUndoState: function(pageNum, action, data) {
            // QA対策 #41: 処理中は保存しない
            if (state.isUndoRedoProcessing) {
                return;
            }

            // QA対策 #39: データ検証
            if (!action || data === undefined || data === null) {
                console.warn('[MojiQ] saveUndoState: 無効なデータ', { action, data });
                return;
            }

            if (!state.undoStacks[pageNum]) {
                state.undoStacks[pageNum] = [];
            }

            state.undoStacks[pageNum].push({
                action: action,
                data: MojiQClone.deep(data),
                timestamp: Date.now()
            });

            // QA対策 #40: constants.jsからスタックサイズ制限を取得
            const historyLimits = window.MojiQConstants?.HISTORY || {};
            const maxStackSize = historyLimits.MAX_STACK_SIZE || 50;
            if (state.undoStacks[pageNum].length > maxStackSize) {
                state.undoStacks[pageNum].shift();
            }

            // Redoスタックをクリア
            state.redoStacks[pageNum] = [];

            // ヒストリーパネルへ通知
            const objectType = data.type || (data.object && data.object.type) || action;
            window.dispatchEvent(new CustomEvent('mojiq:history-add', {
                detail: {
                    pageNum: pageNum,
                    actionType: action,
                    objectType: objectType,
                    source: 'drawing',
                    timestamp: Date.now()
                }
            }));
        },

        /**
         * Undo実行
         */
        undo: function(pageNum) {
            // QA対策 #38,#41: 処理中は実行しない（連続操作防止）
            if (state.isUndoRedoProcessing) {
                console.warn('[MojiQ] Undo: 処理中のため実行をスキップ');
                return false;
            }

            if (!state.undoStacks[pageNum] || state.undoStacks[pageNum].length === 0) {
                return false;
            }

            // 処理開始
            state.isUndoRedoProcessing = true;

            try {
                initPageData(pageNum);
                const action = state.undoStacks[pageNum].pop();

                // QA対策 #39: アクションデータの検証
                if (!action || !action.action || action.data === undefined) {
                    console.warn('[MojiQ] Undo: 無効なアクションデータ', action);
                    return false;
                }

                const objects = state.pageObjects[pageNum].objects;

                // Redo用に保存
                if (!state.redoStacks[pageNum]) {
                    state.redoStacks[pageNum] = [];
                }
                state.redoStacks[pageNum].push(action);

                // 操作を取り消し
                switch (action.action) {
                    case 'add':
                        // 追加を取り消し → 削除
                        const idx = this.findIndexById(pageNum, action.data.id);
                        if (idx >= 0) {
                            objects.splice(idx, 1);
                        }
                        break;

                    case 'remove':
                        // 削除を取り消し → 復元
                        objects.splice(action.data.index, 0, action.data.object);
                        break;

                    case 'update':
                        // 更新を取り消し → 前の状態に戻す
                        const updateIdx = this.findIndexById(pageNum, action.data.old.id);
                        if (updateIdx >= 0) {
                            objects[updateIdx] = action.data.old;
                        }
                        break;

                    case 'clear':
                        // クリアを取り消し → 復元
                        state.pageObjects[pageNum].objects = action.data.objects;
                        break;
                }

                // idIndexを再構築（undo操作後のインデックス整合性を保証）
                rebuildPageIndex(pageNum);

                // ページキャッシュを無効化（描画オブジェクトが変更されたため）
                if (window.MojiQPdfManager && MojiQPdfManager.invalidatePageCache) {
                    MojiQPdfManager.invalidatePageCache(pageNum);
                }

                // 変更フラグをセット（上書き保存時のスキップ判定用）
                if (window.MojiQPdfManager && MojiQPdfManager.markAsChanged) {
                    MojiQPdfManager.markAsChanged();
                }

                // ヒストリーパネルへ通知
                window.dispatchEvent(new CustomEvent('mojiq:history-undo'));

                return true;
            } finally {
                // QA対策 #38: 処理完了フラグをリセット
                state.isUndoRedoProcessing = false;
            }
        },

        /**
         * Redo実行
         */
        redo: function(pageNum) {
            // QA対策 #38,#41: 処理中は実行しない（連続操作防止）
            if (state.isUndoRedoProcessing) {
                console.warn('[MojiQ] Redo: 処理中のため実行をスキップ');
                return false;
            }

            if (!state.redoStacks[pageNum] || state.redoStacks[pageNum].length === 0) {
                return false;
            }

            // 処理開始
            state.isUndoRedoProcessing = true;

            try {
                initPageData(pageNum);
                const action = state.redoStacks[pageNum].pop();

                // QA対策 #39: アクションデータの検証
                if (!action || !action.action || action.data === undefined) {
                    console.warn('[MojiQ] Redo: 無効なアクションデータ', action);
                    return false;
                }

                const objects = state.pageObjects[pageNum].objects;

                // Undo用に保存（ただしRedoスタックはクリアしない）
                if (!state.undoStacks[pageNum]) {
                    state.undoStacks[pageNum] = [];
                }
                state.undoStacks[pageNum].push(action);

                // 操作を再実行
                switch (action.action) {
                    case 'add':
                        // 追加を再実行
                        objects.push(action.data);
                        break;

                    case 'remove':
                        // 削除を再実行
                        const idx = this.findIndexById(pageNum, action.data.object.id);
                        if (idx >= 0) {
                            objects.splice(idx, 1);
                        }
                        break;

                    case 'update':
                        // 更新を再実行
                        const updateIdx = this.findIndexById(pageNum, action.data.new.id);
                        if (updateIdx >= 0) {
                            objects[updateIdx] = action.data.new;
                        }
                        break;

                    case 'clear':
                        // クリアを再実行
                        state.pageObjects[pageNum].objects = [];
                        state.pageObjects[pageNum].selectedIndex = null;
                        break;
                }

                // idIndexを再構築（redo操作後のインデックス整合性を保証）
                rebuildPageIndex(pageNum);

                // ページキャッシュを無効化（描画オブジェクトが変更されたため）
                if (window.MojiQPdfManager && MojiQPdfManager.invalidatePageCache) {
                    MojiQPdfManager.invalidatePageCache(pageNum);
                }

                // 変更フラグをセット（上書き保存時のスキップ判定用）
                if (window.MojiQPdfManager && MojiQPdfManager.markAsChanged) {
                    MojiQPdfManager.markAsChanged();
                }

                // ヒストリーパネルへ通知
                window.dispatchEvent(new CustomEvent('mojiq:history-redo'));

                return true;
            } finally {
                // QA対策 #38: 処理完了フラグをリセット
                state.isUndoRedoProcessing = false;
            }
        },

        /**
         * Undo可能かどうか
         */
        canUndo: function(pageNum) {
            return state.undoStacks[pageNum] && state.undoStacks[pageNum].length > 0;
        },

        /**
         * Redo可能かどうか
         */
        canRedo: function(pageNum) {
            return state.redoStacks[pageNum] && state.redoStacks[pageNum].length > 0;
        },

        /**
         * Undoスタックをクリア
         */
        clearUndoStack: function(pageNum) {
            state.undoStacks[pageNum] = [];
            state.redoStacks[pageNum] = [];
        },

        /**
         * 全ページのUndo/Redoスタックのみをクリア（オブジェクトは保持）
         */
        clearAllHistory: function() {
            state.undoStacks = {};
            state.redoStacks = {};
            // ヒストリーパネルの全履歴もクリア
            window.dispatchEvent(new CustomEvent('mojiq:history-clear-all'));
        },

        /**
         * 全ページの全オブジェクトをクリア（PDF新規読み込み時用）
         */
        clearAllObjects: function() {
            state.pageObjects = {};
            state.pendingObject = null;
            state.undoStacks = {};
            state.redoStacks = {};

            // ヒストリーパネルの全履歴もクリア
            window.dispatchEvent(new CustomEvent('mojiq:history-clear-all'));
        },

        /**
         * オブジェクトを別のページに移動（見開きモードでのページ跨ぎ用）
         * @param {number} fromPageNum - 移動元ページ番号
         * @param {number} toPageNum - 移動先ページ番号
         * @param {number} index - オブジェクトのインデックス
         * @returns {number|null} 新しいインデックス、失敗時はnull
         */
        moveObjectToPage: function(fromPageNum, toPageNum, index) {
            if (fromPageNum === toPageNum) return index;

            initPageData(fromPageNum);
            initPageData(toPageNum);

            const fromObjects = state.pageObjects[fromPageNum].objects;
            if (index < 0 || index >= fromObjects.length) return null;

            // オブジェクトを取得（選択状態をリセットしてから削除）
            const obj = fromObjects[index];
            const objCopy = MojiQClone.deep(obj);

            // 移動元から削除（Undo用の保存はスキップ）
            fromObjects.splice(index, 1);

            // IDインデックスを更新
            if (obj.id) {
                removeFromIndex(fromPageNum, obj.id);
            }
            rebuildPageIndex(fromPageNum);

            // 移動元の選択状態をクリア
            state.pageObjects[fromPageNum].selectedIndex = null;
            state.pageObjects[fromPageNum].selectedIndices = [];

            // 移動先に追加
            state.pageObjects[toPageNum].objects.push(objCopy);
            const newIndex = state.pageObjects[toPageNum].objects.length - 1;

            // IDインデックスを更新
            if (objCopy.id) {
                addToIndex(toPageNum, objCopy.id, newIndex);
            }

            // 移動先で選択状態にする
            state.pageObjects[toPageNum].selectedIndex = newIndex;
            state.pageObjects[toPageNum].selectedIndices = [newIndex];

            return newIndex;
        },

        // --- デバッグ用 ---

        /**
         * 全状態を取得（デバッグ用）
         */
        getState: function() {
            return MojiQClone.deep(state);
        },

        // --- シリアライズ/デシリアライズ（PDF保存・復元用） ---

        /**
         * 全ページのオブジェクトをシリアライズ可能な形式で取得
         */
        getAllPagesData: function() {
            const result = {};
            for (const pageNum in state.pageObjects) {
                const serialized = this.serializePageObjects(parseInt(pageNum));
                if (serialized.length > 0) {
                    result[pageNum] = serialized;
                }
            }
            return result;
        },

        /**
         * ページのオブジェクトをシリアライズ（画像をBase64化）
         */
        serializePageObjects: function(pageNum) {
            const objects = this.getPageObjects(pageNum);
            return objects.map(obj => this.serializeObject(obj));
        },

        /**
         * 単一オブジェクトをシリアライズ
         */
        serializeObject: function(obj) {
            const serialized = MojiQClone.deep(obj);

            // 画像オブジェクトの場合、HTMLImageElementをBase64に変換（JPEG圧縮でサイズ削減）
            if (obj.type === 'image' && obj.imageData instanceof HTMLImageElement) {
                try {
                    const canvas = document.createElement('canvas');
                    // 画像サイズを制限して圧縮効率を上げる（最大4K相当）
                    const maxSize = 3840;
                    let width = obj.imageData.naturalWidth || obj.imageData.width;
                    let height = obj.imageData.naturalHeight || obj.imageData.height;
                    if (width > maxSize || height > maxSize) {
                        const scale = maxSize / Math.max(width, height);
                        width = Math.round(width * scale);
                        height = Math.round(height * scale);
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    // 白背景を塗ってからJPEG化（透明部分対策）
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(obj.imageData, 0, 0, width, height);
                    serialized.imageDataUrl = canvas.toDataURL('image/jpeg', 0.92);
                    delete serialized.imageData;
                } catch (e) {
                    console.warn('画像のシリアライズに失敗:', e);
                    delete serialized.imageData;
                }
            }

            return serialized;
        },

        /**
         * シリアライズされたデータから全ページを復元
         */
        deserializeAllPagesData: async function(data) {
            for (const pageNum in data) {
                await this.deserializePageObjects(parseInt(pageNum), data[pageNum]);
            }
        },

        /**
         * ページのオブジェクトを復元
         */
        deserializePageObjects: async function(pageNum, objects) {
            initPageData(pageNum);
            const restored = [];

            for (const obj of objects) {
                const restoredObj = await this.deserializeObject(obj);
                restored.push(restoredObj);
            }

            state.pageObjects[pageNum].objects = restored;
            state.pageObjects[pageNum].selectedIndex = null;
        },

        /**
         * 単一オブジェクトを復元（画像はBase64からHTMLImageElementに）
         */
        deserializeObject: function(obj) {
            return new Promise((resolve) => {
                if (obj.type === 'image' && obj.imageDataUrl) {
                    const img = new Image();
                    img.onload = () => {
                        obj.imageData = img;
                        delete obj.imageDataUrl;
                        resolve(obj);
                    };
                    img.onerror = () => {
                        console.warn('画像の復元に失敗:', obj.id);
                        resolve(obj);
                    };
                    img.src = obj.imageDataUrl;
                } else {
                    resolve(obj);
                }
            });
        },

        /**
         * ページ挿入時にページ番号をシフト
         * @param {number} insertIndex - 挿入位置（0始まり）
         * @param {number} count - 挿入するページ数（デフォルト: 1）
         */
        shiftPageNumbersAfterInsert: function(insertIndex, count) {
            count = count || 1;
            const insertPageNum = insertIndex + 1;
            const newPageObjects = {};
            const newUndoStacks = {};
            const newRedoStacks = {};

            for (const pageNumStr in state.pageObjects) {
                const pageNum = parseInt(pageNumStr);
                if (pageNum >= insertPageNum) {
                    // 挿入位置以降のページは番号を+count
                    newPageObjects[pageNum + count] = state.pageObjects[pageNum];
                    if (state.undoStacks[pageNum]) {
                        newUndoStacks[pageNum + count] = state.undoStacks[pageNum];
                    }
                    if (state.redoStacks[pageNum]) {
                        newRedoStacks[pageNum + count] = state.redoStacks[pageNum];
                    }
                } else {
                    // 挿入位置より前のページはそのまま
                    newPageObjects[pageNum] = state.pageObjects[pageNum];
                    if (state.undoStacks[pageNum]) {
                        newUndoStacks[pageNum] = state.undoStacks[pageNum];
                    }
                    if (state.redoStacks[pageNum]) {
                        newRedoStacks[pageNum] = state.redoStacks[pageNum];
                    }
                }
            }

            state.pageObjects = newPageObjects;
            state.undoStacks = newUndoStacks;
            state.redoStacks = newRedoStacks;

            // 新しく挿入されたページのデータを初期化
            for (let i = 0; i < count; i++) {
                const newPageNum = insertPageNum + i;
                if (!state.pageObjects[newPageNum]) {
                    state.pageObjects[newPageNum] = {
                        objects: [],
                        selectedIndex: null
                    };
                }
                if (!state.undoStacks[newPageNum]) {
                    state.undoStacks[newPageNum] = [];
                }
                if (!state.redoStacks[newPageNum]) {
                    state.redoStacks[newPageNum] = [];
                }
            }
        },

        /**
         * ページ削除時にページ番号をシフト
         * @param {number} deleteIndex - 削除位置（0始まり）
         */
        shiftPageNumbersAfterDelete: function(deleteIndex) {
            const deletePageNum = deleteIndex + 1;
            const newPageObjects = {};
            const newUndoStacks = {};
            const newRedoStacks = {};

            for (const pageNumStr in state.pageObjects) {
                const pageNum = parseInt(pageNumStr);
                if (pageNum === deletePageNum) {
                    // 削除されるページはスキップ
                    continue;
                } else if (pageNum > deletePageNum) {
                    // 削除位置より後のページは番号を-1
                    newPageObjects[pageNum - 1] = state.pageObjects[pageNum];
                    if (state.undoStacks[pageNum]) {
                        newUndoStacks[pageNum - 1] = state.undoStacks[pageNum];
                    }
                    if (state.redoStacks[pageNum]) {
                        newRedoStacks[pageNum - 1] = state.redoStacks[pageNum];
                    }
                } else {
                    // 削除位置より前のページはそのまま
                    newPageObjects[pageNum] = state.pageObjects[pageNum];
                    if (state.undoStacks[pageNum]) {
                        newUndoStacks[pageNum] = state.undoStacks[pageNum];
                    }
                    if (state.redoStacks[pageNum]) {
                        newRedoStacks[pageNum] = state.redoStacks[pageNum];
                    }
                }
            }

            state.pageObjects = newPageObjects;
            state.undoStacks = newUndoStacks;
            state.redoStacks = newRedoStacks;
        },

        /**
         * いずれかのページに描画オブジェクトがあるかチェック
         * @returns {boolean} 描画データがあればtrue
         */
        hasAnyObjects: function() {
            for (const pageNumStr in state.pageObjects) {
                const pageData = state.pageObjects[pageNumStr];
                if (pageData && pageData.objects && pageData.objects.length > 0) {
                    return true;
                }
            }
            return false;
        },

        /**
         * ページの描画オブジェクトをページサイズ内にクリップ
         * 見開きモードから単ページモードに戻る際に使用
         * @param {number} pageNum - ページ番号
         * @param {number} pageWidth - ページの幅
         * @param {number} pageHeight - ページの高さ
         */
        clipObjectsToPageBounds: function(pageNum, pageWidth, pageHeight) {
            initPageData(pageNum);
            const objects = state.pageObjects[pageNum].objects;
            const objectsToRemove = [];

            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];
                let shouldRemove = false;

                // オブジェクトのタイプに応じてクリップ処理
                switch (obj.type) {
                    case 'pen':
                    case 'marker':
                    case 'eraser':
                        // ストロークの場合：ページ外のポイントをクリップ
                        if (obj.points && obj.points.length > 0) {
                            const clippedPoints = [];
                            for (const pt of obj.points) {
                                // ページ内のポイントのみ保持（少し余裕を持たせる）
                                if (pt.x >= -10 && pt.x <= pageWidth + 10 &&
                                    pt.y >= -10 && pt.y <= pageHeight + 10) {
                                    clippedPoints.push({
                                        x: Math.max(0, Math.min(pageWidth, pt.x)),
                                        y: Math.max(0, Math.min(pageHeight, pt.y))
                                    });
                                }
                            }
                            if (clippedPoints.length < 2) {
                                // ポイントが1つ以下になったらオブジェクトを削除
                                shouldRemove = true;
                            } else {
                                obj.points = clippedPoints;
                            }
                        }
                        break;

                    case 'rect':
                    case 'ellipse':
                    case 'labeledRect':
                        // 図形：開始点と終了点の両方がページ外なら削除、一部はクリップ
                        if (obj.startPos && obj.endPos) {
                            // 完全にページ外なら削除
                            if ((obj.startPos.x < -50 && obj.endPos.x < -50) ||
                                (obj.startPos.x > pageWidth + 50 && obj.endPos.x > pageWidth + 50) ||
                                (obj.startPos.y < -50 && obj.endPos.y < -50) ||
                                (obj.startPos.y > pageHeight + 50 && obj.endPos.y > pageHeight + 50)) {
                                shouldRemove = true;
                            } else {
                                // ページ内にクリップ
                                obj.startPos.x = Math.max(0, Math.min(pageWidth, obj.startPos.x));
                                obj.startPos.y = Math.max(0, Math.min(pageHeight, obj.startPos.y));
                                obj.endPos.x = Math.max(0, Math.min(pageWidth, obj.endPos.x));
                                obj.endPos.y = Math.max(0, Math.min(pageHeight, obj.endPos.y));
                            }
                        }
                        break;

                    case 'line':
                    case 'chevron':
                    case 'lshape':
                    case 'zshape':
                    case 'bracket':
                    case 'polyline':
                        // 線系：開始点と終了点の処理
                        if (obj.startPos && obj.endPos) {
                            // 両方がページ外なら削除
                            const startOutside = obj.startPos.x < -50 || obj.startPos.x > pageWidth + 50 ||
                                                 obj.startPos.y < -50 || obj.startPos.y > pageHeight + 50;
                            const endOutside = obj.endPos.x < -50 || obj.endPos.x > pageWidth + 50 ||
                                               obj.endPos.y < -50 || obj.endPos.y > pageHeight + 50;
                            if (startOutside && endOutside) {
                                shouldRemove = true;
                            } else {
                                // ページ内にクリップ
                                obj.startPos.x = Math.max(0, Math.min(pageWidth, obj.startPos.x));
                                obj.startPos.y = Math.max(0, Math.min(pageHeight, obj.startPos.y));
                                obj.endPos.x = Math.max(0, Math.min(pageWidth, obj.endPos.x));
                                obj.endPos.y = Math.max(0, Math.min(pageHeight, obj.endPos.y));
                            }
                        }
                        // polylineの場合はpointsもクリップ
                        if (obj.type === 'polyline' && obj.points) {
                            obj.points = obj.points.map(pt => ({
                                x: Math.max(0, Math.min(pageWidth, pt.x)),
                                y: Math.max(0, Math.min(pageHeight, pt.y))
                            }));
                        }
                        break;

                    case 'text':
                    case 'fontLabel':
                        // テキスト：位置がページ外なら削除
                        if (obj.startPos) {
                            if (obj.startPos.x < -50 || obj.startPos.x > pageWidth + 50 ||
                                obj.startPos.y < -50 || obj.startPos.y > pageHeight + 50) {
                                shouldRemove = true;
                            } else {
                                obj.startPos.x = Math.max(0, Math.min(pageWidth, obj.startPos.x));
                                obj.startPos.y = Math.max(0, Math.min(pageHeight, obj.startPos.y));
                            }
                        }
                        break;

                    case 'image':
                        // 画像：位置がページ外なら削除
                        if (obj.x !== undefined && obj.y !== undefined) {
                            if (obj.x < -obj.width - 50 || obj.x > pageWidth + 50 ||
                                obj.y < -obj.height - 50 || obj.y > pageHeight + 50) {
                                shouldRemove = true;
                            }
                        }
                        break;

                    default:
                        // スタンプ類など：startPosがある場合はチェック
                        if (obj.startPos) {
                            if (obj.startPos.x < -50 || obj.startPos.x > pageWidth + 50 ||
                                obj.startPos.y < -50 || obj.startPos.y > pageHeight + 50) {
                                shouldRemove = true;
                            }
                        }
                        break;
                }

                if (shouldRemove) {
                    objectsToRemove.push(i);
                }
            }

            // 後ろから削除（インデックスがずれないように）
            for (let i = objectsToRemove.length - 1; i >= 0; i--) {
                const idx = objectsToRemove[i];
                const removedObj = objects.splice(idx, 1)[0];
                if (removedObj && removedObj.id) {
                    removeFromIndex(pageNum, removedObj.id);
                }
            }

            // インデックスを再構築
            if (objectsToRemove.length > 0) {
                rebuildPageIndex(pageNum);
            }
        },

        /**
         * 見開きモード用：左右のページオブジェクトを見開きページに統合
         * @param {string} spreadKey - 見開きページキー（例：'spread_0'）
         * @param {number} leftPageNum - 左ページ番号（nullの場合は白紙）
         * @param {number} rightPageNum - 右ページ番号（nullの場合は白紙）
         * @param {number} rightOffset - 右ページのX座標オフセット（見開き座標系）
         * @param {Object} scaleInfo - スケール情報（省略時はスケーリングなし）
         * @param {number} scaleInfo.leftScaleX - 左ページのX方向スケール
         * @param {number} scaleInfo.leftScaleY - 左ページのY方向スケール
         * @param {number} scaleInfo.rightScaleX - 右ページのX方向スケール
         * @param {number} scaleInfo.rightScaleY - 右ページのY方向スケール
         */
        mergeToSpreadPage: function(spreadKey, leftPageNum, rightPageNum, rightOffset, scaleInfo) {
            initPageData(spreadKey);
            state.pageObjects[spreadKey].objects = [];

            // 左ページのオブジェクトを追加
            if (leftPageNum !== null) {
                const leftObjects = this.getPageObjects(leftPageNum);
                for (const obj of leftObjects) {
                    const clonedObj = MojiQClone.deep(obj);
                    // 元のページ番号を保持（解除時に戻すため）
                    clonedObj._originalPageNum = leftPageNum;
                    clonedObj._isLeftPage = true;
                    // スケーリングを適用
                    if (scaleInfo && (scaleInfo.leftScaleX !== 1 || scaleInfo.leftScaleY !== 1)) {
                        this._scaleObject(clonedObj, scaleInfo.leftScaleX, scaleInfo.leftScaleY);
                    }
                    state.pageObjects[spreadKey].objects.push(clonedObj);
                }
            }

            // 右ページのオブジェクトを追加（スケーリング後にX座標にrightOffsetを加算）
            if (rightPageNum !== null) {
                const rightObjects = this.getPageObjects(rightPageNum);
                for (const obj of rightObjects) {
                    const clonedObj = MojiQClone.deep(obj);
                    // 元のページ番号を保持
                    clonedObj._originalPageNum = rightPageNum;
                    clonedObj._isLeftPage = false;
                    // スケーリングを適用
                    if (scaleInfo && (scaleInfo.rightScaleX !== 1 || scaleInfo.rightScaleY !== 1)) {
                        this._scaleObject(clonedObj, scaleInfo.rightScaleX, scaleInfo.rightScaleY);
                    }
                    // X座標をオフセット（スケーリング後に適用）
                    this._offsetObjectX(clonedObj, rightOffset);
                    state.pageObjects[spreadKey].objects.push(clonedObj);
                }
            }
        },

        /**
         * 見開きモード解除用：見開きページのオブジェクトを左右のページに分割
         * @param {string} spreadKey - 見開きページキー
         * @param {number} leftPageNum - 左ページ番号
         * @param {number} rightPageNum - 右ページ番号
         * @param {number} rightOffset - 右ページのX座標オフセット（見開き座標系）
         * @param {number} pageWidth - 1ページの幅（左右判定用、見開き座標系）
         * @param {Object} scaleInfo - スケール情報（省略時はスケーリングなし）
         * @param {number} scaleInfo.leftScaleX - 左ページのX方向スケール（見開き→単ページ）
         * @param {number} scaleInfo.leftScaleY - 左ページのY方向スケール（見開き→単ページ）
         * @param {number} scaleInfo.rightScaleX - 右ページのX方向スケール（見開き→単ページ）
         * @param {number} scaleInfo.rightScaleY - 右ページのY方向スケール（見開き→単ページ）
         */
        splitFromSpreadPage: function(spreadKey, leftPageNum, rightPageNum, rightOffset, pageWidth, scaleInfo) {
            const spreadObjects = this.getPageObjects(spreadKey);
            if (!spreadObjects || spreadObjects.length === 0) return;

            // 左右ページを初期化
            if (leftPageNum !== null) {
                initPageData(leftPageNum);
                state.pageObjects[leftPageNum].objects = [];
            }
            if (rightPageNum !== null) {
                initPageData(rightPageNum);
                state.pageObjects[rightPageNum].objects = [];
            }

            // オブジェクトを左右に振り分け
            for (const obj of spreadObjects) {
                const clonedObj = MojiQClone.deep(obj);

                // オブジェクトの中心X座標を計算
                let centerX = 0;
                if (obj.startPos && obj.endPos) {
                    centerX = (obj.startPos.x + obj.endPos.x) / 2;
                } else if (obj.startPos) {
                    centerX = obj.startPos.x;
                } else if (obj.points && obj.points.length > 0) {
                    const sumX = obj.points.reduce((sum, p) => sum + p.x, 0);
                    centerX = sumX / obj.points.length;
                }

                // 左右判定（ページ幅の中央で分割）
                const isLeftPage = centerX < pageWidth;

                // 一時プロパティを削除
                delete clonedObj._originalPageNum;
                delete clonedObj._isLeftPage;

                if (isLeftPage && leftPageNum !== null) {
                    // 左ページに追加
                    // スケーリングを適用（見開き座標系→単ページ座標系）
                    if (scaleInfo && (scaleInfo.leftScaleX !== 1 || scaleInfo.leftScaleY !== 1)) {
                        this._scaleObject(clonedObj, scaleInfo.leftScaleX, scaleInfo.leftScaleY);
                    }
                    state.pageObjects[leftPageNum].objects.push(clonedObj);
                } else if (!isLeftPage && rightPageNum !== null) {
                    // 右ページに追加（X座標からrightOffsetを引いてからスケーリング）
                    this._offsetObjectX(clonedObj, -rightOffset);
                    // スケーリングを適用（見開き座標系→単ページ座標系）
                    if (scaleInfo && (scaleInfo.rightScaleX !== 1 || scaleInfo.rightScaleY !== 1)) {
                        this._scaleObject(clonedObj, scaleInfo.rightScaleX, scaleInfo.rightScaleY);
                    }
                    state.pageObjects[rightPageNum].objects.push(clonedObj);
                }
            }

            // 見開きページのオブジェクトをクリア
            state.pageObjects[spreadKey].objects = [];
        },

        /**
         * 内部関数：オブジェクトのX座標をオフセット
         */
        _offsetObjectX: function(obj, offsetX) {
            if (obj.startPos) {
                obj.startPos.x += offsetX;
            }
            if (obj.endPos) {
                obj.endPos.x += offsetX;
            }
            if (obj.points) {
                obj.points = obj.points.map(p => ({ x: p.x + offsetX, y: p.y }));
            }
            if (obj.annotation) {
                obj.annotation.x += offsetX;
                if (obj.annotation.leaderLine) {
                    obj.annotation.leaderLine.start.x += offsetX;
                    obj.annotation.leaderLine.end.x += offsetX;
                }
            }
            if (obj.leaderLine) {
                obj.leaderLine.start.x += offsetX;
                obj.leaderLine.end.x += offsetX;
            }
            if (obj.textX !== undefined) {
                obj.textX += offsetX;
            }
        },

        /**
         * 内部関数：オブジェクトの座標をスケーリング
         * @param {Object} obj - オブジェクト
         * @param {number} scaleX - X方向スケール
         * @param {number} scaleY - Y方向スケール
         */
        _scaleObject: function(obj, scaleX, scaleY) {
            if (obj.startPos) {
                obj.startPos.x *= scaleX;
                obj.startPos.y *= scaleY;
            }
            if (obj.endPos) {
                obj.endPos.x *= scaleX;
                obj.endPos.y *= scaleY;
            }
            if (obj.points) {
                obj.points = obj.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
            }
            if (obj.annotation) {
                obj.annotation.x *= scaleX;
                obj.annotation.y *= scaleY;
                if (obj.annotation.leaderLine) {
                    obj.annotation.leaderLine.start.x *= scaleX;
                    obj.annotation.leaderLine.start.y *= scaleY;
                    obj.annotation.leaderLine.end.x *= scaleX;
                    obj.annotation.leaderLine.end.y *= scaleY;
                }
            }
            if (obj.leaderLine) {
                obj.leaderLine.start.x *= scaleX;
                obj.leaderLine.start.y *= scaleY;
                obj.leaderLine.end.x *= scaleX;
                obj.leaderLine.end.y *= scaleY;
            }
            if (obj.textX !== undefined) {
                obj.textX *= scaleX;
            }
            if (obj.textY !== undefined) {
                obj.textY *= scaleY;
            }
            // 線幅もスケーリング
            if (obj.lineWidth !== undefined) {
                obj.lineWidth *= Math.min(scaleX, scaleY);
            }
            // フォントサイズもスケーリング
            if (obj.fontSize !== undefined) {
                obj.fontSize *= Math.min(scaleX, scaleY);
            }
            // スタンプのサイズもスケーリング
            if (obj.size !== undefined) {
                obj.size *= Math.min(scaleX, scaleY);
            }
            // アノテーションのフォントサイズもスケーリング
            if (obj.annotation && obj.annotation.fontSize !== undefined) {
                obj.annotation.fontSize *= Math.min(scaleX, scaleY);
            }
        },

        /**
         * 見開きモード用ページキーを生成
         * @param {number} spreadIndex - 見開きインデックス
         * @returns {string} 見開きページキー
         */
        getSpreadPageKey: function(spreadIndex) {
            return 'spread_' + spreadIndex;
        },

        /**
         * キーが見開きページキーかどうかを判定
         * @param {string|number} key - ページキー
         * @returns {boolean}
         */
        isSpreadPageKey: function(key) {
            return typeof key === 'string' && key.startsWith('spread_');
        },

        /**
         * 全ての見開きページデータをクリア
         */
        clearAllSpreadPages: function() {
            const keysToDelete = [];
            for (const key in state.pageObjects) {
                if (this.isSpreadPageKey(key)) {
                    keysToDelete.push(key);
                }
            }
            for (const key of keysToDelete) {
                delete state.pageObjects[key];
                delete state.undoStacks[key];
                delete state.redoStacks[key];
            }
        },

        // --- プロジェクトメタデータ（回転状態など） ---

        /**
         * プロジェクトメタデータを取得（保存用）
         * @returns {Object} メタデータオブジェクト
         */
        getProjectMetadata: function() {
            return {};
        },

        /**
         * プロジェクトメタデータを設定（読込用）
         * @param {Object} metadata - メタデータオブジェクト
         */
        setProjectMetadata: function(metadata) {
            // 現在は追加のメタデータ処理なし
        }
    };
})();
