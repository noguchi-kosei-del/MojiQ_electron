/* js/canvas-context.js - 描画コンテキスト初期化・カラー管理 */

window.MojiQCanvasContext = (function() {
    let ctx = null;
    let colorPicker = null;
    let lineWidthRange = null;
    let state = null;
    let eyedropperBtn = null;
    let pdfBgCanvas = null;
    let mojiqCanvas = null;

    /**
     * 初期化
     * @param {CanvasRenderingContext2D} context - キャンバスコンテキスト
     * @param {object} elements - DOM要素 {colorPicker, lineWidthRange}
     * @param {object} appState - アプリケーション状態への参照
     */
    function init(context, elements, appState) {
        ctx = context;
        colorPicker = elements.colorPicker;
        lineWidthRange = elements.lineWidthRange;
        state = appState;
        eyedropperBtn = document.getElementById('eyedropperBtn');
        pdfBgCanvas = document.getElementById('layer-pdf-bg');
        mojiqCanvas = document.getElementById('whiteboard');

        // 初期値設定
        colorPicker.value = "#ff0000";
        initContext();
        setupColorPaletteEvents();
        setupRainbowPicker();
        setupEyedropper();
        updateLineWidthDisplay();

        // Storeの線の太さ変更を監視（校正モードからの変更を同期）
        if (window.MojiQStore) {
            window.MojiQStore.subscribe('drawing.lineWidth', (value) => {
                // 値が同じ場合は更新をスキップ（ラグ防止）
                if (parseFloat(lineWidthRange.value) === value) return;
                lineWidthRange.value = value;
                const lineWidthInput = document.getElementById('lineWidthInput');
                if (lineWidthInput && document.activeElement !== lineWidthInput) {
                    lineWidthInput.value = value;
                }
                updateLineWidthDisplay();
            });
        }
    }

    /**
     * コンテキスト初期化
     */
    function initContext() {
        ctx.strokeStyle = colorPicker.value;
        ctx.fillStyle = colorPicker.value;
        ctx.lineWidth = lineWidthRange.value;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (state.currentMode === 'marker') {
            ctx.globalAlpha = 0.3;
            ctx.globalCompositeOperation = 'multiply';
        } else if (state.currentMode === 'eraser') {
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = state.eraserSize;
        } else {
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
        }
        updateColorUI();
    }

    /**
     * カラーUIの更新
     */
    function updateColorUI() {
        const currentColor = colorPicker.value.toLowerCase();
        const swatches = document.querySelectorAll('.color-swatch');

        swatches.forEach(swatch => {
            if (swatch.closest('#ui-group-mojiq-left')) { // MojiQパレットのみ
                const swatchColorAttr = swatch.getAttribute('data-color');
                // スポイトボタンなどdata-colorがない要素はスキップ
                if (!swatchColorAttr) return;
                const swatchColor = swatchColorAttr.toLowerCase();
                if (swatchColor === currentColor) {
                    swatch.classList.add('active-color');
                } else {
                    swatch.classList.remove('active-color');
                }
            }
        });
    }

    /**
     * 選択中のオブジェクトの色を変更
     * @param {string} color - HEXカラーコード
     * @returns {boolean} - 選択中のオブジェクトがあり、色を変更した場合はtrue
     */
    function applyColorToSelectedObject(color) {
        if (state.currentMode === 'select' && window.MojiQDrawingSelect && window.MojiQDrawingSelect.hasSelection()) {
            window.MojiQDrawingSelect.setSelectedColor(color);
            return true;
        }
        return false;
    }

    /**
     * 選択中のオブジェクトの線幅を変更
     * @param {number} lineWidth - 線幅
     * @returns {boolean} - 選択中のオブジェクトがあり、線幅を変更した場合はtrue
     */
    function applyLineWidthToSelectedObject(lineWidth) {
        if (state.currentMode === 'select' && window.MojiQDrawingSelect && window.MojiQDrawingSelect.hasSelection()) {
            window.MojiQDrawingSelect.setSelectedLineWidth(lineWidth);
            return true;
        }
        return false;
    }

    /**
     * カラーパレットのイベント登録
     */
    function setupColorPaletteEvents() {
        const swatches = document.querySelectorAll('.color-swatch');
        swatches.forEach(swatch => {
            // スポイトボタンは別途処理するためスキップ
            if (swatch.classList.contains('eyedropper-swatch')) return;

            swatch.addEventListener('click', (e) => {
                const color = e.target.getAttribute('data-color');
                if (color) {
                    colorPicker.value = color;
                    initContext();

                    // rainbowColorSwatch以外のスウォッチをクリックした場合、rainbowColorSwatchを点線に戻す
                    const rainbowSwatch = document.getElementById('rainbowColorSwatch');
                    if (rainbowSwatch && e.target.id !== 'rainbowColorSwatch') {
                        rainbowSwatch.style.backgroundColor = 'transparent';
                        rainbowSwatch.style.border = '2px dashed #ccc';
                        rainbowSwatch.setAttribute('data-color', '');
                    }

                    updateColorUI();
                    // 選択中のオブジェクトがあればその色を変更
                    applyColorToSelectedObject(color);
                }
            });
        });

        // カラーピッカー変更時のイベント
        colorPicker.addEventListener('input', () => {
            initContext();
            updateColorUI();
            // 選択中のオブジェクトがあればその色を変更
            applyColorToSelectedObject(colorPicker.value);
        });

        // 線幅スライダー変更時のイベント（消しゴムモード対応）
        lineWidthRange.addEventListener('input', () => {
            const value = parseFloat(lineWidthRange.value);
            if (state.currentMode === 'eraser') {
                state.eraserSize = value;
            }
            initContext();
            updateLineWidthDisplay();
            // 選択中のオブジェクトがあればその線幅を変更
            applyLineWidthToSelectedObject(value);
            // ツール別線幅設定を保存
            saveToolLineWidth(state.currentMode, value);
            // Storeに保存（校正モードと同期）
            if (window.MojiQStore) {
                window.MojiQStore.set('drawing.lineWidth', value);
            }
        });

        // 線幅入力フィールド変更時のイベント
        const lineWidthInput = document.getElementById('lineWidthInput');
        if (lineWidthInput) {
            lineWidthInput.addEventListener('input', () => {
                let value = parseFloat(lineWidthInput.value);
                const min = parseFloat(lineWidthRange.min);
                const max = parseFloat(lineWidthRange.max);

                // 範囲内に制限
                if (isNaN(value)) value = min;
                value = Math.max(min, Math.min(max, value));

                lineWidthRange.value = value;
                if (state.currentMode === 'eraser') {
                    state.eraserSize = value;
                }
                initContext();
                updateLineWidthDisplay();
                // 選択中のオブジェクトがあればその線幅を変更
                applyLineWidthToSelectedObject(value);
                // ツール別線幅設定を保存
                saveToolLineWidth(state.currentMode, value);
                // Storeに保存（校正モードと同期）
                if (window.MojiQStore) {
                    window.MojiQStore.set('drawing.lineWidth', value);
                }
            });

            // フォーカスが外れた時に値を整形
            lineWidthInput.addEventListener('blur', () => {
                let value = parseFloat(lineWidthInput.value);
                const min = parseFloat(lineWidthRange.min);
                const max = parseFloat(lineWidthRange.max);

                if (isNaN(value)) value = min;
                value = Math.max(min, Math.min(max, value));
                // 0.1単位に丸める
                value = Math.round(value * 10) / 10;
                lineWidthInput.value = value;
                lineWidthRange.value = value;
                updateLineWidthDisplay();
            });

            // Enterキーで確定
            lineWidthInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    lineWidthInput.blur();
                }
            });
        }

        // 線幅スライダー上でのマウススクロールによる変更
        lineWidthRange.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const step = e.deltaY > 0 ? -0.1 : 0.1;
            const min = parseFloat(lineWidthRange.min);
            const max = parseFloat(lineWidthRange.max);
            // Storeから現在の値を取得（スライダーの値は同期が遅れる可能性がある）
            const currentValue = window.MojiQStore ?
                (window.MojiQStore.get('drawing.lineWidth') || parseFloat(lineWidthRange.value)) :
                parseFloat(lineWidthRange.value);
            // 0.1単位に丸める
            let newValue = Math.round((currentValue + step) * 10) / 10;
            newValue = Math.max(min, Math.min(max, newValue));

            // Storeを先に更新
            if (window.MojiQStore) {
                window.MojiQStore.set('drawing.lineWidth', newValue);
            }
            // 値を更新
            lineWidthRange.value = newValue;
            const lineWidthInput = document.getElementById('lineWidthInput');
            if (lineWidthInput) {
                lineWidthInput.value = newValue;
            }
            if (state.currentMode === 'eraser') {
                state.eraserSize = newValue;
            }
            initContext();
            updateLineWidthDisplay();
            // 選択中のオブジェクトがあればその線幅を変更
            applyLineWidthToSelectedObject(newValue);
            // ツール別線幅設定を保存
            saveToolLineWidth(state.currentMode, newValue);
        }, { passive: false });
    }

    /**
     * ツール別線幅設定を保存
     * @param {string} mode - 現在のツールモード
     * @param {number} width - 線幅
     */
    function saveToolLineWidth(mode, width) {
        const lineWidthTools = ['draw', 'marker', 'eraser', 'line', 'arrow', 'doubleArrow', 'doubleArrowAnnotated', 'lineAnnotated', 'rect', 'rectAnnotated', 'ellipse', 'ellipseAnnotated', 'polyline'];
        if (lineWidthTools.includes(mode) && window.MojiQSettings) {
            const baseToolName = mode.replace('Annotated', '');
            MojiQSettings.setToolLineWidth(baseToolName, width);
        }
    }

    /**
     * 線の太さの数値表示を更新
     */
    function updateLineWidthDisplay() {
        const lineWidthInput = document.getElementById('lineWidthInput');
        if (lineWidthRange) {
            const value = parseFloat(lineWidthRange.value);
            // 0.1単位に丸めて表示
            const displayValue = Math.round(value * 10) / 10;

            // 入力フィールドを更新（フォーカス中でなければ）
            if (lineWidthInput && document.activeElement !== lineWidthInput) {
                lineWidthInput.value = displayValue;
            }

            // スライダーの進捗バーを更新
            const min = parseFloat(lineWidthRange.min);
            const max = parseFloat(lineWidthRange.max);
            const percent = ((value - min) / (max - min)) * 100;
            lineWidthRange.style.background = `linear-gradient(to right, #ff8c00 ${percent}%, #333 ${percent}%)`;
        }
    }

    /**
     * 虹色バーのセットアップ
     */
    function setupRainbowPicker() {
        const rainbowPicker = document.getElementById('rainbowPicker');
        const rainbowSwatch = document.getElementById('rainbowColorSwatch');
        if (rainbowPicker) {
            rainbowPicker.addEventListener('click', function(e) {
                const rect = this.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, x / rect.width));

                // 虹色グラデーションの色を計算（HSLを使用）
                const hue = ratio * 360;
                const color = MojiQUtils.hslToHex(hue, 100, 50);

                colorPicker.value = color;
                initContext();

                // rainbowColorSwatchの色を更新し、実線に変更
                if (rainbowSwatch) {
                    rainbowSwatch.style.backgroundColor = color;
                    rainbowSwatch.style.border = '2px solid #ccc';
                    rainbowSwatch.setAttribute('data-color', color);
                }

                updateColorUI();
                // 選択中のオブジェクトがあればその色を変更
                applyColorToSelectedObject(color);
            });
        }
    }

    /**
     * スポイト（アイドロッパー）機能のセットアップ
     */
    function setupEyedropper() {
        if (!eyedropperBtn) return;

        eyedropperBtn.addEventListener('click', () => {
            if (window.MojiQModeController) {
                MojiQModeController.setMode('eyedropper');
            }
        });
    }

    /**
     * スポイトでキャンバスから色を取得
     * @param {number} canvasX - キャンバス上のX座標（論理座標）
     * @param {number} canvasY - キャンバス上のY座標（論理座標）
     * @returns {string|null} - 取得した色（HEX形式）、取得できない場合はnull
     */
    function pickColorFromCanvas(canvasX, canvasY) {
        // 描画時と同じdprを使用（MojiQDOMCacheと同じ計算式）
        const dpr = window.MojiQDOMCache && MojiQDOMCache.isInitialized()
            ? MojiQDOMCache.get('dpr')
            : Math.min(3, Math.max(2, window.devicePixelRatio || 1));
        const physicalX = Math.floor(canvasX * dpr);
        const physicalY = Math.floor(canvasY * dpr);

        // 描画レイヤーから色を取得
        if (mojiqCanvas) {
            const mojiqCtx = mojiqCanvas.getContext('2d');
            // 範囲チェック
            if (physicalX >= 0 && physicalX < mojiqCanvas.width &&
                physicalY >= 0 && physicalY < mojiqCanvas.height) {
                const pixelData = mojiqCtx.getImageData(physicalX, physicalY, 1, 1).data;
                // 透明でない場合は描画レイヤーの色を使用
                if (pixelData[3] > 0) {
                    return rgbToHex(pixelData[0], pixelData[1], pixelData[2]);
                }
            }
        }

        // 描画レイヤーが透明の場合、PDF背景レイヤーから色を取得
        if (pdfBgCanvas) {
            const bgCtx = pdfBgCanvas.getContext('2d');
            // 範囲チェック
            if (physicalX >= 0 && physicalX < pdfBgCanvas.width &&
                physicalY >= 0 && physicalY < pdfBgCanvas.height) {
                const pixelData = bgCtx.getImageData(physicalX, physicalY, 1, 1).data;
                if (pixelData[3] > 0) {
                    return rgbToHex(pixelData[0], pixelData[1], pixelData[2]);
                }
            }
        }

        return null;
    }

    /**
     * RGB値をHEX形式に変換
     * @param {number} r - 赤成分（0-255）
     * @param {number} g - 緑成分（0-255）
     * @param {number} b - 青成分（0-255）
     * @returns {string} - HEXカラーコード
     */
    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('').toUpperCase();
    }

    /**
     * スポイトで色を適用
     * @param {string} color - HEXカラーコード
     */
    function applyEyedropperColor(color) {
        if (!color) return;

        colorPicker.value = color;
        initContext();

        // rainbowColorSwatchの色を更新し、実線に変更
        const rainbowSwatch = document.getElementById('rainbowColorSwatch');
        if (rainbowSwatch) {
            rainbowSwatch.style.backgroundColor = color;
            rainbowSwatch.style.border = '2px solid #ccc';
            rainbowSwatch.setAttribute('data-color', color);
        }

        // 校正モードのカスタムカラーサムネイルも更新
        const proofCustomSwatch = document.getElementById('proofCustomColorSwatch');
        if (proofCustomSwatch) {
            proofCustomSwatch.style.backgroundColor = color;
            proofCustomSwatch.style.border = '2px solid #ccc';
            proofCustomSwatch.setAttribute('data-color', color);
        }

        // 校正パネルのカラーピッカーも同期
        const proofColorPicker = document.getElementById('proofColorPicker');
        if (proofColorPicker) {
            proofColorPicker.value = color;
        }

        updateColorUI();
    }

    /**
     * スポイトボタンのアクティブ状態を更新
     * @param {boolean} active - アクティブ状態
     */
    function setEyedropperActive(active) {
        // 通常モードのスポイトボタン
        if (eyedropperBtn) {
            if (active) {
                eyedropperBtn.classList.add('active');
            } else {
                eyedropperBtn.classList.remove('active');
            }
        }
        // 校正モードのスポイトボタン
        const proofEyedropperBtn = document.getElementById('proofEyedropperBtn');
        if (proofEyedropperBtn) {
            if (active) {
                proofEyedropperBtn.classList.add('active');
            } else {
                proofEyedropperBtn.classList.remove('active');
            }
        }
    }

    /**
     * 色を設定
     * @param {string} color - HEXカラーコード
     */
    function setColor(color) {
        colorPicker.value = color;
        initContext();
        updateColorUI();
    }

    /**
     * 現在の色を取得
     * @returns {string}
     */
    function getColor() {
        return colorPicker.value;
    }

    return {
        init,
        initContext,
        updateColorUI,
        updateLineWidthDisplay,
        setColor,
        getColor,
        pickColorFromCanvas,
        applyEyedropperColor,
        setEyedropperActive
    };
})();
