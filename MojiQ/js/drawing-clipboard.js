/**
 * MojiQ Drawing Clipboard - クリップボードモジュール
 * カット/コピー/ペースト操作を担当
 */
window.MojiQDrawingClipboard = (function() {
    'use strict';

    // 依存モジュール
    let DrawingObjects = null;

    // コールバック
    let redrawCallback = null;
    let resetStateCallback = null;

    // クリップボード（カット/コピー/ペースト用）
    let clipboard = {
        objects: [],       // コピー/カットされたオブジェクト
        isCut: false,      // カット操作かどうか
        sourcePageNum: null // コピー元のページ番号
    };

    /**
     * 初期化
     * @param {object} deps - 依存関係
     * @param {object} deps.DrawingObjects - 描画オブジェクト管理モジュール
     * @param {function} deps.redrawCallback - 再描画コールバック
     * @param {function} deps.resetStateCallback - 状態リセットコールバック
     */
    function init(deps) {
        DrawingObjects = deps.DrawingObjects;
        redrawCallback = deps.redrawCallback;
        resetStateCallback = deps.resetStateCallback;
    }

    /**
     * オブジェクトの座標をオフセットする
     * @param {object} obj - オブジェクト
     * @param {number} dx - X方向のオフセット
     * @param {number} dy - Y方向のオフセット
     */
    function applyOffsetToObject(obj, dx, dy) {
        if (obj.startPos) {
            obj.startPos.x += dx;
            obj.startPos.y += dy;
        }
        if (obj.endPos) {
            obj.endPos.x += dx;
            obj.endPos.y += dy;
        }
        if (obj.points) {
            obj.points = obj.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        }
        if (obj.annotation) {
            obj.annotation.x += dx;
            obj.annotation.y += dy;
            if (obj.annotation.leaderLine) {
                obj.annotation.leaderLine.start.x += dx;
                obj.annotation.leaderLine.start.y += dy;
                obj.annotation.leaderLine.end.x += dx;
                obj.annotation.leaderLine.end.y += dy;
            }
        }
        if (obj.leaderLine) {
            obj.leaderLine.start.x += dx;
            obj.leaderLine.start.y += dy;
            obj.leaderLine.end.x += dx;
            obj.leaderLine.end.y += dy;
        }
        if (obj.textX !== undefined) {
            obj.textX += dx;
        }
        if (obj.textY !== undefined) {
            obj.textY += dy;
        }
    }

    /**
     * 選択中のオブジェクトをカット（クリップボードにコピーして削除）
     * @returns {boolean} カットに成功したかどうか
     */
    function cutSelected() {
        if (!DrawingObjects) return false;

        const pageNum = DrawingObjects.getCurrentPage();
        const selectedIndices = DrawingObjects.getSelectedIndices(pageNum);

        if (selectedIndices.length === 0) {
            return false;
        }

        // 選択されたオブジェクトをクリップボードにコピー
        const objects = DrawingObjects.getPageObjects(pageNum);
        clipboard.objects = [];
        clipboard.isCut = true;
        clipboard.sourcePageNum = pageNum;

        // 選択されたオブジェクトのIDを収集
        const selectedIds = new Set();
        for (const idx of selectedIndices) {
            if (objects[idx] && objects[idx].id) {
                selectedIds.add(objects[idx].id);
            }
        }

        // 選択されたオブジェクトに関連する消しゴムオブジェクトのインデックスを収集
        const relatedEraserIndices = new Set();
        objects.forEach((obj, idx) => {
            if (obj.type === 'eraser' && obj.linkedObjectIds) {
                // この消しゴムが選択されたオブジェクトに関連しているかチェック
                const hasRelatedObject = obj.linkedObjectIds.some(id => selectedIds.has(id));
                if (hasRelatedObject) {
                    relatedEraserIndices.add(idx);
                }
            }
        });

        // インデックス順にコピー（後で削除時にずれないよう逆順で削除するため）
        const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
        const selectedIndicesSet = new Set(selectedIndices);
        for (const idx of sortedIndices) {
            clipboard.objects.push(MojiQClone.deep(objects[idx]));
        }

        // 関連する消しゴムオブジェクトもコピー（選択オブジェクトと一緒に）
        for (const idx of relatedEraserIndices) {
            if (!selectedIndicesSet.has(idx)) {
                clipboard.objects.push(MojiQClone.deep(objects[idx]));
            }
        }

        // 削除対象のインデックスをマージ
        const allIndicesToDelete = new Set([...selectedIndices, ...relatedEraserIndices]);

        // 選択されたオブジェクトと関連消しゴムを削除（逆順で削除してインデックスずれを防ぐ）
        const reverseIndices = [...allIndicesToDelete].sort((a, b) => b - a);
        for (const idx of reverseIndices) {
            DrawingObjects.removeObject(pageNum, idx);
        }

        // 選択状態をクリア
        DrawingObjects.deselectObject(pageNum);
        if (resetStateCallback) resetStateCallback();

        if (redrawCallback) redrawCallback(true);
        return true;
    }

    /**
     * クリップボードの内容をペースト
     * @returns {boolean} ペーストに成功したかどうか
     */
    function pasteFromClipboard() {
        if (!DrawingObjects) return false;

        if (clipboard.objects.length === 0) {
            return false;
        }

        const pageNum = DrawingObjects.getCurrentPage();

        // 選択解除
        DrawingObjects.deselectObject(pageNum);

        // ペースト位置のオフセット（同じ位置に重ならないよう少しずらす）
        const offset = clipboard.isCut ? 0 : 20;

        const newIndices = [];
        // 元のIDと新しいIDのマッピング（消しゴムのlinkedObjectIds更新用）
        const idMapping = {};

        for (const obj of clipboard.objects) {
            // オブジェクトを深くコピー
            const newObj = MojiQClone.deep(obj);

            // 元のIDを保存
            const oldId = newObj.id;

            // 新しいIDを生成（重複を避けるため）
            delete newObj.id;

            // ペースト位置をオフセット（コピーの場合のみ）
            if (offset !== 0) {
                applyOffsetToObject(newObj, offset, offset);
            }

            // オブジェクトを追加
            const newId = DrawingObjects.addObject(pageNum, newObj);

            // IDマッピングを記録
            if (oldId) {
                idMapping[oldId] = newId;
            }

            const newIndex = DrawingObjects.findIndexById(pageNum, newId);
            if (newIndex >= 0) {
                newIndices.push(newIndex);
            }
        }

        // 消しゴムオブジェクトのlinkedObjectIdsを新しいIDに更新
        const objects = DrawingObjects.getPageObjects(pageNum);
        for (const index of newIndices) {
            const obj = objects[index];
            if (obj && obj.type === 'eraser' && obj.linkedObjectIds) {
                obj.linkedObjectIds = obj.linkedObjectIds.map(oldId => {
                    return idMapping[oldId] || oldId;
                });
            }
        }

        // ペーストしたオブジェクトを選択状態にする
        if (newIndices.length > 0) {
            DrawingObjects.selectObject(pageNum, newIndices[0]);
            for (let i = 1; i < newIndices.length; i++) {
                DrawingObjects.addToSelection(pageNum, newIndices[i]);
            }
        }

        // カットの場合はクリップボードをクリア（1回だけペースト可能）
        if (clipboard.isCut) {
            clipboard.objects = [];
            clipboard.isCut = false;
            clipboard.sourcePageNum = null;
        }

        if (redrawCallback) redrawCallback(true);
        return true;
    }

    /**
     * クリップボードにオブジェクトがあるかどうか
     * @returns {boolean}
     */
    function hasClipboard() {
        return clipboard.objects.length > 0;
    }

    // --- 公開API ---
    return {
        init: init,
        cutSelected: cutSelected,
        pasteFromClipboard: pasteFromClipboard,
        hasClipboard: hasClipboard,
        applyOffsetToObject: applyOffsetToObject
    };
})();
