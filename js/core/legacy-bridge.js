/**
 * MojiQ Legacy Bridge
 * 既存コードとの後方互換性を維持するためのブリッジ層
 * - 既存のappStateへの書き込みをStoreに同期
 * - 既存のグローバル変数へのアクセスを維持
 * - 段階的な移行をサポート
 */
window.MojiQLegacyBridge = (function() {
    'use strict';

    // ブリッジが有効かどうか
    let isActive = false;

    // appState → Store パスマッピング
    const appStateMapping = {
        'currentPageNum': 'page.currentPageNum',
        'totalPages': 'page.totalPages',
        'pageMapping': 'page.pageMapping',
        'pdfDocs': 'page.pdfDocs',
        'currentMode': 'drawing.currentMode',
        'currentZoom': 'canvas.currentZoom',
        'isPanning': 'drawing.isPanning',
        'isShiftPressed': 'drawing.isShiftPressed'
    };

    // DrawingObjects.state → Store パスマッピング
    const drawingObjectsMapping = {
        'currentPageNum': 'page.currentPageNum',
        'pageObjects': 'objects.pages',
        'idCounter': 'objects.idCounter'
    };

    // SimulatorState → Store パスマッピング
    const simulatorMapping = {
        'currentPageNum': 'page.currentPageNum',
        'totalPages': 'page.totalPages',
        'pixelsPerMm': 'simulator.pixelsPerMm',
        'isCalibrated': 'simulator.isCalibrated',
        'pageGridStates': 'simulator.pageGridStates',
        'currentMode': 'simulator.currentMode',
        'ptStep': 'simulator.ptStep'
    };

    /**
     * オブジェクトにProxyを適用してStoreと同期
     * @param {Object} target - 対象オブジェクト
     * @param {Object} mapping - プロパティ→Storeパスのマッピング
     * @param {string} name - デバッグ用の名前
     * @returns {Proxy}
     */
    function createSyncProxy(target, mapping, name) {
        return new Proxy(target, {
            get: function(obj, prop) {
                // マッピングされたプロパティはStoreから取得
                if (mapping[prop] && window.MojiQStore) {
                    const storeValue = window.MojiQStore.get(mapping[prop]);
                    // StoreにUNDEFINEDがある場合は元の値を返す
                    if (storeValue !== undefined) {
                        return storeValue;
                    }
                }
                return obj[prop];
            },

            set: function(obj, prop, value) {
                obj[prop] = value;

                // マッピングされたプロパティはStoreにも同期
                if (mapping[prop] && window.MojiQStore) {
                    window.MojiQStore.set(mapping[prop], value);
                }

                return true;
            }
        });
    }

    /**
     * appStateをラップしてStoreと同期
     * @param {Object} appState - 既存のappState
     * @returns {Proxy}
     */
    function wrapAppState(appState) {
        if (!appState) {
            console.warn('[LegacyBridge] appState is null');
            return appState;
        }

        // 既存の値をStoreに同期
        syncToStore(appState, appStateMapping);

        return createSyncProxy(appState, appStateMapping, 'appState');
    }

    /**
     * 既存の値をStoreに同期
     * @param {Object} source - ソースオブジェクト
     * @param {Object} mapping - マッピング
     */
    function syncToStore(source, mapping) {
        if (!window.MojiQStore) return;

        const updates = {};
        for (const [prop, storePath] of Object.entries(mapping)) {
            if (source[prop] !== undefined) {
                updates[storePath] = source[prop];
            }
        }

        if (Object.keys(updates).length > 0) {
            window.MojiQStore.batch(updates);
        }
    }

    /**
     * Storeの変更を既存オブジェクトに同期
     * @param {Object} target - ターゲットオブジェクト
     * @param {Object} mapping - マッピング
     */
    function syncFromStore(target, mapping) {
        if (!window.MojiQStore) return;

        // 逆マッピングを作成
        const reverseMapping = {};
        for (const [prop, storePath] of Object.entries(mapping)) {
            reverseMapping[storePath] = prop;
        }

        // Storeの変更を購読
        for (const storePath of Object.values(mapping)) {
            window.MojiQStore.subscribe(storePath, (value, changedPath) => {
                const prop = reverseMapping[changedPath];
                if (prop && target[prop] !== value) {
                    target[prop] = value;
                }
            });
        }
    }

    /**
     * MojiQGlobalの互換性シムを作成
     */
    function createGlobalShim() {
        if (!window.MojiQGlobal) {
            window.MojiQGlobal = {};
        }

        // pageNumプロパティをStoreにリダイレクト
        Object.defineProperty(window.MojiQGlobal, 'pageNum', {
            get: function() {
                return window.MojiQStore
                    ? window.MojiQStore.get('page.currentPageNum')
                    : 0;
            },
            set: function(value) {
                if (window.MojiQStore) {
                    window.MojiQStore.set('page.currentPageNum', value);
                }
            },
            configurable: true
        });
    }

    /**
     * モジュール間の同期を設定
     * MojiQDrawingObjects.setCurrentPage()などが呼ばれた時にStoreを更新
     */
    function setupModuleSyncHooks() {
        // MojiQDrawingObjectsのフック
        if (window.MojiQDrawingObjects) {
            const originalSetCurrentPage = window.MojiQDrawingObjects.setCurrentPage;
            if (originalSetCurrentPage) {
                window.MojiQDrawingObjects.setCurrentPage = function(pageNum) {
                    originalSetCurrentPage.call(window.MojiQDrawingObjects, pageNum);
                    if (window.MojiQStore) {
                        window.MojiQStore.set('page.currentPageNum', pageNum);
                    }
                };
            }
        }

        // SimulatorStateのフック
        if (window.SimulatorState) {
            const originalSet = window.SimulatorState.set;
            if (originalSet) {
                window.SimulatorState.set = function(key, value) {
                    originalSet.call(window.SimulatorState, key, value);
                    if (window.MojiQStore && simulatorMapping[key]) {
                        window.MojiQStore.set(simulatorMapping[key], value);
                    }
                };
            }
        }
    }

    /**
     * Storeからの変更を各モジュールに伝播
     */
    function setupStoreToModuleSync() {
        if (!window.MojiQStore) return;

        // ページ番号の変更を各モジュールに伝播
        window.MojiQStore.subscribe('page.currentPageNum', (pageNum) => {
            // MojiQDrawingObjectsに同期（無限ループ防止のため直接state更新）
            if (window.MojiQDrawingObjects && window.MojiQDrawingObjects.state) {
                if (window.MojiQDrawingObjects.state.currentPageNum !== pageNum) {
                    window.MojiQDrawingObjects.state.currentPageNum = pageNum;
                }
            }

            // SimulatorStateに同期
            if (window.SimulatorState && window.SimulatorState.state) {
                if (window.SimulatorState.state.currentPageNum !== pageNum) {
                    window.SimulatorState.state.currentPageNum = pageNum;
                }
            }
        });
    }

    /**
     * ブリッジを有効化
     */
    function activate() {
        if (isActive) return;

        createGlobalShim();

        // DOMContentLoadedまたはwindow.loadの後にフックを設定
        if (document.readyState === 'complete') {
            setupModuleSyncHooks();
            setupStoreToModuleSync();
        } else {
            window.addEventListener('load', () => {
                setupModuleSyncHooks();
                setupStoreToModuleSync();
            });
        }

        isActive = true;
    }

    /**
     * ブリッジを無効化
     */
    function deactivate() {
        isActive = false;
    }

    /**
     * ブリッジの状態を取得
     */
    function getStatus() {
        return {
            isActive: isActive,
            hasStore: !!window.MojiQStore,
            hasDrawingObjects: !!window.MojiQDrawingObjects,
            hasSimulatorState: !!window.SimulatorState
        };
    }

    // Public API
    return {
        wrapAppState: wrapAppState,
        createSyncProxy: createSyncProxy,
        syncToStore: syncToStore,
        syncFromStore: syncFromStore,
        createGlobalShim: createGlobalShim,
        setupModuleSyncHooks: setupModuleSyncHooks,
        setupStoreToModuleSync: setupStoreToModuleSync,
        activate: activate,
        deactivate: deactivate,
        getStatus: getStatus,

        // マッピング定義（外部からのカスタマイズ用）
        mappings: {
            appState: appStateMapping,
            drawingObjects: drawingObjectsMapping,
            simulator: simulatorMapping
        }
    };
})();
