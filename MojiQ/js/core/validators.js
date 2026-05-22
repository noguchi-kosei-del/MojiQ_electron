/**
 * MojiQ Validators - 共通バリデーションユーティリティ
 *
 * 座標、オブジェクト、配列などの検証を統一的に行います。
 * 重複コードの削減と一貫性のある検証を提供します。
 *
 * 使用例:
 *   const V = MojiQ.Validators || window.MojiQValidators;
 *
 *   if (!V.isValidPosition(pos)) return;
 *   if (!V.isValidObject(obj, ['id', 'type'])) return;
 */
window.MojiQValidators = (function() {
    'use strict';

    /**
     * 有効な数値かどうかを検証
     * @param {*} value - 検証する値
     * @returns {boolean}
     */
    function isValidNumber(value) {
        return typeof value === 'number' && Number.isFinite(value);
    }

    /**
     * 正の数値かどうかを検証
     * @param {*} value - 検証する値
     * @returns {boolean}
     */
    function isPositiveNumber(value) {
        return isValidNumber(value) && value > 0;
    }

    /**
     * 非負の数値かどうかを検証
     * @param {*} value - 検証する値
     * @returns {boolean}
     */
    function isNonNegativeNumber(value) {
        return isValidNumber(value) && value >= 0;
    }

    /**
     * 有効な位置オブジェクト（x, y座標）かどうかを検証
     * @param {*} pos - 検証するオブジェクト
     * @returns {boolean}
     */
    function isValidPosition(pos) {
        return pos !== null &&
               pos !== undefined &&
               typeof pos === 'object' &&
               isValidNumber(pos.x) &&
               isValidNumber(pos.y);
    }

    /**
     * 有効なサイズオブジェクト（width, height）かどうかを検証
     * @param {*} size - 検証するオブジェクト
     * @param {boolean} allowZero - 0を許可するか（デフォルト: false）
     * @returns {boolean}
     */
    function isValidSize(size, allowZero = false) {
        if (size === null || size === undefined || typeof size !== 'object') {
            return false;
        }
        const validator = allowZero ? isNonNegativeNumber : isPositiveNumber;
        return validator(size.width) && validator(size.height);
    }

    /**
     * 有効な矩形オブジェクト（x, y, width, height）かどうかを検証
     * @param {*} rect - 検証するオブジェクト
     * @returns {boolean}
     */
    function isValidRect(rect) {
        return isValidPosition(rect) && isValidSize(rect, true);
    }

    /**
     * 有効なバウンディングボックスかどうかを検証
     * @param {*} bounds - 検証するオブジェクト
     * @returns {boolean}
     */
    function isValidBounds(bounds) {
        return bounds !== null &&
               bounds !== undefined &&
               typeof bounds === 'object' &&
               isValidNumber(bounds.minX) &&
               isValidNumber(bounds.minY) &&
               isValidNumber(bounds.maxX) &&
               isValidNumber(bounds.maxY) &&
               bounds.minX <= bounds.maxX &&
               bounds.minY <= bounds.maxY;
    }

    /**
     * 有効なスケール値かどうかを検証
     * @param {*} scale - 検証する値
     * @returns {boolean}
     */
    function isValidScale(scale) {
        return isPositiveNumber(scale) && scale !== Infinity;
    }

    /**
     * 有効なスケールペア（scaleX, scaleY）かどうかを検証
     * @param {number} scaleX - X方向のスケール
     * @param {number} scaleY - Y方向のスケール
     * @returns {boolean}
     */
    function isValidScalePair(scaleX, scaleY) {
        return isValidScale(scaleX) && isValidScale(scaleY);
    }

    /**
     * オブジェクトが必要なプロパティを持っているかを検証
     * @param {*} obj - 検証するオブジェクト
     * @param {string[]} requiredProps - 必須プロパティ名の配列
     * @returns {boolean}
     */
    function isValidObject(obj, requiredProps = []) {
        if (obj === null || obj === undefined || typeof obj !== 'object') {
            return false;
        }
        for (const prop of requiredProps) {
            if (!(prop in obj) || obj[prop] === undefined) {
                return false;
            }
        }
        return true;
    }

    /**
     * 有効な描画オブジェクトかどうかを検証
     * @param {*} obj - 検証するオブジェクト
     * @returns {boolean}
     */
    function isValidDrawingObject(obj) {
        return isValidObject(obj, ['id', 'type']);
    }

    /**
     * 有効な配列かどうかを検証
     * @param {*} arr - 検証する配列
     * @param {number} minLength - 最小長（デフォルト: 0）
     * @returns {boolean}
     */
    function isValidArray(arr, minLength = 0) {
        return Array.isArray(arr) && arr.length >= minLength;
    }

    /**
     * 有効なポイント配列（座標の配列）かどうかを検証
     * @param {*} points - 検証する配列
     * @param {number} minLength - 最小長（デフォルト: 1）
     * @returns {boolean}
     */
    function isValidPointsArray(points, minLength = 1) {
        if (!isValidArray(points, minLength)) {
            return false;
        }
        return points.every(isValidPosition);
    }

    /**
     * 有効な文字列かどうかを検証
     * @param {*} str - 検証する値
     * @param {boolean} allowEmpty - 空文字を許可するか（デフォルト: false）
     * @returns {boolean}
     */
    function isValidString(str, allowEmpty = false) {
        if (typeof str !== 'string') {
            return false;
        }
        return allowEmpty || str.length > 0;
    }

    /**
     * 有効なページ番号かどうかを検証
     * @param {*} pageNum - 検証する値
     * @param {number} maxPages - 最大ページ数（省略可能）
     * @returns {boolean}
     */
    function isValidPageNumber(pageNum, maxPages = Infinity) {
        return Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= maxPages;
    }

    /**
     * 有効なインデックスかどうかを検証
     * @param {*} index - 検証する値
     * @param {number} length - 配列の長さ
     * @returns {boolean}
     */
    function isValidIndex(index, length) {
        return Number.isInteger(index) && index >= 0 && index < length;
    }

    /**
     * 有効な色文字列かどうかを検証（簡易版）
     * @param {*} color - 検証する値
     * @returns {boolean}
     */
    function isValidColor(color) {
        if (typeof color !== 'string' || color.length === 0) {
            return false;
        }
        // #RGB, #RRGGBB, #RRGGBBAA, rgb(), rgba(), 色名
        return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color) ||
               /^rgba?\s*\(/.test(color) ||
               /^[a-zA-Z]+$/.test(color);
    }

    /**
     * 値が範囲内かどうかを検証
     * @param {number} value - 検証する値
     * @param {number} min - 最小値
     * @param {number} max - 最大値
     * @returns {boolean}
     */
    function isInRange(value, min, max) {
        return isValidNumber(value) && value >= min && value <= max;
    }

    /**
     * DOM要素かどうかを検証
     * @param {*} element - 検証する値
     * @returns {boolean}
     */
    function isDOMElement(element) {
        return element instanceof Element || element instanceof HTMLDocument;
    }

    /**
     * Canvas要素かどうかを検証
     * @param {*} element - 検証する値
     * @returns {boolean}
     */
    function isCanvas(element) {
        return element instanceof HTMLCanvasElement;
    }

    /**
     * 有効なCanvas 2Dコンテキストかどうかを検証
     * @param {*} ctx - 検証する値
     * @returns {boolean}
     */
    function isCanvasContext(ctx) {
        return ctx instanceof CanvasRenderingContext2D;
    }

    /**
     * nullまたはundefinedかどうかを検証
     * @param {*} value - 検証する値
     * @returns {boolean}
     */
    function isNullish(value) {
        return value === null || value === undefined;
    }

    /**
     * 検証に失敗した場合に警告をログ出力
     * @param {boolean} condition - 条件
     * @param {string} message - 警告メッセージ
     * @param {string} location - 場所
     * @returns {boolean} conditionをそのまま返す
     */
    function warnIfFalse(condition, message, location = '') {
        if (!condition) {
            const prefix = location ? `[MojiQ ${location}]` : '[MojiQ]';
            console.warn(`${prefix} ${message}`);
        }
        return condition;
    }

    /**
     * アサーション（条件が満たされない場合はエラー）
     * @param {boolean} condition - 条件
     * @param {string} message - エラーメッセージ
     * @throws {Error} 条件が満たされない場合
     */
    function assert(condition, message) {
        if (!condition) {
            throw new Error(message || 'Assertion failed');
        }
    }

    // Public API
    return {
        // 数値
        isValidNumber: isValidNumber,
        isPositiveNumber: isPositiveNumber,
        isNonNegativeNumber: isNonNegativeNumber,
        isInRange: isInRange,

        // 座標・サイズ
        isValidPosition: isValidPosition,
        isValidSize: isValidSize,
        isValidRect: isValidRect,
        isValidBounds: isValidBounds,
        isValidScale: isValidScale,
        isValidScalePair: isValidScalePair,
        isValidPointsArray: isValidPointsArray,

        // オブジェクト・配列
        isValidObject: isValidObject,
        isValidDrawingObject: isValidDrawingObject,
        isValidArray: isValidArray,

        // 文字列
        isValidString: isValidString,
        isValidColor: isValidColor,

        // インデックス・ページ
        isValidPageNumber: isValidPageNumber,
        isValidIndex: isValidIndex,

        // DOM
        isDOMElement: isDOMElement,
        isCanvas: isCanvas,
        isCanvasContext: isCanvasContext,

        // ユーティリティ
        isNullish: isNullish,
        warnIfFalse: warnIfFalse,
        assert: assert
    };
})();
