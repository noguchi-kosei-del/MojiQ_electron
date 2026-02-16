// js/settings.js - MojiQ 設定管理モジュール

window.MojiQSettings = (function() {
    'use strict';

    // localStorage キー
    const STORAGE_KEY = 'mojiq_settings';

    // デフォルト設定
    const DEFAULT_SETTINGS = {
        version: 1,
        // ツール別線幅設定
        toolLineWidths: {
            draw: 3,        // ペン
            marker: 8,      // マーカー
            eraser: 5,      // 消しゴム
            line: 3,        // 直線
            arrow: 3,       // 矢印
            doubleArrow: 3, // 両端矢印
            rect: 3,        // 矩形
            ellipse: 3,     // 楕円
            polyline: 3     // 折れ線
        },
        shortcuts: {
            // ズーム操作
            zoomIn: { key: '=', modifiers: ['ctrl'], description: '拡大' },
            zoomOut: { key: '-', modifiers: ['ctrl'], description: '縮小' },
            zoomReset: { key: '0', modifiers: ['ctrl'], description: '100%' },
            // 履歴操作
            undo: { key: 'z', modifiers: ['ctrl'], description: '元に戻す' },
            redo: { key: 'z', modifiers: ['ctrl', 'shift'], description: 'やり直し' },
            // ファイル操作
            save: { key: 's', modifiers: ['ctrl'], description: '保存' },
            saveAs: { key: 's', modifiers: ['ctrl', 'shift'], description: '名前を付けて保存' },
            open: { key: 'o', modifiers: ['ctrl'], description: '開く' },
            print: { key: 'p', modifiers: ['ctrl'], description: '印刷' },
            quit: { key: 'q', modifiers: ['ctrl'], description: '終了' },
            // ページ移動
            pageNext: { key: 'ArrowRight', modifiers: [], description: '次ページ' },
            pagePrev: { key: 'ArrowLeft', modifiers: [], description: '前ページ' },
            pageFirst: { key: 'ArrowRight', modifiers: ['ctrl'], description: '最初のページ' },
            pageLast: { key: 'ArrowLeft', modifiers: ['ctrl'], description: '最後のページ' },
            // 線幅
            lineWidthUp: { key: ']', modifiers: ['ctrl'], description: '線を太く' },
            lineWidthDown: { key: '[', modifiers: ['ctrl'], description: '線を細く' },
            // その他
            toggleTextLayer: { key: 't', modifiers: ['ctrl'], description: 'テキスト表示切替' },
            clearAll: { key: 'Delete', modifiers: ['ctrl'], description: '全消去' },
            viewerMode: { key: 'F1', modifiers: [], description: '閲覧モード' },
            toggleDensity: { key: 'q', modifiers: [], description: '余白トグル' },
            // ツール切り替え
            toolSelect: { key: 'v', modifiers: [], description: '選択ツール' },
            toolDraw: { key: 'p', modifiers: [], description: 'ペン' },
            toolMarker: { key: 'm', modifiers: [], description: 'マーカー' },
            toolEraser: { key: 'e', modifiers: [], description: '消しゴム' },
            toolText: { key: 't', modifiers: [], description: 'テキスト' },
            toolEyedropper: { key: 'i', modifiers: [], description: 'スポイト' },
            // 編集操作
            cut: { key: 'x', modifiers: ['ctrl'], description: 'カット' },
            paste: { key: 'v', modifiers: ['ctrl'], description: 'ペースト' }
        },
        scroll: {
            direction: 'normal'  // 'normal' | 'inverted'
        },
        panel: {
            closeOnSelect: false  // false: パネルの展開を維持（デフォルト）, true: 選択すると閉じる
        },
        arrowKey: {
            inverted: false  // false: 通常（右キーで次ページ）, true: 反転（左キーで次ページ）
        }
    };

    // 現在の設定
    let settings = null;

    /**
     * 初期化
     */
    function init() {
        load();
        return settings;
    }

    /**
     * 設定読み込み
     */
    function load() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                settings = JSON.parse(saved);
                // マイグレーション処理（新しいショートカットの追加など）
                settings = migrate(settings);
            } catch (e) {
                console.warn('[MojiQSettings] Failed to parse settings, using defaults');
                settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            }
        } else {
            settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
    }

    /**
     * 設定保存
     */
    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        // イベント発火（他モジュールへの通知）
        window.dispatchEvent(new CustomEvent('mojiq:settings-changed', {
            detail: { settings: settings }
        }));
    }

    /**
     * マイグレーション - 新しいショートカットの追加や構造変更に対応
     */
    function migrate(oldSettings) {
        if (!oldSettings.version) {
            oldSettings.version = 1;
        }
        // デフォルト設定で欠けているショートカットを補完
        if (!oldSettings.shortcuts) {
            oldSettings.shortcuts = {};
        }
        for (const key in DEFAULT_SETTINGS.shortcuts) {
            if (!oldSettings.shortcuts[key]) {
                oldSettings.shortcuts[key] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.shortcuts[key]));
            }
            // description が欠けている場合は補完
            if (!oldSettings.shortcuts[key].description) {
                oldSettings.shortcuts[key].description = DEFAULT_SETTINGS.shortcuts[key].description;
            }
        }
        // スクロール設定の補完
        if (!oldSettings.scroll) {
            oldSettings.scroll = { direction: 'normal' };
        }
        // パネル設定の補完
        if (!oldSettings.panel) {
            oldSettings.panel = { closeOnSelect: false };
        }
        // 方向キー設定の補完
        if (!oldSettings.arrowKey) {
            oldSettings.arrowKey = { inverted: false };
        }
        // ツール別線幅設定の補完
        if (!oldSettings.toolLineWidths) {
            oldSettings.toolLineWidths = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.toolLineWidths));
        } else {
            // 新しいツールが追加された場合の補完
            for (const tool in DEFAULT_SETTINGS.toolLineWidths) {
                if (oldSettings.toolLineWidths[tool] === undefined) {
                    oldSettings.toolLineWidths[tool] = DEFAULT_SETTINGS.toolLineWidths[tool];
                }
            }
        }
        return oldSettings;
    }

    /**
     * ショートカット取得
     */
    function getShortcut(id) {
        if (settings && settings.shortcuts && settings.shortcuts[id]) {
            return settings.shortcuts[id];
        }
        return DEFAULT_SETTINGS.shortcuts[id] || null;
    }

    /**
     * ショートカット設定
     */
    function setShortcut(id, key, modifiers) {
        if (!settings.shortcuts[id]) {
            settings.shortcuts[id] = {};
        }
        settings.shortcuts[id].key = key;
        settings.shortcuts[id].modifiers = modifiers;
        // description は保持
        if (!settings.shortcuts[id].description && DEFAULT_SETTINGS.shortcuts[id]) {
            settings.shortcuts[id].description = DEFAULT_SETTINGS.shortcuts[id].description;
        }
        save();
    }

    /**
     * スクロール方向取得
     */
    function getScrollDirection() {
        return (settings && settings.scroll && settings.scroll.direction) || 'normal';
    }

    /**
     * スクロール方向設定
     */
    function setScrollDirection(direction) {
        if (!settings.scroll) {
            settings.scroll = {};
        }
        settings.scroll.direction = direction;
        save();
    }

    /**
     * パネルの選択時閉じる設定を取得
     */
    function getPanelCloseOnSelect() {
        return (settings && settings.panel && settings.panel.closeOnSelect) || false;
    }

    /**
     * パネルの選択時閉じる設定を設定
     */
    function setPanelCloseOnSelect(closeOnSelect) {
        if (!settings.panel) {
            settings.panel = {};
        }
        settings.panel.closeOnSelect = closeOnSelect;
        save();
    }

    /**
     * 方向キー反転設定を取得
     */
    function getArrowKeyInverted() {
        return (settings && settings.arrowKey && settings.arrowKey.inverted) || false;
    }

    /**
     * 方向キー反転設定を設定
     */
    function setArrowKeyInverted(inverted) {
        if (!settings.arrowKey) {
            settings.arrowKey = {};
        }
        settings.arrowKey.inverted = inverted;
        save();
    }

    /**
     * ツール別線幅を取得
     * @param {string} toolName - ツール名 (draw, marker, eraser, line, arrow, etc.)
     * @returns {number} - 線幅
     */
    function getToolLineWidth(toolName) {
        if (settings && settings.toolLineWidths && settings.toolLineWidths[toolName] !== undefined) {
            return settings.toolLineWidths[toolName];
        }
        return DEFAULT_SETTINGS.toolLineWidths[toolName] || 3;
    }

    /**
     * ツール別線幅を設定
     * @param {string} toolName - ツール名
     * @param {number} width - 線幅
     */
    function setToolLineWidth(toolName, width) {
        if (!settings.toolLineWidths) {
            settings.toolLineWidths = {};
        }
        settings.toolLineWidths[toolName] = width;
        save();
    }

    /**
     * 全ツールの線幅を取得
     * @returns {Object} - ツール別線幅オブジェクト
     */
    function getAllToolLineWidths() {
        return settings && settings.toolLineWidths
            ? settings.toolLineWidths
            : DEFAULT_SETTINGS.toolLineWidths;
    }

    /**
     * 全ショートカット取得
     */
    function getAllShortcuts() {
        return settings ? settings.shortcuts : DEFAULT_SETTINGS.shortcuts;
    }

    /**
     * デフォルトにリセット
     */
    function resetToDefault() {
        settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        save();
    }

    /**
     * ショートカットのみデフォルトにリセット
     */
    function resetShortcutsToDefault() {
        settings.shortcuts = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.shortcuts));
        save();
    }

    /**
     * 衝突チェック
     * @param {string} id - 設定しようとしているショートカットのID
     * @param {string} key - 設定しようとしているキー
     * @param {string[]} modifiers - 修飾キーの配列
     * @returns {Object} - { conflict: boolean, with?: string, description?: string }
     */
    function checkConflict(id, key, modifiers) {
        const sortedModifiers = [...modifiers].sort();
        for (const [shortcutId, shortcut] of Object.entries(settings.shortcuts)) {
            if (shortcutId === id) continue;
            const shortcutModifiers = [...(shortcut.modifiers || [])].sort();
            if (shortcut.key === key &&
                JSON.stringify(shortcutModifiers) === JSON.stringify(sortedModifiers)) {
                return {
                    conflict: true,
                    with: shortcutId,
                    description: shortcut.description
                };
            }
        }
        return { conflict: false };
    }

    /**
     * キー表示用の文字列を取得
     */
    function formatShortcutDisplay(shortcut) {
        if (!shortcut) return '';
        const parts = [];
        const modifiers = shortcut.modifiers || [];
        if (modifiers.includes('ctrl')) {
            parts.push('Ctrl');
        }
        if (modifiers.includes('shift')) {
            parts.push('Shift');
        }
        if (modifiers.includes('alt')) {
            parts.push('Alt');
        }
        // キー名の整形
        let keyDisplay = shortcut.key;
        if (keyDisplay === 'ArrowLeft') keyDisplay = '←';
        else if (keyDisplay === 'ArrowRight') keyDisplay = '→';
        else if (keyDisplay === 'ArrowUp') keyDisplay = '↑';
        else if (keyDisplay === 'ArrowDown') keyDisplay = '↓';
        else if (keyDisplay === ' ' || keyDisplay === 'Space') keyDisplay = 'Space';
        else if (keyDisplay === 'Delete') keyDisplay = 'Delete';
        else if (keyDisplay === 'Backspace') keyDisplay = 'Backspace';
        else if (keyDisplay.startsWith('F') && !isNaN(keyDisplay.slice(1))) keyDisplay = keyDisplay; // F1-F12
        else keyDisplay = keyDisplay.toUpperCase();

        parts.push(keyDisplay);
        return parts.join(' + ');
    }

    /**
     * デフォルト設定を取得
     */
    function getDefaultSettings() {
        return DEFAULT_SETTINGS;
    }

    // 自動初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        init,
        load,
        save,
        getShortcut,
        setShortcut,
        getScrollDirection,
        setScrollDirection,
        getPanelCloseOnSelect,
        setPanelCloseOnSelect,
        getArrowKeyInverted,
        setArrowKeyInverted,
        getToolLineWidth,
        setToolLineWidth,
        getAllToolLineWidths,
        getAllShortcuts,
        resetToDefault,
        resetShortcutsToDefault,
        checkConflict,
        formatShortcutDisplay,
        getDefaultSettings,
        DEFAULT_SETTINGS
    };
})();
