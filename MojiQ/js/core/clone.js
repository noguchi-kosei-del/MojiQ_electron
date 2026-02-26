/**
 * MojiQ Clone Utility
 * 効率的なディープクローン機能を提供
 * JSON.parse(JSON.stringify())の代替として使用
 */
window.MojiQClone = (function() {
    'use strict';

    /**
     * ディープクローン
     * - HTMLImageElementは参照を保持（クローンしない）
     * - 循環参照に対応
     * - Date, RegExpの適切な処理
     * @param {*} obj - クローン対象
     * @param {WeakMap} seen - 循環参照検出用
     * @returns {*} クローンされたオブジェクト
     */
    function deep(obj, seen) {
        // プリミティブ値はそのまま返す
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        // 循環参照の初期化
        if (!seen) {
            seen = new WeakMap();
        }

        // 循環参照の検出
        if (seen.has(obj)) {
            return seen.get(obj);
        }

        // 特殊な型の処理
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }

        if (obj instanceof RegExp) {
            return new RegExp(obj.source, obj.flags);
        }

        // HTMLImageElement, HTMLCanvasElementは参照を保持
        if (obj instanceof HTMLImageElement ||
            obj instanceof HTMLCanvasElement ||
            obj instanceof Image) {
            return obj;
        }

        // ImageDataは新しいインスタンスを作成
        if (obj instanceof ImageData) {
            return new ImageData(
                new Uint8ClampedArray(obj.data),
                obj.width,
                obj.height
            );
        }

        // 配列の処理
        if (Array.isArray(obj)) {
            const cloned = [];
            seen.set(obj, cloned);
            for (let i = 0; i < obj.length; i++) {
                cloned[i] = deep(obj[i], seen);
            }
            return cloned;
        }

        // Mapの処理
        if (obj instanceof Map) {
            const cloned = new Map();
            seen.set(obj, cloned);
            obj.forEach((value, key) => {
                cloned.set(deep(key, seen), deep(value, seen));
            });
            return cloned;
        }

        // Setの処理
        if (obj instanceof Set) {
            const cloned = new Set();
            seen.set(obj, cloned);
            obj.forEach(value => {
                cloned.add(deep(value, seen));
            });
            return cloned;
        }

        // 通常のオブジェクトの処理
        const cloned = {};
        seen.set(obj, cloned);

        // プロトタイプチェーンは保持しない（プレーンオブジェクトとしてクローン）
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                cloned[key] = deep(obj[key], seen);
            }
        }

        return cloned;
    }

    /**
     * シャローコピー（1階層のみ）
     * 単純なオブジェクトの高速コピー用
     * @param {*} obj - コピー対象
     * @returns {*} シャローコピーされたオブジェクト
     */
    function shallow(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return [...obj];
        }

        if (obj instanceof Map) {
            return new Map(obj);
        }

        if (obj instanceof Set) {
            return new Set(obj);
        }

        return { ...obj };
    }

    /**
     * 選択的クローン
     * 指定したパスのプロパティのみをディープクローン
     * @param {Object} obj - ソースオブジェクト
     * @param {string[]} paths - クローンするパス（ドット記法）
     * @returns {Object} 選択されたプロパティのみを含むオブジェクト
     */
    function selective(obj, paths) {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        const result = {};

        paths.forEach(path => {
            const keys = path.split('.');
            let source = obj;
            let target = result;

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];

                if (source === undefined || source === null) {
                    break;
                }

                if (i === keys.length - 1) {
                    // 最後のキー：値をディープクローン
                    target[key] = deep(source[key]);
                } else {
                    // 中間のキー：オブジェクト構造を維持
                    if (!target[key]) {
                        target[key] = {};
                    }
                    target = target[key];
                    source = source[key];
                }
            }
        });

        return result;
    }

    /**
     * オブジェクトのマージ（イミュータブル）
     * ターゲットを変更せず、新しいオブジェクトを返す
     * @param {Object} target - ベースオブジェクト
     * @param {Object} source - マージするオブジェクト
     * @returns {Object} マージされた新しいオブジェクト
     */
    function merge(target, source) {
        if (!source || typeof source !== 'object') {
            return deep(target);
        }

        if (!target || typeof target !== 'object') {
            return deep(source);
        }

        const result = deep(target);

        for (const key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                const sourceVal = source[key];
                const targetVal = result[key];

                if (sourceVal && typeof sourceVal === 'object' &&
                    targetVal && typeof targetVal === 'object' &&
                    !Array.isArray(sourceVal) && !Array.isArray(targetVal)) {
                    // 両方がオブジェクトの場合は再帰的にマージ
                    result[key] = merge(targetVal, sourceVal);
                } else {
                    // それ以外はディープクローンで上書き
                    result[key] = deep(sourceVal);
                }
            }
        }

        return result;
    }

    /**
     * 2つのオブジェクトが同値かどうかを比較
     * @param {*} a - 比較対象1
     * @param {*} b - 比較対象2
     * @returns {boolean} 同値ならtrue
     */
    function isEqual(a, b) {
        // 同一参照
        if (a === b) return true;

        // 型が異なる
        if (typeof a !== typeof b) return false;

        // nullチェック
        if (a === null || b === null) return a === b;

        // プリミティブ
        if (typeof a !== 'object') return a === b;

        // 配列
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        if (Array.isArray(a)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!isEqual(a[i], b[i])) return false;
            }
            return true;
        }

        // Date
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() === b.getTime();
        }

        // オブジェクト
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);

        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!isEqual(a[key], b[key])) return false;
        }

        return true;
    }

    // Public API
    return {
        deep: deep,
        shallow: shallow,
        selective: selective,
        merge: merge,
        isEqual: isEqual
    };
})();
