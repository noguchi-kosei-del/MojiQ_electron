/**
 * MojiQ Event Bus
 * モジュール間通信のための拡張イベントシステム
 * 既存のwindow.dispatchEvent(CustomEvent)と互換性を保ちつつ、
 * より柔軟なイベント管理機能を提供
 */
window.MojiQEvents = (function() {
    'use strict';

    // 標準イベント名定義
    const EventTypes = {
        // 描画関連
        REQUEST_REDRAW: 'mojiq:request-redraw',      // 再描画リクエスト
        SAVE_HISTORY: 'mojiq:save-history',          // 履歴保存
        CLEAR_CANVAS: 'mojiq:clear-canvas',          // キャンバスクリア
        DESELECT: 'mojiq:deselect',                  // 選択解除

        // ページ関連
        PAGE_CHANGE: 'mojiq:page-change',            // ページ変更
        PAGE_ADD: 'mojiq:page-add',                  // ページ追加
        PAGE_DELETE: 'mojiq:page-delete',           // ページ削除

        // オブジェクト関連
        OBJECT_ADD: 'mojiq:object-add',              // オブジェクト追加
        OBJECT_UPDATE: 'mojiq:object-update',        // オブジェクト更新
        OBJECT_DELETE: 'mojiq:object-delete',        // オブジェクト削除
        OBJECT_SELECT: 'mojiq:object-select',        // オブジェクト選択

        // 状態関連
        STATE_CHANGE: 'mojiq:state-change',          // Store状態変更
        STATE_RESET: 'mojiq:state-reset',            // Store状態リセット

        // モード関連
        MODE_CHANGE: 'mojiq:mode-change',            // モード変更

        // ズーム関連
        ZOOM_CHANGE: 'mojiq:zoom-change',            // ズーム変更

        // PDF関連
        PDF_LOAD: 'mojiq:pdf-load',                  // PDF読み込み完了
        PDF_CLEAR: 'mojiq:pdf-clear'                // PDFクリア
    };

    // イベントリスナーの格納
    const listeners = new Map();        // event -> Set<{callback, options}>
    const onceListeners = new Map();    // event -> Set<callback>

    // イベント履歴（デバッグ用）
    let debugMode = false;
    const eventHistory = [];
    const MAX_HISTORY = 100;

    /**
     * イベントリスナーを登録
     * @param {string} event - イベント名
     * @param {Function} callback - コールバック関数
     * @param {Object} options - オプション
     * @param {boolean} options.once - 一度だけ実行
     * @param {number} options.priority - 優先度（高い順に実行）
     * @returns {Function} 登録解除関数
     */
    function on(event, callback, options = {}) {
        if (typeof callback !== 'function') {
            console.error('[MojiQEvents] Callback must be a function');
            return () => {};
        }

        const map = options.once ? onceListeners : listeners;

        if (!map.has(event)) {
            map.set(event, new Set());
        }

        const entry = options.once ? callback : {
            callback: callback,
            priority: options.priority || 0
        };

        map.get(event).add(entry);

        // 登録解除関数を返す
        return function unsubscribe() {
            off(event, callback);
        };
    }

    /**
     * 一度だけ実行されるイベントリスナーを登録
     * @param {string} event - イベント名
     * @param {Function} callback - コールバック関数
     * @returns {Function} 登録解除関数
     */
    function once(event, callback) {
        return on(event, callback, { once: true });
    }

    /**
     * イベントリスナーを解除
     * @param {string} event - イベント名
     * @param {Function} callback - コールバック関数
     */
    function off(event, callback) {
        // 通常のリスナーから削除
        const regularListeners = listeners.get(event);
        if (regularListeners) {
            for (const entry of regularListeners) {
                if (entry.callback === callback) {
                    regularListeners.delete(entry);
                    break;
                }
            }
            if (regularListeners.size === 0) {
                listeners.delete(event);
            }
        }

        // onceリスナーから削除
        const onceListenerSet = onceListeners.get(event);
        if (onceListenerSet) {
            onceListenerSet.delete(callback);
            if (onceListenerSet.size === 0) {
                onceListeners.delete(event);
            }
        }
    }

    /**
     * 特定のイベントの全リスナーを解除
     * @param {string} event - イベント名
     */
    function offAll(event) {
        listeners.delete(event);
        onceListeners.delete(event);
    }

    /**
     * イベントを発行
     * @param {string} event - イベント名
     * @param {*} data - イベントデータ
     * @param {Object} options - オプション
     * @param {boolean} options.sync - 同期実行（デフォルト: true）
     */
    function emit(event, data, options = {}) {
        const sync = options.sync !== false;

        // デバッグモードでは履歴を記録
        if (debugMode) {
            eventHistory.push({
                event: event,
                data: data,
                timestamp: Date.now()
            });
            if (eventHistory.length > MAX_HISTORY) {
                eventHistory.shift();
            }
            console.log('[MojiQEvents]', event, data);
        }

        const executeCallbacks = () => {
            // 通常のリスナーを優先度順に実行
            const regularListeners = listeners.get(event);
            if (regularListeners) {
                // 優先度でソート（高い順）
                const sorted = Array.from(regularListeners)
                    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

                for (const entry of sorted) {
                    try {
                        entry.callback(data);
                    } catch (e) {
                        console.error(`[MojiQEvents] Error in listener for "${event}":`, e);
                    }
                }
            }

            // onceリスナーを実行して削除
            const onceListenerSet = onceListeners.get(event);
            if (onceListenerSet) {
                const callbacks = Array.from(onceListenerSet);
                onceListenerSet.clear();

                for (const callback of callbacks) {
                    try {
                        callback(data);
                    } catch (e) {
                        console.error(`[MojiQEvents] Error in once listener for "${event}":`, e);
                    }
                }

                if (onceListenerSet.size === 0) {
                    onceListeners.delete(event);
                }
            }

            // 後方互換性: CustomEventも発行
            window.dispatchEvent(new CustomEvent(event, { detail: data }));
        };

        if (sync) {
            executeCallbacks();
        } else {
            // 非同期実行
            queueMicrotask(executeCallbacks);
        }
    }

    /**
     * 複数のイベントをバッチで発行（パフォーマンス最適化）
     * @param {Array<{event: string, data: *}>} events - イベント配列
     */
    function emitBatch(events) {
        queueMicrotask(() => {
            for (const { event, data } of events) {
                emit(event, data, { sync: true });
            }
        });
    }

    /**
     * イベントリスナーが存在するかチェック
     * @param {string} event - イベント名
     * @returns {boolean}
     */
    function hasListeners(event) {
        const regular = listeners.get(event);
        const once = onceListeners.get(event);
        return (regular && regular.size > 0) || (once && once.size > 0);
    }

    /**
     * 特定のイベントのリスナー数を取得
     * @param {string} event - イベント名
     * @returns {number}
     */
    function listenerCount(event) {
        let count = 0;
        const regular = listeners.get(event);
        const once = onceListeners.get(event);
        if (regular) count += regular.size;
        if (once) count += once.size;
        return count;
    }

    /**
     * Promiseベースのイベント待機
     * @param {string} event - 待機するイベント名
     * @param {number} timeout - タイムアウト（ms）、0で無制限
     * @returns {Promise<*>} イベントデータ
     */
    function waitFor(event, timeout = 0) {
        return new Promise((resolve, reject) => {
            let timeoutId;

            const cleanup = once(event, (data) => {
                if (timeoutId) clearTimeout(timeoutId);
                resolve(data);
            });

            if (timeout > 0) {
                timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error(`Timeout waiting for event: ${event}`));
                }, timeout);
            }
        });
    }

    /**
     * デバッグモードを設定
     * @param {boolean} enabled - 有効/無効
     */
    function setDebugMode(enabled) {
        debugMode = enabled;
        if (!enabled) {
            eventHistory.length = 0;
        }
    }

    /**
     * イベント履歴を取得（デバッグ用）
     * @returns {Array}
     */
    function getHistory() {
        return [...eventHistory];
    }

    /**
     * 全リスナーをクリア（テスト用）
     */
    function clear() {
        listeners.clear();
        onceListeners.clear();
        eventHistory.length = 0;
    }

    // Public API
    return {
        on: on,
        once: once,
        off: off,
        offAll: offAll,
        emit: emit,
        emitBatch: emitBatch,
        hasListeners: hasListeners,
        listenerCount: listenerCount,
        waitFor: waitFor,
        setDebugMode: setDebugMode,
        getHistory: getHistory,
        clear: clear,

        // イベント名定数（Phase 7で追加）
        EventTypes: EventTypes
    };
})();
