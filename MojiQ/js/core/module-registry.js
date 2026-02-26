/**
 * MojiQ Module Registry
 * モジュールの登録・依存関係解決・初期化を管理
 * ES Modules移行の準備として、依存関係の明示的な管理を提供
 */
window.MojiQModules = (function() {
    'use strict';

    // 登録されたモジュール
    const modules = new Map();

    // 初期化済みモジュール
    const initialized = new Set();

    // 初期化順序
    const initOrder = [];

    // デバッグモード
    let debugMode = false;

    /**
     * モジュールを登録
     * @param {string} name - モジュール名
     * @param {Object} config - モジュール設定
     * @param {string[]} config.deps - 依存モジュール名の配列
     * @param {Function} config.factory - モジュールファクトリ関数
     * @param {boolean} config.autoInit - 自動初期化するか（デフォルト: false）
     */
    function register(name, config) {
        if (modules.has(name)) {
            console.warn(`[MojiQModules] Module "${name}" is already registered`);
            return;
        }

        modules.set(name, {
            name: name,
            deps: config.deps || [],
            factory: config.factory,
            autoInit: config.autoInit || false,
            instance: null
        });

        if (debugMode) {
            console.log(`[MojiQModules] Registered: ${name}`, config.deps);
        }
    }

    /**
     * 依存関係を解決してトポロジカルソート
     * @returns {string[]} 初期化順序
     */
    function resolveDependencies() {
        const resolved = [];
        const visiting = new Set();

        function visit(name) {
            if (resolved.includes(name)) return;
            if (visiting.has(name)) {
                throw new Error(`[MojiQModules] Circular dependency detected: ${name}`);
            }

            const module = modules.get(name);
            if (!module) {
                // 外部モジュール（windowに登録済み）
                return;
            }

            visiting.add(name);

            for (const dep of module.deps) {
                visit(dep);
            }

            visiting.delete(name);
            resolved.push(name);
        }

        for (const name of modules.keys()) {
            visit(name);
        }

        return resolved;
    }

    /**
     * モジュールを初期化
     * @param {string} name - モジュール名
     * @returns {*} モジュールインスタンス
     */
    function initModule(name) {
        if (initialized.has(name)) {
            return modules.get(name).instance;
        }

        const module = modules.get(name);
        if (!module) {
            // 外部モジュール（windowから取得）
            return window[name] || window[`MojiQ${name}`];
        }

        // 依存モジュールを先に初期化
        const deps = {};
        for (const depName of module.deps) {
            deps[depName] = initModule(depName);
        }

        // ファクトリ関数を実行
        try {
            module.instance = module.factory(deps);
            initialized.add(name);
            initOrder.push(name);

            if (debugMode) {
                console.log(`[MojiQModules] Initialized: ${name}`);
            }

            return module.instance;
        } catch (e) {
            console.error(`[MojiQModules] Failed to initialize "${name}":`, e);
            throw e;
        }
    }

    /**
     * 全モジュールを初期化
     */
    function initAll() {
        const order = resolveDependencies();

        if (debugMode) {
            console.log('[MojiQModules] Init order:', order);
        }

        for (const name of order) {
            const module = modules.get(name);
            if (module && module.autoInit) {
                initModule(name);
            }
        }
    }

    /**
     * モジュールを取得
     * @param {string} name - モジュール名
     * @returns {*} モジュールインスタンス
     */
    function get(name) {
        const module = modules.get(name);
        if (module && module.instance) {
            return module.instance;
        }

        // 外部モジュールを検索
        return window[name] || window[`MojiQ${name}`];
    }

    /**
     * モジュールが登録されているか確認
     * @param {string} name - モジュール名
     * @returns {boolean}
     */
    function has(name) {
        return modules.has(name) || !!window[name] || !!window[`MojiQ${name}`];
    }

    /**
     * 登録されている全モジュール名を取得
     * @returns {string[]}
     */
    function list() {
        return Array.from(modules.keys());
    }

    /**
     * 初期化済みモジュール一覧を取得
     * @returns {string[]}
     */
    function listInitialized() {
        return [...initOrder];
    }

    /**
     * 依存関係グラフを取得（デバッグ用）
     * @returns {Object}
     */
    function getDependencyGraph() {
        const graph = {};
        for (const [name, module] of modules) {
            graph[name] = module.deps;
        }
        return graph;
    }

    /**
     * モジュールの状態を取得
     * @param {string} name - モジュール名
     * @returns {Object|null}
     */
    function getStatus(name) {
        const module = modules.get(name);
        if (!module) return null;

        return {
            name: name,
            deps: module.deps,
            autoInit: module.autoInit,
            initialized: initialized.has(name),
            hasInstance: !!module.instance
        };
    }

    /**
     * 全体の状態を取得
     * @returns {Object}
     */
    function getOverallStatus() {
        return {
            totalModules: modules.size,
            initializedModules: initialized.size,
            initOrder: [...initOrder],
            modules: list().map(name => getStatus(name))
        };
    }

    /**
     * デバッグモードを設定
     * @param {boolean} enabled
     */
    function setDebugMode(enabled) {
        debugMode = enabled;
    }

    /**
     * リセット（テスト用）
     */
    function reset() {
        modules.clear();
        initialized.clear();
        initOrder.length = 0;
    }

    // Public API
    return {
        register: register,
        initModule: initModule,
        initAll: initAll,
        get: get,
        has: has,
        list: list,
        listInitialized: listInitialized,
        getDependencyGraph: getDependencyGraph,
        getStatus: getStatus,
        getOverallStatus: getOverallStatus,
        setDebugMode: setDebugMode,
        reset: reset
    };
})();
