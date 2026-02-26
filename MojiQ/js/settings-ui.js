// js/settings-ui.js - MojiQ 設定UI管理モジュール

window.MojiQSettingsUI = (function() {
    'use strict';

    // DOM要素キャッシュ
    let elements = {};

    // キーキャプチャ状態
    let captureState = {
        isCapturing: false,
        currentShortcutId: null,
        capturedKey: null,
        capturedModifiers: []
    };

    /**
     * 初期化
     */
    function init() {
        cacheElements();
        bindEvents();
        // 初期値を反映
        updateScrollDirectionUI();
        updatePanelBehaviorUI();
        updateArrowKeyUI();
    }

    /**
     * DOM要素をキャッシュ
     */
    function cacheElements() {
        elements = {
            // 設定ボタン
            settingsBtn: document.getElementById('settingsBtn'),
            // ホームボタン
            homeBtn: document.getElementById('homeBtn'),
            // 設定モーダル
            settingsModal: document.getElementById('settingsModal'),
            settingsModalOkBtn: document.getElementById('settingsModalOkBtn'),
            // タブ
            settingsTabs: document.querySelectorAll('.settings-tab'),
            settingsShortcutsTab: document.getElementById('settingsShortcutsTab'),
            settingsScrollTab: document.getElementById('settingsScrollTab'),
            // ショートカット
            shortcutList: document.getElementById('shortcutList'),
            resetShortcutsBtn: document.getElementById('resetShortcutsBtn'),
            // スクロール
            scrollOptionNormal: document.getElementById('scrollOptionNormal'),
            scrollOptionInverted: document.getElementById('scrollOptionInverted'),
            scrollDirectionRadios: document.querySelectorAll('input[name="scrollDirection"]'),
            // パネル動作
            settingsPanelTab: document.getElementById('settingsPanelTab'),
            panelOptionKeepOpen: document.getElementById('panelOptionKeepOpen'),
            panelOptionCloseOnSelect: document.getElementById('panelOptionCloseOnSelect'),
            panelBehaviorRadios: document.querySelectorAll('input[name="panelBehavior"]'),
            // 方向キー
            settingsArrowKeyTab: document.getElementById('settingsArrowKeyTab'),
            arrowKeyOptionNormal: document.getElementById('arrowKeyOptionNormal'),
            arrowKeyOptionInverted: document.getElementById('arrowKeyOptionInverted'),
            arrowKeyRadios: document.querySelectorAll('input[name="arrowKeyDirection"]'),
            // キーキャプチャモーダル
            keyCaptureModal: document.getElementById('keyCaptureModal'),
            keyCaptureTitle: document.getElementById('keyCaptureTitle'),
            keyCaptureDisplay: document.getElementById('keyCaptureDisplay'),
            keyCaptureConflict: document.getElementById('keyCaptureConflict'),
            keyCaptureCancelBtn: document.getElementById('keyCaptureCancelBtn'),
            keyCaptureOkBtn: document.getElementById('keyCaptureOkBtn')
        };
    }

    /**
     * イベントバインド
     */
    function bindEvents() {
        // 設定ボタン
        if (elements.settingsBtn) {
            elements.settingsBtn.addEventListener('click', openSettingsModal);
        }

        // ホームボタン
        if (elements.homeBtn) {
            elements.homeBtn.addEventListener('click', async () => {
                const confirmed = await MojiQModal.showConfirm(
                    '読み込んだページ、描画は全て削除されます。よろしいですか？',
                    'ホーム画面に戻る'
                );
                if (confirmed && typeof window.resetToInitial === 'function') {
                    window.resetToInitial();
                }
            });
        }

        // 設定モーダルを閉じる
        if (elements.settingsModalOkBtn) {
            elements.settingsModalOkBtn.addEventListener('click', closeSettingsModal);
        }
        if (elements.settingsModal) {
            elements.settingsModal.addEventListener('click', (e) => {
                if (e.target === elements.settingsModal) {
                    closeSettingsModal();
                }
            });
        }

        // タブ切り替え
        elements.settingsTabs.forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        // スクロール方向
        elements.scrollDirectionRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (window.MojiQSettings) {
                    window.MojiQSettings.setScrollDirection(e.target.value);
                }
                updateScrollDirectionUI();
            });
        });

        // パネル動作
        elements.panelBehaviorRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (window.MojiQSettings) {
                    window.MojiQSettings.setPanelCloseOnSelect(e.target.value === 'closeOnSelect');
                }
                updatePanelBehaviorUI();
            });
        });

        // 方向キー
        elements.arrowKeyRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (window.MojiQSettings) {
                    window.MojiQSettings.setArrowKeyInverted(e.target.value === 'inverted');
                }
                updateArrowKeyUI();
            });
        });

        // ショートカットリセット
        if (elements.resetShortcutsBtn) {
            elements.resetShortcutsBtn.addEventListener('click', resetShortcuts);
        }

        // キーキャプチャモーダル
        if (elements.keyCaptureCancelBtn) {
            elements.keyCaptureCancelBtn.addEventListener('click', closeKeyCaptureModal);
        }
        if (elements.keyCaptureOkBtn) {
            elements.keyCaptureOkBtn.addEventListener('click', confirmKeyCapture);
        }
        if (elements.keyCaptureModal) {
            elements.keyCaptureModal.addEventListener('click', (e) => {
                if (e.target === elements.keyCaptureModal) {
                    closeKeyCaptureModal();
                }
            });
        }

        // 設定変更イベントをリッスン
        window.addEventListener('mojiq:settings-changed', () => {
            renderShortcutList();
            updateScrollDirectionUI();
            updatePanelBehaviorUI();
            updateArrowKeyUI();
        });
    }

    /**
     * 設定モーダルを開く
     */
    function openSettingsModal() {
        // スライドメニューを閉じる（script.jsのcloseSlideMenuと同じ処理）
        const slideMenu = document.getElementById('slideMenu');
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const slideMenuOverlay = document.getElementById('slideMenuOverlay');
        const modeTabs = document.querySelector('.mode-tabs');
        const menuLockableItems = document.querySelectorAll('.menu-lockable');

        if (slideMenu) slideMenu.classList.remove('open');
        if (hamburgerBtn) hamburgerBtn.classList.remove('active');
        if (slideMenuOverlay) slideMenuOverlay.classList.remove('visible');
        if (modeTabs) modeTabs.classList.remove('menu-locked');
        menuLockableItems.forEach(item => item.classList.remove('menu-locked'));

        // 上部メニューをグレーアウト
        menuLockableItems.forEach(item => item.classList.add('menu-locked'));

        // モーダルを表示
        if (elements.settingsModal) {
            elements.settingsModal.style.display = 'flex';
            // ショートカットリストを生成
            renderShortcutList();
            // スクロール方向UIを更新
            updateScrollDirectionUI();
            // パネル動作UIを更新
            updatePanelBehaviorUI();
            // 方向キーUIを更新
            updateArrowKeyUI();
        }
    }

    /**
     * 設定モーダルを閉じる
     */
    function closeSettingsModal() {
        if (elements.settingsModal) {
            elements.settingsModal.style.display = 'none';
        }
        // 上部メニューのグレーアウトを解除
        const menuLockableItems = document.querySelectorAll('.menu-lockable');
        menuLockableItems.forEach(item => item.classList.remove('menu-locked'));
    }

    /**
     * タブ切り替え
     */
    function switchTab(tabName) {
        // タブボタンのアクティブ状態を更新
        elements.settingsTabs.forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // タブコンテンツの表示を更新
        if (elements.settingsShortcutsTab) {
            elements.settingsShortcutsTab.classList.toggle('active', tabName === 'shortcuts');
        }
        if (elements.settingsScrollTab) {
            elements.settingsScrollTab.classList.toggle('active', tabName === 'scroll');
        }
        if (elements.settingsPanelTab) {
            elements.settingsPanelTab.classList.toggle('active', tabName === 'panel');
        }
        if (elements.settingsArrowKeyTab) {
            elements.settingsArrowKeyTab.classList.toggle('active', tabName === 'arrowKey');
        }
    }

    /**
     * ショートカットリストを生成
     */
    function renderShortcutList() {
        if (!elements.shortcutList || !window.MojiQSettings) return;

        const shortcuts = window.MojiQSettings.getAllShortcuts();
        const html = [];

        // カテゴリ順にソートして表示
        const categories = {
            'ズーム': ['zoomIn', 'zoomOut', 'zoomReset'],
            '履歴': ['undo', 'redo'],
            'ファイル': ['open', 'save', 'saveAs', 'print', 'quit'],
            'ページ移動': ['pagePrev', 'pageNext', 'pageFirst', 'pageLast'],
            '編集': ['cut', 'paste', 'clearAll'],
            '線幅': ['lineWidthUp', 'lineWidthDown'],
            'ツール': ['toolSelect', 'toolDraw', 'toolMarker', 'toolEraser', 'toolText', 'toolEyedropper'],
            'その他': ['toggleTextLayer', 'viewerMode']
        };

        for (const [category, ids] of Object.entries(categories)) {
            for (const id of ids) {
                const shortcut = shortcuts[id];
                if (!shortcut) continue;

                const displayKey = window.MojiQSettings.formatShortcutDisplay(shortcut);
                html.push(`
                    <div class="shortcut-item" data-shortcut-id="${id}">
                        <span class="shortcut-label">${shortcut.description || id}</span>
                        <button class="shortcut-key-btn" data-shortcut-id="${id}">${displayKey || '未設定'}</button>
                    </div>
                `);
            }
        }

        elements.shortcutList.innerHTML = html.join('');

        // ショートカットキーボタンにイベントリスナーを追加
        elements.shortcutList.querySelectorAll('.shortcut-key-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                openKeyCaptureModal(btn.dataset.shortcutId);
            });
        });
    }

    /**
     * スクロール方向UIを更新
     */
    function updateScrollDirectionUI() {
        if (!window.MojiQSettings) return;

        const direction = window.MojiQSettings.getScrollDirection();

        elements.scrollDirectionRadios.forEach(radio => {
            radio.checked = radio.value === direction;
        });

        // 選択状態のスタイルを更新
        if (elements.scrollOptionNormal) {
            elements.scrollOptionNormal.classList.toggle('selected', direction === 'normal');
        }
        if (elements.scrollOptionInverted) {
            elements.scrollOptionInverted.classList.toggle('selected', direction === 'inverted');
        }
    }

    /**
     * パネル動作UIを更新
     */
    function updatePanelBehaviorUI() {
        if (!window.MojiQSettings) return;

        const closeOnSelect = window.MojiQSettings.getPanelCloseOnSelect();

        elements.panelBehaviorRadios.forEach(radio => {
            if (closeOnSelect) {
                radio.checked = radio.value === 'closeOnSelect';
            } else {
                radio.checked = radio.value === 'keepOpen';
            }
        });

        // 選択状態のスタイルを更新
        if (elements.panelOptionKeepOpen) {
            elements.panelOptionKeepOpen.classList.toggle('selected', !closeOnSelect);
        }
        if (elements.panelOptionCloseOnSelect) {
            elements.panelOptionCloseOnSelect.classList.toggle('selected', closeOnSelect);
        }
    }

    /**
     * 方向キーUIを更新
     */
    function updateArrowKeyUI() {
        if (!window.MojiQSettings) return;

        const inverted = window.MojiQSettings.getArrowKeyInverted();

        elements.arrowKeyRadios.forEach(radio => {
            if (inverted) {
                radio.checked = radio.value === 'inverted';
            } else {
                radio.checked = radio.value === 'normal';
            }
        });

        // 選択状態のスタイルを更新
        if (elements.arrowKeyOptionNormal) {
            elements.arrowKeyOptionNormal.classList.toggle('selected', !inverted);
        }
        if (elements.arrowKeyOptionInverted) {
            elements.arrowKeyOptionInverted.classList.toggle('selected', inverted);
        }
    }

    /**
     * ショートカットをデフォルトにリセット
     */
    async function resetShortcuts() {
        if (window.MojiQSettings) {
            const confirmed = await MojiQModal.showConfirm(
                'デフォルトのショートカットに戻します。よろしいですか？',
                'ショートカットのリセット'
            );
            if (confirmed) {
                window.MojiQSettings.resetShortcutsToDefault();
                renderShortcutList();
            }
        }
    }

    /**
     * キーキャプチャモーダルを開く
     */
    function openKeyCaptureModal(shortcutId) {
        if (!window.MojiQSettings) return;

        const shortcut = window.MojiQSettings.getShortcut(shortcutId);
        if (!shortcut) return;

        captureState.isCapturing = true;
        captureState.currentShortcutId = shortcutId;
        captureState.capturedKey = null;
        captureState.capturedModifiers = [];

        // UI更新
        if (elements.keyCaptureTitle) {
            elements.keyCaptureTitle.textContent = `「${shortcut.description}」のショートカットを入力`;
        }
        if (elements.keyCaptureDisplay) {
            elements.keyCaptureDisplay.textContent = 'キーを押してください...';
            elements.keyCaptureDisplay.classList.add('waiting');
            elements.keyCaptureDisplay.classList.remove('has-key');
        }
        if (elements.keyCaptureConflict) {
            elements.keyCaptureConflict.style.display = 'none';
        }
        if (elements.keyCaptureOkBtn) {
            elements.keyCaptureOkBtn.disabled = true;
        }

        // モーダル表示
        if (elements.keyCaptureModal) {
            elements.keyCaptureModal.style.display = 'flex';
        }

        // キーイベントリスナーを追加
        document.addEventListener('keydown', handleKeyCapture);
    }

    /**
     * キーキャプチャモーダルを閉じる
     */
    function closeKeyCaptureModal() {
        captureState.isCapturing = false;
        captureState.currentShortcutId = null;
        captureState.capturedKey = null;
        captureState.capturedModifiers = [];

        if (elements.keyCaptureModal) {
            elements.keyCaptureModal.style.display = 'none';
        }

        document.removeEventListener('keydown', handleKeyCapture);
    }

    /**
     * キーキャプチャ処理
     */
    function handleKeyCapture(e) {
        e.preventDefault();
        e.stopPropagation();

        // Escapeでキャンセル
        if (e.key === 'Escape') {
            closeKeyCaptureModal();
            return;
        }

        // Backspaceでクリア
        if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey) {
            captureState.capturedKey = null;
            captureState.capturedModifiers = [];
            if (elements.keyCaptureDisplay) {
                elements.keyCaptureDisplay.textContent = 'キーを押してください...';
                elements.keyCaptureDisplay.classList.add('waiting');
                elements.keyCaptureDisplay.classList.remove('has-key');
            }
            if (elements.keyCaptureConflict) {
                elements.keyCaptureConflict.style.display = 'none';
            }
            if (elements.keyCaptureOkBtn) {
                elements.keyCaptureOkBtn.disabled = true;
            }
            return;
        }

        // 修飾キーのみは無視
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
            return;
        }

        // キーと修飾キーを取得
        const modifiers = [];
        if (e.ctrlKey || e.metaKey) modifiers.push('ctrl');
        if (e.shiftKey) modifiers.push('shift');
        if (e.altKey) modifiers.push('alt');

        captureState.capturedKey = e.key;
        captureState.capturedModifiers = modifiers;

        // 表示を更新
        const displayKey = window.MojiQSettings.formatShortcutDisplay({
            key: captureState.capturedKey,
            modifiers: captureState.capturedModifiers
        });

        if (elements.keyCaptureDisplay) {
            elements.keyCaptureDisplay.textContent = displayKey;
            elements.keyCaptureDisplay.classList.remove('waiting');
            elements.keyCaptureDisplay.classList.add('has-key');
        }

        // 衝突チェック
        const conflict = window.MojiQSettings.checkConflict(
            captureState.currentShortcutId,
            captureState.capturedKey,
            captureState.capturedModifiers
        );

        if (conflict.conflict) {
            if (elements.keyCaptureConflict) {
                elements.keyCaptureConflict.innerHTML = `<span class="key-capture-conflict-icon">⚠</span>「${conflict.description}」と重複しています。上書きしますか？`;
                elements.keyCaptureConflict.style.display = 'block';
            }
        } else {
            if (elements.keyCaptureConflict) {
                elements.keyCaptureConflict.style.display = 'none';
            }
        }

        // OKボタンを有効化
        if (elements.keyCaptureOkBtn) {
            elements.keyCaptureOkBtn.disabled = false;
        }
    }

    /**
     * キーキャプチャを確定
     */
    function confirmKeyCapture() {
        if (!captureState.capturedKey || !captureState.currentShortcutId) {
            closeKeyCaptureModal();
            return;
        }

        // 衝突チェック
        const conflict = window.MojiQSettings.checkConflict(
            captureState.currentShortcutId,
            captureState.capturedKey,
            captureState.capturedModifiers
        );

        // 衝突がある場合、衝突先をクリア
        if (conflict.conflict) {
            window.MojiQSettings.setShortcut(conflict.with, '', []);
        }

        // ショートカットを設定
        window.MojiQSettings.setShortcut(
            captureState.currentShortcutId,
            captureState.capturedKey,
            captureState.capturedModifiers
        );

        // リストを更新
        renderShortcutList();

        // モーダルを閉じる
        closeKeyCaptureModal();
    }

    // 自動初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        init,
        openSettingsModal,
        closeSettingsModal
    };
})();
