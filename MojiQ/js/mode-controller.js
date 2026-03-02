/**
 * MojiQ Mode Controller - モード制御モジュール
 * 描画モードの切り替えと管理を担当
 */
window.MojiQModeController = (function() {
    'use strict';

    // 定数への参照
    const Constants = window.MojiQConstants;
    // ツールボタン
    let selectBtn = null;
    let handBtn = null;
    let drawBtn = null;
    let markerBtn = null;
    let rectBtn = null;
    let rectAnnotatedBtn = null;
    let labeledRectBtn = null;
    let ellipseBtn = null;
    let ellipseAnnotatedBtn = null;
    let semicircleBtn = null;
    let chevronBtn = null;
    let lshapeBtn = null;
    let zshapeBtn = null;
    let bracketBtn = null;
    let lineBtn = null;
    let lineAnnotatedBtn = null;
    let arrowBtn = null;
    let doubleArrowBtn = null;
    let doubleArrowAnnotatedBtn = null;
    let polylineBtn = null;
    let textBtn = null;
    let imgInsertBtn = null;
    let eraserBtn = null;
    let doneStampBtn = null;
    let rubyStampBtn = null;
    let toruStampBtn = null;
    let torutsumeStampBtn = null;
    let torumamaStampBtn = null;
    let zenkakuakiStampBtn = null;
    let nibunakiStampBtn = null;
    let shibunakiStampBtn = null;
    let kaigyouStampBtn = null;
    let tojiruStampBtn = null;
    let hirakuStampBtn = null;
    let imageInput = null;

    // その他要素
    let mojiqCanvas = null;
    let stampContainer = null;
    let lineWidthRange = null;
    let colorPicker = null;

    let state = null;

    // イベントリスナー参照（cleanup用）
    let boundHandlers = {
        selectBtn: null,
        handBtn: null,
        drawBtn: null,
        markerBtn: null,
        rectBtn: null,
        rectAnnotatedBtn: null,
        labeledRectBtn: null,
        ellipseBtn: null,
        ellipseAnnotatedBtn: null,
        semicircleBtn: null,
        chevronBtn: null,
        lshapeBtn: null,
        zshapeBtn: null,
        bracketBtn: null,
        lineBtn: null,
        lineAnnotatedBtn: null,
        arrowBtn: null,
        doubleArrowBtn: null,
        doubleArrowAnnotatedBtn: null,
        polylineBtn: null,
        textBtn: null,
        imgInsertBtn: null,
        eraserBtn: null,
        doneStampBtn: null,
        rubyStampBtn: null,
        toruStampBtn: null,
        torutsumeStampBtn: null,
        torumamaStampBtn: null,
        zenkakuakiStampBtn: null,
        nibunakiStampBtn: null,
        shibunakiStampBtn: null,
        kaigyouStampBtn: null,
        tojiruStampBtn: null,
        hirakuStampBtn: null,
        imageInputChange: null,
        spaceHandler: null,
        shiftHandler: null,
        toolSwitchHandler: null,
        documentClickHandler: null
    };

    /**
     * 初期化
     * @param {object} elements - DOM要素
     * @param {object} appState - アプリケーション状態への参照
     */
    function init(elements, appState) {
        selectBtn = elements.selectBtn;
        handBtn = elements.handBtn;
        drawBtn = elements.drawBtn;
        markerBtn = elements.markerBtn;
        rectBtn = elements.rectBtn;
        rectAnnotatedBtn = elements.rectAnnotatedBtn;
        labeledRectBtn = elements.labeledRectBtn;
        ellipseBtn = elements.ellipseBtn;
        ellipseAnnotatedBtn = elements.ellipseAnnotatedBtn;
        semicircleBtn = elements.semicircleBtn;
        chevronBtn = elements.chevronBtn;
        lshapeBtn = elements.lshapeBtn;
        zshapeBtn = elements.zshapeBtn;
        bracketBtn = elements.bracketBtn;
        lineBtn = elements.lineBtn;
        lineAnnotatedBtn = elements.lineAnnotatedBtn;
        arrowBtn = elements.arrowBtn;
        doubleArrowBtn = elements.doubleArrowBtn;
        doubleArrowAnnotatedBtn = elements.doubleArrowAnnotatedBtn;
        polylineBtn = elements.polylineBtn;
        textBtn = elements.textBtn;
        imgInsertBtn = elements.imgInsertBtn;
        eraserBtn = elements.eraserBtn;
        doneStampBtn = elements.doneStampBtn;
        rubyStampBtn = elements.rubyStampBtn;
        toruStampBtn = elements.toruStampBtn;
        torutsumeStampBtn = elements.torutsumeStampBtn;
        torumamaStampBtn = elements.torumamaStampBtn;
        zenkakuakiStampBtn = elements.zenkakuakiStampBtn;
        nibunakiStampBtn = elements.nibunakiStampBtn;
        shibunakiStampBtn = elements.shibunakiStampBtn;
        kaigyouStampBtn = elements.kaigyouStampBtn;
        tojiruStampBtn = elements.tojiruStampBtn;
        hirakuStampBtn = elements.hirakuStampBtn;
        imageInput = elements.imageInput;
        mojiqCanvas = elements.mojiqCanvas;
        stampContainer = elements.stampContainer;
        lineWidthRange = elements.lineWidthRange;
        colorPicker = elements.colorPicker;
        state = appState;

        // 初期状態
        selectBtn.classList.add('active');

        setupEventListeners();
    }

    /**
     * 削除モードをOFFにする
     */
    function turnOffDeleteMode() {
        if (!state.isDeleteMode) return;
        state.isDeleteMode = false;
        if (stampContainer) {
            stampContainer.classList.remove('delete-mode');
        }
    }

    /**
     * 編集モードをOFFにする
     */
    function turnOffEditMode() {
        if (!state.isEditMode) return;
        state.isEditMode = false;
        state.editingTargetBtn = null;
        if (stampContainer) {
            stampContainer.classList.remove('edit-mode');
        }
    }

    /**
     * セクション別削除モード切替
     * @param {string} sectionType - 'size' または 'font'
     */
    function toggleDeleteModeForSection(sectionType) {
        const sectionId = sectionType === 'size' ? 'sizeDeleteModeBtn' : 'fontDeleteModeBtn';
        const sectionBtn = document.getElementById(sectionId);
        const sectionClass = sectionType === 'size' ? '.stamp-section' : '.font-section';
        const sectionEl = stampContainer.querySelector(sectionClass);

        if (!sectionBtn) return;

        // まず全セクションのモードを解除
        turnOffAllSectionModes();

        // 削除モードがすでにアクティブなら解除のみ
        if (sectionBtn.classList.contains('active-delete')) {
            sectionBtn.classList.remove('active-delete');
            sectionBtn.textContent = '削除';
            if (sectionEl) sectionEl.classList.remove('delete-mode');
            state.isDeleteMode = false;
            state.deleteModeSection = null;
        } else {
            // 削除モードをON
            sectionBtn.classList.add('active-delete');
            sectionBtn.textContent = '削除中';
            if (sectionEl) sectionEl.classList.add('delete-mode');
            state.isDeleteMode = true;
            state.deleteModeSection = sectionType;
        }
    }

    /**
     * セクション別編集モード切替
     * @param {string} sectionType - 'font' のみサポート
     */
    function toggleEditModeForSection(sectionType) {
        if (sectionType !== 'font') return;

        const sectionBtn = document.getElementById('fontEditModeBtn');
        const sectionEl = stampContainer.querySelector('.font-section');

        if (!sectionBtn) return;

        // まず全セクションのモードを解除
        turnOffAllSectionModes();

        // 編集モードがすでにアクティブなら解除のみ
        if (sectionBtn.classList.contains('active-edit')) {
            sectionBtn.classList.remove('active-edit');
            sectionBtn.textContent = '編集';
            if (sectionEl) sectionEl.classList.remove('edit-mode');
            state.isEditMode = false;
            state.editingTargetBtn = null;
        } else {
            // 編集モードをON
            sectionBtn.classList.add('active-edit');
            sectionBtn.textContent = '編集中';
            if (sectionEl) sectionEl.classList.add('edit-mode');
            state.isEditMode = true;
        }
    }

    /**
     * 全セクションのモードを解除
     */
    function turnOffAllSectionModes() {
        // 文字サイズ削除ボタン
        const sizeDeleteBtn = document.getElementById('sizeDeleteModeBtn');
        const sizeSection = stampContainer ? stampContainer.querySelector('.stamp-section') : null;
        if (sizeDeleteBtn) {
            sizeDeleteBtn.classList.remove('active-delete');
            sizeDeleteBtn.textContent = '削除';
        }
        if (sizeSection) sizeSection.classList.remove('delete-mode');

        // フォント編集・削除ボタン
        const fontEditBtn = document.getElementById('fontEditModeBtn');
        const fontDeleteBtn = document.getElementById('fontDeleteModeBtn');
        const fontSection = stampContainer ? stampContainer.querySelector('.font-section') : null;
        if (fontEditBtn) {
            fontEditBtn.classList.remove('active-edit');
            fontEditBtn.textContent = '編集';
        }
        if (fontDeleteBtn) {
            fontDeleteBtn.classList.remove('active-delete');
            fontDeleteBtn.textContent = '削除';
        }
        if (fontSection) {
            fontSection.classList.remove('delete-mode');
            fontSection.classList.remove('edit-mode');
        }

        state.isDeleteMode = false;
        state.isEditMode = false;
        state.deleteModeSection = null;
        state.editingTargetBtn = null;
    }

    /**
     * 消しゴムボタンの有効/無効状態を更新
     * 常に有効状態を維持
     * @param {string} mode - 現在のモード
     */
    function updateEraserButtonState(mode) {
        if (!eraserBtn) return;

        // 消しゴムは常に有効
        eraserBtn.disabled = false;
        eraserBtn.classList.remove('disabled');
        eraserBtn.title = '消しゴム (E)';
    }

    /**
     * スタンプの選択解除
     */
    function deactivateStamps() {
        state.activeStampText = null;
        state.selectedFontInfo = null;
        state.activeFontBtn = null;
        const btns = stampContainer.querySelectorAll('.stamp-btn');
        btns.forEach(b => b.classList.remove('active'));
    }

    /**
     * モードを設定
     * @param {string} mode - モード名
     * @param {Object} options - オプション
     * @param {boolean} options.fromShortcut - ショートカットキーからの呼び出しかどうか
     */
    function setMode(mode, options = {}) {
        const { fromShortcut = false } = options;
        // ビューワーモード中はツール変更を無効化
        if (window.MojiQViewerMode && MojiQViewerMode.isActive()) {
            return;
        }

        // ツール変更時は必ず削除モード・編集モードを解除
        turnOffDeleteMode();
        turnOffEditMode();

        // Simulatorのキャリブレーション/グリッドモードを解除
        if (window.SimulatorState) {
            const simMode = window.SimulatorState.get('currentMode');
            if (simMode === 'calibration' || simMode === 'grid') {
                // グリッド調整中の場合は確定してから解除
                if (window.SimulatorTools) {
                    if (window.SimulatorState.get('isGridAdjusting')) {
                        window.SimulatorTools.confirmGrid();
                    }
                    window.SimulatorTools.exitCalibrationMode();
                }
                window.SimulatorState.set('currentMode', null);
                // ボタンのアクティブ状態を解除
                const calibrateBtn = document.getElementById('calibrateBtn');
                const gridBtn = document.getElementById('gridBtn');
                if (calibrateBtn) calibrateBtn.classList.remove('active');
                if (gridBtn) gridBtn.classList.remove('active');
                // Simulatorのキャンバスカーソルをリセット
                const simCanvas = document.getElementById('sim-whiteboard');
                if (simCanvas) simCanvas.style.cursor = 'default';
            }
        }

        // 選択モードから他のモードに切り替える場合、選択を解除
        if (state.currentMode === 'select' && mode !== 'select') {
            if (window.MojiQDrawingObjects) {
                const pageNum = state.currentPageNum || 1;
                MojiQDrawingObjects.deselectObject(pageNum);
                // キャンバスを再描画
                if (window.MojiQDrawing) {
                    MojiQDrawing.redrawCanvas();
                }
            }
        }

        // ツール切り替え時に線幅を記憶・復元
        const lineWidthTools = ['draw', 'marker', 'eraser', 'line', 'arrow', 'doubleArrow', 'doubleArrowAnnotated', 'lineAnnotated', 'rect', 'rectAnnotated', 'ellipse', 'ellipseAnnotated', 'polyline'];
        const prevMode = state.currentMode;

        // 現在のツールの線幅を保存（線幅を使用するツールの場合）
        if (lineWidthTools.includes(prevMode) && window.MojiQSettings) {
            const currentWidth = parseFloat(lineWidthRange.value);
            // 消しゴムの場合はeraserSizeを保存
            if (prevMode === 'eraser') {
                MojiQSettings.setToolLineWidth('eraser', state.eraserSize || currentWidth);
            } else {
                // 基本ツール名にマッピング（Annotated系は基本ツールと同じ線幅を共有）
                const baseToolName = prevMode.replace('Annotated', '');
                MojiQSettings.setToolLineWidth(baseToolName, currentWidth);
            }
        }

        // 新しいツールの線幅を復元（線幅を使用するツールの場合）
        if (lineWidthTools.includes(mode) && window.MojiQSettings) {
            // 基本ツール名にマッピング
            const baseToolName = mode.replace('Annotated', '');
            const savedWidth = MojiQSettings.getToolLineWidth(baseToolName);

            if (mode === 'eraser') {
                state.eraserSize = savedWidth;
                lineWidthRange.value = savedWidth;
            } else {
                lineWidthRange.value = savedWidth;
            }
            if (window.MojiQCanvasContext) MojiQCanvasContext.updateLineWidthDisplay();
            // Storeに保存（校正モードと同期）
            if (window.MojiQStore) {
                window.MojiQStore.set('drawing.lineWidth', savedWidth);
            }
        }

        state.currentMode = mode;

        // 消しゴムボタンの有効/無効状態を更新
        updateEraserButtonState(mode);

        // ショートカット切り替え時にフォーカスを外す（ボタンの:focus状態を解除）
        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }

        // 展開中のトグルボタン（文字サイズ、フォント指定、校正ツール）を閉じる
        // ロックモードが有効な場合は閉じない（ただしショートカットキーからの呼び出し時は閉じる）
        if (fromShortcut || !window.isProofreadingLockModeEnabled || !window.isProofreadingLockModeEnabled()) {
            if (window.MojiQStamps && MojiQStamps.forceCloseAllDropdowns) {
                MojiQStamps.forceCloseAllDropdowns();
            }
            if (window.MojiQProofreadingSymbol && MojiQProofreadingSymbol.closeDropdown) {
                MojiQProofreadingSymbol.closeDropdown();
            }
        }

        // ツールバー内の全ボタンからactiveクラスを削除
        const toolBarVertical = document.getElementById('toolBarVertical');
        if (toolBarVertical) {
            toolBarVertical.querySelectorAll('.tool-btn-icon.active').forEach(btn => {
                btn.classList.remove('active');
            });
        }

        // 各スタンプ系ツールのモード判定
        const stampLabels = {
            'toruStamp': 'トル',
            'torutsumeStamp': 'トルツメ',
            'torumamaStamp': 'トルママ',
            'zenkakuakiStamp': '全角アキ',
            'nibunakiStamp': '半角アキ',
            'kaigyouStamp': '改行',
            'labeledRect': '小文字指定'
        };
        const isInstructionStampMode = Object.keys(stampLabels).includes(mode);

        // 校正記号スタンプのモード判定
        const proofreadingSymbolModes = ['chevron', 'lshape', 'zshape', 'bracket', 'rectSymbolStamp', 'triangleSymbolStamp', 'semicircle'];
        const isProofreadingSymbolMode = proofreadingSymbolModes.includes(mode);

        // 校正指示スタンプ（指示スタンプ + 校正記号）かどうか
        const isProofreadingInstructionMode = isInstructionStampMode || isProofreadingSymbolMode;

        // 校正指示スタンプトグルボタンのアクティブ状態と選択中スタンプ表示を更新
        const proofreadingInstructionToggleBtn = document.getElementById('proofreadingInstructionToggleBtn');
        const selectedProofreadingDisplay = document.getElementById('selectedProofreadingDisplay');

        // 校正指示スタンプ以外のモードに切り替えた時、選択表示をクリア
        if (!isProofreadingInstructionMode) {
            if (window.MojiQProofreadingSymbol && MojiQProofreadingSymbol.clearActive) {
                MojiQProofreadingSymbol.clearActive();
            }
        }

        // 文字サイズ・フォントスタンプの選択表示をクリア（text/rect/rectAnnotated以外のモードに切り替えた時）
        // text: 文字サイズスタンプから呼ばれる
        // rect/rectAnnotated: フォント指定スタンプから呼ばれる
        if (mode !== 'text' && mode !== 'rect' && mode !== 'rectAnnotated') {
            if (window.MojiQStamps && MojiQStamps.clearSelectedDisplay) {
                MojiQStamps.clearSelectedDisplay();
            }
        }

        if (mode === 'select' && selectBtn) selectBtn.classList.add('active');
        if (mode === 'hand') handBtn.classList.add('active');
        if (mode === 'draw') drawBtn.classList.add('active');
        if (mode === 'marker') markerBtn.classList.add('active');
        if (mode === 'rect') rectBtn.classList.add('active');
        if (mode === 'rectAnnotated' && rectAnnotatedBtn) rectAnnotatedBtn.classList.add('active');
        if (mode === 'labeledRect' && labeledRectBtn) labeledRectBtn.classList.add('active');
        if (mode === 'ellipse') ellipseBtn.classList.add('active');
        if (mode === 'ellipseAnnotated' && ellipseAnnotatedBtn) ellipseAnnotatedBtn.classList.add('active');
        if (mode === 'semicircle' && semicircleBtn) semicircleBtn.classList.add('active');
        if (mode === 'chevron') chevronBtn.classList.add('active');
        if (mode === 'lshape' && lshapeBtn) lshapeBtn.classList.add('active');
        if (mode === 'zshape' && zshapeBtn) zshapeBtn.classList.add('active');
        if (mode === 'bracket' && bracketBtn) bracketBtn.classList.add('active');
        if (mode === 'line') lineBtn.classList.add('active');
        if (mode === 'lineAnnotated' && lineAnnotatedBtn) lineAnnotatedBtn.classList.add('active');
        if (mode === 'arrow' && arrowBtn) arrowBtn.classList.add('active');
        if (mode === 'doubleArrow' && doubleArrowBtn) doubleArrowBtn.classList.add('active');
        if (mode === 'doubleArrowAnnotated' && doubleArrowAnnotatedBtn) doubleArrowAnnotatedBtn.classList.add('active');
        if (mode === 'polyline' && polylineBtn) polylineBtn.classList.add('active');
        if (mode === 'text') textBtn.classList.add('active');
        if (mode === 'image') imgInsertBtn.classList.add('active');
        if (mode === 'eraser') eraserBtn.classList.add('active');
        if (mode === 'doneStamp') doneStampBtn.classList.add('active');
        if (mode === 'rubyStamp') rubyStampBtn.classList.add('active');
        if (mode === 'toruStamp' && toruStampBtn) toruStampBtn.classList.add('active');
        if (mode === 'torutsumeStamp' && torutsumeStampBtn) torutsumeStampBtn.classList.add('active');
        if (mode === 'torumamaStamp' && torumamaStampBtn) torumamaStampBtn.classList.add('active');
        if (mode === 'zenkakuakiStamp' && zenkakuakiStampBtn) zenkakuakiStampBtn.classList.add('active');
        if (mode === 'nibunakiStamp' && nibunakiStampBtn) nibunakiStampBtn.classList.add('active');
        if (mode === 'shibunakiStamp' && shibunakiStampBtn) shibunakiStampBtn.classList.add('active');
        if (mode === 'kaigyouStamp' && kaigyouStampBtn) kaigyouStampBtn.classList.add('active');
        if (mode === 'tojiruStamp' && tojiruStampBtn) tojiruStampBtn.classList.add('active');
        if (mode === 'hirakuStamp' && hirakuStampBtn) hirakuStampBtn.classList.add('active');

        // スポイトモードのアクティブ状態を更新
        if (window.MojiQCanvasContext) {
            MojiQCanvasContext.setEyedropperActive(mode === 'eyedropper');
        }

        if (mode === 'hand') {
            mojiqCanvas.style.cursor = 'grab';
        } else if (mode === 'text') {
            mojiqCanvas.style.cursor = 'default';
        } else if (mode === 'select') {
            mojiqCanvas.style.cursor = 'move';
        } else if (mode === 'eyedropper') {
            // スポイトモード: カスタムカーソルを設定
            mojiqCanvas.style.cursor = 'crosshair';
        } else if (mode === 'doneStamp' || mode === 'rubyStamp' || mode === 'toruStamp' || mode === 'torutsumeStamp' || mode === 'torumamaStamp' || mode === 'zenkakuakiStamp' || mode === 'nibunakiStamp' || mode === 'shibunakiStamp' || mode === 'kaigyouStamp') {
            mojiqCanvas.style.cursor = 'pointer';
        } else if (mode === 'rectSymbolStamp' || mode === 'triangleSymbolStamp') {
            mojiqCanvas.style.cursor = 'crosshair';
        } else {
            mojiqCanvas.style.cursor = 'crosshair';
        }

        state.interactionState = 0;
        deactivateStamps();

        MojiQCanvasContext.initContext();
    }

    /**
     * 画像をキャンバス中央に配置（Photoshop風埋め込み方式）
     * @param {HTMLImageElement} img - 配置する画像
     */
    function placeImageAtCenter(img) {
        // 表示領域のサイズを取得
        const canvasWrapper = document.getElementById('canvas-wrapper');
        if (!canvasWrapper) return;

        const viewWidth = canvasWrapper.clientWidth;
        const viewHeight = canvasWrapper.clientHeight;
        const zoom = state.currentZoom || 1.0;

        // スクロール位置を考慮した中央位置（キャンバス座標系）
        const scrollLeft = canvasWrapper.scrollLeft;
        const scrollTop = canvasWrapper.scrollTop;
        const centerX = (scrollLeft + viewWidth / 2) / zoom;
        const centerY = (scrollTop + viewHeight / 2) / zoom;

        // 画像サイズ（表示領域の50%を最大とする）
        const maxWidth = (viewWidth / zoom) * 0.5;
        const maxHeight = (viewHeight / zoom) * 0.5;

        const imgAspect = img.naturalWidth / img.naturalHeight;
        let imgWidth, imgHeight;

        if (img.naturalWidth > maxWidth || img.naturalHeight > maxHeight) {
            // 表示領域に収まるようにスケール
            if (maxWidth / maxHeight > imgAspect) {
                imgHeight = maxHeight;
                imgWidth = imgHeight * imgAspect;
            } else {
                imgWidth = maxWidth;
                imgHeight = imgWidth / imgAspect;
            }
        } else {
            // 元のサイズで表示
            imgWidth = img.naturalWidth;
            imgHeight = img.naturalHeight;
        }

        // 中央配置の座標を計算
        const startX = centerX - imgWidth / 2;
        const startY = centerY - imgHeight / 2;

        // 画像オブジェクトを作成して保存
        const imageObj = {
            type: 'image',
            startPos: { x: startX, y: startY },
            endPos: { x: startX + imgWidth, y: startY + imgHeight },
            imageData: img
        };

        // 現在のページ番号を取得
        const currentPage = state.currentPageNum;

        // pendingImageをクリア（旧ドラッグ方式が発動しないように）
        state.pendingImage = null;

        // オブジェクトを追加
        if (window.MojiQDrawingObjects) {
            MojiQDrawingObjects.addObject(currentPage, imageObj);
        }

        // キャンバスを再描画
        if (window.MojiQDrawing) {
            MojiQDrawing.redrawCanvas();
        }

        // 選択モードに切り替え（配置後すぐに移動・リサイズできるように）
        setMode('select');
        // 配置した画像を選択状態にする
        if (window.MojiQDrawingObjects) {
            const objects = MojiQDrawingObjects.getPageObjects(currentPage);
            const lastIndex = objects.length - 1;
            if (lastIndex >= 0) {
                MojiQDrawingObjects.selectObject(currentPage, lastIndex);
                if (window.MojiQDrawing) {
                    MojiQDrawing.redrawCanvas();
                }
            }
        }
    }

    /**
     * 画像ファイルを読み込んで配置（JPEG, PNG, TIF等）
     * @param {File} file - 画像ファイル
     */
    function loadImageFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    placeImageAtCenter(img);
                    resolve();
                };
                img.onerror = () => {
                    reject(new Error('画像の読み込みに失敗しました'));
                };
                img.src = event.target.result;
            };
            reader.onerror = () => {
                reject(new Error('ファイルの読み込みに失敗しました'));
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * PDFファイルを読み込んで最初のページを画像として配置
     * @param {File} file - PDFファイル
     */
    async function loadPdfAsImage(file) {
        // pdf.jsが利用可能か確認
        if (!window.pdfjsLib) {
            throw new Error('PDF.jsが読み込まれていません');
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        // 高解像度でレンダリング（スケール2.0）
        const scale = 2.0;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        // キャンバスを画像に変換
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                placeImageAtCenter(img);
                resolve();
            };
            img.onerror = () => {
                reject(new Error('PDF画像の変換に失敗しました'));
            };
            img.src = canvas.toDataURL('image/png');
        });
    }

    /**
     * イベントリスナーのセットアップ
     */
    function setupEventListeners() {
        // ハンドラを保存しながらリスナーを登録
        boundHandlers.selectBtn = () => setMode('select');
        boundHandlers.drawBtn = () => setMode('draw');
        boundHandlers.handBtn = () => setMode('hand');
        boundHandlers.markerBtn = () => setMode('marker');
        boundHandlers.rectBtn = () => setMode('rect');
        boundHandlers.rectAnnotatedBtn = () => setMode('rectAnnotated');
        boundHandlers.labeledRectBtn = () => setMode('labeledRect');
        boundHandlers.ellipseBtn = () => setMode('ellipse');
        boundHandlers.ellipseAnnotatedBtn = () => setMode('ellipseAnnotated');
        boundHandlers.semicircleBtn = () => setMode('semicircle');
        boundHandlers.chevronBtn = () => setMode('chevron');
        boundHandlers.lshapeBtn = () => setMode('lshape');
        boundHandlers.zshapeBtn = () => setMode('zshape');
        boundHandlers.bracketBtn = () => setMode('bracket');
        boundHandlers.lineBtn = () => setMode('line');
        boundHandlers.lineAnnotatedBtn = () => setMode('lineAnnotated');
        boundHandlers.arrowBtn = () => setMode('arrow');
        boundHandlers.doubleArrowBtn = () => setMode('doubleArrow');
        boundHandlers.doubleArrowAnnotatedBtn = () => setMode('doubleArrowAnnotated');
        boundHandlers.polylineBtn = () => setMode('polyline');
        boundHandlers.textBtn = () => setMode('text');
        boundHandlers.eraserBtn = () => setMode('eraser');
        boundHandlers.doneStampBtn = () => setMode('doneStamp');
        boundHandlers.rubyStampBtn = () => setMode('rubyStamp');
        boundHandlers.toruStampBtn = () => setMode('toruStamp');
        boundHandlers.torutsumeStampBtn = () => setMode('torutsumeStamp');
        boundHandlers.torumamaStampBtn = () => setMode('torumamaStamp');
        boundHandlers.zenkakuakiStampBtn = () => setMode('zenkakuakiStamp');
        boundHandlers.nibunakiStampBtn = () => setMode('nibunakiStamp');
        boundHandlers.shibunakiStampBtn = () => setMode('shibunakiStamp');
        boundHandlers.kaigyouStampBtn = () => setMode('kaigyouStamp');
        boundHandlers.tojiruStampBtn = () => setMode('tojiruStamp');
        boundHandlers.hirakuStampBtn = () => setMode('hirakuStamp');
        boundHandlers.imgInsertBtn = () => imageInput.click();

        if (selectBtn) selectBtn.addEventListener('click', boundHandlers.selectBtn);
        drawBtn.addEventListener('click', boundHandlers.drawBtn);
        handBtn.addEventListener('click', boundHandlers.handBtn);
        markerBtn.addEventListener('click', boundHandlers.markerBtn);
        rectBtn.addEventListener('click', boundHandlers.rectBtn);
        if (rectAnnotatedBtn) rectAnnotatedBtn.addEventListener('click', boundHandlers.rectAnnotatedBtn);
        if (labeledRectBtn) labeledRectBtn.addEventListener('click', boundHandlers.labeledRectBtn);
        ellipseBtn.addEventListener('click', boundHandlers.ellipseBtn);
        if (ellipseAnnotatedBtn) ellipseAnnotatedBtn.addEventListener('click', boundHandlers.ellipseAnnotatedBtn);
        if (semicircleBtn) semicircleBtn.addEventListener('click', boundHandlers.semicircleBtn);
        if (chevronBtn) chevronBtn.addEventListener('click', boundHandlers.chevronBtn);
        if (lshapeBtn) lshapeBtn.addEventListener('click', boundHandlers.lshapeBtn);
        if (zshapeBtn) zshapeBtn.addEventListener('click', boundHandlers.zshapeBtn);
        if (bracketBtn) bracketBtn.addEventListener('click', boundHandlers.bracketBtn);
        lineBtn.addEventListener('click', boundHandlers.lineBtn);
        if (lineAnnotatedBtn) lineAnnotatedBtn.addEventListener('click', boundHandlers.lineAnnotatedBtn);
        if (arrowBtn) arrowBtn.addEventListener('click', boundHandlers.arrowBtn);
        if (doubleArrowBtn) doubleArrowBtn.addEventListener('click', boundHandlers.doubleArrowBtn);
        if (doubleArrowAnnotatedBtn) doubleArrowAnnotatedBtn.addEventListener('click', boundHandlers.doubleArrowAnnotatedBtn);
        if (polylineBtn) polylineBtn.addEventListener('click', boundHandlers.polylineBtn);
        textBtn.addEventListener('click', boundHandlers.textBtn);
        eraserBtn.addEventListener('click', boundHandlers.eraserBtn);
        if (doneStampBtn) doneStampBtn.addEventListener('click', boundHandlers.doneStampBtn);
        if (rubyStampBtn) rubyStampBtn.addEventListener('click', boundHandlers.rubyStampBtn);
        if (toruStampBtn) toruStampBtn.addEventListener('click', boundHandlers.toruStampBtn);
        if (torutsumeStampBtn) torutsumeStampBtn.addEventListener('click', boundHandlers.torutsumeStampBtn);
        if (torumamaStampBtn) torumamaStampBtn.addEventListener('click', boundHandlers.torumamaStampBtn);
        if (zenkakuakiStampBtn) zenkakuakiStampBtn.addEventListener('click', boundHandlers.zenkakuakiStampBtn);
        if (nibunakiStampBtn) nibunakiStampBtn.addEventListener('click', boundHandlers.nibunakiStampBtn);
        if (shibunakiStampBtn) shibunakiStampBtn.addEventListener('click', boundHandlers.shibunakiStampBtn);
        if (kaigyouStampBtn) kaigyouStampBtn.addEventListener('click', boundHandlers.kaigyouStampBtn);
        if (tojiruStampBtn) tojiruStampBtn.addEventListener('click', boundHandlers.tojiruStampBtn);
        if (hirakuStampBtn) hirakuStampBtn.addEventListener('click', boundHandlers.hirakuStampBtn);
        imgInsertBtn.addEventListener('click', boundHandlers.imgInsertBtn);

        // 画像読み込みイベント（JPEG, PNG, TIF, PDF対応）
        boundHandlers.imageInputChange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const fileName = file.name.toLowerCase();
            const fileType = file.type;

            // サポートされるファイル形式のチェック
            const isImage = fileType.startsWith('image/');
            const isTiff = fileName.endsWith('.tif') || fileName.endsWith('.tiff') || fileType === 'image/tiff';
            const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf');

            if (!isImage && !isPdf) {
                MojiQModal.showAlert('対応形式: JPEG, PNG, TIF, PDF', 'エラー');
                return;
            }

            try {
                if (isPdf) {
                    // PDF処理: pdf.jsを使って最初のページを画像に変換
                    await loadPdfAsImage(file);
                } else {
                    // 通常の画像処理（JPEG, PNG, TIF等）
                    await loadImageFile(file);
                }
            } catch (error) {
                console.error('ファイル読み込みエラー:', error);
                MojiQModal.showAlert('ファイルの読み込みに失敗しました', 'エラー');
            }

            e.target.value = '';
        };
        imageInput.addEventListener('change', boundHandlers.imageInputChange);

        // スペースキーイベント (shortcuts.js連携)
        boundHandlers.spaceHandler = (e) => {
            if (e.detail.down) {
                if (!state.isSpacePressed) {
                    state.isSpacePressed = true;
                    if (!state.isPanning) mojiqCanvas.classList.add('cursor-grab');
                }
            } else {
                state.isSpacePressed = false;
                if (!state.isPanning && !state.isShiftPressed) mojiqCanvas.classList.remove('cursor-grab');
            }
        };
        window.addEventListener('mojiq:space', boundHandlers.spaceHandler);

        // Shiftキーイベント (shortcuts.js連携)
        boundHandlers.shiftHandler = (e) => {
            // ペン・マーカー・直線モードではShiftはスナップ描画用なのでカーソルを変えない
            const shiftSnapModes = ['draw', 'marker', 'line', 'lineAnnotated', 'rect', 'rectAnnotated', 'ellipse', 'ellipseAnnotated'];
            const isSnapMode = shiftSnapModes.includes(state.currentMode);
            if (e.detail.down) {
                if (!state.isShiftPressed) {
                    state.isShiftPressed = true;
                    if (!state.isPanning && !isSnapMode) mojiqCanvas.classList.add('cursor-grab');
                }
            } else {
                state.isShiftPressed = false;
                if (!state.isPanning && !state.isSpacePressed) mojiqCanvas.classList.remove('cursor-grab');
            }
        };
        window.addEventListener('mojiq:shift', boundHandlers.shiftHandler);

        // ツール切り替えショートカット (shortcuts.js連携)
        boundHandlers.toolSwitchHandler = (e) => {
            const mode = e.detail.mode;
            if (mode) {
                setMode(mode, { fromShortcut: true });
            }
        };
        window.addEventListener('mojiq:tool-switch', boundHandlers.toolSwitchHandler);

        // 削除モード・編集モード中に他の部分をクリックしたらモード解除
        boundHandlers.documentClickHandler = (e) => {
            if (!state.isDeleteMode && !state.isEditMode) return;

            // クリックされた要素がstampContainer内かどうか確認
            const isInsideStampContainer = stampContainer && stampContainer.contains(e.target);
            // セクション別ボタンかどうか確認
            const sizeDeleteBtn = document.getElementById('sizeDeleteModeBtn');
            const fontEditBtn = document.getElementById('fontEditModeBtn');
            const fontDeleteBtn = document.getElementById('fontDeleteModeBtn');
            const isSectionBtn = (sizeDeleteBtn && (e.target === sizeDeleteBtn || sizeDeleteBtn.contains(e.target))) ||
                                 (fontEditBtn && (e.target === fontEditBtn || fontEditBtn.contains(e.target))) ||
                                 (fontDeleteBtn && (e.target === fontDeleteBtn || fontDeleteBtn.contains(e.target)));
            // フォントモーダル内かどうか確認（編集中はモーダルを除外）
            const fontModal = document.getElementById('fontModal');
            const isInsideFontModal = fontModal && fontModal.contains(e.target);

            // スタンプコンテナ外かつセクションボタン外かつモーダル外をクリックした場合にモード解除
            if (!isInsideStampContainer && !isSectionBtn && !isInsideFontModal) {
                turnOffAllSectionModes();
            }
        };
        document.addEventListener('click', boundHandlers.documentClickHandler);
    }

    /**
     * イベントリスナーをクリーンアップ
     */
    function cleanup() {
        if (selectBtn) selectBtn.removeEventListener('click', boundHandlers.selectBtn);
        if (drawBtn) drawBtn.removeEventListener('click', boundHandlers.drawBtn);
        if (handBtn) handBtn.removeEventListener('click', boundHandlers.handBtn);
        if (markerBtn) markerBtn.removeEventListener('click', boundHandlers.markerBtn);
        if (rectBtn) rectBtn.removeEventListener('click', boundHandlers.rectBtn);
        if (rectAnnotatedBtn) rectAnnotatedBtn.removeEventListener('click', boundHandlers.rectAnnotatedBtn);
        if (labeledRectBtn) labeledRectBtn.removeEventListener('click', boundHandlers.labeledRectBtn);
        if (ellipseBtn) ellipseBtn.removeEventListener('click', boundHandlers.ellipseBtn);
        if (ellipseAnnotatedBtn) ellipseAnnotatedBtn.removeEventListener('click', boundHandlers.ellipseAnnotatedBtn);
        if (semicircleBtn) semicircleBtn.removeEventListener('click', boundHandlers.semicircleBtn);
        if (chevronBtn) chevronBtn.removeEventListener('click', boundHandlers.chevronBtn);
        if (lshapeBtn) lshapeBtn.removeEventListener('click', boundHandlers.lshapeBtn);
        if (zshapeBtn) zshapeBtn.removeEventListener('click', boundHandlers.zshapeBtn);
        if (bracketBtn) bracketBtn.removeEventListener('click', boundHandlers.bracketBtn);
        if (lineBtn) lineBtn.removeEventListener('click', boundHandlers.lineBtn);
        if (lineAnnotatedBtn) lineAnnotatedBtn.removeEventListener('click', boundHandlers.lineAnnotatedBtn);
        if (arrowBtn) arrowBtn.removeEventListener('click', boundHandlers.arrowBtn);
        if (doubleArrowBtn) doubleArrowBtn.removeEventListener('click', boundHandlers.doubleArrowBtn);
        if (doubleArrowAnnotatedBtn) doubleArrowAnnotatedBtn.removeEventListener('click', boundHandlers.doubleArrowAnnotatedBtn);
        if (polylineBtn) polylineBtn.removeEventListener('click', boundHandlers.polylineBtn);
        if (textBtn) textBtn.removeEventListener('click', boundHandlers.textBtn);
        if (eraserBtn) eraserBtn.removeEventListener('click', boundHandlers.eraserBtn);
        if (doneStampBtn) doneStampBtn.removeEventListener('click', boundHandlers.doneStampBtn);
        if (rubyStampBtn) rubyStampBtn.removeEventListener('click', boundHandlers.rubyStampBtn);
        if (toruStampBtn) toruStampBtn.removeEventListener('click', boundHandlers.toruStampBtn);
        if (torutsumeStampBtn) torutsumeStampBtn.removeEventListener('click', boundHandlers.torutsumeStampBtn);
        if (torumamaStampBtn) torumamaStampBtn.removeEventListener('click', boundHandlers.torumamaStampBtn);
        if (zenkakuakiStampBtn) zenkakuakiStampBtn.removeEventListener('click', boundHandlers.zenkakuakiStampBtn);
        if (nibunakiStampBtn) nibunakiStampBtn.removeEventListener('click', boundHandlers.nibunakiStampBtn);
        if (shibunakiStampBtn) shibunakiStampBtn.removeEventListener('click', boundHandlers.shibunakiStampBtn);
        if (kaigyouStampBtn) kaigyouStampBtn.removeEventListener('click', boundHandlers.kaigyouStampBtn);
        if (tojiruStampBtn) tojiruStampBtn.removeEventListener('click', boundHandlers.tojiruStampBtn);
        if (hirakuStampBtn) hirakuStampBtn.removeEventListener('click', boundHandlers.hirakuStampBtn);
        if (imgInsertBtn) imgInsertBtn.removeEventListener('click', boundHandlers.imgInsertBtn);
        if (imageInput) imageInput.removeEventListener('change', boundHandlers.imageInputChange);

        window.removeEventListener('mojiq:space', boundHandlers.spaceHandler);
        window.removeEventListener('mojiq:shift', boundHandlers.shiftHandler);
        window.removeEventListener('mojiq:tool-switch', boundHandlers.toolSwitchHandler);
        document.removeEventListener('click', boundHandlers.documentClickHandler);

        // 参照をクリア
        for (const key in boundHandlers) {
            boundHandlers[key] = null;
        }
    }

    return {
        init,
        cleanup,  // メモリリーク対策: イベントリスナー解除
        setMode,
        turnOffDeleteMode,
        turnOffEditMode,
        deactivateStamps,
        toggleDeleteModeForSection,
        toggleEditModeForSection,
        turnOffAllSectionModes
    };
})();
