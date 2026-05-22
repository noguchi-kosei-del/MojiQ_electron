/**
 * MojiQ Error Handler - 標準化されたエラーハンドリング
 *
 * エラーの分類、ログ、ユーザー通知を統一的に管理します。
 *
 * 使用例:
 *   const ErrorHandler = MojiQ.ErrorHandler || window.MojiQErrorHandler;
 *
 *   try {
 *     // 処理
 *   } catch (e) {
 *     ErrorHandler.handle(e, 'PdfManager.loadPdf', {
 *       level: 'error',
 *       notify: true,
 *       context: { fileName: 'test.pdf' }
 *     });
 *   }
 */
window.MojiQErrorHandler = (function() {
    'use strict';

    /**
     * エラーレベル定義
     */
    const ErrorLevel = {
        DEBUG: 'debug',    // デバッグ情報（本番では無視）
        INFO: 'info',      // 情報（ログのみ）
        WARN: 'warn',      // 警告（続行可能）
        ERROR: 'error',    // エラー（操作失敗）
        FATAL: 'fatal'     // 致命的エラー（アプリ停止の可能性）
    };

    /**
     * エラーカテゴリ定義
     */
    const ErrorCategory = {
        IO: 'io',              // ファイルI/O関連
        NETWORK: 'network',    // ネットワーク関連
        PARSE: 'parse',        // パース/変換関連
        RENDER: 'render',      // 描画関連
        VALIDATION: 'validation', // バリデーション関連
        MEMORY: 'memory',      // メモリ関連
        UNKNOWN: 'unknown'     // 不明
    };

    // 設定
    let config = {
        debugMode: false,
        logToConsole: true,
        collectErrors: true,
        maxCollectedErrors: 100
    };

    // 収集されたエラー履歴
    const errorHistory = [];

    /**
     * エラーを分類
     * @param {Error} error - エラーオブジェクト
     * @returns {string} エラーカテゴリ
     */
    function categorizeError(error) {
        const message = (error.message || '').toLowerCase();

        if (message.includes('network') || message.includes('fetch') || message.includes('xhr')) {
            return ErrorCategory.NETWORK;
        }
        if (message.includes('json') || message.includes('parse') || message.includes('syntax')) {
            return ErrorCategory.PARSE;
        }
        if (message.includes('canvas') || message.includes('render') || message.includes('draw')) {
            return ErrorCategory.RENDER;
        }
        if (message.includes('file') || message.includes('read') || message.includes('write') || message.includes('save')) {
            return ErrorCategory.IO;
        }
        if (message.includes('memory') || message.includes('heap') || message.includes('allocation')) {
            return ErrorCategory.MEMORY;
        }
        if (message.includes('invalid') || message.includes('required') || message.includes('validation')) {
            return ErrorCategory.VALIDATION;
        }

        return ErrorCategory.UNKNOWN;
    }

    /**
     * ユーザー向けメッセージを生成
     * @param {Error} error - エラーオブジェクト
     * @param {string} category - エラーカテゴリ
     * @returns {string} ユーザー向けメッセージ
     */
    function getUserMessage(error, category) {
        const baseMessages = {
            [ErrorCategory.IO]: 'ファイルの読み書きに失敗しました',
            [ErrorCategory.NETWORK]: 'ネットワークエラーが発生しました',
            [ErrorCategory.PARSE]: 'データの解析に失敗しました',
            [ErrorCategory.RENDER]: '描画処理でエラーが発生しました',
            [ErrorCategory.VALIDATION]: '入力データが不正です',
            [ErrorCategory.MEMORY]: 'メモリ不足が発生しました',
            [ErrorCategory.UNKNOWN]: 'エラーが発生しました'
        };

        const baseMessage = baseMessages[category] || baseMessages[ErrorCategory.UNKNOWN];

        // 詳細メッセージがある場合は追加
        if (error.message && !error.message.includes('undefined') && error.message.length < 100) {
            return `${baseMessage}: ${error.message}`;
        }

        return baseMessage;
    }

    /**
     * エラーをログ出力
     * @param {Object} errorInfo - エラー情報
     */
    function logError(errorInfo) {
        if (!config.logToConsole) return;

        const prefix = `[MojiQ ${errorInfo.level.toUpperCase()}]`;
        const location = errorInfo.location ? ` (${errorInfo.location})` : '';
        const message = `${prefix}${location} ${errorInfo.message}`;

        switch (errorInfo.level) {
            case ErrorLevel.DEBUG:
                if (config.debugMode) console.debug(message, errorInfo);
                break;
            case ErrorLevel.INFO:
                console.info(message);
                break;
            case ErrorLevel.WARN:
                console.warn(message, errorInfo.error);
                break;
            case ErrorLevel.ERROR:
            case ErrorLevel.FATAL:
                console.error(message, errorInfo.error);
                if (errorInfo.context) {
                    console.error('Context:', errorInfo.context);
                }
                break;
        }
    }

    /**
     * ユーザーに通知
     * @param {Object} errorInfo - エラー情報
     */
    function notifyUser(errorInfo) {
        const Modal = window.MojiQModal || window.MojiQ?.Modal;
        if (!Modal || !Modal.showAlert) {
            // フォールバック: alert
            alert(errorInfo.userMessage);
            return;
        }

        const title = errorInfo.level === ErrorLevel.FATAL ? '致命的エラー' :
                      errorInfo.level === ErrorLevel.ERROR ? 'エラー' :
                      errorInfo.level === ErrorLevel.WARN ? '警告' : '情報';

        Modal.showAlert(errorInfo.userMessage, title);
    }

    /**
     * エラーを履歴に追加
     * @param {Object} errorInfo - エラー情報
     */
    function collectError(errorInfo) {
        if (!config.collectErrors) return;

        errorHistory.push({
            ...errorInfo,
            timestamp: new Date().toISOString()
        });

        // 最大数を超えたら古いものを削除
        while (errorHistory.length > config.maxCollectedErrors) {
            errorHistory.shift();
        }
    }

    /**
     * エラーをハンドル
     * @param {Error|string} error - エラーオブジェクトまたはメッセージ
     * @param {string} location - エラー発生場所（例: 'PdfManager.loadPdf'）
     * @param {Object} options - オプション
     * @param {string} options.level - エラーレベル（デフォルト: 'error'）
     * @param {boolean} options.notify - ユーザーに通知するか（デフォルト: false）
     * @param {Object} options.context - 追加のコンテキスト情報
     * @param {string} options.userMessage - カスタムユーザーメッセージ
     * @returns {Object} エラー情報
     */
    function handle(error, location = '', options = {}) {
        const {
            level = ErrorLevel.ERROR,
            notify = false,
            context = null,
            userMessage = null
        } = options;

        // エラーオブジェクトの正規化
        const errorObj = error instanceof Error ? error : new Error(String(error));
        const category = categorizeError(errorObj);

        const errorInfo = {
            error: errorObj,
            message: errorObj.message,
            stack: errorObj.stack,
            location: location,
            level: level,
            category: category,
            context: context,
            userMessage: userMessage || getUserMessage(errorObj, category)
        };

        // ログ出力
        logError(errorInfo);

        // 履歴に追加
        collectError(errorInfo);

        // ユーザー通知
        if (notify) {
            notifyUser(errorInfo);
        }

        return errorInfo;
    }

    /**
     * try-catchラッパー（同期関数用）
     * @param {Function} fn - 実行する関数
     * @param {string} location - エラー発生場所
     * @param {Object} options - handleオプション
     * @returns {*} 関数の戻り値またはundefined
     */
    function tryCatch(fn, location, options = {}) {
        try {
            return fn();
        } catch (e) {
            handle(e, location, options);
            return options.defaultValue;
        }
    }

    /**
     * try-catchラッパー（非同期関数用）
     * @param {Function} fn - 実行する非同期関数
     * @param {string} location - エラー発生場所
     * @param {Object} options - handleオプション
     * @returns {Promise<*>} 関数の戻り値またはundefined
     */
    async function tryCatchAsync(fn, location, options = {}) {
        try {
            return await fn();
        } catch (e) {
            handle(e, location, options);
            return options.defaultValue;
        }
    }

    /**
     * バリデーションエラーを生成してハンドル
     * @param {string} message - エラーメッセージ
     * @param {string} location - エラー発生場所
     * @param {Object} options - オプション
     * @returns {Object} エラー情報
     */
    function validationError(message, location, options = {}) {
        const error = new Error(message);
        return handle(error, location, {
            ...options,
            level: ErrorLevel.WARN
        });
    }

    /**
     * エラー履歴を取得
     * @returns {Array} エラー履歴
     */
    function getHistory() {
        return [...errorHistory];
    }

    /**
     * エラー履歴をクリア
     */
    function clearHistory() {
        errorHistory.length = 0;
    }

    /**
     * 設定を更新
     * @param {Object} newConfig - 新しい設定
     */
    function configure(newConfig) {
        config = { ...config, ...newConfig };
    }

    /**
     * 設定を取得
     * @returns {Object} 現在の設定
     */
    function getConfig() {
        return { ...config };
    }

    // Public API
    return {
        // エラーレベル定数
        Level: ErrorLevel,
        Category: ErrorCategory,

        // 主要メソッド
        handle: handle,
        tryCatch: tryCatch,
        tryCatchAsync: tryCatchAsync,
        validationError: validationError,

        // 履歴管理
        getHistory: getHistory,
        clearHistory: clearHistory,

        // 設定
        configure: configure,
        getConfig: getConfig,

        // ユーティリティ
        categorize: categorizeError,
        getUserMessage: getUserMessage
    };
})();
