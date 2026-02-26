/**
 * MojiQ Render Manager
 * requestAnimationFrameを使用したバッチレンダリング管理
 * - 複数のredraw要求を1フレームにまとめる
 * - 不要な再描画を防止
 * - フレームレート制御
 */
window.MojiQRenderManager = (function() {
    'use strict';

    // レンダリング状態
    let renderRequested = false;
    let renderCallbacks = [];
    let lastRenderTime = 0;

    // 設定
    const config = {
        minRenderInterval: 16,    // 最小レンダリング間隔（約60fps）
        enableThrottling: true,   // スロットリング有効
        debugMode: false          // デバッグモード
    };

    // 統計情報
    const stats = {
        totalRenders: 0,
        skippedRenders: 0,
        batchedCallbacks: 0,
        lastFrameTime: 0
    };

    /**
     * レンダリングを実行
     */
    function performRender(timestamp) {
        renderRequested = false;

        // スロットリング
        if (config.enableThrottling) {
            const elapsed = timestamp - lastRenderTime;
            if (elapsed < config.minRenderInterval) {
                // 間隔が短すぎる場合は次フレームに延期
                stats.skippedRenders++;
                if (renderCallbacks.length > 0) {
                    renderRequested = true;
                    requestAnimationFrame(performRender);
                }
                return;
            }
        }

        lastRenderTime = timestamp;
        stats.lastFrameTime = timestamp;

        // コールバックを実行
        const callbacks = renderCallbacks;
        renderCallbacks = [];

        if (callbacks.length === 0) return;

        stats.totalRenders++;
        stats.batchedCallbacks += callbacks.length;

        if (config.debugMode) {
            console.log(`[RenderManager] Rendering ${callbacks.length} callbacks`);
        }

        // 重複除去（同じコールバックは1回だけ実行）
        const uniqueCallbacks = [...new Set(callbacks)];

        for (const callback of uniqueCallbacks) {
            try {
                callback(timestamp);
            } catch (e) {
                console.error('[RenderManager] Error in render callback:', e);
            }
        }
    }

    /**
     * レンダリングを要求
     * @param {Function} callback - レンダリング時に実行するコールバック
     */
    function requestRender(callback) {
        if (callback && typeof callback === 'function') {
            renderCallbacks.push(callback);
        }

        if (!renderRequested) {
            renderRequested = true;
            requestAnimationFrame(performRender);
        }
    }

    /**
     * 即座にレンダリングを実行（バッチ処理をバイパス）
     * @param {Function} callback - 実行するコールバック
     */
    function forceRender(callback) {
        if (callback && typeof callback === 'function') {
            try {
                callback(performance.now());
            } catch (e) {
                console.error('[RenderManager] Error in force render:', e);
            }
        }
    }

    /**
     * 保留中のレンダリングをすべてキャンセル
     */
    function cancelPending() {
        renderCallbacks = [];
        // renderRequestedはそのまま（requestAnimationFrameはキャンセルできない）
        // 次のフレームでコールバックが空になるだけ
    }

    /**
     * デバウンスされたレンダリング要求
     * 指定時間内の複数要求を1回にまとめる
     * @param {Function} callback - レンダリング時に実行するコールバック
     * @param {number} delay - デバウンス遅延（ms）
     * @returns {Function} デバウンスされた関数
     */
    function createDebouncedRender(callback, delay = 16) {
        let timeoutId = null;

        return function debouncedRender() {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            timeoutId = setTimeout(() => {
                timeoutId = null;
                requestRender(callback);
            }, delay);
        };
    }

    /**
     * スロットルされたレンダリング要求
     * 指定間隔で最大1回実行
     * @param {Function} callback - レンダリング時に実行するコールバック
     * @param {number} interval - 最小間隔（ms）
     * @returns {Function} スロットルされた関数
     */
    function createThrottledRender(callback, interval = 16) {
        let lastCall = 0;
        let pendingCall = false;

        return function throttledRender() {
            const now = performance.now();
            const elapsed = now - lastCall;

            if (elapsed >= interval) {
                lastCall = now;
                requestRender(callback);
            } else if (!pendingCall) {
                pendingCall = true;
                setTimeout(() => {
                    pendingCall = false;
                    lastCall = performance.now();
                    requestRender(callback);
                }, interval - elapsed);
            }
        };
    }

    /**
     * 次のアニメーションフレームを待つPromise
     * @returns {Promise<number>} タイムスタンプ
     */
    function nextFrame() {
        return new Promise(resolve => {
            requestAnimationFrame(resolve);
        });
    }

    /**
     * 複数フレームにわたるアニメーション
     * @param {Function} animator - (progress, timestamp) => boolean を返す関数
     * @param {number} duration - アニメーション時間（ms）
     * @returns {Promise} アニメーション完了時に解決
     */
    function animate(animator, duration) {
        return new Promise((resolve, reject) => {
            const startTime = performance.now();

            function tick(timestamp) {
                const elapsed = timestamp - startTime;
                const progress = Math.min(elapsed / duration, 1);

                try {
                    const shouldContinue = animator(progress, timestamp);

                    if (progress < 1 && shouldContinue !== false) {
                        requestAnimationFrame(tick);
                    } else {
                        resolve();
                    }
                } catch (e) {
                    reject(e);
                }
            }

            requestAnimationFrame(tick);
        });
    }

    /**
     * 設定を更新
     * @param {Object} newConfig - 新しい設定
     */
    function configure(newConfig) {
        Object.assign(config, newConfig);
    }

    /**
     * 統計情報を取得
     * @returns {Object}
     */
    function getStats() {
        return {
            ...stats,
            pendingCallbacks: renderCallbacks.length,
            isRenderPending: renderRequested,
            averageCallbacksPerRender: stats.totalRenders > 0
                ? (stats.batchedCallbacks / stats.totalRenders).toFixed(2)
                : 0
        };
    }

    /**
     * 統計情報をリセット
     */
    function resetStats() {
        stats.totalRenders = 0;
        stats.skippedRenders = 0;
        stats.batchedCallbacks = 0;
    }

    /**
     * デバッグモードを設定
     * @param {boolean} enabled
     */
    function setDebugMode(enabled) {
        config.debugMode = enabled;
    }

    // Public API
    return {
        requestRender: requestRender,
        forceRender: forceRender,
        cancelPending: cancelPending,
        createDebouncedRender: createDebouncedRender,
        createThrottledRender: createThrottledRender,
        nextFrame: nextFrame,
        animate: animate,
        configure: configure,
        getStats: getStats,
        resetStats: resetStats,
        setDebugMode: setDebugMode
    };
})();
