/**
 * MojiQ DOM Cache - DOM要素参照の一元管理
 * キャンバスや重要なDOM要素への参照をキャッシュして一元管理する
 */
window.MojiQDOMCache = (function() {
    'use strict';

    // キャッシュされたDOM要素
    const cache = {
        // キャンバス要素
        mojiqCanvas: null,
        bgCanvas: null,
        simCanvas: null,
        canvasWrapper: null,
        canvasArea: null,

        // キャンバスコンテキスト
        ctx: null,
        simCtx: null,

        // デバイスピクセル比
        dpr: null
    };

    // 初期化済みフラグ
    let initialized = false;

    /**
     * DOM Cacheを初期化
     * @returns {boolean} 初期化成功かどうか
     */
    function init() {
        if (initialized) return true;

        // キャンバス要素を取得
        cache.mojiqCanvas = document.getElementById('whiteboard');
        cache.bgCanvas = document.getElementById('layer-pdf-bg');
        cache.simCanvas = document.getElementById('sim-whiteboard');
        cache.canvasWrapper = document.getElementById('canvas-wrapper');
        cache.canvasArea = document.getElementById('sharedCanvasArea');

        // 必須要素の確認
        if (!cache.mojiqCanvas || !cache.bgCanvas || !cache.canvasWrapper) {
            console.error('MojiQDOMCache: Required canvas elements not found');
            return false;
        }

        // コンテキストを取得
        cache.ctx = cache.mojiqCanvas.getContext('2d');
        cache.simCtx = cache.simCanvas ? cache.simCanvas.getContext('2d') : null;

        // デバイスピクセル比を計算
        cache.dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));

        initialized = true;
        return true;
    }

    /**
     * キャッシュされた値を取得
     * @param {string} key - キャッシュキー
     * @returns {*} キャッシュされた値
     */
    function get(key) {
        if (!initialized) {
            console.warn('MojiQDOMCache: Not initialized. Call init() first.');
            return null;
        }
        return cache[key];
    }

    /**
     * 複数のキャッシュされた値を取得
     * @param {string[]} keys - キャッシュキーの配列
     * @returns {object} キーと値のオブジェクト
     */
    function getMultiple(keys) {
        if (!initialized) {
            console.warn('MojiQDOMCache: Not initialized. Call init() first.');
            return {};
        }
        const result = {};
        keys.forEach(key => {
            result[key] = cache[key];
        });
        return result;
    }

    /**
     * すべてのキャンバス関連要素を取得
     * @returns {object} キャンバス関連要素
     */
    function getCanvasElements() {
        return getMultiple(['mojiqCanvas', 'bgCanvas', 'simCanvas', 'canvasWrapper', 'canvasArea', 'ctx', 'simCtx', 'dpr']);
    }

    /**
     * 初期化済みかどうか
     * @returns {boolean}
     */
    function isInitialized() {
        return initialized;
    }

    return {
        init,
        get,
        getMultiple,
        getCanvasElements,
        isInitialized
    };
})();
