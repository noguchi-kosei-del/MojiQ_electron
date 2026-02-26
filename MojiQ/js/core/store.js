/**
 * MojiQ Store
 * 中央集権的な状態管理システム
 * - 分散した状態を統一管理
 * - パス指定でのアクセス
 * - 変更の購読（リアクティブ）
 * - バッチ更新による最適化
 */
window.MojiQStore = (function() {
    'use strict';

    // 初期状態スキーマ
    const initialState = {
        // アプリケーションモード
        app: {
            mode: 'mojiq',          // 'mojiq' | 'simulator'
            isLocked: true,         // PDF未ロード時のロック状態
            isModalOpen: false      // モーダル表示中
        },

        // ページ管理（単一ソース）
        page: {
            currentPageNum: 0,      // 現在のページ番号（0-indexed）
            totalPages: 0,          // 総ページ数
            pageMapping: [],        // {docIndex, pageNum, width?, height?}[]
            pdfDocs: []             // 読み込まれたPDFドキュメント参照
        },

        // キャンバス状態
        canvas: {
            currentZoom: 1.0,       // 現在のズーム倍率
            baseCSSExtent: {        // ベースサイズ
                width: 0,
                height: 0
            },
            dpr: 2                  // デバイスピクセル比
        },

        // 描画状態
        drawing: {
            currentMode: 'draw',    // 描画モード
            interactionState: 0,    // 0: idle, 1: drawing, 2: annotation
            color: '#ff0000',       // 現在の色
            lineWidth: 2,           // 線幅
            fontSize: 12,           // フォントサイズ
            isPanning: false,       // パン中
            isSpacePressed: false,  // スペースキー押下
            isShiftPressed: false   // シフトキー押下
        },

        // オブジェクト管理
        objects: {
            // ページごとのオブジェクト：{ [pageNum]: { objects: [], selectedIndex: null } }
            pages: {},
            pendingObject: null,    // 作成中のオブジェクト
            idCounter: 0            // ID生成カウンター
        },

        // 履歴管理
        history: {
            undoStacks: {},         // { [pageNum]: [...] }
            redoStacks: {},         // { [pageNum]: [...] }
            maxStackSize: 50        // 最大履歴数
        },

        // スタンプ
        stamps: {
            activeStampText: null,
            selectedFontInfo: null,
            activeFontBtn: null,
            isDeleteMode: false,
            isEditMode: false,
            useLeaderLine: false
        },

        // シミュレーター
        simulator: {
            pixelsPerMm: 1.0,
            isCalibrated: false,
            pageGridStates: {},
            currentMode: null,
            ptStep: 1.0
        },

        // PDF管理（将来的にpdf-manager.jsの状態変数を統合予定）
        pdf: {
            isProcessing: false,        // 処理中フラグ
            isRendering: false,         // レンダリング中フラグ
            currentFilePath: null,      // 現在開いているファイルパス
            hasUnsavedChanges: false,   // 未保存の変更有無
            spread: {
                viewMode: false,        // 見開きモード
                mapping: [],            // 見開きページマッピング
                currentIndex: 0,        // 現在の見開きインデックス
                bindingDirection: 'right', // 綴じ方向: 'right'(右綴じ) | 'left'(左綴じ)
                cacheReady: false       // キャッシュ準備完了
            }
        },

        // 校正モード
        proofreadingMode: {
            enabled: false,             // 校正モードが有効か
            jsonLoaded: false,          // 校正チェックJSONが読み込まれているか
            currentData: null,          // 読み込んだJSONデータ { title, checks: { variation, simple } }
            currentFilePath: null       // 読み込んだJSONファイルパス
        }
    };

    // 状態のストレージ
    let state = null;

    // 購読者管理
    const subscribers = new Map();  // path -> Set<callback>

    // バッチ更新用
    let pendingNotifications = new Set();
    let isNotificationScheduled = false;

    // デバッグモード
    let debugMode = false;

    /**
     * パスで値を取得
     */
    function getByPath(obj, path) {
        if (!path) return obj;

        const keys = path.split('.');
        let current = obj;

        for (const key of keys) {
            if (current === undefined || current === null) {
                return undefined;
            }
            current = current[key];
        }

        return current;
    }

    /**
     * パスで値を設定
     */
    function setByPath(obj, path, value) {
        if (!path) return;

        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || current[key] === null || typeof current[key] !== 'object') {
                current[key] = {};
            } else if (Array.isArray(current[key])) {
                // BUG-013修正: 配列型の場合は上書きしない（配列を保護）
                // 配列の中の要素にアクセスする場合はそのまま進む
            }
            current = current[key];
        }

        current[keys[keys.length - 1]] = value;
    }

    /**
     * 通知をスケジュール（バッチ処理）
     */
    function scheduleNotification(path) {
        pendingNotifications.add(path);

        if (!isNotificationScheduled) {
            isNotificationScheduled = true;

            queueMicrotask(() => {
                const notifications = new Set(pendingNotifications);
                pendingNotifications.clear();
                isNotificationScheduled = false;

                // 各パスの購読者に通知
                notifications.forEach(notifyPath => {
                    notifySubscribers(notifyPath);
                });
            });
        }
    }

    /**
     * 購読者に通知
     */
    function notifySubscribers(changedPath) {
        // 完全一致の購読者
        const exactSubscribers = subscribers.get(changedPath);
        if (exactSubscribers) {
            const value = getByPath(state, changedPath);
            exactSubscribers.forEach(cb => {
                try {
                    cb(value, changedPath);
                } catch (e) {
                    console.error('[MojiQStore] Error in subscriber:', e);
                }
            });
        }

        // 親パスの購読者にも通知
        const parts = changedPath.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            const parentSubscribers = subscribers.get(parentPath);
            if (parentSubscribers) {
                const value = getByPath(state, parentPath);
                parentSubscribers.forEach(cb => {
                    try {
                        cb(value, changedPath);
                    } catch (e) {
                        console.error('[MojiQStore] Error in parent subscriber:', e);
                    }
                });
            }
        }

        // ルート購読者（全変更を監視）
        const rootSubscribers = subscribers.get('*');
        if (rootSubscribers) {
            rootSubscribers.forEach(cb => {
                try {
                    cb(state, changedPath);
                } catch (e) {
                    console.error('[MojiQStore] Error in root subscriber:', e);
                }
            });
        }
    }

    /**
     * 状態値を取得（クローンを返す）
     * @param {string} path - ドット記法のパス（例: 'page.currentPageNum'）
     * @returns {*} 状態値のクローン
     */
    function get(path) {
        const value = getByPath(state, path);

        // プリミティブ値はそのまま返す
        if (value === null || typeof value !== 'object') {
            return value;
        }

        // オブジェクトはクローンして返す（外部からの変更を防ぐ）
        return MojiQClone.deep(value);
    }

    /**
     * 状態値の参照を取得（読み取り専用、パフォーマンス重視）
     * 注意: 返された値を直接変更しないこと
     * @param {string} path - ドット記法のパス
     * @returns {*} 状態値への直接参照
     */
    function getRef(path) {
        return getByPath(state, path);
    }

    /**
     * 状態値を設定
     * @param {string} path - ドット記法のパス
     * @param {*} value - 設定する値
     */
    function set(path, value) {
        const oldValue = getByPath(state, path);

        // 値が変更されていない場合はスキップ
        if (oldValue === value) return;

        // 配列やオブジェクトの場合は深い比較
        if (window.MojiQClone && window.MojiQClone.isEqual &&
            typeof oldValue === 'object' && typeof value === 'object') {
            if (window.MojiQClone.isEqual(oldValue, value)) return;
        }

        if (debugMode) {
            console.log('[MojiQStore] set', path, value, '(was:', oldValue, ')');
        }

        setByPath(state, path, value);
        scheduleNotification(path);

        // イベントバスにも通知（後方互換性）
        if (window.MojiQEvents) {
            window.MojiQEvents.emit('mojiq:state-change', {
                path: path,
                value: value,
                oldValue: oldValue
            });
        }
    }

    /**
     * 複数のパスを一括更新（アトミック操作）
     * @param {Object} updates - { path: value } の形式
     */
    function batch(updates) {
        const changes = [];

        Object.entries(updates).forEach(([path, value]) => {
            const oldValue = getByPath(state, path);
            if (oldValue !== value) {
                setByPath(state, path, value);
                pendingNotifications.add(path);
                changes.push({ path, value, oldValue });
            }
        });

        if (changes.length > 0 && !isNotificationScheduled) {
            isNotificationScheduled = true;

            queueMicrotask(() => {
                const notifications = new Set(pendingNotifications);
                pendingNotifications.clear();
                isNotificationScheduled = false;

                notifications.forEach(notifyPath => {
                    notifySubscribers(notifyPath);
                });
            });

            if (debugMode) {
                console.log('[MojiQStore] batch', changes);
            }
        }
    }

    /**
     * 状態変更を購読
     * @param {string} path - 監視するパス（'*'で全変更）
     * @param {Function} callback - コールバック(value, changedPath)
     * @returns {Function} 購読解除関数
     */
    function subscribe(path, callback) {
        if (typeof callback !== 'function') {
            console.error('[MojiQStore] Callback must be a function');
            return () => {};
        }

        if (!subscribers.has(path)) {
            subscribers.set(path, new Set());
        }

        subscribers.get(path).add(callback);

        // 購読解除関数を返す
        return function unsubscribe() {
            const subs = subscribers.get(path);
            if (subs) {
                subs.delete(callback);
                if (subs.size === 0) {
                    subscribers.delete(path);
                }
            }
        };
    }

    /**
     * 特定パスの購読者を取得
     * @param {string} path
     * @returns {number} 購読者数
     */
    function subscriberCount(path) {
        const subs = subscribers.get(path);
        return subs ? subs.size : 0;
    }

    /**
     * 状態を初期値にリセット
     */
    function reset() {
        state = MojiQClone.deep(initialState);

        // 全購読者に通知
        subscribers.forEach((callbacks, path) => {
            const value = getByPath(state, path);
            callbacks.forEach(cb => {
                try {
                    cb(value, path);
                } catch (e) {
                    console.error('[MojiQStore] Error in subscriber during reset:', e);
                }
            });
        });

        if (window.MojiQEvents) {
            window.MojiQEvents.emit('mojiq:state-reset');
        }
    }

    /**
     * 状態の完全なスナップショットを取得（デバッグ用）
     * @returns {Object}
     */
    function getSnapshot() {
        return MojiQClone.deep(state);
    }

    /**
     * 状態を復元（デバッグ/永続化用）
     * @param {Object} snapshot - 復元するスナップショット
     */
    function restore(snapshot) {
        state = MojiQClone.deep(snapshot);

        // 全パスを通知
        function notifyAll(obj, prefix = '') {
            for (const key in obj) {
                const path = prefix ? `${prefix}.${key}` : key;
                if (subscribers.has(path)) {
                    scheduleNotification(path);
                }
                if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                    notifyAll(obj[key], path);
                }
            }
        }
        notifyAll(state);
    }

    /**
     * デバッグモードを設定
     * @param {boolean} enabled
     */
    function setDebugMode(enabled) {
        debugMode = enabled;
    }

    /**
     * 初期化
     */
    function init() {
        reset();
        if (debugMode) {
            console.log('[MojiQStore] Initialized');
        }
    }

    // 自動初期化
    init();

    // Public API
    return {
        get: get,
        getRef: getRef,
        set: set,
        batch: batch,
        subscribe: subscribe,
        subscriberCount: subscriberCount,
        reset: reset,
        getSnapshot: getSnapshot,
        restore: restore,
        setDebugMode: setDebugMode,
        init: init
    };
})();
