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
     * キャンバス座標に変換（回転対応）
     * @param {MouseEvent|TouchEvent} e - イベントオブジェクト
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @param {number} [dpr=1] - デバイスピクセル比
     * @returns {{x: number, y: number}} キャンバス座標
     */
    function getCanvasCoordinates(e, canvas, dpr = 1) {
        const client = getEventCoordinates(e, 'client');
        const canvasWrapper = canvas.parentElement;

        // キャンバスの論理サイズ（dpr適用前）
        const canvasWidth = canvas.width / dpr;
        const canvasHeight = canvas.height / dpr;

        if (!canvasWrapper) {
            // フォールバック
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (client.x - rect.left) * scaleX / dpr,
                y: (client.y - rect.top) * scaleY / dpr
            };
        }

        // CSS変換を取得
        const style = window.getComputedStyle(canvasWrapper);
        const transform = style.transform;

        if (transform === 'none' || transform === '') {
            // 変換なし: 通常の計算
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (client.x - rect.left) * scaleX / dpr,
                y: (client.y - rect.top) * scaleY / dpr
            };
        }

        // DOMMatrixで逆変換を計算
        const matrix = new DOMMatrix(transform);
        const inverseMatrix = matrix.inverse();

        // canvasWrapperの変換前のサイズ（offsetWidth/offsetHeightは変換前のサイズ）
        const cssWidth = canvasWrapper.offsetWidth;
        const cssHeight = canvasWrapper.offsetHeight;

        // 変換後のバウンディングボックスの中心
        const rect = canvasWrapper.getBoundingClientRect();
        const rectCenterX = rect.left + rect.width / 2;
        const rectCenterY = rect.top + rect.height / 2;

        // クリック位置を中心からの相対座標に変換
        const relPoint = new DOMPoint(client.x - rectCenterX, client.y - rectCenterY);

        // 逆変換を適用
        const unrotatedPoint = relPoint.matrixTransform(inverseMatrix);

        // 中心からの相対座標をキャンバス座標に変換
        const scaleX = canvasWidth / cssWidth;
        const scaleY = canvasHeight / cssHeight;

        return {
            x: unrotatedPoint.x * scaleX + canvasWidth / 2,
            y: unrotatedPoint.y * scaleY + canvasHeight / 2
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

    /**
     * startPos/endPosからバウンディングボックスを計算
     * @param {{x: number, y: number}} startPos - 開始位置
     * @param {{x: number, y: number}} endPos - 終了位置
     * @returns {{minX: number, maxX: number, minY: number, maxY: number}} バウンディングボックス
     */
    function getBoundsFromStartEnd(startPos, endPos) {
        return {
            minX: Math.min(startPos.x, endPos.x),
            maxX: Math.max(startPos.x, endPos.x),
            minY: Math.min(startPos.y, endPos.y),
            maxY: Math.max(startPos.y, endPos.y)
        };
    }

    // ========================================
    // 描画ユーティリティ
    // ========================================

    /**
     * 白フチ付きテキストを描画
     * @param {CanvasRenderingContext2D} ctx - キャンバスコンテキスト
     * @param {string} text - 描画するテキスト
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {Object} options - オプション
     * @param {number} options.fontSize - フォントサイズ
     * @param {string} options.color - 塗りつぶし色
     * @param {number} [options.shadowBlur=5] - 影のぼかし半径
     * @param {number} [options.outlineWidthMax=8] - アウトライン最大線幅
     * @param {number} [options.outlineWidthMin=2] - アウトライン最小線幅
     * @param {string} [options.fontFamily='sans-serif'] - フォントファミリー
     * @param {string} [options.fontWeight='bold'] - フォントウェイト
     */
    function drawTextWithOutline(ctx, text, x, y, options) {
        const {
            fontSize,
            color,
            shadowBlur = 5,
            outlineWidthMax = 8,
            outlineWidthMin = 2,
            fontFamily = 'sans-serif',
            fontWeight = 'bold'
        } = options;

        ctx.save();
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // 複数回ストロークして白フチを作成
        for (let lw = outlineWidthMax; lw >= outlineWidthMin; lw--) {
            ctx.lineWidth = lw;
            ctx.strokeText(text, x, y);
        }

        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    /**
     * オブジェクトに回転を適用
     * @param {CanvasRenderingContext2D} ctx - キャンバスコンテキスト
     * @param {Object} obj - 描画オブジェクト（rotationプロパティを持つ）
     * @param {number} centerX - 回転中心X座標
     * @param {number} centerY - 回転中心Y座標
     */
    function applyRotation(ctx, obj, centerX, centerY) {
        if (obj.rotation) {
            ctx.translate(centerX, centerY);
            ctx.rotate(obj.rotation);
            ctx.translate(-centerX, -centerY);
        }
    }

    // ========================================
    // 色変換ユーティリティ
    // ========================================

    /**
     * HSLを16進数カラーコードに変換
     * @param {number} h - 色相 (0-360)
     * @param {number} s - 彩度 (0-100)
     * @param {number} l - 明度 (0-100)
     * @returns {string} 16進数カラーコード (#RRGGBB)
     */
    function hslToHex(h, s, l) {
        s /= 100;
        l /= 100;

        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;

        let r = 0, g = 0, b = 0;

        if (h >= 0 && h < 60) {
            r = c; g = x; b = 0;
        } else if (h >= 60 && h < 120) {
            r = x; g = c; b = 0;
        } else if (h >= 120 && h < 180) {
            r = 0; g = c; b = x;
        } else if (h >= 180 && h < 240) {
            r = 0; g = x; b = c;
        } else if (h >= 240 && h < 300) {
            r = x; g = 0; b = c;
        } else if (h >= 300 && h < 360) {
            r = c; g = 0; b = x;
        }

        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);

        const toHex = (n) => n.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
        getBoundsFromStartEnd,

        // 描画
        drawTextWithOutline,
        applyRotation,

        // 色変換
        hslToHex,

        // DOM
        isInputElement,
        isModalOpen
    });
})();
