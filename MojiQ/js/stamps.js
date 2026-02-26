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

    // オブジェクト保存用コールバック
    let saveObjectCallback = null;

    // モーダルが閉じた直後のフラグ（ドロップダウンが閉じるのを防ぐ）
    let modalJustClosed = false;

    // イベントリスナー参照（cleanup用）
    let boundHandlers = {
        sizeToggleClick: null,
        fontToggleClick: null,
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
    let selectedSizeDisplay = null;
    let selectedFontDisplay = null;

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

        // スクロールボックス外のアクション行（文字サイズ追加・削除）
        const sizeActionRow = document.createElement('div');
        sizeActionRow.className = 'section-action-row';

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

        const sizeDeleteBtn = document.createElement('button');
        sizeDeleteBtn.className = 'section-delete-btn';
        sizeDeleteBtn.id = 'sizeDeleteModeBtn';
        sizeDeleteBtn.textContent = '削除';
        sizeDeleteBtn.onclick = (e) => {
            e.stopPropagation();
            MojiQModeController.toggleDeleteModeForSection('size');
        };
        sizeActionRow.appendChild(sizeDeleteBtn);

        sizeDropdown.appendChild(sizeActionRow);
        sizeArea.appendChild(sizeDropdown);
        stampContainer.appendChild(sizeArea);

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

        // スクロールボックス外のアクション行（フォント追加・編集・削除）
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
        fontEditBtn.disabled = true;
        fontEditBtn.onclick = (e) => {
            e.stopPropagation();
            MojiQModeController.toggleEditModeForSection('font');
        };
        fontActionRow.appendChild(fontEditBtn);

        const fontDeleteBtn = document.createElement('button');
        fontDeleteBtn.className = 'section-delete-btn';
        fontDeleteBtn.id = 'fontDeleteModeBtn';
        fontDeleteBtn.textContent = '削除';
        fontDeleteBtn.onclick = (e) => {
            e.stopPropagation();
            MojiQModeController.toggleDeleteModeForSection('font');
        };
        fontActionRow.appendChild(fontDeleteBtn);

        fontDropdown.appendChild(fontActionRow);
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
            // 他のドロップダウンを閉じる
            if (isOpen) {
                fontDropdown.classList.remove('open');
                fontToggleBtn.classList.remove('open');
                // 校正指示スタンプドロップダウンも閉じる
                closeProofreadingInstructionDropdown();
            }
        };
        sizeToggleBtn.addEventListener('click', boundHandlers.sizeToggleClick);

        // フォント指定トグル
        boundHandlers.fontToggleClick = (e) => {
            e.stopPropagation();
            const isOpen = fontDropdown.classList.toggle('open');
            fontToggleBtn.classList.toggle('open', isOpen);
            // 他のドロップダウンを閉じる
            if (isOpen) {
                sizeDropdown.classList.remove('open');
                sizeToggleBtn.classList.remove('open');
                // 校正指示スタンプドロップダウンも閉じる
                closeProofreadingInstructionDropdown();
            }
        };
        fontToggleBtn.addEventListener('click', boundHandlers.fontToggleClick);

        // ドロップダウン外クリックで閉じる
        boundHandlers.documentClick = (e) => {
            const sizeArea = document.getElementById('size-stamp-area');
            const fontArea = document.getElementById('font-stamp-area');

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

            const isActionBtn = (sizeAddBtn && (e.target === sizeAddBtn || sizeAddBtn.contains(e.target))) ||
                               (sizeDeleteBtn && (e.target === sizeDeleteBtn || sizeDeleteBtn.contains(e.target))) ||
                               (fontAddBtn && (e.target === fontAddBtn || fontAddBtn.contains(e.target))) ||
                               (fontEditBtn && (e.target === fontEditBtn || fontEditBtn.contains(e.target))) ||
                               (fontDeleteBtn && (e.target === fontDeleteBtn || fontDeleteBtn.contains(e.target)));

            if (isActionBtn) return;

            // 「パネルの展開を維持」設定の場合はドロップダウンを閉じない
            if (window.MojiQSettings && !window.MojiQSettings.getPanelCloseOnSelect()) {
                return;
            }

            if (sizeArea && !sizeArea.contains(e.target)) {
                sizeDropdown.classList.remove('open');
                sizeToggleBtn.classList.remove('open');
            }
            if (fontArea && !fontArea.contains(e.target)) {
                fontDropdown.classList.remove('open');
                fontToggleBtn.classList.remove('open');
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
                if (await MojiQModal.showConfirm(`サイズ「${size}P」を削除しますか？`)) {
                    btn.remove();
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
            updateSelectedDisplay('size', size + 'P');
        };
        container.appendChild(btn);
    }

    /**
     * 選択中のスタンプ表示を更新
     * @param {string} type - 'size' または 'font'
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

            selectedFontDisplay.textContent = displayText;
            selectedFontDisplay.classList.add('visible');
            // トグルボタンもアクティブに
            if (fontToggleBtn) fontToggleBtn.classList.add('active');
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
        if (sizeToggleBtn) sizeToggleBtn.classList.remove('active');
        if (fontToggleBtn) fontToggleBtn.classList.remove('active');

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

            // スクロールボックス外のアクション行（文字サイズ追加・削除）
            const sizeActionRow = document.createElement('div');
            sizeActionRow.className = 'section-action-row';

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

            const sizeDeleteBtn = document.createElement('button');
            sizeDeleteBtn.className = 'section-delete-btn';
            sizeDeleteBtn.id = 'sizeDeleteModeBtn';
            sizeDeleteBtn.textContent = '削除';
            sizeDeleteBtn.onclick = (e) => {
                e.stopPropagation();
                MojiQModeController.toggleDeleteModeForSection('size');
            };
            sizeActionRow.appendChild(sizeDeleteBtn);

            sizeDropdown.appendChild(sizeActionRow);
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
        createSizeStampElement(size, palette);
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
                    // フォントスタンプが全て削除されたら編集ボタンを無効化
                    const remainingFonts = stampContainer.querySelectorAll('.stamp-btn.font-type');
                    const fontEditModeBtn = document.getElementById('fontEditModeBtn');
                    if (remainingFonts.length === 0 && fontEditModeBtn) {
                        fontEditModeBtn.disabled = true;
                    }
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

        // フォントスタンプが追加されたら編集ボタンを有効化
        const fontEditModeBtn = document.getElementById('fontEditModeBtn');
        if (fontEditModeBtn) {
            fontEditModeBtn.disabled = false;
        }
    }

    /**
     * スタンプボタンを再構築
     * @param {Array} sizes - サイズ配列
     * @param {Array} fonts - フォント配列
     */
    function rebuildStampButtons(sizes, fonts) {
        stampContainer.innerHTML = '';
        state.fontCount = 0;

        // 文字サイズエリア
        if (sizes && sizes.length > 0) {
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

            // スクロールボックス外のアクション行（文字サイズ追加・削除）
            const sizeActionRow = document.createElement('div');
            sizeActionRow.className = 'section-action-row';

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

            const sizeDeleteBtn = document.createElement('button');
            sizeDeleteBtn.className = 'section-delete-btn';
            sizeDeleteBtn.id = 'sizeDeleteModeBtn';
            sizeDeleteBtn.textContent = '削除';
            sizeDeleteBtn.onclick = (e) => {
                e.stopPropagation();
                MojiQModeController.toggleDeleteModeForSection('size');
            };
            sizeActionRow.appendChild(sizeDeleteBtn);

            sizeDropdown.appendChild(sizeActionRow);
            sizeArea.appendChild(sizeDropdown);
            stampContainer.appendChild(sizeArea);
        }

        // フォント指定エリア
        if (fonts && fonts.length > 0) {
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

            fontScrollBox.appendChild(fontPaletteDiv);
            fontDropdown.appendChild(fontScrollBox);

            // スクロールボックス外のアクション行（フォント追加・編集・削除）
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
            fontEditBtn.onclick = (e) => {
                e.stopPropagation();
                MojiQModeController.toggleEditModeForSection('font');
            };
            fontActionRow.appendChild(fontEditBtn);

            const fontDeleteBtn = document.createElement('button');
            fontDeleteBtn.className = 'section-delete-btn';
            fontDeleteBtn.id = 'fontDeleteModeBtn';
            fontDeleteBtn.textContent = '削除';
            fontDeleteBtn.onclick = (e) => {
                e.stopPropagation();
                MojiQModeController.toggleDeleteModeForSection('font');
            };
            fontActionRow.appendChild(fontDeleteBtn);

            fontDropdown.appendChild(fontActionRow);
            fontArea.appendChild(fontDropdown);
            stampContainer.appendChild(fontArea);
        }

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

            // スクロールボックス外のアクション行（フォント追加・編集・削除）
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
            fontEditBtn.onclick = (e) => {
                e.stopPropagation();
                MojiQModeController.toggleEditModeForSection('font');
            };
            fontActionRow.appendChild(fontEditBtn);

            const fontDeleteBtn = document.createElement('button');
            fontDeleteBtn.className = 'section-delete-btn';
            fontDeleteBtn.id = 'fontDeleteModeBtn';
            fontDeleteBtn.textContent = '削除';
            fontDeleteBtn.onclick = (e) => {
                e.stopPropagation();
                MojiQModeController.toggleDeleteModeForSection('font');
            };
            fontActionRow.appendChild(fontDeleteBtn);

            fontDropdown.appendChild(fontActionRow);
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
