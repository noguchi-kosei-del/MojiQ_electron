/* js/stamps.js - スタンプ/フォントボタン・プリセット */

window.MojiQStamps = (function() {
    let stampContainer = null;
    let fontSizeInput = null;
    let colorPicker = null;
    let lineWidthRange = null;
    let ctx = null;
    let state = null;

    let fontPaletteDiv = null;
    let sizePaletteDiv = null;
    let sizeAdjustPaletteDiv = null;

    // オブジェクト保存用コールバック
    let saveObjectCallback = null;

    // モーダルが閉じた直後のフラグ（ドロップダウンが閉じるのを防ぐ）
    let modalJustClosed = false;

    // イベントリスナー参照（cleanup用）
    let boundHandlers = {
        sizeToggleClick: null,
        fontToggleClick: null,
        sizeAdjustToggleClick: null,
        documentClick: null
    };
    let modalObservers = [];

    /**
     * 初期化
     * @param {object} elements - DOM要素
     * @param {CanvasRenderingContext2D} context - キャンバスコンテキスト
     * @param {object} appState - アプリケーション状態への参照
     */
    function init(elements, context, appState) {
        stampContainer = elements.stampContainer;
        fontSizeInput = elements.fontSizeInput;
        colorPicker = elements.colorPicker;
        lineWidthRange = elements.lineWidthRange;
        ctx = context;
        state = appState;

        renderDefaultButtons();
        setupEventListeners();
    }

    // トグルボタンとドロップダウンの参照
    let sizeToggleBtn = null;
    let sizeDropdown = null;
    let fontToggleBtn = null;
    let fontDropdown = null;
    let sizeAdjustToggleBtn = null;
    let sizeAdjustDropdown = null;
    let selectedSizeDisplay = null;
    let selectedFontDisplay = null;
    let selectedSizeAdjustDisplay = null;

    // 文字サイズ（アップ・ダウン）スタンプの既定プリセット（非永続・毎セッション再生成）
    const SIZE_ADJUST_DEFAULTS = [
        { v: 0.5, d: 'up' }, { v: 1, d: 'up' }, { v: 1.5, d: 'up' }, { v: 2, d: 'up' },
        { v: 2.5, d: 'up' }, { v: 3, d: 'up' }, { v: 4, d: 'up' }, { v: 5, d: 'up' },
        { v: 0.5, d: 'down' }, { v: 1, d: 'down' }, { v: 1.5, d: 'down' }, { v: 2, d: 'down' }
    ];

    /**
     * デフォルトボタンのレンダリング
     */
    function renderDefaultButtons() {
        const sizes = [11, 12, 13, 14, 15, 16, 18, 20, 24];

        // 文字サイズエリア
        const sizeArea = document.createElement('div');
        sizeArea.className = 'stamp-toggle-area';
        sizeArea.id = 'size-stamp-area';

        // 文字サイズトグルボタン
        sizeToggleBtn = document.createElement('button');
        sizeToggleBtn.className = 'stamp-toggle-btn';
        sizeToggleBtn.id = 'sizeStampToggleBtn';
        sizeToggleBtn.innerHTML = '<span class="toggle-label">文字サイズ</span><span id="selectedSizeDisplay" class="selected-stamp-display"></span><span class="toggle-arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
        sizeArea.appendChild(sizeToggleBtn);

        // 文字サイズドロップダウン
        sizeDropdown = document.createElement('div');
        sizeDropdown.className = 'stamp-dropdown';

        const sizeScrollBox = document.createElement('div');
        sizeScrollBox.className = 'stamp-section';

        sizePaletteDiv = document.createElement('div');
        sizePaletteDiv.className = 'stamp-palette';
        sizes.forEach(size => {
            createSizeStampElement(size, sizePaletteDiv);
        });
        sizeScrollBox.appendChild(sizePaletteDiv);
        sizeDropdown.appendChild(sizeScrollBox);

        sizeDropdown.appendChild(createSizeActionRow());
        sizeArea.appendChild(sizeDropdown);
        stampContainer.appendChild(sizeArea);

        // 文字サイズ（アップ・ダウン）エリア
        stampContainer.appendChild(buildSizeAdjustArea(SIZE_ADJUST_DEFAULTS));

        // フォント指定エリア
        const fontArea = document.createElement('div');
        fontArea.className = 'stamp-toggle-area';
        fontArea.id = 'font-stamp-area';

        // フォント指定トグルボタン
        fontToggleBtn = document.createElement('button');
        fontToggleBtn.className = 'stamp-toggle-btn';
        fontToggleBtn.id = 'fontStampToggleBtn';
        fontToggleBtn.innerHTML = '<span class="toggle-label">フォント指定</span><span id="selectedFontDisplay" class="selected-stamp-display"></span><span class="toggle-arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
        fontArea.appendChild(fontToggleBtn);

        // フォント指定ドロップダウン
        fontDropdown = document.createElement('div');
        fontDropdown.className = 'stamp-dropdown';

        const fontScrollBox = document.createElement('div');
        fontScrollBox.className = 'font-section';

        fontPaletteDiv = document.createElement('div');
        fontPaletteDiv.className = 'stamp-palette';

        // フォントが無い場合は「データがありません」を表示
        const fontNoDataMsg = document.createElement('div');
        fontNoDataMsg.className = 'stamp-no-data-message';
        fontNoDataMsg.textContent = 'データがありません（追加するか作品仕様を読み込みから読み込んでください）';
        fontPaletteDiv.appendChild(fontNoDataMsg);

        fontScrollBox.appendChild(fontPaletteDiv);
        fontDropdown.appendChild(fontScrollBox);

        fontDropdown.appendChild(createFontActionRow(true));
        fontArea.appendChild(fontDropdown);
        stampContainer.appendChild(fontArea);

        // 選択表示用の参照を取得
        selectedSizeDisplay = document.getElementById('selectedSizeDisplay');
        selectedFontDisplay = document.getElementById('selectedFontDisplay');

        // トグルボタンのイベントリスナー設定
        setupToggleListeners();
    }

    /**
     * トグルボタンのイベントリスナー設定
     */
    function setupToggleListeners() {
        // 文字サイズトグル
        boundHandlers.sizeToggleClick = (e) => {
            e.stopPropagation();
            const isOpen = sizeDropdown.classList.toggle('open');
            sizeToggleBtn.classList.toggle('open', isOpen);
            if (isOpen) {
                // 他のドロップダウンを閉じる
                fontDropdown.classList.remove('open');
                fontToggleBtn.classList.remove('open');
                if (sizeAdjustDropdown) sizeAdjustDropdown.classList.remove('open');
                if (sizeAdjustToggleBtn) sizeAdjustToggleBtn.classList.remove('open');
                // 校正指示スタンプドロップダウンも閉じる
                closeProofreadingInstructionDropdown();
            } else {
                // 閉じた場合は編集・削除モードも解除
                if (window.MojiQModeController && MojiQModeController.turnOffAllSectionModes) {
                    MojiQModeController.turnOffAllSectionModes();
                }
            }
        };
        sizeToggleBtn.addEventListener('click', boundHandlers.sizeToggleClick);

        // フォント指定トグル
        boundHandlers.fontToggleClick = (e) => {
            e.stopPropagation();
            const isOpen = fontDropdown.classList.toggle('open');
            fontToggleBtn.classList.toggle('open', isOpen);
            if (isOpen) {
                // 他のドロップダウンを閉じる
                sizeDropdown.classList.remove('open');
                sizeToggleBtn.classList.remove('open');
                if (sizeAdjustDropdown) sizeAdjustDropdown.classList.remove('open');
                if (sizeAdjustToggleBtn) sizeAdjustToggleBtn.classList.remove('open');
                // 校正指示スタンプドロップダウンも閉じる
                closeProofreadingInstructionDropdown();
            } else {
                // 閉じた場合は編集・削除モードも解除
                if (window.MojiQModeController && MojiQModeController.turnOffAllSectionModes) {
                    MojiQModeController.turnOffAllSectionModes();
                }
            }
        };
        fontToggleBtn.addEventListener('click', boundHandlers.fontToggleClick);

        // 文字サイズ（アップ・ダウン）トグル
        boundHandlers.sizeAdjustToggleClick = (e) => {
            e.stopPropagation();
            if (!sizeAdjustDropdown) return;
            const isOpen = sizeAdjustDropdown.classList.toggle('open');
            sizeAdjustToggleBtn.classList.toggle('open', isOpen);
            if (isOpen) {
                // 他のドロップダウンを閉じる
                sizeDropdown.classList.remove('open');
                sizeToggleBtn.classList.remove('open');
                fontDropdown.classList.remove('open');
                fontToggleBtn.classList.remove('open');
                // 校正指示スタンプドロップダウンも閉じる
                closeProofreadingInstructionDropdown();
            } else {
                // 閉じた場合は編集・削除モードも解除
                if (window.MojiQModeController && MojiQModeController.turnOffAllSectionModes) {
                    MojiQModeController.turnOffAllSectionModes();
                }
            }
        };
        if (sizeAdjustToggleBtn) sizeAdjustToggleBtn.addEventListener('click', boundHandlers.sizeAdjustToggleClick);

        // ドロップダウン外クリックで閉じる
        boundHandlers.documentClick = (e) => {
            const sizeArea = document.getElementById('size-stamp-area');
            const fontArea = document.getElementById('font-stamp-area');
            const sizeAdjustArea = document.getElementById('sizeadjust-stamp-area');

            // モーダルが閉じた直後は無視
            if (modalJustClosed) {
                modalJustClosed = false;
                return;
            }

            // モーダルが表示されている場合は無視（表示中のモーダルのみをチェック）
            const textModal = document.getElementById('textModal');
            const fontModal = document.getElementById('fontModal');
            const promptModal = document.getElementById('promptModal');
            const confirmModal = document.getElementById('confirmModal');

            // モーダルが実際に表示されている場合のみ処理をスキップ
            const isModalVisible = (textModal && textModal.style.display === 'flex') ||
                                   (fontModal && fontModal.style.display === 'flex') ||
                                   (promptModal && promptModal.style.display === 'flex') ||
                                   (confirmModal && confirmModal.style.display === 'flex');

            if (isModalVisible) return;

            // アクションボタン（追加・編集・削除）のクリックは無視
            const sizeAddBtn = document.getElementById('sizeAddBtn');
            const sizeDeleteBtn = document.getElementById('sizeDeleteModeBtn');
            const fontAddBtn = document.getElementById('fontAddBtn');
            const fontEditBtn = document.getElementById('fontEditModeBtn');
            const fontDeleteBtn = document.getElementById('fontDeleteModeBtn');
            const sizeAdjustAddBtn = document.getElementById('sizeAdjustAddBtn');
            const sizeAdjustDeleteBtn = document.getElementById('sizeAdjustDeleteModeBtn');

            const isActionBtn = (sizeAddBtn && (e.target === sizeAddBtn || sizeAddBtn.contains(e.target))) ||
                               (sizeDeleteBtn && (e.target === sizeDeleteBtn || sizeDeleteBtn.contains(e.target))) ||
                               (fontAddBtn && (e.target === fontAddBtn || fontAddBtn.contains(e.target))) ||
                               (fontEditBtn && (e.target === fontEditBtn || fontEditBtn.contains(e.target))) ||
                               (fontDeleteBtn && (e.target === fontDeleteBtn || fontDeleteBtn.contains(e.target))) ||
                               (sizeAdjustAddBtn && (e.target === sizeAdjustAddBtn || sizeAdjustAddBtn.contains(e.target))) ||
                               (sizeAdjustDeleteBtn && (e.target === sizeAdjustDeleteBtn || sizeAdjustDeleteBtn.contains(e.target)));

            if (isActionBtn) return;

            // 「パネルの展開を維持」設定の場合はドロップダウンを閉じない
            if (window.MojiQSettings && !window.MojiQSettings.getPanelCloseOnSelect()) {
                return;
            }

            let anyClosed = false;
            if (sizeArea && !sizeArea.contains(e.target)) {
                sizeDropdown.classList.remove('open');
                sizeToggleBtn.classList.remove('open');
                anyClosed = true;
            }
            if (fontArea && !fontArea.contains(e.target)) {
                fontDropdown.classList.remove('open');
                fontToggleBtn.classList.remove('open');
                anyClosed = true;
            }
            if (sizeAdjustArea && sizeAdjustDropdown && !sizeAdjustArea.contains(e.target)) {
                sizeAdjustDropdown.classList.remove('open');
                sizeAdjustToggleBtn.classList.remove('open');
                anyClosed = true;
            }
            // ドロップダウンが閉じたら編集・削除モードも解除
            if (anyClosed && window.MojiQModeController && MojiQModeController.turnOffAllSectionModes) {
                MojiQModeController.turnOffAllSectionModes();
            }
        };
        document.addEventListener('click', boundHandlers.documentClick);

        // モーダルの表示状態を監視してフラグを設定
        const observeModal = (modalId) => {
            const modal = document.getElementById(modalId);
            if (!modal) return;

            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'style') {
                        // モーダルが非表示になったらフラグを立てる
                        if (modal.style.display === 'none' || modal.style.display === '') {
                            modalJustClosed = true;
                            // 少し遅延してフラグをリセット（次のクリックイベントの後）
                            setTimeout(() => {
                                modalJustClosed = false;
                            }, 100);
                        }
                    }
                });
            });
            observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
            modalObservers.push(observer);  // cleanup用に保存
        };

        // 各モーダルを監視
        observeModal('fontModal');
        observeModal('promptModal');
        observeModal('confirmModal');
    }

    /**
     * 校正指示スタンプドロップダウンを閉じる（DOM操作）
     */
    function closeProofreadingInstructionDropdown() {
        const proofreadingInstructionDropdown = document.querySelector('.proofreading-instruction-dropdown');
        const proofreadingInstructionToggleBtn = document.getElementById('proofreadingInstructionToggleBtn');
        if (proofreadingInstructionDropdown) {
            proofreadingInstructionDropdown.classList.remove('open');
        }
        if (proofreadingInstructionToggleBtn) {
            proofreadingInstructionToggleBtn.classList.remove('open');
        }
    }

    /**
     * ドロップダウンを閉じる
     * @param {boolean} force - trueの場合はロックモードでも強制的に閉じる
     */
    function closeAllDropdowns(force = false) {
        // ロックモードが有効で強制フラグがない場合は閉じない
        if (!force && window.isProofreadingLockModeEnabled && window.isProofreadingLockModeEnabled()) {
            return;
        }
        if (sizeDropdown) {
            sizeDropdown.classList.remove('open');
            sizeToggleBtn.classList.remove('open');
        }
        if (fontDropdown) {
            fontDropdown.classList.remove('open');
            fontToggleBtn.classList.remove('open');
        }
        if (sizeAdjustDropdown) {
            sizeAdjustDropdown.classList.remove('open');
            sizeAdjustToggleBtn.classList.remove('open');
        }
        // 編集・削除モードも解除
        if (window.MojiQModeController && MojiQModeController.turnOffAllSectionModes) {
            MojiQModeController.turnOffAllSectionModes();
        }
    }

    /**
     * 強制的にドロップダウンを閉じる（他のツール選択時に使用）
     */
    function forceCloseAllDropdowns() {
        if (sizeDropdown) {
            sizeDropdown.classList.remove('open');
            sizeToggleBtn.classList.remove('open');
        }
        if (fontDropdown) {
            fontDropdown.classList.remove('open');
            fontToggleBtn.classList.remove('open');
        }
        if (sizeAdjustDropdown) {
            sizeAdjustDropdown.classList.remove('open');
            sizeAdjustToggleBtn.classList.remove('open');
        }
        // 編集・削除モードも解除
        if (window.MojiQModeController && MojiQModeController.turnOffAllSectionModes) {
            MojiQModeController.turnOffAllSectionModes();
        }
    }

    /**
     * 文字サイズセクションのアクション行（追加・編集・削除）を生成
     * @returns {HTMLElement} アクション行要素
     */
    function createSizeActionRow() {
        const sizeActionRow = document.createElement('div');
        sizeActionRow.className = 'section-action-row triple';

        const sizeAddBtn = document.createElement('button');
        sizeAddBtn.className = 'section-add-btn';
        sizeAddBtn.id = 'sizeAddBtn';
        sizeAddBtn.textContent = '追加';
        sizeAddBtn.onclick = async (e) => {
            e.stopPropagation();
            MojiQModeController.turnOffAllSectionModes();
            const input = await MojiQModal.showPrompt('追加する文字サイズ（数値）を入力してください:', '', '文字サイズ追加');
            if (input !== null && input.trim() !== '') {
                const size = parseInt(input.trim(), 10);
                if (!isNaN(size) && size > 0) {
                    addSizeStamp(size);
                } else {
                    await MojiQModal.showAlert('有効な数値を入力してください', 'エラー');
                }
            }
        };
        sizeActionRow.appendChild(sizeAddBtn);

        const sizeEditBtn = document.createElement('button');
        sizeEditBtn.className = 'section-edit-btn';
        sizeEditBtn.id = 'sizeEditModeBtn';
        sizeEditBtn.textContent = '編集';
        sizeEditBtn.onclick = (e) => {
            e.stopPropagation();
            MojiQModeController.toggleEditModeForSection('size');
        };
        sizeActionRow.appendChild(sizeEditBtn);

        const sizeDeleteBtn = document.createElement('button');
        sizeDeleteBtn.className = 'section-delete-btn';
        sizeDeleteBtn.id = 'sizeDeleteModeBtn';
        sizeDeleteBtn.textContent = '削除';
        sizeDeleteBtn.onclick = (e) => {
            e.stopPropagation();
            MojiQModeController.toggleDeleteModeForSection('size');
        };
        sizeActionRow.appendChild(sizeDeleteBtn);

        const sizeDeleteAllBtn = document.createElement('button');
        sizeDeleteAllBtn.className = 'section-delete-all-btn';
        sizeDeleteAllBtn.id = 'sizeDeleteAllBtn';
        sizeDeleteAllBtn.textContent = 'すべて削除';
        sizeDeleteAllBtn.onclick = async (e) => {
            e.stopPropagation();
            MojiQModeController.turnOffAllSectionModes();
            const palette = sizePaletteDiv;
            if (!palette) return;
            const btns = palette.querySelectorAll('.stamp-btn[data-size]');
            if (btns.length === 0) return;
            if (await MojiQModal.showConfirm('文字サイズをすべて削除しますか？')) {
                btns.forEach(b => b.remove());
                const noDataMsg = document.createElement('div');
                noDataMsg.className = 'stamp-no-data-message';
                noDataMsg.textContent = 'データがありません（追加するか作品仕様を読み込みから読み込んでください）';
                palette.appendChild(noDataMsg);
                updateSizeButtonStates();
            }
        };
        sizeActionRow.appendChild(sizeDeleteAllBtn);

        return sizeActionRow;
    }

    /**
     * 文字サイズセクションの編集・削除・すべて削除ボタンの有効/無効を更新
     */
    function updateSizeButtonStates() {
        const hasItems = sizePaletteDiv && sizePaletteDiv.querySelectorAll('.stamp-btn[data-size]').length > 0;
        const editBtn = document.getElementById('sizeEditModeBtn');
        const deleteBtn = document.getElementById('sizeDeleteModeBtn');
        const deleteAllBtn = document.getElementById('sizeDeleteAllBtn');
        if (editBtn) editBtn.disabled = !hasItems;
        if (deleteBtn) deleteBtn.disabled = !hasItems;
        if (deleteAllBtn) deleteAllBtn.disabled = !hasItems;
    }

    /**
     * フォント指定セクションの編集・削除・すべて削除ボタンの有効/無効を更新
     */
    function updateFontButtonStates() {
        const hasItems = fontPaletteDiv && fontPaletteDiv.querySelectorAll('.stamp-btn.font-type').length > 0;
        const editBtn = document.getElementById('fontEditModeBtn');
        const deleteBtn = document.getElementById('fontDeleteModeBtn');
        const deleteAllBtn = document.getElementById('fontDeleteAllBtn');
        if (editBtn) editBtn.disabled = !hasItems;
        if (deleteBtn) deleteBtn.disabled = !hasItems;
        if (deleteAllBtn) deleteAllBtn.disabled = !hasItems;
    }

    /**
     * フォント指定セクションのアクション行（追加・編集・削除・すべて削除）を生成
     * @param {boolean} [editDisabled=true] - 編集ボタンを無効にするか
     * @returns {HTMLElement} アクション行要素
     */
    function createFontActionRow(noData) {
        if (noData === undefined) noData = true;

        const fontActionRow = document.createElement('div');
        fontActionRow.className = 'section-action-row triple';

        const fontAddBtn = document.createElement('button');
        fontAddBtn.className = 'section-add-btn';
        fontAddBtn.id = 'fontAddBtn';
        fontAddBtn.textContent = '追加';
        fontAddBtn.onclick = (e) => {
            e.stopPropagation();
            MojiQModeController.turnOffAllSectionModes();
            MojiQModal.openFontModal();
        };
        fontActionRow.appendChild(fontAddBtn);

        const fontEditBtn = document.createElement('button');
        fontEditBtn.className = 'section-edit-btn';
        fontEditBtn.id = 'fontEditModeBtn';
        fontEditBtn.textContent = '編集';
        fontEditBtn.disabled = noData;
        fontEditBtn.onclick = (e) => {
            e.stopPropagation();
            MojiQModeController.toggleEditModeForSection('font');
        };
        fontActionRow.appendChild(fontEditBtn);

        const fontDeleteBtn = document.createElement('button');
        fontDeleteBtn.className = 'section-delete-btn';
        fontDeleteBtn.id = 'fontDeleteModeBtn';
        fontDeleteBtn.textContent = '削除';
        fontDeleteBtn.disabled = noData;
        fontDeleteBtn.onclick = (e) => {
            e.stopPropagation();
            MojiQModeController.toggleDeleteModeForSection('font');
        };
        fontActionRow.appendChild(fontDeleteBtn);

        const fontDeleteAllBtn = document.createElement('button');
        fontDeleteAllBtn.className = 'section-delete-all-btn';
        fontDeleteAllBtn.id = 'fontDeleteAllBtn';
        fontDeleteAllBtn.textContent = 'すべて削除';
        fontDeleteAllBtn.disabled = noData;
        fontDeleteAllBtn.onclick = async (e) => {
            e.stopPropagation();
            MojiQModeController.turnOffAllSectionModes();
            const palette = fontPaletteDiv;
            if (!palette) return;
            const btns = palette.querySelectorAll('.stamp-btn.font-type');
            if (btns.length === 0) return;
            if (await MojiQModal.showConfirm('フォント指定をすべて削除しますか？')) {
                btns.forEach(b => b.remove());
                const noDataMsg = document.createElement('div');
                noDataMsg.className = 'stamp-no-data-message';
                noDataMsg.textContent = 'データがありません（追加するか作品仕様を読み込みから読み込んでください）';
                palette.appendChild(noDataMsg);
                updateFontButtonStates();
            }
        };
        fontActionRow.appendChild(fontDeleteAllBtn);

        return fontActionRow;
    }

    /**
     * 文字サイズスタンプボタンを生成
     * @param {number} size - 文字サイズ
     * @param {HTMLElement} container - 追加先の親要素
     */
    function createSizeStampElement(size, container) {
        const btn = document.createElement('button');
        btn.className = 'stamp-btn';
        btn.textContent = size + 'P';
        btn.dataset.size = size;
        btn.dataset.text = size + 'P';
        btn.onclick = async (e) => {
            if (state.isDeleteMode) {
                e.preventDefault();
                e.stopPropagation();
                const currentSize = parseInt(btn.dataset.size, 10);
                if (await MojiQModal.showConfirm(`サイズ「${currentSize}P」を削除しますか？`)) {
                    btn.remove();
                    // 残りのスタンプが無ければ「データがありません」を表示
                    const remainingSizes = container.querySelectorAll('.stamp-btn[data-size]');
                    if (remainingSizes.length === 0) {
                        const noDataMsg = document.createElement('div');
                        noDataMsg.className = 'stamp-no-data-message';
                        noDataMsg.textContent = 'データがありません（追加するか作品仕様を読み込みから読み込んでください）';
                        container.appendChild(noDataMsg);
                    }
                    updateSizeButtonStates();
                }
                return;
            }
            // 編集モード時
            if (state.isEditMode) {
                e.preventDefault();
                e.stopPropagation();
                const currentSize = parseInt(btn.dataset.size, 10);
                const input = await MojiQModal.showPrompt('新しい文字サイズ（数値）を入力してください:', String(currentSize), '文字サイズ編集');
                if (input !== null && input.trim() !== '') {
                    const newSize = parseInt(input.trim(), 10);
                    if (!isNaN(newSize) && newSize > 0) {
                        const newText = newSize + 'P';
                        const wasActive = btn.classList.contains('active');
                        btn.dataset.size = newSize;
                        btn.dataset.text = newText;
                        btn.textContent = newText;
                        // アクティブなボタンを編集した場合は選択状態も更新
                        if (wasActive) {
                            state.activeStampText = newText;
                            updateSelectedDisplay('size', newText);
                        }
                    } else {
                        await MojiQModal.showAlert('有効な数値を入力してください', 'エラー');
                    }
                }
                return;
            }
            MojiQModeController.setMode('text');
            state.activeStampText = e.target.dataset.text;

            const allBtns = stampContainer.querySelectorAll('.stamp-btn');
            allBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            colorPicker.value = '#ff0000';
            MojiQCanvasContext.initContext();

            // 設定に応じてドロップダウンを閉じて選択表示を更新
            if (window.MojiQSettings && window.MojiQSettings.getPanelCloseOnSelect()) {
                closeAllDropdowns(true);
            }
            updateSelectedDisplay('size', btn.dataset.text);
        };
        container.appendChild(btn);
    }

    /**
     * 文字サイズ（アップ・ダウン）スタンプの表示文言を生成
     * @param {number} value - pt数
     * @param {string} direction - 'up' または 'down'
     * @returns {string}
     */
    function sizeAdjustLabel(value, direction) {
        return value + 'pt' + (direction === 'down' ? 'ダウン' : 'アップ');
    }

    /**
     * 文字サイズ（アップ・ダウン）スタンプボタンを生成
     * @param {number} value - pt数
     * @param {string} direction - 'up' または 'down'
     * @param {HTMLElement} container - 追加先の親要素
     */
    function createSizeAdjustStampElement(value, direction, container) {
        const btn = document.createElement('button');
        btn.className = 'stamp-btn';
        const text = sizeAdjustLabel(value, direction);
        btn.textContent = text;
        btn.dataset.value = value;
        btn.dataset.direction = direction;
        btn.dataset.text = text;
        btn.onclick = async (e) => {
            // 削除モード時
            if (state.isDeleteMode) {
                e.preventDefault();
                e.stopPropagation();
                const curText = btn.dataset.text;
                if (await MojiQModal.showConfirm(`「${curText}」を削除しますか？`)) {
                    btn.remove();
                    const remaining = container.querySelectorAll('.stamp-btn[data-direction]');
                    if (remaining.length === 0) {
                        const noDataMsg = document.createElement('div');
                        noDataMsg.className = 'stamp-no-data-message';
                        noDataMsg.textContent = 'データがありません（追加してください）';
                        container.appendChild(noDataMsg);
                    }
                    updateSizeAdjustButtonStates();
                }
                return;
            }
            // 編集モード時（pt数のみ変更、方向は維持）
            if (state.isEditMode) {
                e.preventDefault();
                e.stopPropagation();
                const curValue = parseFloat(btn.dataset.value);
                const input = await MojiQModal.showPrompt('新しいpt数（数値）を入力してください:', String(curValue), '文字サイズ（アップ・ダウン）編集');
                if (input !== null && input.trim() !== '') {
                    const newValue = parseFloat(input.trim());
                    if (!isNaN(newValue) && newValue > 0) {
                        const dir = btn.dataset.direction;
                        const newText = sizeAdjustLabel(newValue, dir);
                        const wasActive = btn.classList.contains('active');
                        btn.dataset.value = newValue;
                        btn.dataset.text = newText;
                        btn.textContent = newText;
                        // アクティブなボタンを編集した場合は選択状態も更新
                        if (wasActive) {
                            state.activeStampText = newText;
                            updateSelectedDisplay('sizeAdjust', newText);
                        }
                    } else {
                        await MojiQModal.showAlert('有効な数値を入力してください', 'エラー');
                    }
                }
                return;
            }
            MojiQModeController.setMode('text');
            state.activeStampText = btn.dataset.text;

            const allBtns = stampContainer.querySelectorAll('.stamp-btn');
            allBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            colorPicker.value = '#ff0000';
            MojiQCanvasContext.initContext();

            // 設定に応じてドロップダウンを閉じて選択表示を更新
            if (window.MojiQSettings && window.MojiQSettings.getPanelCloseOnSelect()) {
                closeAllDropdowns(true);
            }
            updateSelectedDisplay('sizeAdjust', btn.dataset.text);
        };
        container.appendChild(btn);
    }

    /**
     * 文字サイズ（アップ・ダウン）セクションのアクション行（追加・編集・削除・すべて削除）を生成
     * @returns {HTMLElement} アクション行要素
     */
    function createSizeAdjustActionRow() {
        const row = document.createElement('div');
        row.className = 'section-action-row triple';

        const addBtn = document.createElement('button');
        addBtn.className = 'section-add-btn';
        addBtn.id = 'sizeAdjustAddBtn';
        addBtn.textContent = '追加';
        addBtn.onclick = async (e) => {
            e.stopPropagation();
            MojiQModeController.turnOffAllSectionModes();
            const input = await MojiQModal.showPrompt('追加するpt数（数値）を入力してください:', '', '文字サイズ（アップ・ダウン）追加');
            if (input === null || input.trim() === '') return;
            const value = parseFloat(input.trim());
            if (isNaN(value) || value <= 0) {
                await MojiQModal.showAlert('有効な数値を入力してください', 'エラー');
                return;
            }
            const dir = await MojiQModal.showChoice('方向を選択してください', [
                { label: 'アップ', value: 'up' },
                { label: 'ダウン', value: 'down' }
            ], 'アップ／ダウン');
            if (dir === null || dir === undefined) return;
            addSizeAdjustStamp(value, dir);
        };
        row.appendChild(addBtn);

        const editBtn = document.createElement('button');
        editBtn.className = 'section-edit-btn';
        editBtn.id = 'sizeAdjustEditModeBtn';
        editBtn.textContent = '編集';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            MojiQModeController.toggleEditModeForSection('sizeAdjust');
        };
        row.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'section-delete-btn';
        deleteBtn.id = 'sizeAdjustDeleteModeBtn';
        deleteBtn.textContent = '削除';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            MojiQModeController.toggleDeleteModeForSection('sizeAdjust');
        };
        row.appendChild(deleteBtn);

        const deleteAllBtn = document.createElement('button');
        deleteAllBtn.className = 'section-delete-all-btn';
        deleteAllBtn.id = 'sizeAdjustDeleteAllBtn';
        deleteAllBtn.textContent = 'すべて削除';
        deleteAllBtn.onclick = async (e) => {
            e.stopPropagation();
            MojiQModeController.turnOffAllSectionModes();
            const palette = sizeAdjustPaletteDiv;
            if (!palette) return;
            const btns = palette.querySelectorAll('.stamp-btn[data-direction]');
            if (btns.length === 0) return;
            if (await MojiQModal.showConfirm('文字サイズ（アップ・ダウン）をすべて削除しますか？')) {
                btns.forEach(b => b.remove());
                const noDataMsg = document.createElement('div');
                noDataMsg.className = 'stamp-no-data-message';
                noDataMsg.textContent = 'データがありません（追加してください）';
                palette.appendChild(noDataMsg);
                updateSizeAdjustButtonStates();
            }
        };
        row.appendChild(deleteAllBtn);

        return row;
    }

    /**
     * 文字サイズ（アップ・ダウン）セクションの編集・削除・すべて削除ボタンの有効/無効を更新
     */
    function updateSizeAdjustButtonStates() {
        const hasItems = sizeAdjustPaletteDiv && sizeAdjustPaletteDiv.querySelectorAll('.stamp-btn[data-direction]').length > 0;
        const editBtn = document.getElementById('sizeAdjustEditModeBtn');
        const deleteBtn = document.getElementById('sizeAdjustDeleteModeBtn');
        const deleteAllBtn = document.getElementById('sizeAdjustDeleteAllBtn');
        if (editBtn) editBtn.disabled = !hasItems;
        if (deleteBtn) deleteBtn.disabled = !hasItems;
        if (deleteAllBtn) deleteAllBtn.disabled = !hasItems;
    }

    /**
     * 文字サイズ（アップ・ダウン）エリアを構築（refを設定して返す）
     * @param {Array<{v:number,d:string}>|null} defaults - 初期プリセット（nullなら空＝データなし表示）
     * @returns {HTMLElement} stamp-toggle-area 要素
     */
    function buildSizeAdjustArea(defaults) {
        const area = document.createElement('div');
        area.className = 'stamp-toggle-area';
        area.id = 'sizeadjust-stamp-area';

        sizeAdjustToggleBtn = document.createElement('button');
        sizeAdjustToggleBtn.className = 'stamp-toggle-btn';
        sizeAdjustToggleBtn.id = 'sizeAdjustStampToggleBtn';
        sizeAdjustToggleBtn.innerHTML = '<span class="toggle-label">文字サイズ<br>（アップ・ダウン）</span><span id="selectedSizeAdjustDisplay" class="selected-stamp-display"></span><span class="toggle-arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
        area.appendChild(sizeAdjustToggleBtn);

        sizeAdjustDropdown = document.createElement('div');
        sizeAdjustDropdown.className = 'stamp-dropdown';

        const scrollBox = document.createElement('div');
        scrollBox.className = 'sizeadjust-section';

        sizeAdjustPaletteDiv = document.createElement('div');
        sizeAdjustPaletteDiv.className = 'stamp-palette';

        if (defaults && defaults.length > 0) {
            defaults.forEach(item => {
                createSizeAdjustStampElement(item.v, item.d, sizeAdjustPaletteDiv);
            });
        } else {
            const noDataMsg = document.createElement('div');
            noDataMsg.className = 'stamp-no-data-message';
            noDataMsg.textContent = 'データがありません（追加してください）';
            sizeAdjustPaletteDiv.appendChild(noDataMsg);
        }

        scrollBox.appendChild(sizeAdjustPaletteDiv);
        sizeAdjustDropdown.appendChild(scrollBox);
        sizeAdjustDropdown.appendChild(createSizeAdjustActionRow());
        area.appendChild(sizeAdjustDropdown);

        selectedSizeAdjustDisplay = sizeAdjustToggleBtn.querySelector('#selectedSizeAdjustDisplay');

        return area;
    }

    /**
     * 文字サイズ（アップ・ダウン）パレットを取得または作成
     * @returns {HTMLElement}
     */
    function getOrCreateSizeAdjustPalette() {
        if (!sizeAdjustPaletteDiv || !document.contains(sizeAdjustPaletteDiv)) {
            const area = buildSizeAdjustArea(null);
            const sizeArea = document.getElementById('size-stamp-area');
            if (sizeArea && sizeArea.parentNode === stampContainer) {
                stampContainer.insertBefore(area, sizeArea.nextSibling);
            } else {
                stampContainer.appendChild(area);
            }
            setupToggleListeners();
        }
        return sizeAdjustPaletteDiv;
    }

    /**
     * 新しい文字サイズ（アップ・ダウン）スタンプを追加
     * @param {number} value - pt数
     * @param {string} direction - 'up' または 'down'
     */
    function addSizeAdjustStamp(value, direction) {
        const palette = getOrCreateSizeAdjustPalette();
        const noDataMsg = palette.querySelector('.stamp-no-data-message');
        if (noDataMsg) {
            noDataMsg.remove();
        }
        createSizeAdjustStampElement(value, direction, palette);
        updateSizeAdjustButtonStates();
    }

    /**
     * 選択中のスタンプ表示を更新
     * @param {string} type - 'size' / 'font' / 'sizeAdjust'
     * @param {string} text - 表示テキスト
     */
    function updateSelectedDisplay(type, text) {
        // 10文字を超える場合は切り詰めて「…」を表示
        const displayText = text.length > 10 ? text.substring(0, 10) + '…' : text;

        // 校正指示スタンプの選択表示をクリア
        if (window.MojiQProofreadingSymbol && MojiQProofreadingSymbol.clearActive) {
            MojiQProofreadingSymbol.clearActive();
        }

        if (type === 'size' && selectedSizeDisplay) {
            // フォント指定の選択表示をクリア
            if (selectedFontDisplay) {
                selectedFontDisplay.textContent = '';
                selectedFontDisplay.classList.remove('visible');
            }
            if (fontToggleBtn) fontToggleBtn.classList.remove('active');
            // フォントスタンプボタンのアクティブ状態もクリア
            if (stampContainer) {
                const fontBtns = stampContainer.querySelectorAll('.stamp-btn.font-type');
                fontBtns.forEach(b => b.classList.remove('active'));
            }
            // 文字サイズ（アップ・ダウン）の選択表示をクリア
            if (selectedSizeAdjustDisplay) {
                selectedSizeAdjustDisplay.textContent = '';
                selectedSizeAdjustDisplay.classList.remove('visible');
            }
            if (sizeAdjustToggleBtn) sizeAdjustToggleBtn.classList.remove('active');
            if (stampContainer) {
                const saBtns = stampContainer.querySelectorAll('.stamp-btn[data-direction]');
                saBtns.forEach(b => b.classList.remove('active'));
            }

            selectedSizeDisplay.textContent = displayText;
            selectedSizeDisplay.classList.add('visible');
            // トグルボタンもアクティブに
            if (sizeToggleBtn) sizeToggleBtn.classList.add('active');
        } else if (type === 'font' && selectedFontDisplay) {
            // 文字サイズの選択表示をクリア
            if (selectedSizeDisplay) {
                selectedSizeDisplay.textContent = '';
                selectedSizeDisplay.classList.remove('visible');
            }
            if (sizeToggleBtn) sizeToggleBtn.classList.remove('active');
            // サイズスタンプボタンのアクティブ状態もクリア
            if (stampContainer) {
                const sizeBtns = stampContainer.querySelectorAll('.stamp-btn[data-size]');
                sizeBtns.forEach(b => b.classList.remove('active'));
            }
            // 文字サイズ（アップ・ダウン）の選択表示をクリア
            if (selectedSizeAdjustDisplay) {
                selectedSizeAdjustDisplay.textContent = '';
                selectedSizeAdjustDisplay.classList.remove('visible');
            }
            if (sizeAdjustToggleBtn) sizeAdjustToggleBtn.classList.remove('active');
            if (stampContainer) {
                const saBtns = stampContainer.querySelectorAll('.stamp-btn[data-direction]');
                saBtns.forEach(b => b.classList.remove('active'));
            }

            selectedFontDisplay.textContent = displayText;
            selectedFontDisplay.classList.add('visible');
            // トグルボタンもアクティブに
            if (fontToggleBtn) fontToggleBtn.classList.add('active');
        } else if (type === 'sizeAdjust' && selectedSizeAdjustDisplay) {
            // 文字サイズの選択表示をクリア
            if (selectedSizeDisplay) {
                selectedSizeDisplay.textContent = '';
                selectedSizeDisplay.classList.remove('visible');
            }
            if (sizeToggleBtn) sizeToggleBtn.classList.remove('active');
            // フォント指定の選択表示をクリア
            if (selectedFontDisplay) {
                selectedFontDisplay.textContent = '';
                selectedFontDisplay.classList.remove('visible');
            }
            if (fontToggleBtn) fontToggleBtn.classList.remove('active');
            // 文字サイズ・フォントスタンプボタンのアクティブ状態をクリア
            if (stampContainer) {
                const otherBtns = stampContainer.querySelectorAll('.stamp-btn[data-size], .stamp-btn.font-type');
                otherBtns.forEach(b => b.classList.remove('active'));
            }

            selectedSizeAdjustDisplay.textContent = displayText;
            selectedSizeAdjustDisplay.classList.add('visible');
            // トグルボタンもアクティブに
            if (sizeAdjustToggleBtn) sizeAdjustToggleBtn.classList.add('active');
        }
    }

    /**
     * 選択表示をクリア
     */
    function clearSelectedDisplay() {
        if (selectedSizeDisplay) {
            selectedSizeDisplay.textContent = '';
            selectedSizeDisplay.classList.remove('visible');
        }
        if (selectedFontDisplay) {
            selectedFontDisplay.textContent = '';
            selectedFontDisplay.classList.remove('visible');
        }
        if (selectedSizeAdjustDisplay) {
            selectedSizeAdjustDisplay.textContent = '';
            selectedSizeAdjustDisplay.classList.remove('visible');
        }
        if (sizeToggleBtn) sizeToggleBtn.classList.remove('active');
        if (fontToggleBtn) fontToggleBtn.classList.remove('active');
        if (sizeAdjustToggleBtn) sizeAdjustToggleBtn.classList.remove('active');

        // スタンプボタンのアクティブ状態もクリア
        if (stampContainer) {
            const allBtns = stampContainer.querySelectorAll('.stamp-btn');
            allBtns.forEach(b => b.classList.remove('active'));
        }
    }

    /**
     * サイズパレットを取得または作成
     * @returns {HTMLElement}
     */
    function getOrCreateSizePalette() {
        if (!sizePaletteDiv || !document.contains(sizePaletteDiv)) {
            // 文字サイズエリア
            const sizeArea = document.createElement('div');
            sizeArea.className = 'stamp-toggle-area';
            sizeArea.id = 'size-stamp-area';

            // 文字サイズトグルボタン
            sizeToggleBtn = document.createElement('button');
            sizeToggleBtn.className = 'stamp-toggle-btn';
            sizeToggleBtn.id = 'sizeStampToggleBtn';
            sizeToggleBtn.innerHTML = '<span class="toggle-label">文字サイズ</span><span id="selectedSizeDisplay" class="selected-stamp-display"></span><span class="toggle-arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
            sizeArea.appendChild(sizeToggleBtn);

            // 文字サイズドロップダウン
            sizeDropdown = document.createElement('div');
            sizeDropdown.className = 'stamp-dropdown';

            const sizeScrollBox = document.createElement('div');
            sizeScrollBox.className = 'stamp-section';

            sizePaletteDiv = document.createElement('div');
            sizePaletteDiv.className = 'stamp-palette';

            sizeScrollBox.appendChild(sizePaletteDiv);
            sizeDropdown.appendChild(sizeScrollBox);

            sizeDropdown.appendChild(createSizeActionRow());
            sizeArea.appendChild(sizeDropdown);
            stampContainer.insertBefore(sizeArea, stampContainer.firstChild);

            // 選択表示用の参照を取得
            selectedSizeDisplay = document.getElementById('selectedSizeDisplay');

            // トグルボタンのイベントリスナー設定
            setupToggleListeners();
        }
        return sizePaletteDiv;
    }

    /**
     * 新しい文字サイズスタンプを追加
     * @param {number} size - 文字サイズ
     */
    function addSizeStamp(size) {
        const palette = getOrCreateSizePalette();
        // 「データがありません」メッセージを削除
        const noDataMsg = palette.querySelector('.stamp-no-data-message');
        if (noDataMsg) {
            noDataMsg.remove();
        }
        createSizeStampElement(size, palette);
        updateSizeButtonStates();
    }

    /**
     * フォントスタンプボタンを生成
     * @param {string} name - フォント名
     * @param {string} color - 枠線の色
     * @param {HTMLElement} container - 追加先の親要素
     */
    function createFontStampElement(name, color, container) {
        const btn = document.createElement('button');
        btn.className = 'stamp-btn font-type';
        btn.textContent = name;
        btn.title = name;
        btn.dataset.text = name;
        btn.dataset.color = color;

        // 色インジケーター
        const indicator = document.createElement('span');
        indicator.className = 'color-indicator';
        indicator.style.backgroundColor = color;
        btn.prepend(indicator);

        btn.onclick = async (e) => {
            // 削除モード時
            if (state.isDeleteMode) {
                e.preventDefault();
                e.stopPropagation();
                if (await MojiQModal.showConfirm(`フォント「${btn.dataset.text}」を削除しますか？`)) {
                    btn.remove();
                    const remainingFonts = stampContainer.querySelectorAll('.stamp-btn.font-type');
                    if (remainingFonts.length === 0) {
                        const noDataMsg = document.createElement('div');
                        noDataMsg.className = 'stamp-no-data-message';
                        noDataMsg.textContent = 'データがありません（追加するか作品仕様を読み込みから読み込んでください）';
                        container.appendChild(noDataMsg);
                    }
                    updateFontButtonStates();
                }
                return;
            }

            // 編集モード時
            if (state.isEditMode) {
                e.preventDefault();
                e.stopPropagation();
                MojiQModal.openFontModalForEdit(btn);
                return;
            }

            // 通常モード時
            MojiQModeController.setMode('rect');
            state.activeStampText = null;
            // datasetから最新の値を取得（編集後も正しい値が使われるように）
            state.selectedFontInfo = { name: btn.dataset.text, color: btn.dataset.color };
            state.activeFontBtn = btn;

            const allBtns = stampContainer.querySelectorAll('.stamp-btn');
            allBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            colorPicker.value = color;

            // カラーパレットのサムネイル（rainbowColorSwatch）に色を反映
            const rainbowSwatch = document.getElementById('rainbowColorSwatch');
            if (rainbowSwatch) {
                // 固定色かどうかチェック
                const fixedColors = ['#000000', '#ff0000', '#00bfff', '#ffff00'];
                const normalizedColor = color.toLowerCase();
                if (!fixedColors.includes(normalizedColor)) {
                    // カスタムカラーの場合、rainbowSwatchに反映
                    rainbowSwatch.style.backgroundColor = color;
                    rainbowSwatch.style.border = '2px solid #ccc';
                    rainbowSwatch.setAttribute('data-color', color);
                } else {
                    // 固定色の場合、rainbowSwatchをリセット
                    rainbowSwatch.style.backgroundColor = 'transparent';
                    rainbowSwatch.style.border = '2px dashed #ccc';
                    rainbowSwatch.setAttribute('data-color', '');
                }
            }

            MojiQCanvasContext.initContext();

            // 設定に応じてドロップダウンを閉じて選択表示を更新
            if (window.MojiQSettings && window.MojiQSettings.getPanelCloseOnSelect()) {
                closeAllDropdowns(true);
            }
            updateSelectedDisplay('font', btn.dataset.text);
        };

        container.appendChild(btn);

        updateFontButtonStates();
    }

    /**
     * スタンプボタンを再構築
     * @param {Array} sizes - サイズ配列
     * @param {Array} fonts - フォント配列
     */
    function rebuildStampButtons(sizes, fonts) {
        stampContainer.innerHTML = '';
        state.fontCount = 0;

        // 文字サイズエリア（常に表示）
        const sizeArea = document.createElement('div');
        sizeArea.className = 'stamp-toggle-area';
        sizeArea.id = 'size-stamp-area';

        // 文字サイズトグルボタン
        sizeToggleBtn = document.createElement('button');
        sizeToggleBtn.className = 'stamp-toggle-btn';
        sizeToggleBtn.id = 'sizeStampToggleBtn';
        sizeToggleBtn.innerHTML = '<span class="toggle-label">文字サイズ</span><span id="selectedSizeDisplay" class="selected-stamp-display"></span><span class="toggle-arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
        sizeArea.appendChild(sizeToggleBtn);

        // 文字サイズドロップダウン
        sizeDropdown = document.createElement('div');
        sizeDropdown.className = 'stamp-dropdown';

        const sizeScrollBox = document.createElement('div');
        sizeScrollBox.className = 'stamp-section';

        sizePaletteDiv = document.createElement('div');
        sizePaletteDiv.className = 'stamp-palette';

        if (sizes && sizes.length > 0) {
            sizes.forEach(size => {
                createSizeStampElement(size, sizePaletteDiv);
            });
        } else {
            // サイズが無い場合は「データがありません」を表示
            const sizeNoDataMsg = document.createElement('div');
            sizeNoDataMsg.className = 'stamp-no-data-message';
            sizeNoDataMsg.textContent = 'データがありません（追加するか作品仕様を読み込みから読み込んでください）';
            sizePaletteDiv.appendChild(sizeNoDataMsg);
        }

        sizeScrollBox.appendChild(sizePaletteDiv);
        sizeDropdown.appendChild(sizeScrollBox);

        sizeDropdown.appendChild(createSizeActionRow());
        sizeArea.appendChild(sizeDropdown);
        stampContainer.appendChild(sizeArea);

        // 文字サイズ（アップ・ダウン）エリア（常に表示）
        stampContainer.appendChild(buildSizeAdjustArea(SIZE_ADJUST_DEFAULTS));

        // フォント指定エリア（常に表示）
        const fontArea = document.createElement('div');
        fontArea.className = 'stamp-toggle-area';
        fontArea.id = 'font-stamp-area';

        // フォント指定トグルボタン
        fontToggleBtn = document.createElement('button');
        fontToggleBtn.className = 'stamp-toggle-btn';
        fontToggleBtn.id = 'fontStampToggleBtn';
        fontToggleBtn.innerHTML = '<span class="toggle-label">フォント指定</span><span id="selectedFontDisplay" class="selected-stamp-display"></span><span class="toggle-arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
        fontArea.appendChild(fontToggleBtn);

        // フォント指定ドロップダウン
        fontDropdown = document.createElement('div');
        fontDropdown.className = 'stamp-dropdown';

        const fontScrollBox = document.createElement('div');
        fontScrollBox.className = 'font-section';

        fontPaletteDiv = document.createElement('div');
        fontPaletteDiv.className = 'stamp-palette';

        if (fonts && fonts.length > 0) {
            fonts.forEach((fontItem) => {
                const name = (typeof fontItem === 'object' && fontItem.name) ? fontItem.name : String(fontItem);
                let color = null;
                if (typeof fontItem === 'object' && fontItem.color) {
                    color = fontItem.color;
                } else {
                    color = state.autoColors[state.fontCount % state.autoColors.length];
                    state.fontCount++;
                }

                createFontStampElement(name, color, fontPaletteDiv);
            });
        } else {
            // フォントが無い場合は「データがありません」を表示
            const fontNoDataMsg = document.createElement('div');
            fontNoDataMsg.className = 'stamp-no-data-message';
            fontNoDataMsg.textContent = 'データがありません（追加するか作品仕様を読み込みから読み込んでください）';
            fontPaletteDiv.appendChild(fontNoDataMsg);
        }

        fontScrollBox.appendChild(fontPaletteDiv);
        fontDropdown.appendChild(fontScrollBox);

        fontDropdown.appendChild(createFontActionRow(!fonts || fonts.length === 0));
        fontArea.appendChild(fontDropdown);
        stampContainer.appendChild(fontArea);

        // 選択表示用の参照を取得
        selectedSizeDisplay = document.getElementById('selectedSizeDisplay');
        selectedFontDisplay = document.getElementById('selectedFontDisplay');

        // トグルボタンのイベントリスナー設定
        setupToggleListeners();
    }

    /**
     * 既存のスタンプを保持したままプリセットを追加
     * @param {Array} sizes - サイズ配列
     * @param {Array} fonts - フォント配列
     */
    function appendStampButtons(sizes, fonts) {
        // 既存のサイズを取得（重複チェック用）
        const existingSizes = new Set();
        const existingSizeBtns = stampContainer.querySelectorAll('.stamp-btn[data-size]');
        existingSizeBtns.forEach(btn => {
            existingSizes.add(parseInt(btn.dataset.size, 10));
        });

        // 既存のフォント名を取得（重複チェック用）
        const existingFonts = new Set();
        const existingFontBtns = stampContainer.querySelectorAll('.stamp-btn.font-type');
        existingFontBtns.forEach(btn => {
            existingFonts.add(btn.dataset.text);
        });

        // 文字サイズボタンを追加（重複を除く）
        if (sizes && sizes.length > 0) {
            const sizePalette = getOrCreateSizePalette();
            // 「データがありません」メッセージを削除
            const sizeNoDataMsg = sizePalette.querySelector('.stamp-no-data-message');
            if (sizeNoDataMsg) {
                sizeNoDataMsg.remove();
            }
            sizes.forEach(size => {
                if (!existingSizes.has(size)) {
                    createSizeStampElement(size, sizePalette);
                    existingSizes.add(size);
                }
            });
        }

        // フォントボタンを追加（重複を除く）
        if (fonts && fonts.length > 0) {
            const fontPalette = getOrCreateFontPalette();
            // 「データがありません」メッセージを削除
            const fontNoDataMsg = fontPalette.querySelector('.stamp-no-data-message');
            if (fontNoDataMsg) {
                fontNoDataMsg.remove();
            }
            fonts.forEach((fontItem) => {
                const name = (typeof fontItem === 'object' && fontItem.name) ? fontItem.name : String(fontItem);

                // 同名フォントが既に存在する場合はスキップ
                if (!existingFonts.has(name)) {
                    let color = null;
                    if (typeof fontItem === 'object' && fontItem.color) {
                        color = fontItem.color;
                    } else {
                        color = state.autoColors[state.fontCount % state.autoColors.length];
                        state.fontCount++;
                    }

                    createFontStampElement(name, color, fontPalette);
                    existingFonts.add(name);
                }
            });
        }
    }

    /**
     * フォントパレットを取得または作成
     * @returns {HTMLElement}
     */
    function getOrCreateFontPalette() {
        if (!fontPaletteDiv || !document.contains(fontPaletteDiv)) {
            // フォント指定エリア
            const fontArea = document.createElement('div');
            fontArea.className = 'stamp-toggle-area';
            fontArea.id = 'font-stamp-area';

            // フォント指定トグルボタン
            fontToggleBtn = document.createElement('button');
            fontToggleBtn.className = 'stamp-toggle-btn';
            fontToggleBtn.id = 'fontStampToggleBtn';
            fontToggleBtn.innerHTML = '<span class="toggle-label">フォント指定</span><span id="selectedFontDisplay" class="selected-stamp-display"></span><span class="toggle-arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
            fontArea.appendChild(fontToggleBtn);

            // フォント指定ドロップダウン
            fontDropdown = document.createElement('div');
            fontDropdown.className = 'stamp-dropdown';

            const fontScrollBox = document.createElement('div');
            fontScrollBox.className = 'font-section';

            fontPaletteDiv = document.createElement('div');
            fontPaletteDiv.className = 'stamp-palette';

            fontScrollBox.appendChild(fontPaletteDiv);
            fontDropdown.appendChild(fontScrollBox);

            fontDropdown.appendChild(createFontActionRow(true));
            fontArea.appendChild(fontDropdown);
            stampContainer.appendChild(fontArea);

            // 選択表示用の参照を取得
            selectedFontDisplay = document.getElementById('selectedFontDisplay');

            // トグルボタンのイベントリスナー設定
            setupToggleListeners();
        }
        return fontPaletteDiv;
    }

    /**
     * 新しいフォントスタンプを追加
     * @param {string} name - フォント名
     * @param {string} color - 色
     */
    function addFontStamp(name, color) {
        const palette = getOrCreateFontPalette();
        // 「データがありません」メッセージを削除
        const noDataMsg = palette.querySelector('.stamp-no-data-message');
        if (noDataMsg) {
            noDataMsg.remove();
        }
        createFontStampElement(name, color, palette);
    }

    /**
     * イベントリスナーのセットアップ
     */
    function setupEventListeners() {
        // イベントリスナーは各要素作成時に設定されるため、ここでは何もしない
    }

    /**
     * フォントラベルをオブジェクトとして保存
     * @param {object} start - 開始位置
     * @param {object} end - 終了位置
     * @param {object} fontInfo - フォント情報
     */
    function putFontLabel(start, end, fontInfo) {
        // テキスト位置を計算
        let align = 'left';
        let textX = 0;
        let textY = 0;
        const padding = 5;
        if (end.x > start.x) {
            align = 'left';
            textX = end.x + padding;
        } else {
            align = 'right';
            textX = end.x - padding;
        }
        if (end.y > start.y) {
            textY = end.y + padding;
        } else {
            textY = end.y - padding;
        }

        // オブジェクトとして保存
        const fontLabelData = {
            type: 'fontLabel',
            startPos: { x: start.x, y: start.y },
            endPos: { x: end.x, y: end.y },
            color: fontInfo.color,
            lineWidth: parseInt(lineWidthRange.value, 10) || 2,
            fontName: fontInfo.name,
            fontSize: 12,
            textAlign: align,
            textX: textX,
            textY: textY
        };

        // コールバック経由でオブジェクトを保存
        if (saveObjectCallback) {
            saveObjectCallback(fontLabelData);
        }
    }

    /**
     * オブジェクト保存コールバックを設定
     * @param {function} callback - 保存用コールバック関数
     */
    function setSaveObjectCallback(callback) {
        saveObjectCallback = callback;
    }

    /**
     * イベントリスナーをクリーンアップ
     */
    function cleanup() {
        if (sizeToggleBtn) sizeToggleBtn.removeEventListener('click', boundHandlers.sizeToggleClick);
        if (fontToggleBtn) fontToggleBtn.removeEventListener('click', boundHandlers.fontToggleClick);
        if (sizeAdjustToggleBtn) sizeAdjustToggleBtn.removeEventListener('click', boundHandlers.sizeAdjustToggleClick);
        document.removeEventListener('click', boundHandlers.documentClick);

        // MutationObserversを解除
        modalObservers.forEach(observer => observer.disconnect());
        modalObservers = [];

        // 参照をクリア
        for (const key in boundHandlers) {
            boundHandlers[key] = null;
        }
    }

    return {
        init,
        cleanup,  // メモリリーク対策: イベントリスナー解除
        renderDefaultButtons,
        createFontStampElement,
        rebuildStampButtons,
        appendStampButtons,
        addFontStamp,
        putFontLabel,
        getOrCreateFontPalette,
        setSaveObjectCallback,
        clearSelectedDisplay,
        closeAllDropdowns,
        forceCloseAllDropdowns
    };
})();
