/* js/pdf/pdf-cache.js - ページレンダリングLRUキャッシュ */

/**
 * LRUキャッシュ（ページレンダリング結果保持用）
 * キーはキャッシュキー文字列、値は { bitmap, width, height, displayWidth, displayHeight }
 */
window._MojiQPdfCache = (function() {
    'use strict';

    function PageRenderLRUCache(maxSize) {
        this._maxSize = maxSize;
        this._map = new Map();
    }

    /**
     * キャッシュキー生成
     * @param {number} pageNum - ページ番号
     * @param {number} containerWidth - コンテナ幅
     * @param {number} containerHeight - コンテナ高さ
     * @param {number} dprValue - デバイスピクセル比
     * @returns {string}
     */
    PageRenderLRUCache.makeKey = function(pageNum, containerWidth, containerHeight, dprValue) {
        return pageNum + '_' + containerWidth + '_' + containerHeight + '_' + dprValue;
    };

    /**
     * キャッシュ取得（アクセス時にLRU順序を更新）
     * @param {string} key
     * @returns {object|null}
     */
    PageRenderLRUCache.prototype.get = function(key) {
        if (!this._map.has(key)) return null;
        var value = this._map.get(key);
        // LRU更新: 削除して再追加（Mapの末尾が最新）
        this._map.delete(key);
        this._map.set(key, value);
        return value;
    };

    /**
     * キャッシュ保存（容量超過時は最古エントリを削除）
     * @param {string} key
     * @param {object} value
     */
    PageRenderLRUCache.prototype.set = function(key, value) {
        if (this._map.has(key)) {
            this._map.delete(key);
        }
        this._map.set(key, value);
        // 容量超過時にLRU（先頭）を削除
        while (this._map.size > this._maxSize) {
            var oldestKey = this._map.keys().next().value;
            var oldest = this._map.get(oldestKey);
            if (oldest && oldest.bitmap && typeof oldest.bitmap.close === 'function') {
                oldest.bitmap.close();
            }
            this._map.delete(oldestKey);
        }
    };

    /**
     * 全キャッシュクリア（メモリ解放付き）
     */
    PageRenderLRUCache.prototype.clear = function() {
        for (var entry of this._map.values()) {
            if (entry && entry.bitmap && typeof entry.bitmap.close === 'function') {
                entry.bitmap.close();
            }
        }
        this._map.clear();
    };

    Object.defineProperty(PageRenderLRUCache.prototype, 'size', {
        get: function() {
            return this._map.size;
        }
    });

    return {
        PageRenderLRUCache: PageRenderLRUCache
    };
})();
