/**
 * MojiQ Namespace - 統一名前空間
 *
 * すべてのMojiQモジュールを単一の名前空間に統合し、
 * グローバル変数の汚染を軽減します。
 *
 * 使用方法:
 *   MojiQ.PdfManager.loadPdf(...)
 *   MojiQ.Drawing.init(...)
 *   MojiQ.Modal.showAlert(...)
 *
 * 後方互換性:
 *   window.MojiQPdfManager は MojiQ.PdfManager のエイリアスとして維持
 */
(function() {
    'use strict';

    // 名前空間が既に存在する場合は再作成しない
    if (window.MojiQ && window.MojiQ._initialized) {
        return;
    }

    /**
     * MojiQ 統一名前空間
     */
    const MojiQ = {
        _initialized: true,
        _version: '2.10',
        _modules: {},
        _aliases: new Map(),

        /**
         * モジュールを名前空間に登録
         * @param {string} name - モジュール名（例: 'PdfManager'）
         * @param {Object} module - モジュールオブジェクト
         * @param {Object} options - オプション
         * @param {boolean} options.createAlias - window.MojiQXxx エイリアスを作成（デフォルト: true）
         * @param {string} options.aliasName - カスタムエイリアス名
         */
        register: function(name, module, options = {}) {
            if (this._modules[name]) {
                console.warn(`[MojiQ] Module "${name}" is already registered`);
                return module;
            }

            this._modules[name] = module;
            this[name] = module;

            // 後方互換性のためのエイリアス作成
            const createAlias = options.createAlias !== false;
            if (createAlias) {
                const aliasName = options.aliasName || `MojiQ${name}`;
                if (!window[aliasName]) {
                    window[aliasName] = module;
                    this._aliases.set(aliasName, name);
                }
            }

            return module;
        },

        /**
         * モジュールを取得
         * @param {string} name - モジュール名
         * @returns {Object|undefined}
         */
        get: function(name) {
            return this._modules[name] || this[name];
        },

        /**
         * モジュールが登録されているか確認
         * @param {string} name - モジュール名
         * @returns {boolean}
         */
        has: function(name) {
            return name in this._modules || name in this;
        },

        /**
         * 登録されている全モジュール名を取得
         * @returns {string[]}
         */
        list: function() {
            return Object.keys(this._modules);
        },

        /**
         * 既存のwindow.MojiQXxxモジュールを名前空間に統合
         * HTMLでスクリプトが読み込まれた後に呼び出す
         */
        integrateExistingModules: function() {
            // MojiQプレフィックス付きモジュールを統合
            const mojiQModules = [
                'Constants', 'Utils', 'Store', 'Events', 'DOMCache', 'Clone',
                'RenderManager', 'Modules', 'LegacyBridge',
                'ErrorHandler', 'Validators',
                'Drawing', 'DrawingObjects', 'DrawingRenderer', 'DrawingSelect',
                'DrawingClipboard', 'DrawingModes',
                'PdfManager', 'PdfLibSaver', 'PdfAnnotationLoader',
                'PageManager', 'ModeController', 'Modal', 'Navigation',
                'Shortcuts', 'Stamps', 'Settings', 'SettingsUI',
                'TextLayerManager', 'ViewerMode', 'Zoom', 'CanvasContext',
                'JsonFolderBrowser', 'PrintManager', 'DropdownPositioner',
                'HistoryPanel', 'ProofreadingUI', 'Electron'
            ];

            for (const name of mojiQModules) {
                const globalName = `MojiQ${name}`;
                if (window[globalName] && !this._modules[name]) {
                    this._modules[name] = window[globalName];
                    this[name] = window[globalName];
                    this._aliases.set(globalName, name);
                }
            }

            // 内部モジュール（_MojiQXxx）を統合
            const internalModules = {
                '_MojiQPdfCache': 'PdfCache',
                '_MojiQPdfCompress': 'PdfCompress',
                '_MojiQPdfSpreadState': 'PdfSpreadState',
                '_MojiQPdfUtils': 'PdfUtils'
            };

            for (const [globalName, name] of Object.entries(internalModules)) {
                if (window[globalName] && !this._modules[name]) {
                    this._modules[name] = window[globalName];
                    this[name] = window[globalName];
                    this._aliases.set(globalName, name);
                }
            }

            // 特殊なモジュール（MojiQプレフィックスなしで公開されていたもの）
            const specialModules = {
                'DrawingExportImport': 'MojiQDrawingExportImport',
                'ProofreadingPanel': 'MojiQProofreadingPanel',
                'AppLock': 'MojiQAppLock'
            };

            for (const [name, globalName] of Object.entries(specialModules)) {
                const module = window[globalName] || window[name];
                if (module && !this._modules[name]) {
                    this._modules[name] = module;
                    this[name] = module;
                    if (window[globalName]) {
                        this._aliases.set(globalName, name);
                    }
                }
            }

            console.log(`[MojiQ] Integrated ${this.list().length} modules into namespace`);
        },

        /**
         * デバッグ情報を出力
         */
        debug: function() {
            console.group('[MojiQ] Namespace Status');
            console.log('Version:', this._version);
            console.log('Registered modules:', this.list());
            console.log('Aliases:', Array.from(this._aliases.entries()));
            console.groupEnd();
        }
    };

    // グローバルに公開
    window.MojiQ = MojiQ;

    // DOMContentLoaded時に既存モジュールを統合
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            MojiQ.integrateExistingModules();
        });
    } else {
        // 既にDOMが読み込まれている場合は即時実行
        setTimeout(function() {
            MojiQ.integrateExistingModules();
        }, 0);
    }
})();
