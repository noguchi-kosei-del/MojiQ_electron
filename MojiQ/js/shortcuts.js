// js/shortcuts.js

window.MojiQShortcuts = (function() {
    'use strict';

    // 初期化済みフラグ（重複初期化防止）
    let isInitialized = false;

    // イベントリスナー参照（cleanup用）
    let boundHandlers = {
        wheelHandler: null,
        keydownHandler: null,
        keyupHandler: null
    };

    // 入力フォームでのキー操作は無視するためのチェック
    function isInputActive(e) {
        const tag = e.target.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;
    }

    // スライドメニューが開いているかチェック
    function isSlideMenuOpen() {
        const slideMenu = document.getElementById('slideMenu');
        return slideMenu && slideMenu.classList.contains('open');
    }

    // モーダルが開いているかチェック
    function isModalOpen() {
        const settingsModal = document.getElementById('settingsModal');
        const keyCaptureModal = document.getElementById('keyCaptureModal');
        return (settingsModal && settingsModal.style.display !== 'none') ||
               (keyCaptureModal && keyCaptureModal.style.display !== 'none');
    }

    // ページナビゲーション用の状態管理
    let pageNavState = {
        isHolding: false,           // キー長押し中か
        pendingPage: null,          // 長押し中の目標ページ
        holdingKey: null,           // 押されているキー
        repeatCount: 0,             // リピート回数
        lastSlideTime: 0            // 最後のスライド処理時刻（スロットリング用）
    };

    // スロットリング間隔（ミリ秒）
    const SLIDE_THROTTLE_MS = 50;

    /**
     * ショートカット設定とキーイベントをマッチング
     * @param {KeyboardEvent} e - キーイベント
     * @param {string} shortcutId - ショートカットID
     * @returns {boolean} - マッチした場合true
     */
    function matchesShortcut(e, shortcutId) {
        if (!window.MojiQSettings) return false;

        const config = window.MojiQSettings.getShortcut(shortcutId);
        if (!config || !config.key) return false;

        const isCtrlOrMeta = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;

        const requiresCtrl = config.modifiers && config.modifiers.includes('ctrl');
        const requiresShift = config.modifiers && config.modifiers.includes('shift');

        if (requiresCtrl !== isCtrlOrMeta) return false;
        if (requiresShift !== isShift) return false;

        // キー比較（大文字小文字無視、特殊キー対応）
        const targetKey = config.key.toLowerCase();
        const pressedKey = e.key.toLowerCase();

        // 矢印キーやファンクションキーはそのまま比較
        if (config.key.startsWith('Arrow') || config.key.startsWith('F')) {
            return e.key === config.key;
        }

        // 通常キー
        return targetKey === pressedKey;
    }

    /**
     * 初期化
     */
    function init() {
        // 重複初期化を防止
        if (isInitialized) {
            return;
        }
        isInitialized = true;

        // ブラウザのCtrl+ホイールズームを常に防止
        boundHandlers.wheelHandler = (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
            }
        };
        document.addEventListener('wheel', boundHandlers.wheelHandler, { passive: false });

        // --- Keydown イベント ---
        boundHandlers.keydownHandler = (e) => {
            // モーダルが開いている場合はショートカットを無視
            if (isModalOpen()) return;

            // Ctrl または Command(Mac) キーが押されているか
            const isCtrlOrMeta = e.ctrlKey || e.metaKey;

            // ブラウザのズーム操作 (Ctrl + +/-/0) は常に防止する（INPUT要素にフォーカスがあっても）
            if (isCtrlOrMeta) {
                let action = null;
                // 設定を確認
                if (matchesShortcut(e, 'zoomIn') || ['=', '+', ';', 'NumpadAdd'].includes(e.key) || e.code === 'NumpadAdd') {
                    if (matchesShortcut(e, 'zoomIn')) action = 'in';
                    else if (!e.shiftKey) action = 'in'; // デフォルト動作
                }
                if (!action && (matchesShortcut(e, 'zoomOut') || ['-', '_', 'NumpadSubtract'].includes(e.key) || e.code === 'NumpadSubtract')) {
                    if (matchesShortcut(e, 'zoomOut')) action = 'out';
                    else if (!e.shiftKey) action = 'out'; // デフォルト動作
                }
                if (!action && (matchesShortcut(e, 'zoomReset') || ['0', 'Numpad0'].includes(e.key) || e.code === 'Numpad0')) {
                    if (matchesShortcut(e, 'zoomReset')) action = 'reset';
                    else if (!e.shiftKey) action = 'reset'; // デフォルト動作
                }

                if (action) {
                    e.preventDefault();
                    // INPUT要素にフォーカスがある場合、またはスライドメニューが開いている場合はズームイベントを発火しない（ブラウザズームの防止のみ）
                    if (!isInputActive(e) && !isSlideMenuOpen()) {
                        window.dispatchEvent(new CustomEvent('mojiq:zoom', { detail: { action: action } }));
                    }
                    return;
                }

                // Ctrl/Cmd + 矢印は即時移動（最初/最後のページへ）- INPUT要素にフォーカスがあっても動作させる
                if (matchesShortcut(e, 'pageFirst') || matchesShortcut(e, 'pageLast') ||
                    (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        // フォーカスを外す（スライダーなどからフォーカスを解除）
                        if (document.activeElement && document.activeElement !== document.body) {
                            document.activeElement.blur();
                        }
                        // 見開きモードかつ左綴じの場合はキー方向を反転
                        const PdfManager = window.MojiQPdfManager;
                        const isLeftBinding = PdfManager && PdfManager.isSpreadViewMode() &&
                                              PdfManager.getSpreadBindingDirection() === 'left';
                        // ユーザー設定による反転
                        const isUserInverted = window.MojiQSettings && window.MojiQSettings.getArrowKeyInverted();
                        // 両方の反転を組み合わせる（XOR: 一方だけtrueなら反転）
                        const shouldInvert = isLeftBinding !== isUserInverted;
                        let navAction;
                        if (shouldInvert) {
                            // 反転: 左キーで最初、右キーで最後
                            navAction = e.key === 'ArrowLeft' ? 'first' : 'last';
                        } else {
                            // 通常: 左キーで最後、右キーで最初
                            navAction = e.key === 'ArrowLeft' ? 'last' : 'first';
                        }
                        window.dispatchEvent(new CustomEvent('mojiq:page-navigate', { detail: { action: navAction } }));
                        return;
                    }
                }
            }

            // 1.5. Shiftキー (パン操作の開始 / スナップ描画) - isInputActiveチェックより前に処理
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                // ペン・マーカー・直線モードではスナップ描画用なのでデフォルト動作を防ぐ
                const currentMode = window.MojiQStore && window.MojiQStore.get('drawing.currentMode');
                const shiftSnapModes = ['draw', 'marker', 'line', 'lineAnnotated', 'rect', 'rectAnnotated', 'ellipse', 'ellipseAnnotated'];
                if (shiftSnapModes.includes(currentMode)) {
                    e.preventDefault();
                    // フォーカスがある場合は外す（UIにフォーカスが入る問題の対策）
                    if (document.activeElement && document.activeElement !== document.body) {
                        document.activeElement.blur();
                    }
                }
                window.dispatchEvent(new CustomEvent('mojiq:shift', { detail: { down: true } }));
            }

            if (isInputActive(e)) return;

            // 1. スペースキー (パン操作の開始)
            if (e.code === 'Space') {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:space', { detail: { down: true } }));
            }

            // 3. ページ送り (矢印キー) - 長押し対応
            if (matchesShortcut(e, 'pagePrev') || matchesShortcut(e, 'pageNext') ||
                e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();

                    // ボタン等にフォーカスがある場合は外す（hover状態が残る問題の対策）
                    if (document.activeElement && document.activeElement !== document.body) {
                        document.activeElement.blur();
                    }

                    // 見開きモードかつ左綴じの場合はキー方向を反転
                    const PdfManager = window.MojiQPdfManager;
                    const isLeftBinding = PdfManager && PdfManager.isSpreadViewMode() &&
                                          PdfManager.getSpreadBindingDirection() === 'left';
                    // ユーザー設定による反転
                    const isUserInverted = window.MojiQSettings && window.MojiQSettings.getArrowKeyInverted();
                    // 両方の反転を組み合わせる（XOR: 一方だけtrueなら反転）
                    const shouldInvert = isLeftBinding !== isUserInverted;

                    // Ctrl/Cmd + 矢印は即時移動（最初/最後のページへ）
                    if (isCtrlOrMeta) {
                        let action;
                        if (shouldInvert) {
                            // 反転: 左キーで最初、右キーで最後
                            action = e.key === 'ArrowLeft' ? 'first' : 'last';
                        } else {
                            // 通常: 左キーで最後、右キーで最初
                            action = e.key === 'ArrowLeft' ? 'last' : 'first';
                        }
                        window.dispatchEvent(new CustomEvent('mojiq:page-navigate', { detail: { action: action } }));
                        return;
                    }

                    // 長押し中の場合はスライダーのみ更新（スロットリング付き）
                    if (e.repeat) {
                        const now = performance.now();
                        if (now - pageNavState.lastSlideTime < SLIDE_THROTTLE_MS) {
                            return; // スロットリング: 間隔が短すぎる場合はスキップ
                        }
                        pageNavState.lastSlideTime = now;
                        pageNavState.repeatCount++;
                        let action;
                        if (shouldInvert) {
                            // 反転: 左キーで前、右キーで次
                            action = e.key === 'ArrowLeft' ? 'prev' : 'next';
                        } else {
                            // 通常: 左キーで次、右キーで前
                            action = e.key === 'ArrowLeft' ? 'next' : 'prev';
                        }
                        window.dispatchEvent(new CustomEvent('mojiq:page-slide', { detail: { action: action } }));
                        return;
                    }

                    // 初回キー押下
                    pageNavState.isHolding = true;
                    pageNavState.holdingKey = e.key;
                    pageNavState.repeatCount = 0;
                    let action;
                    if (shouldInvert) {
                        // 反転: 左キーで前、右キーで次
                        action = e.key === 'ArrowLeft' ? 'prev' : 'next';
                    } else {
                        // 通常: 左キーで次、右キーで前
                        action = e.key === 'ArrowLeft' ? 'next' : 'prev';
                    }
                    window.dispatchEvent(new CustomEvent('mojiq:page-navigate', { detail: { action: action } }));
                }
            }

            // --- ★ 修正: 線幅変更 (JIS配列対応) ---
            // e.code (物理配置) を使うとJIS配列で逆転現象が起きるため、e.key (文字) のみで判定します
            if (matchesShortcut(e, 'lineWidthUp')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:linewidth', { detail: { action: 'increase' } }));
            } else if (matchesShortcut(e, 'lineWidthDown')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:linewidth', { detail: { action: 'decrease' } }));
            }

            // 5. アンドゥ / リドゥ
            if (matchesShortcut(e, 'redo')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:history', { detail: { action: 'redo' } }));
            } else if (matchesShortcut(e, 'undo')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:history', { detail: { action: 'undo' } }));
            }

            // カット
            if (matchesShortcut(e, 'cut')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:cut', { detail: {} }));
            }

            // ペースト (Ctrl+Vはツール切り替えと競合しないように先に処理)
            if (matchesShortcut(e, 'paste')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:paste', { detail: {} }));
                return; // ツール切り替えをスキップ
            }

            // ★追加: PDF読み込み
            if (matchesShortcut(e, 'open')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:open-pdf', { detail: {} }));
            }

            // ★追加: 名前を付けて保存
            if (matchesShortcut(e, 'saveAs')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:save-pdf-as', { detail: {} }));
                return; // saveの処理をスキップ
            }

            // ★追加: PDF保存
            if (matchesShortcut(e, 'save')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:save-pdf', { detail: {} }));
            }

            // 6. 全消去
            if (matchesShortcut(e, 'clearAll')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:clear', { detail: {} }));
            }

            // 7. Simulator専用ショートカット（統合モード: グリッド調整中のみ有効）
            if (matchesShortcut(e, 'toggleDensity')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:sim-action', { detail: { type: 'toggleDensity' } }));
            }

            // 8. アプリ終了
            if (matchesShortcut(e, 'quit')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('mojiq:quit', { detail: {} }));
                return;
            }

            // 8.5. 印刷
            if (matchesShortcut(e, 'print')) {
                e.preventDefault();
                if (window.MojiQPrintManager) {
                    window.MojiQPrintManager.printPdf();
                }
                return;
            }

            // 8.6. テキストレイヤー表示切り替え
            if (matchesShortcut(e, 'toggleTextLayer')) {
                e.preventDefault();
                if (window.MojiQTextLayerManager) {
                    MojiQTextLayerManager.toggle();
                }
                return;
            }

            // 9. 閲覧モード
            if (matchesShortcut(e, 'viewerMode')) {
                e.preventDefault();
                if (window.MojiQViewerMode) {
                    window.MojiQViewerMode.enter();
                }
            }

            // 10. ツール切り替えショートカット（単一キー）
            // Ctrlキーが押されていない場合のみ処理
            // ビューワーモード中は無効化
            if (!isCtrlOrMeta && !(window.MojiQViewerMode && MojiQViewerMode.isActive())) {
                let toolMode = null;
                if (matchesShortcut(e, 'toolSelect')) toolMode = 'select';
                else if (matchesShortcut(e, 'toolDraw')) toolMode = 'draw';
                else if (matchesShortcut(e, 'toolMarker')) toolMode = 'marker';
                else if (matchesShortcut(e, 'toolEraser')) toolMode = 'eraser';
                else if (matchesShortcut(e, 'toolText')) toolMode = 'text';
                else if (matchesShortcut(e, 'toolEyedropper')) toolMode = 'eyedropper';

                if (toolMode) {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent('mojiq:tool-switch', { detail: { mode: toolMode } }));
                }
            }
        };
        window.addEventListener('keydown', boundHandlers.keydownHandler);

        // --- Keyup イベント ---
        boundHandlers.keyupHandler = (e) => {
            if (e.code === 'Space') {
                window.dispatchEvent(new CustomEvent('mojiq:space', { detail: { down: false } }));
            }
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                window.dispatchEvent(new CustomEvent('mojiq:shift', { detail: { down: false } }));
            }

            // ページナビゲーション: 長押し終了時にページを確定
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                if (pageNavState.isHolding && pageNavState.repeatCount > 0) {
                    // 長押しがあった場合、現在のスライダー位置でページを確定
                    window.dispatchEvent(new CustomEvent('mojiq:page-confirm', { detail: {} }));
                }
                // 状態をリセット
                pageNavState.isHolding = false;
                pageNavState.holdingKey = null;
                pageNavState.repeatCount = 0;
            }
        };
        window.addEventListener('keyup', boundHandlers.keyupHandler);
    }

    /**
     * イベントリスナーをクリーンアップ
     */
    function cleanup() {
        if (!isInitialized) return;

        document.removeEventListener('wheel', boundHandlers.wheelHandler);
        window.removeEventListener('keydown', boundHandlers.keydownHandler);
        window.removeEventListener('keyup', boundHandlers.keyupHandler);

        // 参照をクリア
        for (const key in boundHandlers) {
            boundHandlers[key] = null;
        }

        // 初期化フラグをリセット
        isInitialized = false;
    }

    // 自動初期化（後方互換性のため）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        init,
        cleanup,  // メモリリーク対策: イベントリスナー解除
        matchesShortcut  // 外部からショートカットマッチングを使用可能に
    };
})();
