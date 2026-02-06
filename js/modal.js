/* js/modal.js - モーダル制御 */

window.MojiQModal = (function() {
    // テキストモーダル要素
    let textModal = null;
    let modalTextInput = null;
    let modalVerticalCheck = null;
    let modalFontSizeRow = null;
    let modalFontSizeInput = null;
    let modalCancelBtn = null;
    let modalOkBtn = null;

    // フォントモーダル要素
    let fontModal = null;
    let modalFontNameInput = null;
    let modalFontColorInput = null;
    let fontModalCancelBtn = null;
    let fontModalAddBtn = null;

    // 汎用プロンプトモーダル要素
    let promptModal = null;
    let promptModalTitle = null;
    let promptModalLabel = null;
    let promptModalInput = null;
    let promptModalCancelBtn = null;
    let promptModalOkBtn = null;
    let promptResolve = null;  // Promiseのresolve関数

    // 汎用確認ダイアログモーダル要素
    let confirmModal = null;
    let confirmModalTitle = null;
    let confirmModalMessage = null;
    let confirmModalCancelBtn = null;
    let confirmModalOkBtn = null;
    let confirmResolve = null;  // Promiseのresolve関数

    // 一文字入力モーダル要素
    let singleCharModal = null;
    let singleCharInput = null;
    let singleCharCancelBtn = null;
    let singleCharOkBtn = null;
    let singleCharResolve = null;  // Promiseのresolve関数

    // 左側バーのフォントサイズ入力欄（新規作成時のデフォルト値用）
    let sidebarFontSizeInput = null;

    let ctx = null;
    let state = null;
    let pendingDrawingInfo = null;

    /**
     * 確実にフォーカスを設定する
     * @param {HTMLElement} element - フォーカスを設定する要素
     * @param {number} delay - 遅延時間（ms）
     */
    function ensureFocus(element, delay = 100) {
        // 現在のフォーカスをクリア
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }

        // 複数回のリトライでフォーカスを確実に設定
        const tryFocus = (retryCount = 0) => {
            if (element && typeof element.focus === 'function') {
                element.focus();

                // select()メソッドがある場合は選択状態にする（inputやtextarea）
                if (typeof element.select === 'function') {
                    element.select();
                }

                // フォーカスが当たらなかった場合、最大5回リトライ
                if (document.activeElement !== element && retryCount < 5) {
                    setTimeout(() => tryFocus(retryCount + 1), 100);
                }
            }
        };

        // 即座に1回試行
        setTimeout(() => {
            element?.focus();
        }, 0);

        // 遅延してリトライ
        setTimeout(() => tryFocus(), delay);
    }

    // テキスト編集用
    let editingTextObject = null;  // 編集中のテキストオブジェクト
    let editingTextIndex = null;   // 編集中のテキストオブジェクトのインデックス
    let editingTextId = null;      // 編集中のテキストオブジェクトのID
    let editingPageNum = null;     // 編集中のテキストオブジェクトのページ番号

    // アノテーション編集用
    let editingAnnotationObject = null;  // 編集中のアノテーションを持つオブジェクト
    let editingAnnotationIndex = null;   // 編集中のオブジェクトのインデックス
    let editingAnnotationId = null;      // 編集中のオブジェクトのID
    let editingAnnotationPageNum = null; // 編集中のオブジェクトのページ番号

    // コールバック
    let saveHistoryCallback = null;
    let executeTextDrawingCallback = null;
    let createFontStampCallback = null;
    let updateTextObjectCallback = null;  // テキストオブジェクト更新用コールバック
    let updateAnnotationCallback = null;  // アノテーション更新用コールバック

    // イベントリスナー参照（cleanup用）
    let boundHandlers = {
        modalCancelClick: null,
        modalOkClick: null,
        textModalClick: null,
        modalTextInputFocus: null,
        fontModalCancelClick: null,
        fontModalAddClick: null,
        promptModalOkClick: null,
        promptModalCancelClick: null,
        promptModalInputKeydown: null,
        promptModalClick: null,
        promptContentClick: null,
        confirmModalOkClick: null,
        confirmModalCancelClick: null,
        confirmModalKeydown: null,
        confirmModalClick: null,
        // singleCharModal用
        singleCharOkClick: null,
        singleCharCancelClick: null,
        singleCharInputKeydown: null,
        singleCharModalClick: null,
        singleCharContentClick: null
    };
    let textModalObserver = null;

    /**
     * 初期化
     * @param {object} elements - DOM要素
     * @param {CanvasRenderingContext2D} context - キャンバスコンテキスト
     * @param {object} appState - アプリケーション状態への参照
     * @param {object} callbacks - コールバック関数群
     */
    function init(elements, context, appState, callbacks) {
        textModal = elements.textModal;
        modalTextInput = elements.modalTextInput;
        modalVerticalCheck = elements.modalVerticalCheck;
        modalFontSizeRow = elements.modalFontSizeRow;
        modalFontSizeInput = elements.modalFontSizeInput;
        modalCancelBtn = elements.modalCancelBtn;
        modalOkBtn = elements.modalOkBtn;

        fontModal = elements.fontModal;
        modalFontNameInput = elements.modalFontNameInput;
        modalFontColorInput = elements.modalFontColorInput;
        fontModalCancelBtn = elements.fontModalCancelBtn;
        fontModalAddBtn = elements.fontModalAddBtn;

        // 汎用プロンプトモーダル（DOM直接取得）
        promptModal = document.getElementById('promptModal');
        promptModalTitle = document.getElementById('promptModalTitle');
        promptModalLabel = document.getElementById('promptModalLabel');
        promptModalInput = document.getElementById('promptModalInput');
        promptModalCancelBtn = document.getElementById('promptModalCancelBtn');
        promptModalOkBtn = document.getElementById('promptModalOkBtn');

        // 汎用確認ダイアログモーダル（DOM直接取得）
        confirmModal = document.getElementById('confirmModal');
        confirmModalTitle = document.getElementById('confirmModalTitle');
        confirmModalMessage = document.getElementById('confirmModalMessage');
        confirmModalCancelBtn = document.getElementById('confirmModalCancelBtn');
        confirmModalOkBtn = document.getElementById('confirmModalOkBtn');

        // 一文字入力モーダル（DOM直接取得）
        singleCharModal = document.getElementById('singleCharModal');
        singleCharInput = document.getElementById('singleCharInput');
        singleCharCancelBtn = document.getElementById('singleCharCancelBtn');
        singleCharOkBtn = document.getElementById('singleCharOkBtn');

        sidebarFontSizeInput = elements.fontSizeInput;

        ctx = context;
        state = appState;

        saveHistoryCallback = callbacks.saveHistory;
        executeTextDrawingCallback = callbacks.executeTextDrawing;
        createFontStampCallback = callbacks.createFontStamp;
        updateTextObjectCallback = callbacks.updateTextObject;  // テキストオブジェクト更新コールバック
        updateAnnotationCallback = callbacks.updateAnnotation;  // アノテーション更新コールバック

        setupTextModalEvents();
        setupFontModalEvents();
        setupPromptModalEvents();
        setupConfirmModalEvents();
        setupSingleCharModalEvents();
    }

    /**
     * テキストモーダルを開く
     * @param {object} drawingInfo - 描画情報
     */
    function openTextModal(drawingInfo) {
        pendingDrawingInfo = drawingInfo;
        editingTextObject = null;
        editingTextIndex = null;
        modalTextInput.value = "";
        // 新規作成時も文字サイズ入力欄を表示し、左側バーの値を初期値として設定
        if (modalFontSizeRow && modalFontSizeInput) {
            modalFontSizeRow.style.display = 'flex';
            // 左側バーのフォントサイズ値を初期値として設定
            const defaultFontSize = sidebarFontSizeInput ? parseInt(sidebarFontSizeInput.value, 10) : 12;
            modalFontSizeInput.value = defaultFontSize;
        }
        textModal.style.display = 'flex';
        ensureFocus(modalTextInput);
    }

    /**
     * テキスト編集用にモーダルを開く
     * @param {object} textObj - 編集するテキストオブジェクト
     * @param {number} index - オブジェクトのインデックス
     * @param {number} pageNum - ページ番号
     */
    function openTextEditModal(textObj, index, pageNum) {
        editingTextObject = textObj;
        editingTextIndex = index;
        editingTextId = textObj.id;  // オブジェクトIDを保存
        editingPageNum = pageNum;
        pendingDrawingInfo = null;

        // 既存のテキストと縦書き設定をモーダルに反映
        modalTextInput.value = textObj.text || "";
        modalVerticalCheck.checked = textObj.isVertical || false;

        // 文字サイズ入力欄を表示して値を設定
        if (modalFontSizeRow && modalFontSizeInput) {
            modalFontSizeRow.style.display = 'flex';
            modalFontSizeInput.value = textObj.fontSize || 12;
        }

        textModal.style.display = 'flex';
        ensureFocus(modalTextInput);
        // カーソルを末尾に移動（フォーカス後に実行）
        setTimeout(() => {
            modalTextInput.selectionStart = modalTextInput.value.length;
            modalTextInput.selectionEnd = modalTextInput.value.length;
        }, 150);
    }

    /**
     * アノテーション編集用にモーダルを開く
     * @param {object} obj - 編集するオブジェクト（アノテーションを持つ）
     * @param {number} index - オブジェクトのインデックス
     * @param {number} pageNum - ページ番号
     */
    function openAnnotationEditModal(obj, index, pageNum) {
        editingAnnotationObject = obj;
        editingAnnotationIndex = index;
        editingAnnotationId = obj.id;
        editingAnnotationPageNum = pageNum;
        pendingDrawingInfo = null;

        // テキスト編集の状態をクリア
        editingTextObject = null;
        editingTextIndex = null;
        editingTextId = null;
        editingPageNum = null;

        // アノテーションのテキストと縦書き設定をモーダルに反映
        const ann = obj.annotation;
        modalTextInput.value = ann.text || "";
        modalVerticalCheck.checked = ann.isVertical || false;

        // 文字サイズ入力欄を表示して値を設定
        if (modalFontSizeRow && modalFontSizeInput) {
            modalFontSizeRow.style.display = 'flex';
            modalFontSizeInput.value = ann.fontSize || 12;
        }

        textModal.style.display = 'flex';
        ensureFocus(modalTextInput);
        // カーソルを末尾に移動（フォーカス後に実行）
        setTimeout(() => {
            modalTextInput.selectionStart = modalTextInput.value.length;
            modalTextInput.selectionEnd = modalTextInput.value.length;
        }, 50);
    }

    /**
     * テキストモーダルを閉じる
     */
    function closeTextModal() {
        textModal.style.display = 'none';

        // アノテーション編集モードの場合はキャンセル
        if (editingAnnotationObject) {
            editingAnnotationObject = null;
            editingAnnotationIndex = null;
            editingAnnotationId = null;
            editingAnnotationPageNum = null;
            // キャンセル時も再描画（選択状態をリフレッシュ）
            if (window.MojiQDrawing) {
                MojiQDrawing.redrawCanvas();
            }
        }
        // テキスト編集モードの場合はキャンセル
        else if (editingTextObject) {
            editingTextObject = null;
            editingTextIndex = null;
            editingTextId = null;
            editingPageNum = null;
            // キャンセル時も再描画（選択状態をリフレッシュ）
            if (window.MojiQDrawing) {
                MojiQDrawing.redrawCanvas();
            }
        } else if (pendingDrawingInfo && MojiQDrawing) {
            // 新規作成モードの場合
            MojiQDrawing.restoreSnapshot();
            if (saveHistoryCallback) saveHistoryCallback();
        }

        pendingDrawingInfo = null;
        state.interactionState = 0;
    }

    /**
     * テキストモーダルから送信
     */
    function submitTextFromModal() {
        const text = modalTextInput.value;
        const isVertical = modalVerticalCheck.checked;
        const fontSize = modalFontSizeInput ? parseInt(modalFontSizeInput.value, 10) : null;

        // アノテーション編集モードの場合
        if (editingAnnotationObject && editingAnnotationId !== null && editingAnnotationPageNum !== null) {
            const pageNum = editingAnnotationPageNum;
            const objectId = editingAnnotationId;

            // 先に編集状態をクリア
            editingAnnotationObject = null;
            editingAnnotationIndex = null;
            editingAnnotationId = null;
            editingAnnotationPageNum = null;
            textModal.style.display = 'none';

            if (updateAnnotationCallback) {
                if (text) {
                    // IDを使って更新（インデックスがずれても正しく更新できる）
                    const updateProps = {
                        text: text,
                        isVertical: isVertical
                    };
                    // fontSizeが有効な値の場合のみ追加
                    if (fontSize && fontSize >= 8 && fontSize <= 100) {
                        updateProps.fontSize = fontSize;
                    }
                    updateAnnotationCallback(pageNum, objectId, updateProps);
                } else {
                    // テキストが空の場合は更新せず、元のテキストを維持
                    if (window.MojiQDrawing) {
                        MojiQDrawing.redrawCanvas();
                    }
                }
            } else {
                if (window.MojiQDrawing) {
                    MojiQDrawing.redrawCanvas();
                }
            }
            return;
        }

        // テキスト編集モードの場合
        if (editingTextObject && editingTextId !== null && editingPageNum !== null) {
            const pageNum = editingPageNum;
            const objectId = editingTextId;

            // 先に編集状態をクリア
            editingTextObject = null;
            editingTextIndex = null;
            editingTextId = null;
            editingPageNum = null;
            textModal.style.display = 'none';

            if (updateTextObjectCallback) {
                if (text) {
                    // IDを使って更新（インデックスがずれても正しく更新できる）
                    const updateProps = {
                        text: text,
                        isVertical: isVertical
                    };
                    // fontSizeが有効な値の場合のみ追加
                    if (fontSize && fontSize >= 8 && fontSize <= 100) {
                        updateProps.fontSize = fontSize;
                    }
                    updateTextObjectCallback(pageNum, objectId, updateProps);
                } else {
                    // テキストが空の場合は更新せず、元のテキストを維持
                    if (window.MojiQDrawing) {
                        MojiQDrawing.redrawCanvas();
                    }
                }
            } else {
                if (window.MojiQDrawing) {
                    MojiQDrawing.redrawCanvas();
                }
            }
            return;
        }

        // 新規作成モードの場合
        if (text && pendingDrawingInfo && executeTextDrawingCallback) {
            executeTextDrawingCallback(pendingDrawingInfo, text, isVertical, fontSize);
        } else {
            MojiQDrawing.restoreSnapshot();
            if (saveHistoryCallback) saveHistoryCallback();
        }
        textModal.style.display = 'none';
        pendingDrawingInfo = null;
    }

    /**
     * テキストモーダルのイベントセットアップ
     */
    function setupTextModalEvents() {
        boundHandlers.modalCancelClick = closeTextModal;
        boundHandlers.modalOkClick = submitTextFromModal;
        modalCancelBtn.addEventListener('click', boundHandlers.modalCancelClick);
        modalOkBtn.addEventListener('click', boundHandlers.modalOkClick);

        // モーダル内クリックでフォーカスを確実に設定（alert後対策）
        boundHandlers.textModalClick = (e) => {
            // 入力欄以外をクリックした場合、入力欄にフォーカス
            if (e.target !== modalTextInput && textModal.style.display === 'flex') {
                ensureFocus(modalTextInput, 0);
            }
        };
        textModal.addEventListener('click', boundHandlers.textModalClick);

        // テキストエリアにフォーカスイベントを追加
        boundHandlers.modalTextInputFocus = () => {
            // フォーカス時にウィンドウもアクティブにする
            window.focus();
        };
        modalTextInput.addEventListener('focus', boundHandlers.modalTextInputFocus);

        // MutationObserverでモーダル表示を監視してフォーカスを設定
        textModalObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'style') {
                    if (textModal.style.display === 'flex') {
                        // 複数のタイミングでフォーカスを試みる
                        setTimeout(() => modalTextInput.focus(), 50);
                        setTimeout(() => modalTextInput.focus(), 150);
                        setTimeout(() => modalTextInput.focus(), 300);
                    }
                }
            });
        });
        textModalObserver.observe(textModal, { attributes: true });
    }

    /**
     * フォントモーダルを開く（新規作成用）
     */
    function openFontModal() {
        state.editingTargetBtn = null;

        // モーダルを「新規作成用」にリセット
        const headerTitle = fontModal.querySelector('.modal-header span');
        if (headerTitle) headerTitle.textContent = "カスタムフォント追加";
        fontModalAddBtn.textContent = "登録";

        // 入力欄リセット
        modalFontNameInput.value = "";
        modalFontColorInput.value = state.autoColors[state.fontCount % state.autoColors.length];

        fontModal.style.display = 'flex';
        ensureFocus(modalFontNameInput);
    }

    /**
     * フォントモーダルを開く（編集用）
     * @param {HTMLElement} btn - 編集対象のボタン
     */
    function openFontModalForEdit(btn) {
        state.editingTargetBtn = btn;

        // 現在の値をモーダルにセット
        modalFontNameInput.value = btn.dataset.text;
        modalFontColorInput.value = btn.dataset.color;

        // モーダルの見た目を「編集用」に変更
        const headerTitle = fontModal.querySelector('.modal-header span');
        if (headerTitle) headerTitle.textContent = "フォント編集";
        fontModalAddBtn.textContent = "更新";

        fontModal.style.display = 'flex';
        ensureFocus(modalFontNameInput);
    }

    /**
     * フォントモーダルを閉じる
     */
    function closeFontModal() {
        fontModal.style.display = 'none';
    }

    /**
     * フォントモーダルから送信
     */
    function submitFontFromModal() {
        const name = modalFontNameInput.value.trim();
        const color = modalFontColorInput.value;

        if (!name) {
            showAlert('フォント名を入力してください', 'エラー').then(() => {
                ensureFocus(modalFontNameInput);
            });
            return;
        }

        // 編集(更新)の場合
        if (state.editingTargetBtn) {
            // データセット更新
            state.editingTargetBtn.dataset.text = name;
            state.editingTargetBtn.dataset.color = color;
            state.editingTargetBtn.title = name;

            // コンテンツ（HTML）の再構築
            state.editingTargetBtn.innerHTML = '';

            const indicator = document.createElement('span');
            indicator.className = 'color-indicator';
            indicator.style.backgroundColor = color;

            state.editingTargetBtn.appendChild(indicator);
            state.editingTargetBtn.appendChild(document.createTextNode(name));

            // 選択状態の情報を更新（編集したボタンが現在アクティブなボタンの場合）
            if (state.activeFontBtn === state.editingTargetBtn) {
                state.selectedFontInfo = { name: name, color: color };
                MojiQCanvasContext.setColor(color);
            }

            state.editingTargetBtn = null;
            fontModal.style.display = 'none';
            fontModalAddBtn.textContent = "登録";

        } else {
            // 新規作成の場合
            if (createFontStampCallback) {
                createFontStampCallback(name, color);
            }
            state.fontCount++;
            fontModal.style.display = 'none';
        }
    }

    /**
     * フォントモーダルのイベントセットアップ
     */
    function setupFontModalEvents() {
        boundHandlers.fontModalCancelClick = closeFontModal;
        boundHandlers.fontModalAddClick = submitFontFromModal;
        fontModalCancelBtn.addEventListener('click', boundHandlers.fontModalCancelClick);
        fontModalAddBtn.addEventListener('click', boundHandlers.fontModalAddClick);
    }

    /**
     * 汎用プロンプトモーダルを開く
     * @param {string} message - 表示するメッセージ
     * @param {string} defaultValue - 入力欄の初期値
     * @param {string} title - モーダルのタイトル（省略可）
     * @returns {Promise<string|null>} 入力値またはnull（キャンセル時）
     */
    function showPrompt(message, defaultValue = '', title = '入力') {
        return new Promise((resolve) => {
            if (!promptModal) {
                // フォールバック：ネイティブのpromptを使用
                resolve(prompt(message, defaultValue));
                return;
            }

            promptResolve = resolve;
            promptModalTitle.textContent = title;
            promptModalLabel.textContent = message;
            promptModalInput.value = defaultValue;
            promptModal.style.display = 'flex';
            ensureFocus(promptModalInput);
        });
    }

    /**
     * 汎用プロンプトモーダルを閉じる（OKボタン）
     */
    function submitPromptModal() {
        const value = promptModalInput.value;
        promptModal.style.display = 'none';
        promptModalInput.style.display = '';  // 入力欄を復帰（showAlertで非表示にした場合）
        if (promptResolve) {
            promptResolve(value);
            promptResolve = null;
        }
    }

    /**
     * 汎用プロンプトモーダルを閉じる（キャンセル）
     */
    function cancelPromptModal() {
        promptModal.style.display = 'none';
        promptModalInput.style.display = '';  // 入力欄を復帰（showAlertで非表示にした場合）
        if (promptResolve) {
            promptResolve(null);
            promptResolve = null;
        }
    }

    /**
     * 汎用プロンプトモーダルのイベントセットアップ
     */
    function setupPromptModalEvents() {
        if (!promptModal) return;

        // ハンドラを保存しながらリスナーを登録
        boundHandlers.promptModalOkClick = submitPromptModal;
        boundHandlers.promptModalCancelClick = cancelPromptModal;
        promptModalOkBtn.addEventListener('click', boundHandlers.promptModalOkClick);
        promptModalCancelBtn.addEventListener('click', boundHandlers.promptModalCancelClick);

        // Enterキーで確定
        boundHandlers.promptModalInputKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitPromptModal();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelPromptModal();
            }
        };
        promptModalInput.addEventListener('keydown', boundHandlers.promptModalInputKeydown);

        // モーダル背景クリックでキャンセル
        boundHandlers.promptModalClick = (e) => {
            if (e.target === promptModal) {
                cancelPromptModal();
            }
        };
        promptModal.addEventListener('click', boundHandlers.promptModalClick);

        // モーダル内クリック時にフォーカスを確保（alert()後対策）
        boundHandlers.promptContentClick = () => {
            if (promptModal.style.display === 'flex') {
                ensureFocus(promptModalInput);
            }
        };
        promptModal.querySelector('.modal-content').addEventListener('click', boundHandlers.promptContentClick);
    }

    /**
     * 汎用アラートモーダル（alert()の代替）
     * ブラウザのalert()後のフォーカス問題を回避
     * @param {string} message - 表示するメッセージ
     * @param {string} title - タイトル（省略可）
     * @returns {Promise<void>}
     */
    function showAlert(message, title = 'お知らせ') {
        return new Promise((resolve) => {
            if (!promptModal) {
                alert(message);
                resolve();
                return;
            }

            promptResolve = () => resolve();
            promptModalTitle.textContent = title;
            promptModalLabel.textContent = message;
            promptModalInput.style.display = 'none';
            promptModal.style.display = 'flex';

            // OKボタンにフォーカス
            ensureFocus(promptModalOkBtn);
        });
    }

    /**
     * 汎用確認ダイアログ（confirm()の代替）
     * @param {string} message - 表示するメッセージ
     * @param {string} title - タイトル（省略可）
     * @returns {Promise<boolean>} OKならtrue、キャンセルならfalse
     */
    function showConfirm(message, title = '確認', options = {}) {
        return new Promise((resolve) => {
            if (!confirmModal) {
                resolve(confirm(message));
                return;
            }

            confirmResolve = resolve;
            confirmModalTitle.textContent = title;
            // HTMLを許可するオプション
            if (options.html) {
                confirmModalMessage.innerHTML = message;
            } else {
                confirmModalMessage.textContent = message;
            }
            confirmModal.style.display = 'flex';

            // OKボタンにフォーカス
            ensureFocus(confirmModalOkBtn);
        });
    }

    /**
     * 確認ダイアログを閉じる（OK）
     */
    function submitConfirmModal() {
        confirmModal.style.display = 'none';
        if (confirmResolve) {
            confirmResolve(true);
            confirmResolve = null;
        }
    }

    /**
     * 確認ダイアログを閉じる（キャンセル）
     */
    function cancelConfirmModal() {
        confirmModal.style.display = 'none';
        if (confirmResolve) {
            confirmResolve(false);
            confirmResolve = null;
        }
    }

    /**
     * 確認ダイアログのイベントセットアップ
     */
    function setupConfirmModalEvents() {
        if (!confirmModal) return;

        // ハンドラを保存しながらリスナーを登録
        boundHandlers.confirmModalOkClick = submitConfirmModal;
        boundHandlers.confirmModalCancelClick = cancelConfirmModal;
        confirmModalOkBtn.addEventListener('click', boundHandlers.confirmModalOkClick);
        confirmModalCancelBtn.addEventListener('click', boundHandlers.confirmModalCancelClick);

        // Escapeキーでキャンセル
        boundHandlers.confirmModalKeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cancelConfirmModal();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                submitConfirmModal();
            }
        };
        confirmModal.addEventListener('keydown', boundHandlers.confirmModalKeydown);

        // モーダル背景クリックでキャンセル
        boundHandlers.confirmModalClick = (e) => {
            if (e.target === confirmModal) {
                cancelConfirmModal();
            }
        };
        confirmModal.addEventListener('click', boundHandlers.confirmModalClick);
    }

    /**
     * 一文字入力モーダルを開く
     * @returns {Promise<string|null>} 入力された文字またはnull（キャンセル時）
     */
    function showSingleCharInput() {
        return new Promise((resolve) => {
            if (!singleCharModal) {
                // フォールバック：ネイティブのpromptを使用
                const result = prompt('小文字を入力（1文字）', '');
                resolve(result ? result.charAt(0) : null);
                return;
            }

            singleCharResolve = resolve;
            singleCharInput.value = '';
            singleCharModal.style.display = 'flex';
            ensureFocus(singleCharInput);
        });
    }

    /**
     * 一文字入力モーダルを閉じる（OKボタン）
     */
    function submitSingleCharModal() {
        const value = singleCharInput.value.charAt(0) || '';  // 最初の1文字のみ取得
        singleCharModal.style.display = 'none';
        if (singleCharResolve) {
            singleCharResolve(value || null);
            singleCharResolve = null;
        }
    }

    /**
     * 一文字入力モーダルを閉じる（キャンセル）
     */
    function cancelSingleCharModal() {
        singleCharModal.style.display = 'none';
        if (singleCharResolve) {
            singleCharResolve(null);
            singleCharResolve = null;
        }
    }

    /**
     * 一文字入力モーダルのイベントセットアップ
     */
    function setupSingleCharModalEvents() {
        if (!singleCharModal) return;

        // ハンドラを保存しながらリスナーを登録
        boundHandlers.singleCharOkClick = submitSingleCharModal;
        boundHandlers.singleCharCancelClick = cancelSingleCharModal;
        singleCharOkBtn.addEventListener('click', boundHandlers.singleCharOkClick);
        singleCharCancelBtn.addEventListener('click', boundHandlers.singleCharCancelClick);

        // Enterキーで確定、Escapeでキャンセル
        boundHandlers.singleCharInputKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitSingleCharModal();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelSingleCharModal();
            }
        };
        singleCharInput.addEventListener('keydown', boundHandlers.singleCharInputKeydown);

        // モーダル背景クリックでキャンセル
        boundHandlers.singleCharModalClick = (e) => {
            if (e.target === singleCharModal) {
                cancelSingleCharModal();
            }
        };
        singleCharModal.addEventListener('click', boundHandlers.singleCharModalClick);

        // モーダル内クリック時にフォーカスを確保
        boundHandlers.singleCharContentClick = () => {
            if (singleCharModal.style.display === 'flex') {
                ensureFocus(singleCharInput);
            }
        };
        singleCharModal.querySelector('.modal-content').addEventListener('click', boundHandlers.singleCharContentClick);
    }

    /**
     * 入力リクエストのハンドリング
     * @param {object} drawingInfo - 描画情報
     */
    function handleInputRequest(drawingInfo) {
        if (state.activeStampText && executeTextDrawingCallback) {
            executeTextDrawingCallback(drawingInfo, state.activeStampText, false);
        } else {
            openTextModal(drawingInfo);
        }
    }

    /**
     * イベントリスナーをクリーンアップ
     */
    function cleanup() {
        // テキストモーダル
        if (modalCancelBtn) modalCancelBtn.removeEventListener('click', boundHandlers.modalCancelClick);
        if (modalOkBtn) modalOkBtn.removeEventListener('click', boundHandlers.modalOkClick);
        if (textModal) textModal.removeEventListener('click', boundHandlers.textModalClick);
        if (modalTextInput) modalTextInput.removeEventListener('focus', boundHandlers.modalTextInputFocus);

        // フォントモーダル
        if (fontModalCancelBtn) fontModalCancelBtn.removeEventListener('click', boundHandlers.fontModalCancelClick);
        if (fontModalAddBtn) fontModalAddBtn.removeEventListener('click', boundHandlers.fontModalAddClick);

        // プロンプトモーダル
        if (promptModalOkBtn) promptModalOkBtn.removeEventListener('click', boundHandlers.promptModalOkClick);
        if (promptModalCancelBtn) promptModalCancelBtn.removeEventListener('click', boundHandlers.promptModalCancelClick);
        if (promptModalInput) promptModalInput.removeEventListener('keydown', boundHandlers.promptModalInputKeydown);
        if (promptModal) {
            promptModal.removeEventListener('click', boundHandlers.promptModalClick);
            const promptContent = promptModal.querySelector('.modal-content');
            if (promptContent) promptContent.removeEventListener('click', boundHandlers.promptContentClick);
        }

        // 確認ダイアログモーダル
        if (confirmModalOkBtn) confirmModalOkBtn.removeEventListener('click', boundHandlers.confirmModalOkClick);
        if (confirmModalCancelBtn) confirmModalCancelBtn.removeEventListener('click', boundHandlers.confirmModalCancelClick);
        if (confirmModal) {
            confirmModal.removeEventListener('keydown', boundHandlers.confirmModalKeydown);
            confirmModal.removeEventListener('click', boundHandlers.confirmModalClick);
        }

        // 一文字入力モーダル
        if (singleCharOkBtn) singleCharOkBtn.removeEventListener('click', boundHandlers.singleCharOkClick);
        if (singleCharCancelBtn) singleCharCancelBtn.removeEventListener('click', boundHandlers.singleCharCancelClick);
        if (singleCharInput) singleCharInput.removeEventListener('keydown', boundHandlers.singleCharInputKeydown);
        if (singleCharModal) {
            singleCharModal.removeEventListener('click', boundHandlers.singleCharModalClick);
            const singleCharContent = singleCharModal.querySelector('.modal-content');
            if (singleCharContent) singleCharContent.removeEventListener('click', boundHandlers.singleCharContentClick);
        }

        // MutationObserverを解除
        if (textModalObserver) {
            textModalObserver.disconnect();
            textModalObserver = null;
        }

        // 参照をクリア
        for (const key in boundHandlers) {
            boundHandlers[key] = null;
        }
    }

    return {
        init,
        cleanup,  // メモリリーク対策: イベントリスナー解除
        openTextModal,
        openTextEditModal,  // テキスト編集用モーダルを追加
        openAnnotationEditModal,  // アノテーション編集用モーダルを追加
        closeTextModal,
        openFontModal,
        openFontModalForEdit,
        closeFontModal,
        handleInputRequest,
        showPrompt,  // 汎用プロンプトモーダル
        showAlert,   // 汎用アラートモーダル
        showConfirm,  // 汎用確認ダイアログ
        showSingleCharInput  // 一文字入力モーダル
    };
})();
