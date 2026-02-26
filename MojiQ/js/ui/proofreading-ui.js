/* js/ui/proofreading-ui.js - 校正指示スタンプドロップダウンUI */

/**
 * 校正指示スタンプのドロップダウン表示と選択管理
 */
window.MojiQProofreadingUI = (function() {
    'use strict';

    /**
     * パネルを閉じるべきかどうかを判定（設定に基づく）
     * @returns {boolean} true: 閉じる, false: 展開を維持
     */
    function shouldCloseOnSelect() {
        return window.MojiQSettings && window.MojiQSettings.getPanelCloseOnSelect();
    }

    function init() {
        const proofreadingInstructionToggleBtn = document.getElementById('proofreadingInstructionToggleBtn');
        const proofreadingInstructionDropdown = document.querySelector('.proofreading-instruction-dropdown');
        const proofreadingInstructionArea = document.getElementById('proofreading-instruction-area');
        const selectedProofreadingDisplay = document.getElementById('selectedProofreadingDisplay');

        // パネルを閉じるべきかを取得する関数（外部から参照可能）
        window.isProofreadingLockModeEnabled = function() {
            // 「選択すると閉じる」設定の場合はロックモード無効（閉じる）
            // 「パネルの展開を維持」設定の場合はロックモード有効（閉じない）
            return !shouldCloseOnSelect();
        };

        function openProofreadingInstructionDropdown() {
            if (proofreadingInstructionToggleBtn && proofreadingInstructionDropdown) {
                proofreadingInstructionDropdown.classList.add('open');
                proofreadingInstructionToggleBtn.classList.add('open');
                if (window.MojiQStamps && window.MojiQStamps.forceCloseAllDropdowns) {
                    window.MojiQStamps.forceCloseAllDropdowns();
                }
            }
        }

        function closeProofreadingInstructionDropdown() {
            if (proofreadingInstructionToggleBtn && proofreadingInstructionDropdown) {
                proofreadingInstructionDropdown.classList.remove('open');
                proofreadingInstructionToggleBtn.classList.remove('open');
            }
        }

        function toggleProofreadingInstructionDropdown(e) {
            e.stopPropagation();
            if (proofreadingInstructionDropdown && proofreadingInstructionDropdown.classList.contains('open')) {
                closeProofreadingInstructionDropdown();
            } else {
                openProofreadingInstructionDropdown();
            }
        }

        if (proofreadingInstructionToggleBtn) {
            proofreadingInstructionToggleBtn.addEventListener('click', toggleProofreadingInstructionDropdown);
        }

        // ドロップダウン外をクリックしたら閉じる（「パネルの展開を維持」設定時は閉じない）
        document.addEventListener('click', (e) => {
            if (proofreadingInstructionArea && !proofreadingInstructionArea.contains(e.target)) {
                if (shouldCloseOnSelect()) {
                    closeProofreadingInstructionDropdown();
                }
            }
        });

        // 指示スタンプボタン
        const instructionStampButtons = document.querySelectorAll('#proofreading-instruction-area .instruction-stamp-buttons .stamp-btn');
        const stampLabelMapping = {
            'toruStampBtn': 'トル',
            'torutsumeStampBtn': 'トルツメ',
            'torumamaStampBtn': 'トルママ',
            'zenkakuakiStampBtn': '全角アキ',
            'nibunakiStampBtn': '半角アキ',
            'kaigyouStampBtn': '改行',
            'tojiruStampBtn': 'とじる',
            'hirakuStampBtn': 'ひらく',
            'labeledRectBtn': '小文字指定',
            'doubleArrowAnnotatedBtn': '字間指示'
        };
        // 描画モードに切り替えるスタンプボタン
        const drawingModeMapping = {
            'doubleArrowAnnotatedBtn': 'doubleArrowAnnotated'
        };
        const shashokuStampLabelMapping = {
            'doneStampBtn': '済',
            'rubyStampBtn': 'ルビ'
        };

        // 校正記号スタンプボタン
        const proofreadingSymbolButtons = document.querySelectorAll('#proofreading-instruction-area .proofreading-symbol-buttons .symbol-btn');
        const symbolToolMapping = {
            'rectSymbolStampBtn': null,
            'triangleSymbolStampBtn': null,
            'chevronBtnSidebar': 'chevronBtn',
            'lshapeBtnSidebar': 'lshapeBtn',
            'zshapeBtnSidebar': 'zshapeBtn',
            'bracketBtnSidebar': 'bracketBtn',
            'semicircleBtnSidebar': null
        };
        const symbolDirectModeMapping = {
            'rectSymbolStampBtn': 'rectSymbolStamp',
            'triangleSymbolStampBtn': 'triangleSymbolStamp',
            'semicircleBtnSidebar': 'semicircle'
        };
        const symbolLabelMapping = {
            'rectSymbolStampBtn': '全角アキ',
            'triangleSymbolStampBtn': '半角アキ',
            'chevronBtnSidebar': 'アキ',
            'lshapeBtnSidebar': '行移動',
            'zshapeBtnSidebar': '改行',
            'bracketBtnSidebar': '全体移動',
            'semicircleBtnSidebar': '半円'
        };

        instructionStampButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                instructionStampButtons.forEach(b => b.classList.remove('active'));
                proofreadingSymbolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // 描画モードに切り替える場合
                const drawingMode = drawingModeMapping[btn.id];
                if (drawingMode) {
                    if (window.MojiQModeController && MojiQModeController.setMode) {
                        MojiQModeController.setMode(drawingMode);
                    }
                }

                if (selectedProofreadingDisplay) {
                    selectedProofreadingDisplay.textContent = stampLabelMapping[btn.id] || shashokuStampLabelMapping[btn.id] || '';
                    selectedProofreadingDisplay.classList.add('visible');
                }
                if (proofreadingInstructionToggleBtn) {
                    proofreadingInstructionToggleBtn.classList.add('active');
                }
                if (window.MojiQStamps && MojiQStamps.clearSelectedDisplay) {
                    MojiQStamps.clearSelectedDisplay();
                }
                if (shouldCloseOnSelect()) {
                    closeProofreadingInstructionDropdown();
                }
            });
        });

        proofreadingSymbolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const directMode = symbolDirectModeMapping[btn.id];
                if (directMode) {
                    if (window.MojiQModeController && MojiQModeController.setMode) {
                        MojiQModeController.setMode(directMode);
                    }
                } else {
                    const toolBtnId = symbolToolMapping[btn.id];
                    if (toolBtnId) {
                        const toolBtn = document.getElementById(toolBtnId);
                        if (toolBtn) toolBtn.click();
                    }
                }
                instructionStampButtons.forEach(b => b.classList.remove('active'));
                proofreadingSymbolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (selectedProofreadingDisplay) {
                    selectedProofreadingDisplay.textContent = symbolLabelMapping[btn.id] || '';
                    selectedProofreadingDisplay.classList.add('visible');
                }
                if (proofreadingInstructionToggleBtn) {
                    proofreadingInstructionToggleBtn.classList.add('active');
                }
                if (window.MojiQStamps && MojiQStamps.clearSelectedDisplay) {
                    MojiQStamps.clearSelectedDisplay();
                }
                if (shouldCloseOnSelect()) {
                    closeProofreadingInstructionDropdown();
                }
            });
        });

        // 他のツールが選択されたときのクリア関数
        function clearProofreadingInstructionActive() {
            instructionStampButtons.forEach(b => b.classList.remove('active'));
            proofreadingSymbolButtons.forEach(b => b.classList.remove('active'));
            if (selectedProofreadingDisplay) {
                selectedProofreadingDisplay.textContent = '';
                selectedProofreadingDisplay.classList.remove('visible');
            }
            if (proofreadingInstructionToggleBtn) {
                proofreadingInstructionToggleBtn.classList.remove('active');
            }
        }

        // ツールバーの他のボタンが押されたときにクリア
        const otherToolButtons = document.querySelectorAll('.tool-bar-vertical .tool-btn-icon:not(#chevronBtn):not(#lshapeBtn):not(#zshapeBtn):not(#bracketBtn)');
        otherToolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                clearProofreadingInstructionActive();
                closeProofreadingInstructionDropdown();
                if (window.MojiQStamps && MojiQStamps.forceCloseAllDropdowns) {
                    MojiQStamps.forceCloseAllDropdowns();
                }
            });
        });

        // グローバル公開
        window.MojiQProofreadingSymbol = {
            clearActive: clearProofreadingInstructionActive,
            closeDropdown: closeProofreadingInstructionDropdown
        };
    }

    return { init: init };
})();
