/**
 * MojiQ Utils - ユーティリティ関数モジュール
 * 共通ヘルパー関数を一元管理
 */
window.MojiQUtils = (function() {
    'use strict';

    // ========================================
    // 関数ユーティリティ
    // ========================================

    /**
     * デバウンス関数
     * @param {Function} func - 実行する関数
     * @param {number} delay - 遅延時間(ms)
     * @returns {Function}
     */
    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    /**
     * スロットル関数
     * @param {Function} func - 実行する関数
     * @param {number} limit - 実行間隔(ms)
     * @returns {Function}
     */
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // ========================================
    // イベント座標ユーティリティ
    // ========================================

    /**
     * マウス/タッチイベントからクライアント座標を取得
     * @param {MouseEvent|TouchEvent} e - イベントオブジェクト
     * @param {string} [type='client'] - 座標タイプ ('client' | 'page' | 'screen')
     * @returns {{x: number, y: number}} 座標
     */
    function getEventCoordinates(e, type = 'client') {
        const xKey = type + 'X';
        const yKey = type + 'Y';

        // マウスイベントの場合
        if (e[xKey] !== undefined) {
            return { x: e[xKey], y: e[yKey] };
        }

        // タッチイベントの場合
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0][xKey], y: e.touches[0][yKey] };
        }

        // touchendの場合 changedTouchesを使用
        if (e.changedTouches && e.changedTouches.length > 0) {
            return { x: e.changedTouches[0][xKey], y: e.changedTouches[0][yKey] };
        }

        return { x: 0, y: 0 };
    }

    /**
     * キャンバス座標に変換
     * @param {MouseEvent|TouchEvent} e - イベントオブジェクト
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @param {number} [dpr=1] - デバイスピクセル比
     * @returns {{x: number, y: number}} キャンバス座標
     */
    function getCanvasCoordinates(e, canvas, dpr = 1) {
        const rect = canvas.getBoundingClientRect();
        const client = getEventCoordinates(e, 'client');

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (client.x - rect.left) * scaleX / dpr,
            y: (client.y - rect.top) * scaleY / dpr
        };
    }

    // ========================================
    // 数学ユーティリティ
    // ========================================

    /**
     * 2点間の距離を計算
     * @param {{x: number, y: number}} p1 - 点1
     * @param {{x: number, y: number}} p2 - 点2
     * @returns {number} 距離
     */
    function distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 値を範囲内に制限
     * @param {number} value - 値
     * @param {number} min - 最小値
     * @param {number} max - 最大値
     * @returns {number} 制限された値
     */
    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    /**
     * 2つの矩形が交差するかを判定
     * @param {{x: number, y: number, width: number, height: number}} a - 矩形A
     * @param {{x: number, y: number, width: number, height: number}} b - 矩形B
     * @returns {boolean} 交差しているか
     */
    function boundsIntersect(a, b) {
        return !(
            a.x + a.width < b.x ||
            b.x + b.width < a.x ||
            a.y + a.height < b.y ||
            b.y + b.height < a.y
        );
    }

    // ========================================
    // DOM ユーティリティ
    // ========================================

    /**
     * 要素が入力フィールドかどうか判定
     * @param {Element} element - DOM要素
     * @returns {boolean} 入力フィールドか
     */
    function isInputElement(element) {
        if (!element) return false;
        return (
            element.tagName === 'INPUT' ||
            element.tagName === 'TEXTAREA' ||
            element.isContentEditable
        );
    }

    /**
     * モーダルが開いているか判定
     * @returns {boolean} モーダルが開いているか
     */
    function isModalOpen() {
        return document.querySelector('.modal[style*="display: flex"]') !== null;
    }

    // ========================================
    // 公開API
    // ========================================

    return Object.freeze({
        // 関数ユーティリティ
        debounce,
        throttle,

        // イベント座標
        getEventCoordinates,
        getCanvasCoordinates,

        // 数学
        distance,
        clamp,
        boundsIntersect,

        // DOM
        isInputElement,
        isModalOpen
    });
})();
