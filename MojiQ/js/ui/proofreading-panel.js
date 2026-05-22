/**
 * proofreading-panel.js - 校正モードパネル
 * 校正モード時の右パネルUI制御
 * - カラー選択
 * - 線の太さ
 * - 正誤チェック / 提案チェック表示
 * - ページジャンプ機能
 */

const ProofreadingPanel = (() => {
    'use strict';

    // 初期化済みフラグ（イベントリスナー多重登録防止）
    let isInitialized = false;

    // DOM要素キャッシュ
    let panel, panelToggle, colorSwatches, customColorSwatch, eyedropperBtn, colorPicker;
    let lineWidthInput, lineWidthSlider;
    let correctnessContent, proposalContent, correctnessCount, proposalCount;
    let commentsContent, commentsCount;
    let tabButtons, tabContents;
    let searchInput, searchClearBtn, searchCountEl;
    let proofDoneStampBtn, proofRubyStampBtn, proofQuestionStampBtn;

    // 現在の状態
    let currentColor = '#ff0000';
    let isCollapsed = false;
    let checkedCategories = new Set(); // 確認済みカテゴリを保持
    let checkedComments = new Set(); // 確認済みコメントインデックス
    let commentDoneStamps = new Map(); // コメントインデックス → 済スタンプオブジェクトIDのマッピング
    let pdfCommentsData = []; // PDFコメントデータ
    let checkedItems = new Set(); // 確認済み項目（正誤・提案）のキー

    /**
     * 初期化
     */
    function init() {
        // 多重初期化を防止
        if (isInitialized) {
            return;
        }
        isInitialized = true;
        panel = document.getElementById('proofreadingPanel');
        if (!panel) return;

        // 折りたたみトグル
        panelToggle = document.getElementById('proofreadingPanelToggle');

        // カラー関連
        colorSwatches = panel.querySelectorAll('.proofreading-color');
        customColorSwatch = document.getElementById('proofCustomColorSwatch');
        eyedropperBtn = document.getElementById('proofEyedropperBtn');
        colorPicker = document.getElementById('proofColorPicker');

        // 線の太さ関連
        lineWidthInput = document.getElementById('proofLineWidthInput');
        lineWidthSlider = document.getElementById('proofLineWidthSlider');

        // チェックコンテンツ
        correctnessContent = document.getElementById('correctnessContent');
        proposalContent = document.getElementById('proposalContent');
        correctnessCount = document.getElementById('correctnessCount');
        proposalCount = document.getElementById('proposalCount');
        commentsContent = document.getElementById('commentsContent');
        commentsCount = document.getElementById('commentsCount');

        // タブ関連
        tabButtons = panel.querySelectorAll('.proofreading-tab');
        tabContents = panel.querySelectorAll('.proofreading-tab-content');

        // 検索関連
        searchInput = document.getElementById('proofreadingSearchInput');
        searchClearBtn = document.getElementById('proofreadingSearchClearBtn');
        searchCountEl = document.getElementById('proofreadingSearchCount');

        // 済スタンプ・ルビスタンプボタン
        proofDoneStampBtn = document.getElementById('proofDoneStampBtn');
        proofRubyStampBtn = document.getElementById('proofRubyStampBtn');
        proofQuestionStampBtn = document.getElementById('proofQuestionStampBtn');

        setupEventListeners();
    }

    /**
     * イベントリスナーの設定
     */
    function setupEventListeners() {
        // 校正チェック読み込みボタン
        const proofreadingLoadBtn = document.getElementById('proofreadingLoadBtn');
        if (proofreadingLoadBtn) {
            proofreadingLoadBtn.addEventListener('click', () => {
                // 既存の校正チェック読み込みボタン（calibrationToggleBtn）のクリックをトリガー
                const calibrationToggleBtn = document.getElementById('calibrationToggleBtn');
                if (calibrationToggleBtn) {
                    calibrationToggleBtn.click();
                }
            });
        }

        // 折りたたみトグルボタン
        if (panelToggle) {
            panelToggle.addEventListener('click', () => {
                toggleCollapse();
            });
        }

        // タブクリックイベント
        tabButtons.forEach(tab => {
            tab.addEventListener('click', () => {
                switchTab(tab.dataset.tab);
            });
        });

        // カラースウォッチのクリック
        colorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                if (swatch === customColorSwatch) {
                    // カスタムカラースウォッチ: 色があれば適用しつつ、常にカラーピッカーも開く
                    // （指示入れモードと同じ挙動: setupColorPaletteEvents + setupCustomColorSwatch の両方が発火）
                    const color = swatch.dataset.color;
                    if (color) {
                        setColor(color);
                    }
                    updateActiveColorSwatch(swatch);
                    if (colorPicker) {
                        colorPicker.click();
                    }
                } else {
                    const color = swatch.dataset.color;
                    if (color) {
                        setColor(color);
                        updateActiveColorSwatch(swatch);
                    }
                }
            });
        });

        // カラーピッカー変更（inputでリアルタイム反映 + changeで確定時反映。指示入れモードと同じ挙動）
        if (colorPicker) {
            // リアルタイム反映（ドラッグ中に選択オブジェクトの色が変わる）
            colorPicker.addEventListener('input', () => {
                const color = colorPicker.value;
                setColor(color);
            });

            // 確定時にカスタムカラースウォッチのUI・data-colorを更新
            colorPicker.addEventListener('change', () => {
                const color = colorPicker.value;
                setColor(color);
                if (customColorSwatch) {
                    customColorSwatch.style.backgroundColor = color;
                    customColorSwatch.style.border = '2px solid #ddd';
                    customColorSwatch.setAttribute('data-color', color);
                }
                updateActiveColorSwatch(customColorSwatch);
            });
        }

        // スポイトボタン
        if (eyedropperBtn) {
            eyedropperBtn.addEventListener('click', () => {
                // スポイトモードに切り替え
                if (window.MojiQModeController && window.MojiQModeController.setMode) {
                    window.MojiQModeController.setMode('eyedropper');
                    eyedropperBtn.classList.add('active');
                }
            });
        }

        // 済スタンプボタン
        if (proofDoneStampBtn) {
            proofDoneStampBtn.addEventListener('click', () => {
                if (window.MojiQModeController && window.MojiQModeController.setMode) {
                    window.MojiQModeController.setMode('doneStamp');
                    updateActiveStampButton(proofDoneStampBtn);
                }
            });
        }

        // ルビスタンプボタン
        if (proofRubyStampBtn) {
            proofRubyStampBtn.addEventListener('click', () => {
                if (window.MojiQModeController && window.MojiQModeController.setMode) {
                    window.MojiQModeController.setMode('rubyStamp');
                    updateActiveStampButton(proofRubyStampBtn);
                }
            });
        }

        // ？スタンプボタン
        if (proofQuestionStampBtn) {
            proofQuestionStampBtn.addEventListener('click', () => {
                if (window.MojiQModeController && window.MojiQModeController.setMode) {
                    window.MojiQModeController.setMode('questionStamp');
                    updateActiveStampButton(proofQuestionStampBtn);
                }
            });
        }

        // 線の太さ
        if (lineWidthInput && lineWidthSlider) {
            lineWidthInput.addEventListener('input', () => {
                const value = parseFloat(lineWidthInput.value);
                if (value >= 1 && value <= 20) {
                    lineWidthSlider.value = value;
                    setLineWidth(value);
                }
            });

            lineWidthSlider.addEventListener('input', () => {
                const value = parseFloat(lineWidthSlider.value);
                lineWidthInput.value = value;
                setLineWidth(value);
            });

            // マウスホイールで線の太さを変更
            lineWidthSlider.addEventListener('wheel', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const step = e.deltaY > 0 ? -0.1 : 0.1;
                const min = parseFloat(lineWidthSlider.min) || 1;
                const max = parseFloat(lineWidthSlider.max) || 20;
                // Storeから現在の値を取得（スライダーの値は同期が遅れる可能性がある）
                const currentValue = window.MojiQStore ?
                    (window.MojiQStore.get('drawing.lineWidth') || parseFloat(lineWidthSlider.value)) :
                    parseFloat(lineWidthSlider.value);
                // 0.1単位に丸める
                let newValue = Math.round((currentValue + step) * 10) / 10;
                newValue = Math.max(min, Math.min(max, newValue));
                // 値を更新（Storeを先に更新）
                if (window.MojiQStore) {
                    window.MojiQStore.set('drawing.lineWidth', newValue);
                }
                lineWidthSlider.value = newValue;
                lineWidthInput.value = newValue;
                updateSliderGradient(newValue);
                // 指示入れモードのスライダーも同期
                updateMainSliderGradient(newValue);
            }, { passive: false });

            // 初期グラデーションを設定
            const initialValue = parseFloat(lineWidthSlider.value) || 3;
            updateSliderGradient(initialValue);
        }

        // Storeの購読（校正モードデータの変更を監視）
        if (window.MojiQStore) {
            window.MojiQStore.subscribe('proofreadingMode.currentData', (data) => {
                if (data) {
                    renderCheckData(data);
                }
            });

            // 線の太さの変更を監視（両モード間で同期）
            window.MojiQStore.subscribe('drawing.lineWidth', (value) => {
                // DOM要素を直接取得（キャッシュが古い場合に備えて）
                const proofLineWidthInput = document.getElementById('proofLineWidthInput');
                const proofLineWidthSlider = document.getElementById('proofLineWidthSlider');
                if (proofLineWidthInput && proofLineWidthSlider) {
                    // 値が同じ場合は更新をスキップ（ラグ防止）
                    if (parseFloat(proofLineWidthSlider.value) === value) return;
                    proofLineWidthInput.value = value;
                    proofLineWidthSlider.value = value;
                    updateSliderGradient(value);
                }
            });
        }

        // ファイル読み込み完了イベントを監視してデータをリセット＆再読み込み
        window.addEventListener('mojiq:file-loaded', () => {
            // 少し遅延を入れてファイル読み込み処理が完全に終わるのを待つ
            setTimeout(() => {
                // 全データをリセット
                resetAllProofreadingData();
                // コメントを再読み込み
                loadPdfComments();
            }, 200);
        });

        // オブジェクト変更イベントを監視してコメントタブをリアルタイム更新
        let objectsChangedTimeout = null;
        window.addEventListener('mojiq:objects-changed', (e) => {
            // コメントタブに関連するオブジェクトタイプのみ更新
            const relevantTypes = ['text', 'rect', 'ellipse', 'line'];
            const objectType = e.detail?.objectType;
            if (objectType && !relevantTypes.includes(objectType)) {
                return; // 関係ないオブジェクトタイプは無視
            }

            // debounce: 連続した変更をまとめて処理（300ms）
            if (objectsChangedTimeout) {
                clearTimeout(objectsChangedTimeout);
            }
            objectsChangedTimeout = setTimeout(() => {
                // 常にコメントデータを更新（カウント表示のため）
                loadPdfComments();
            }, 300);
        });

        // 検索関連のイベントリスナー
        if (searchInput) {
            // 入力時に検索実行
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.trim();
                performSearch(query);
                // クリアボタンの表示/非表示
                if (searchClearBtn) {
                    searchClearBtn.style.display = query ? 'flex' : 'none';
                }
            });

            // Escapeキーでクリア
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearSearch();
                }
            });
        }

        // 検索クリアボタン
        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', () => {
                clearSearch();
            });
        }

        // モード変更イベントを監視してスタンプボタンの状態を更新
        window.addEventListener('mojiq:mode-changed', (e) => {
            const mode = e.detail?.mode;
            // スタンプモード以外になったらスタンプボタンの選択を解除
            if (mode !== 'doneStamp' && mode !== 'rubyStamp' && mode !== 'questionStamp') {
                resetStampButtons();
            } else if (mode === 'doneStamp') {
                updateActiveStampButton(proofDoneStampBtn);
            } else if (mode === 'rubyStamp') {
                updateActiveStampButton(proofRubyStampBtn);
            } else if (mode === 'questionStamp') {
                updateActiveStampButton(proofQuestionStampBtn);
            }
        });
    }

    /**
     * RGB形式の文字列をHEX形式に変換
     * @param {string} rgb - 'rgb(r, g, b)' または 'rgba(r, g, b, a)' 形式
     * @returns {string|null} HEX形式の色、または変換できない場合はnull
     */
    function rgbToHex(rgb) {
        if (!rgb) return null;
        // 既にHEX形式の場合はそのまま返す
        if (rgb.startsWith('#')) return rgb;
        // RGB形式をパース
        const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return null;
        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 指示入れモードのカスタムカラー情報を校正チェックモードに同期
     */
    function syncCustomColorFromMain() {
        const mainRainbowSwatch = document.getElementById('rainbowColorSwatch');
        if (mainRainbowSwatch && customColorSwatch) {
            const bgColor = mainRainbowSwatch.style.backgroundColor;
            if (bgColor && bgColor !== 'transparent') {
                customColorSwatch.style.backgroundColor = bgColor;
                customColorSwatch.style.border = '2px solid #ddd';
                const hexColor = rgbToHex(bgColor);
                if (hexColor) {
                    customColorSwatch.setAttribute('data-color', hexColor);
                }
            }
        }
    }

    /**
     * 校正チェックモードのカスタムカラー情報を指示入れモードに同期
     */
    function syncCustomColorToMain() {
        const mainRainbowSwatch = document.getElementById('rainbowColorSwatch');
        if (mainRainbowSwatch && customColorSwatch) {
            const bgColor = customColorSwatch.style.backgroundColor;
            if (bgColor && bgColor !== 'transparent') {
                mainRainbowSwatch.style.backgroundColor = bgColor;
                mainRainbowSwatch.style.border = '2px solid #ccc';
                const hexColor = rgbToHex(bgColor);
                if (hexColor) {
                    mainRainbowSwatch.setAttribute('data-color', hexColor);
                }
            }
        }
    }

    /**
     * 色を設定
     */
    function setColor(color) {
        currentColor = color;

        // グローバルの描画色を更新
        if (window.MojiQStore) {
            window.MojiQStore.set('drawing.color', color);
        }

        // 描画コンテキストの色を更新（ctx.strokeStyle/fillStyle + colorPicker.value + UI同期）
        if (window.MojiQCanvasContext) {
            window.MojiQCanvasContext.setColor(color);
        } else {
            // フォールバック: CanvasContextが未初期化の場合は手動で同期
            const mainColorPicker = document.getElementById('colorPicker');
            if (mainColorPicker) {
                mainColorPicker.value = color;
            }
        }

        // パレットの選択状態も同期
        const mainPalette = document.getElementById('colorPalette');
        if (mainPalette) {
            mainPalette.querySelectorAll('.color-swatch').forEach(s => {
                s.classList.toggle('active', s.dataset.color === color);
            });
        }

        // 選択中のオブジェクトがあればその色を変更（指示入れモードと挙動を共通化）
        if (window.MojiQDrawingSelect && window.MojiQDrawingSelect.hasSelection()) {
            window.MojiQDrawingSelect.setSelectedColor(color);
        }
    }

    /**
     * アクティブなカラースウォッチを更新
     */
    function updateActiveColorSwatch(activeSwatch) {
        colorSwatches.forEach(s => s.classList.remove('active'));
        if (activeSwatch) {
            activeSwatch.classList.add('active');
        }

        // カスタムカラースウォッチが選択されていない場合は点線に戻し、data-colorもクリア
        // （指示入れモードと同じ挙動: 他のスウォッチ選択時にカスタムカラーをリセット）
        if (customColorSwatch && activeSwatch !== customColorSwatch) {
            customColorSwatch.style.backgroundColor = 'transparent';
            customColorSwatch.style.border = '2px dashed #ccc';
            customColorSwatch.removeAttribute('data-color');
        }

        // スポイトの選択状態をリセット
        if (eyedropperBtn) {
            eyedropperBtn.classList.remove('active');
        }

        // スタンプボタンの選択状態をリセット
        if (proofDoneStampBtn) proofDoneStampBtn.classList.remove('active');
        if (proofRubyStampBtn) proofRubyStampBtn.classList.remove('active');
        if (proofQuestionStampBtn) proofQuestionStampBtn.classList.remove('active');
    }

    /**
     * アクティブなスタンプボタンを更新
     * @param {HTMLElement} activeBtn - アクティブにするボタン
     */
    function updateActiveStampButton(activeBtn) {
        // 両方のスタンプボタンからactiveクラスを削除
        if (proofDoneStampBtn) proofDoneStampBtn.classList.remove('active');
        if (proofRubyStampBtn) proofRubyStampBtn.classList.remove('active');
        if (proofQuestionStampBtn) proofQuestionStampBtn.classList.remove('active');

        // 指定されたボタンにactiveクラスを追加
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // カラースウォッチの選択状態をリセット
        colorSwatches.forEach(s => s.classList.remove('active'));

        // スポイトの選択状態をリセット
        if (eyedropperBtn) {
            eyedropperBtn.classList.remove('active');
        }
    }

    /**
     * スタンプボタンの選択状態をリセット
     */
    function resetStampButtons() {
        if (proofDoneStampBtn) proofDoneStampBtn.classList.remove('active');
        if (proofRubyStampBtn) proofRubyStampBtn.classList.remove('active');
        if (proofQuestionStampBtn) proofQuestionStampBtn.classList.remove('active');
    }

    /**
     * 線の太さを設定
     */
    function setLineWidth(value) {
        if (window.MojiQStore) {
            window.MojiQStore.set('drawing.lineWidth', value);
        }

        // スライダーのグラデーションを更新
        updateSliderGradient(value);

        // 既存のUIも同期
        const mainLineWidth = document.getElementById('lineWidth');
        const mainLineWidthInput = document.getElementById('lineWidthInput');
        if (mainLineWidth) mainLineWidth.value = value;
        if (mainLineWidthInput) mainLineWidthInput.value = value;
        // 指示入れモードのスライダーグラデーションも更新
        updateMainSliderGradient(value);
    }

    /**
     * スライダーのグラデーションを更新（進捗表示）
     */
    function updateSliderGradient(value) {
        if (!lineWidthSlider) return;
        const min = parseFloat(lineWidthSlider.min) || 1;
        const max = parseFloat(lineWidthSlider.max) || 20;
        const percentage = ((value - min) / (max - min)) * 100;
        lineWidthSlider.style.background = `linear-gradient(to right, #ff8c00 ${percentage}%, #333 ${percentage}%)`;
    }

    /**
     * 指示入れモードのスライダーグラデーションを更新
     */
    function updateMainSliderGradient(value) {
        const mainLineWidth = document.getElementById('lineWidth');
        if (!mainLineWidth) return;
        const min = parseFloat(mainLineWidth.min) || 1;
        const max = parseFloat(mainLineWidth.max) || 20;
        const percentage = ((value - min) / (max - min)) * 100;
        mainLineWidth.style.background = `linear-gradient(to right, #ff8c00 ${percentage}%, #333 ${percentage}%)`;
    }

    /**
     * 校正チェックJSONの形式をバリデート
     * @param {Object} data - 読み込んだJSONデータ
     * @returns {boolean} - 有効な校正チェック形式の場合はtrue
     */
    function isValidProofreadingJson(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        // checksオブジェクトが必須
        if (!data.checks || typeof data.checks !== 'object') {
            return false;
        }

        // variation または simple のいずれかが存在し、items配列を持つ必要がある
        const hasVariation = data.checks.variation &&
                             typeof data.checks.variation === 'object' &&
                             Array.isArray(data.checks.variation.items);
        const hasSimple = data.checks.simple &&
                          typeof data.checks.simple === 'object' &&
                          Array.isArray(data.checks.simple.items);

        if (!hasVariation && !hasSimple) {
            return false;
        }

        return true;
    }

    /**
     * チェックデータをレンダリング
     */
    function renderCheckData(data, options) {
        if (!data || !data.checks) {
            renderEmpty();
            return;
        }

        // 新しいデータ読み込み時は正誤・提案の確認済み状態のみリセット
        // コメントの確認済み状態は維持（PDFコメントは校正チェックJSONとは独立）
        // モード切替による再表示時はチェック状態を保持する
        if (!options || !options.preserveChecked) {
            checkedItems.clear();
        }

        // 全アイテムを収集
        const allItems = [];
        if (data.checks.variation && data.checks.variation.items) {
            allItems.push(...data.checks.variation.items);
        }
        if (data.checks.simple && data.checks.simple.items) {
            allItems.push(...data.checks.simple.items);
        }

        // checkKindでフィルタリング
        const correctnessItems = allItems.filter(item => item.checkKind === 'correctness');
        const proposalItems = allItems.filter(item => item.checkKind === 'proposal');

        // カウント更新
        if (correctnessCount) {
            correctnessCount.textContent = `(${correctnessItems.length})`;
        }
        if (proposalCount) {
            proposalCount.textContent = `(${proposalItems.length})`;
        }

        // コンテンツレンダリング
        if (correctnessContent) {
            correctnessContent.innerHTML = renderItemsToHtml(correctnessItems);
        }
        if (proposalContent) {
            proposalContent.innerHTML = renderItemsToHtml(proposalItems);
        }

        // 検索フィルタを再適用（検索中の場合）
        if (searchInput && searchInput.value.trim()) {
            performSearch(searchInput.value.trim());
        }
    }

    /**
     * 検索を実行
     * @param {string} query - 検索クエリ
     */
    function performSearch(query) {
        // 検索結果表示を更新
        if (!query) {
            // クエリが空の場合は全アイテムを表示
            resetSearchFilter();
            if (searchCountEl) {
                searchCountEl.style.display = 'none';
            }
            return;
        }

        const activeTab = getActiveTab();

        // コメントタブの場合は専用の検索
        if (activeTab === 'comments') {
            performCommentsSearch(query);
            return;
        }

        const lowerQuery = query.toLowerCase();
        let totalMatches = 0;

        // 現在のアクティブタブのコンテンツのみ検索
        const activeContent = activeTab === 'correctness' ? correctnessContent : proposalContent;
        if (!activeContent) return;

        const categories = activeContent.querySelectorAll('.proofreading-category');
        categories.forEach(category => {
            const items = category.querySelectorAll('.proofreading-item');
            let categoryHasMatch = false;

            items.forEach(item => {
                // 検索対象: content, excerpt
                const contentText = item.getAttribute('data-content') || '';
                const excerptEl = item.querySelector('.cal-excerpt');
                const contentEl = item.querySelector('.cal-content');
                const excerptText = excerptEl ? excerptEl.textContent : '';
                const displayContentText = contentEl ? contentEl.textContent : '';

                const matchesContent = contentText.toLowerCase().includes(lowerQuery);
                const matchesExcerpt = excerptText.toLowerCase().includes(lowerQuery);
                const matchesDisplay = displayContentText.toLowerCase().includes(lowerQuery);

                if (matchesContent || matchesExcerpt || matchesDisplay) {
                    item.classList.remove('search-hidden');
                    categoryHasMatch = true;
                    totalMatches++;

                    // ハイライト表示
                    if (excerptEl) {
                        highlightText(excerptEl, query);
                    }
                    if (contentEl) {
                        highlightText(contentEl, query);
                    }
                } else {
                    item.classList.add('search-hidden');
                    // ハイライトをクリア
                    if (excerptEl) {
                        clearHighlight(excerptEl);
                    }
                    if (contentEl) {
                        clearHighlight(contentEl);
                    }
                }
            });

            // カテゴリ内にマッチがない場合は非表示
            if (categoryHasMatch) {
                category.classList.remove('search-hidden');
            } else {
                category.classList.add('search-hidden');
            }
        });

        // 検索結果件数を表示
        if (searchCountEl) {
            searchCountEl.style.display = 'inline';
            searchCountEl.textContent = `${totalMatches}件`;
        }
    }

    /**
     * コメントタブ用の検索
     * @param {string} query - 検索クエリ
     */
    function performCommentsSearch(query) {
        if (!commentsContent) return;

        const lowerQuery = query.toLowerCase();
        let matchCount = 0;

        const items = commentsContent.querySelectorAll('.proofreading-comment-item');
        items.forEach(item => {
            const contentEl = item.querySelector('.proofreading-comment-content');
            const text = contentEl ? contentEl.textContent.toLowerCase() : '';

            if (text.includes(lowerQuery)) {
                item.classList.remove('search-hidden');
                matchCount++;
                if (contentEl) highlightText(contentEl, query);
            } else {
                item.classList.add('search-hidden');
                if (contentEl) clearHighlight(contentEl);
            }
        });

        if (searchCountEl) {
            searchCountEl.style.display = 'inline';
            searchCountEl.textContent = `${matchCount}件`;
        }
    }

    /**
     * 検索フィルタをリセット
     */
    function resetSearchFilter() {
        // 正誤・提案コンテンツ
        [correctnessContent, proposalContent].forEach(content => {
            if (!content) return;

            const categories = content.querySelectorAll('.proofreading-category');
            categories.forEach(category => {
                category.classList.remove('search-hidden');

                const items = category.querySelectorAll('.proofreading-item');
                items.forEach(item => {
                    item.classList.remove('search-hidden');

                    // ハイライトをクリア
                    const excerptEl = item.querySelector('.cal-excerpt');
                    const contentEl = item.querySelector('.cal-content');
                    if (excerptEl) clearHighlight(excerptEl);
                    if (contentEl) clearHighlight(contentEl);
                });
            });
        });

        // コメントコンテンツ
        if (commentsContent) {
            const items = commentsContent.querySelectorAll('.proofreading-comment-item');
            items.forEach(item => {
                item.classList.remove('search-hidden');
                const contentEl = item.querySelector('.proofreading-comment-content');
                if (contentEl) clearHighlight(contentEl);
            });
        }
    }

    /**
     * 検索をクリア
     */
    function clearSearch() {
        if (searchInput) {
            searchInput.value = '';
        }
        if (searchClearBtn) {
            searchClearBtn.style.display = 'none';
        }
        resetSearchFilter();
        if (searchCountEl) {
            searchCountEl.style.display = 'none';
        }
    }

    /**
     * テキストをハイライト表示
     * @param {HTMLElement} element - 対象要素
     * @param {string} query - 検索クエリ
     */
    function highlightText(element, query) {
        const originalText = element.textContent;
        const lowerText = originalText.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const index = lowerText.indexOf(lowerQuery);

        if (index === -1) {
            element.innerHTML = escapeHtml(originalText);
            return;
        }

        // マッチ部分をハイライト（大文字小文字を保持）
        const before = originalText.substring(0, index);
        const match = originalText.substring(index, index + query.length);
        const after = originalText.substring(index + query.length);

        element.innerHTML = escapeHtml(before) +
            '<span class="proofreading-search-highlight">' + escapeHtml(match) + '</span>' +
            escapeHtml(after);
    }

    /**
     * ハイライトをクリア
     * @param {HTMLElement} element - 対象要素
     */
    function clearHighlight(element) {
        // innerHTMLをtextContentに戻す
        element.textContent = element.textContent;
    }

    /**
     * 空のコンテンツをレンダリング
     */
    function renderEmpty() {
        if (correctnessContent) {
            correctnessContent.innerHTML = '<div class="proofreading-check-empty">データがありません（校正チェックを読み込みから読み込んでください）</div>';
        }
        if (proposalContent) {
            proposalContent.innerHTML = '<div class="proofreading-check-empty">データがありません（校正チェックを読み込みから読み込んでください）</div>';
        }
        if (correctnessCount) {
            correctnessCount.textContent = '(0)';
        }
        if (proposalCount) {
            proposalCount.textContent = '(0)';
        }
    }

    /**
     * アイテムリストをHTMLに変換（calibration-viewer.jsと同様のロジック）
     */
    function renderItemsToHtml(items) {
        if (!items || items.length === 0) {
            return '<div class="proofreading-check-empty">データがありません（校正チェックを読み込みから読み込んでください）</div>';
        }

        // カテゴリでグループ化
        const grouped = {};
        items.forEach(item => {
            const cat = item.category || '未分類';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        });

        let html = '';
        const sortedKeys = Object.keys(grouped).sort();

        sortedKeys.forEach(category => {
            const catItems = grouped[category];
            const colorClass = getCategoryColor(category);
            const isChecked = checkedCategories.has(category);
            const checkedClass = isChecked ? ' checked collapsed' : '';

            html += '<div class="proofreading-category ' + colorClass + checkedClass + '" data-category="' + escapeAttr(category) + '">';
            html += '<div class="proofreading-category-header">';
            html += '<label class="proofreading-category-checkbox" onclick="event.stopPropagation()">';
            html += '<input type="checkbox" ' + (isChecked ? 'checked' : '') + ' onchange="ProofreadingPanel.toggleCategoryChecked(this, \'' + escapeAttr(category) + '\')">';
            html += '<span class="proofreading-checkbox-icon"></span>';
            html += '</label>';
            html += '<span class="proofreading-category-toggle" onclick="ProofreadingPanel.toggleCategory(this.parentElement)">▼</span>';
            html += '<span class="proofreading-category-name" onclick="ProofreadingPanel.toggleCategory(this.parentElement)">' + escapeHtml(category) + '</span>';
            html += '<span class="proofreading-category-count" onclick="ProofreadingPanel.toggleCategory(this.parentElement)">(' + catItems.length + ')</span>';
            html += '</div>';
            html += '<div class="proofreading-category-body">';
            html += '<table class="proofreading-table"><tbody>';

            catItems.forEach((item, idx) => {
                const itemKey = category + '_' + idx;
                const isItemChecked = checkedItems.has(itemKey);
                const itemCheckedClass = isItemChecked ? ' checked' : '';
                html += '<tr class="proofreading-item' + itemCheckedClass + '" data-item-key="' + escapeAttr(itemKey) + '" data-content="' + escapeAttr(item.content || '') + '">';
                html += '<td class="cal-checkbox">';
                html += '<label class="proofreading-item-checkbox">';
                html += '<input type="checkbox" ' + (isItemChecked ? 'checked' : '') + ' onchange="ProofreadingPanel.toggleItemChecked(this, \'' + escapeAttr(itemKey) + '\')">';
                html += '<span class="proofreading-item-checkbox-icon"></span>';
                html += '</label>';
                html += '</td>';
                html += '<td class="cal-text-btn" onclick="ProofreadingPanel.selectItem(this.parentElement)" title="クリックで内容を追記">';
                html += '<span class="cal-text-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3 L21 7 L8 20 L4 20 L4 16 Z"/><line x1="14" y1="6" x2="18" y2="10"/></svg></span>';
                html += '</td>';
                html += '<td class="cal-page" onclick="ProofreadingPanel.jumpToPage(\'' + escapeAttr(item.page) + '\')">' + formatPage(item.page) + '</td>';
                html += '<td class="cal-excerpt">' + escapeHtml(item.excerpt || '') + '</td>';
                html += '<td class="cal-content">' + escapeHtml(item.content || '') + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table></div></div>';
        });

        return html;
    }

    /**
     * カテゴリに応じた色クラスを返す
     */
    function getCategoryColor(category) {
        const match = category.match(/^(\d+)\./);
        if (!match) return 'cal-color-default';
        const num = parseInt(match[1], 10);
        const colors = ['cal-color-1', 'cal-color-2', 'cal-color-3', 'cal-color-4', 'cal-color-5',
                        'cal-color-6', 'cal-color-7', 'cal-color-8', 'cal-color-9', 'cal-color-10'];
        return colors[(num - 1) % colors.length] || 'cal-color-default';
    }

    /**
     * ページ番号を「●●P」形式にフォーマット
     * 対応フォーマット: "3巻 6ページ", "3巻1P", "25P", "25ページ", "25"
     */
    function formatPage(page) {
        if (!page) return '';
        const pageStr = String(page);

        // 「〇〇ページ」または「〇〇P」のパターンを探す
        const pageMatch = pageStr.match(/(\d+)\s*(?:ページ|P)/i);
        if (pageMatch) {
            return escapeHtml(pageMatch[1]) + 'P';
        }

        // フォールバック: 先頭の数字を使用
        const match = pageStr.match(/^(\d+)/);
        if (match) {
            return escapeHtml(match[1]) + 'P';
        }
        return escapeHtml(pageStr);
    }

    /**
     * HTMLエスケープ
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * 属性用エスケープ
     */
    function escapeAttr(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * セクションの折りたたみ切り替え
     */
    function toggleSection(sectionType) {
        const section = panel.querySelector(`.${sectionType}-section`);
        if (section) {
            section.classList.toggle('collapsed');
        }
    }

    /**
     * カテゴリの折りたたみ切り替え
     */
    function toggleCategory(headerEl) {
        const category = headerEl.closest('.proofreading-category');
        if (category) {
            category.classList.toggle('collapsed');
        }
    }

    /**
     * カテゴリの確認済み状態をトグル
     * @param {HTMLInputElement} checkbox - チェックボックス要素
     * @param {string} categoryName - カテゴリ名
     */
    function toggleCategoryChecked(checkbox, categoryName) {
        const category = checkbox.closest('.proofreading-category');
        if (!category) return;

        if (checkbox.checked) {
            checkedCategories.add(categoryName);
            category.classList.add('checked');
            // チェック時に自動で折りたたむ
            category.classList.add('collapsed');
        } else {
            checkedCategories.delete(categoryName);
            category.classList.remove('checked');
            // チェック解除時に展開
            category.classList.remove('collapsed');
        }

        // カテゴリ内のすべての項目のチェック状態を同期
        const items = category.querySelectorAll('.proofreading-item');
        items.forEach(item => {
            const itemCheckbox = item.querySelector('input[type="checkbox"]');
            const itemKey = item.dataset.itemKey;
            if (itemCheckbox && itemKey) {
                itemCheckbox.checked = checkbox.checked;
                if (checkbox.checked) {
                    checkedItems.add(itemKey);
                    item.classList.add('checked');
                } else {
                    checkedItems.delete(itemKey);
                    item.classList.remove('checked');
                }
            }
        });

        // タブの済状態を更新
        updateTabDoneStatus();
    }

    /**
     * 確認済み状態をリセット
     */
    function resetCheckedCategories() {
        checkedCategories.clear();
    }

    /**
     * 全ての校正チェックデータをリセット（PDF読み込み時用）
     */
    function resetAllProofreadingData() {
        // 正誤・提案の確認済み状態をリセット
        checkedCategories.clear();
        checkedItems.clear();

        // 正誤・提案の表示をリセット
        renderEmpty();

        // コメントデータをリセット
        pdfCommentsData = [];
        resetCheckedComments();

        // コメントタブの表示をリセット
        if (commentsContent) {
            commentsContent.innerHTML = '';
        }
        if (commentsCount) {
            commentsCount.textContent = '(0)';
        }

        // タブの済状態をリセット
        resetTabDoneStatus();
    }

    /**
     * タブの済状態をリセット
     */
    function resetTabDoneStatus() {
        const tabs = document.querySelectorAll('.proofreading-tab');
        tabs.forEach(tab => tab.classList.remove('all-checked'));
    }

    /**
     * コメントの確認済み状態をトグル
     * @param {HTMLInputElement} checkbox - チェックボックス要素
     * @param {number} commentIndex - コメントのインデックス
     */
    function toggleCommentChecked(checkbox, commentIndex) {
        const commentItem = checkbox.closest('.proofreading-comment-item');
        if (!commentItem) return;

        if (checkbox.checked) {
            checkedComments.add(commentIndex);
            commentItem.classList.add('checked');
            // 済スタンプを非同期で追加（UIをブロックしない）
            requestAnimationFrame(() => {
                addDoneStampForComment(commentIndex);
            });
        } else {
            checkedComments.delete(commentIndex);
            commentItem.classList.remove('checked');
            // 済スタンプを非同期で削除（UIをブロックしない）
            requestAnimationFrame(() => {
                removeDoneStampForComment(commentIndex);
            });
        }

        // タブの済状態を更新
        updateCommentsTabDone();
    }

    /**
     * 項目（正誤・提案）の確認済み状態をトグル
     * @param {HTMLInputElement} checkbox - チェックボックス要素
     * @param {string} itemKey - 項目のキー（カテゴリ_インデックス）
     */
    function toggleItemChecked(checkbox, itemKey) {
        const itemRow = checkbox.closest('.proofreading-item');
        if (!itemRow) return;

        if (checkbox.checked) {
            checkedItems.add(itemKey);
            itemRow.classList.add('checked');
        } else {
            checkedItems.delete(itemKey);
            itemRow.classList.remove('checked');
        }

        // カテゴリ内のすべての項目がチェックされているか確認
        const category = itemRow.closest('.proofreading-category');
        if (category) {
            checkAllItemsInCategory(category);
        }

        // タブの済状態を更新
        updateTabDoneStatus();
    }

    /**
     * カテゴリ内のすべての項目がチェックされているか確認し、
     * すべてチェックされていればカテゴリも自動でチェックして畳む
     * @param {HTMLElement} categoryElement - カテゴリ要素
     */
    function checkAllItemsInCategory(categoryElement) {
        const items = categoryElement.querySelectorAll('.proofreading-item');
        const checkedItemsInCategory = categoryElement.querySelectorAll('.proofreading-item.checked');
        const categoryName = categoryElement.getAttribute('data-category');
        const categoryCheckbox = categoryElement.querySelector('.proofreading-category-checkbox input[type="checkbox"]');

        // すべての項目がチェックされている場合
        if (items.length > 0 && items.length === checkedItemsInCategory.length) {
            // カテゴリがまだチェックされていない場合のみ処理
            if (categoryCheckbox && !categoryCheckbox.checked) {
                categoryCheckbox.checked = true;
                checkedCategories.add(categoryName);
                categoryElement.classList.add('checked', 'collapsed');
            }
        } else {
            // 全チェックが崩れた場合、カテゴリのチェックを解除
            if (categoryCheckbox && categoryCheckbox.checked) {
                categoryCheckbox.checked = false;
                checkedCategories.delete(categoryName);
                categoryElement.classList.remove('checked', 'collapsed');
            }
        }
    }

    /**
     * タブの全項目チェック済み状態を更新
     */
    function updateTabDoneStatus() {
        // 正誤タブ
        updateCorrectnessTabDone();
        // 提案タブ
        updateProposalTabDone();
        // コメントタブ
        updateCommentsTabDone();
    }

    /**
     * 正誤タブの済状態を更新
     */
    function updateCorrectnessTabDone() {
        const tab = document.querySelector('.proofreading-tab[data-tab="correctness"]');
        if (!tab || !correctnessContent) return;

        const items = correctnessContent.querySelectorAll('.proofreading-item');
        const totalCount = items.length;
        const checkedCount = correctnessContent.querySelectorAll('.proofreading-item.checked').length;

        // 項目が1つ以上あり、すべてチェック済みの場合
        if (totalCount > 0 && totalCount === checkedCount) {
            tab.classList.add('all-checked');
        } else {
            tab.classList.remove('all-checked');
        }
    }

    /**
     * 提案タブの済状態を更新
     */
    function updateProposalTabDone() {
        const tab = document.querySelector('.proofreading-tab[data-tab="proposal"]');
        if (!tab || !proposalContent) return;

        const items = proposalContent.querySelectorAll('.proofreading-item');
        const totalCount = items.length;
        const checkedCount = proposalContent.querySelectorAll('.proofreading-item.checked').length;

        // 項目が1つ以上あり、すべてチェック済みの場合
        if (totalCount > 0 && totalCount === checkedCount) {
            tab.classList.add('all-checked');
        } else {
            tab.classList.remove('all-checked');
        }
    }

    /**
     * コメントタブの済状態を更新
     */
    function updateCommentsTabDone() {
        const tab = document.querySelector('.proofreading-tab[data-tab="comments"]');
        if (!tab || !commentsContent) return;

        const items = commentsContent.querySelectorAll('.proofreading-comment-item');
        const totalCount = items.length;
        const checkedCount = commentsContent.querySelectorAll('.proofreading-comment-item.checked').length;

        // 項目が1つ以上あり、すべてチェック済みの場合
        if (totalCount > 0 && totalCount === checkedCount) {
            tab.classList.add('all-checked');
        } else {
            tab.classList.remove('all-checked');
        }
    }

    /**
     * コメントに対応する済スタンプを追加
     * @param {number} commentIndex - コメントのインデックス
     */
    function addDoneStampForComment(commentIndex) {
        const comment = pdfCommentsData[commentIndex];
        if (!comment) return;

        const pdfPage = comment.pdfPage;
        const contents = comment.contents;
        const isMojiQText = comment._isMojiQText; // MojiQテキストかどうか
        const isFromMetadata = comment._fromMetadata; // メタデータ由来かどうか
        const commentType = comment.type; // コメントのタイプ（'MojiQ', 'rect', 'ellipse', 'line'など）
        const isShapeWithText = (commentType === 'rect' || commentType === 'ellipse' || commentType === 'line');

        let canvasX, canvasY;

        // メタデータ由来のコメントは、保存時の座標を現在の表示サイズに変換
        // （DrawingObjectsには対応するオブジェクトが存在しないため）
        if (isFromMetadata && comment.canvasRect) {
            // 現在の表示サイズを取得
            const displaySize = window.MojiQPdfManager && window.MojiQPdfManager.getDisplayPageSize ?
                window.MojiQPdfManager.getDisplayPageSize(pdfPage) : null;

            // 保存時の表示サイズがある場合は、スケール変換を行う
            if (displaySize && comment.savedDisplayWidth && comment.savedDisplayHeight) {
                const scaleX = displaySize.width / comment.savedDisplayWidth;
                const scaleY = displaySize.height / comment.savedDisplayHeight;
                canvasX = comment.canvasRect.x * scaleX;
                canvasY = comment.canvasRect.y * scaleY;
            } else {
                // フォールバック: 直接使用
                canvasX = comment.canvasRect.x;
                canvasY = comment.canvasRect.y;
            }
        }
        // 既存のテキストオブジェクトを検索
        else if (window.MojiQDrawingObjects && window.MojiQDrawingObjects.getPageObjects) {
            const pageObjects = window.MojiQDrawingObjects.getPageObjects(pdfPage);
            if (pageObjects) {
                // コメントの座標情報を取得
                let targetX = null;
                let targetY = null;
                if (comment.canvasRect) {
                    targetX = comment.canvasRect.x;
                    targetY = comment.canvasRect.y;
                }

                // 1. テキスト内容が一致 + 座標が最も近いオブジェクトを検索
                // （同じ文言のコメントが複数ある場合を考慮）
                let matchingObjects = [];
                for (const obj of pageObjects) {
                    // 図形+テキストの場合: テキストの位置（annotation.x, annotation.y）を使用
                    if (isShapeWithText && obj.type === commentType && obj.annotation && obj.annotation.text === contents) {
                        if (typeof obj.annotation.x === 'number' && typeof obj.annotation.y === 'number') {
                            matchingObjects.push({ obj, pos: { x: obj.annotation.x, y: obj.annotation.y } });
                        }
                    }
                    // テキストオブジェクトの場合
                    else if (!isShapeWithText && obj.type === 'text' && obj.text === contents && obj.startPos) {
                        // MojiQテキストの場合: _pdfAnnotationSourceがない
                        // PDF注釈の場合: _pdfAnnotationSourceがある
                        if (isMojiQText) {
                            if (!obj._pdfAnnotationSource) {
                                matchingObjects.push({ obj, pos: obj.startPos });
                            }
                        } else {
                            if (obj._pdfAnnotationSource) {
                                matchingObjects.push({ obj, pos: obj.startPos });
                            }
                        }
                    }
                }

                if (matchingObjects.length === 1) {
                    // 1件のみの場合はそのまま使用
                    canvasX = matchingObjects[0].pos.x;
                    canvasY = matchingObjects[0].pos.y;
                } else if (matchingObjects.length > 1 && targetX !== null && targetY !== null) {
                    // 複数件ある場合は座標が最も近いものを選択
                    let minDistance = Infinity;
                    for (const match of matchingObjects) {
                        const dx = Math.abs(match.pos.x - targetX);
                        const dy = Math.abs(match.pos.y - targetY);
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance < minDistance) {
                            minDistance = distance;
                            canvasX = match.pos.x;
                            canvasY = match.pos.y;
                        }
                    }
                }

                // 2. テキスト内容で見つからない場合（編集された場合）は座標のみで検索
                if (canvasX === undefined && targetX !== null && targetY !== null) {
                    let minDistance = Infinity;
                    for (const obj of pageObjects) {
                        let pos = null;

                        // 図形+テキストの場合: テキストの位置を使用
                        if (isShapeWithText && obj.type === commentType && obj.annotation) {
                            if (typeof obj.annotation.x === 'number' && typeof obj.annotation.y === 'number') {
                                pos = { x: obj.annotation.x, y: obj.annotation.y };
                            }
                        }
                        // テキストオブジェクトの場合
                        else if (!isShapeWithText && obj.type === 'text' && obj.startPos) {
                            // MojiQテキストの場合: _pdfAnnotationSourceがないものを検索
                            // PDF注釈の場合: _pdfAnnotationSourceがあるものを検索
                            if (isMojiQText && obj._pdfAnnotationSource) {
                                continue;
                            }
                            if (!isMojiQText && !obj._pdfAnnotationSource) {
                                continue;
                            }
                            pos = obj.startPos;
                        }

                        if (!pos) continue;

                        const dx = Math.abs(pos.x - targetX);
                        const dy = Math.abs(pos.y - targetY);
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance < minDistance) {
                            minDistance = distance;
                            canvasX = pos.x;
                            canvasY = pos.y;
                        }
                    }
                }
            }
        }

        // DrawingObjectが見つからない場合、PDF座標から現在の表示サイズに合わせて座標を計算
        // （MojiQ保存済みPDFの場合、PDF注釈はオブジェクト化されないため）
        if (canvasX === undefined && comment.rect && comment.viewportWidth && comment.viewportHeight) {
            // 現在の表示サイズを取得
            const displaySize = window.MojiQPdfManager && window.MojiQPdfManager.getDisplayPageSize ?
                window.MojiQPdfManager.getDisplayPageSize(pdfPage) : null;

            if (displaySize) {
                // 現在の表示サイズに合わせてスケールを計算
                const scaleX = displaySize.width / comment.viewportWidth;
                const scaleY = displaySize.height / comment.viewportHeight;

                const [x1, y1, x2, y2] = comment.rect;
                // 左上座標をキャンバス座標に変換（スケール適用）
                canvasX = x1 * scaleX;
                canvasY = (comment.viewportHeight - y2) * scaleY;
            } else if (comment.canvasRect) {
                // フォールバック: canvasRectを直接使用
                canvasX = comment.canvasRect.x;
                canvasY = comment.canvasRect.y;
            }
        } else if (canvasX === undefined && comment.canvasRect) {
            // rectがない場合（MojiQテキストなど）はcanvasRectを使用
            canvasX = comment.canvasRect.x;
            canvasY = comment.canvasRect.y;
        }

        if (canvasX === undefined) {
            console.warn('コメントに対応するテキストオブジェクトが見つかりませんでした:', comment);
            return;
        }

        // 済スタンプのサイズ
        const stampSize = 20;

        // 済スタンプオブジェクトを作成
        const doneStamp = {
            type: 'doneStamp',
            startPos: { x: canvasX, y: canvasY },
            color: '#ff0000', // 赤色
            size: stampSize,
            commentIndex: commentIndex // コメントとの関連付け
        };

        // 描画オブジェクトとして保存
        if (window.MojiQDrawingObjects && window.MojiQDrawingObjects.addObject) {
            const stampId = window.MojiQDrawingObjects.addObject(pdfPage, doneStamp);
            if (stampId) {
                commentDoneStamps.set(commentIndex, { page: pdfPage, stampId: stampId });
            }

            // 現在のページなら再描画
            if (window.MojiQPdfManager && window.MojiQPdfManager.getCurrentPage) {
                const currentPage = window.MojiQPdfManager.getCurrentPage();
                if (currentPage === pdfPage) {
                    if (window.redrawCanvas) {
                        window.redrawCanvas(false);
                    } else if (window.MojiQDrawing && window.MojiQDrawing.redrawCanvas) {
                        window.MojiQDrawing.redrawCanvas(false);
                    }
                }
            }
        }
    }

    /**
     * コメントに対応する済スタンプを削除
     * @param {number} commentIndex - コメントのインデックス
     */
    function removeDoneStampForComment(commentIndex) {
        const stampInfo = commentDoneStamps.get(commentIndex);
        if (!stampInfo) return;

        const { page, stampId } = stampInfo;

        // 描画オブジェクトから削除（IDで削除）
        if (window.MojiQDrawingObjects && window.MojiQDrawingObjects.removeObjectById) {
            window.MojiQDrawingObjects.removeObjectById(page, stampId);
        }

        commentDoneStamps.delete(commentIndex);

        // 現在のページなら再描画
        if (window.MojiQPdfManager && window.MojiQPdfManager.getCurrentPage) {
            const currentPage = window.MojiQPdfManager.getCurrentPage();
            if (currentPage === page) {
                if (window.redrawCanvas) {
                    window.redrawCanvas(false);
                } else if (window.MojiQDrawing && window.MojiQDrawing.redrawCanvas) {
                    window.MojiQDrawing.redrawCanvas(false);
                }
            }
        }
    }

    /**
     * コメント確認済み状態をリセット
     */
    function resetCheckedComments() {
        // 全ての済スタンプを削除（Mapのkeysを配列にコピーしてからループ）
        const commentIndices = Array.from(commentDoneStamps.keys());
        for (const commentIndex of commentIndices) {
            const stampInfo = commentDoneStamps.get(commentIndex);
            if (stampInfo && window.MojiQDrawingObjects && window.MojiQDrawingObjects.removeObjectById) {
                window.MojiQDrawingObjects.removeObjectById(stampInfo.page, stampInfo.stampId);
            }
        }
        checkedComments.clear();
        commentDoneStamps.clear();

        // コメントアイテムのUI状態もリセット
        if (commentsContent) {
            const commentItems = commentsContent.querySelectorAll('.proofreading-comment-item');
            commentItems.forEach(item => {
                item.classList.remove('checked');
                const checkbox = item.querySelector('.comment-check-input');
                if (checkbox) checkbox.checked = false;
            });
        }
    }

    /**
     * 確認済みコメントの識別情報を取得
     * 描画エクスポート時にPDF注釈由来オブジェクトを除外するために使用
     * @returns {Array<{pdfPage: number, contents: string, canvasRect: {x: number, y: number}}>}
     */
    function getCheckedCommentSignatures() {
        const signatures = [];
        for (const index of checkedComments) {
            const comment = pdfCommentsData[index];
            if (comment) {
                signatures.push({
                    pdfPage: comment.pdfPage,
                    contents: comment.contents,
                    canvasRect: comment.canvasRect
                });
            }
        }
        return signatures;
    }

    /**
     * 指定ページへジャンプ
     * 対応フォーマット: "3巻 6ページ", "3巻1P", "25P", "25ページ", "25"
     */
    function jumpToPage(pageStr) {
        if (!pageStr) return;

        const str = String(pageStr);

        // 「〇〇ページ」または「〇〇P」のパターンを探す
        let pageMatch = str.match(/(\d+)\s*(?:ページ|P)/i);
        if (!pageMatch) {
            // フォールバック: 先頭の数字を使用
            pageMatch = str.match(/^(\d+)/);
        }
        if (!pageMatch) return;

        let pageNum = parseInt(pageMatch[1], 10);
        if (isNaN(pageNum) || pageNum < 1) return;

        // ページ移動
        if (window.MojiQPdfManager && window.MojiQPdfManager.renderPage) {
            // 1. アプリの見開きモード（SpreadViewMode）: 白紙ページ分を加算
            if (window.MojiQPdfManager.isSpreadViewMode && window.MojiQPdfManager.isSpreadViewMode()) {
                const SpreadState = window._MojiQPdfSpreadState;
                if (SpreadState && SpreadState.getSpreadBlankPagesAdded) {
                    const blankPages = SpreadState.getSpreadBlankPagesAdded();
                    pageNum += blankPages.front;
                }
            }
            // 2. 横長原稿（幅 > 高さ）: 1ページ目は単独、2ページ目以降は見開きとして計算
            else if (window.MojiQPdfManager.getOriginalPageSize) {
                const pageSize = window.MojiQPdfManager.getOriginalPageSize(1);
                if (pageSize && pageSize.width > pageSize.height && pageNum >= 2) {
                    // 2P,3P→2ページ目、4P,5P→3ページ目、...
                    pageNum = Math.ceil((pageNum - 1) / 2) + 1;
                }
            }

            window.MojiQPdfManager.renderPage(pageNum);
        } else if (window.MojiQStore) {
            // フォールバック：Storeを通じて移動
            const totalPages = window.MojiQStore.get('page.totalPages');
            if (pageNum <= totalPages) {
                window.MojiQStore.set('page.currentPageNum', pageNum - 1);
            }
        }
    }

    /**
     * コメントのページにジャンプ（PDFの物理ページ番号で直接移動）
     * @param {string|number} pageNum - PDFのページ番号
     */
    function jumpToCommentPage(pageNum) {
        const num = parseInt(pageNum, 10);
        if (isNaN(num) || num < 1) return;

        // PDFの物理ページに直接移動（ノンブル変換なし）
        if (window.MojiQPdfManager && window.MojiQPdfManager.renderPage) {
            window.MojiQPdfManager.renderPage(num);
        }
    }

    /**
     * コンテンツをクリップボードにコピー
     */
    function copyContent(btn) {
        const content = btn.getAttribute('data-content');
        if (!content) return;

        navigator.clipboard.writeText(content).then(() => {
            // 成功時: ボタンにチェックマークを表示
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            btn.classList.add('copied');

            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.classList.remove('copied');
            }, 1000);
        }).catch(err => {
            console.error('コピーに失敗しました:', err);
        });
    }

    /**
     * パネルを表示
     */
    function show() {
        if (panel) {
            panel.style.display = 'flex';
        }

        // 現在のデータでレンダリング
        if (window.MojiQStore) {
            const data = window.MojiQStore.get('proofreadingMode.currentData');
            if (data) {
                renderCheckData(data, { preserveChecked: true });
            }
        }

        // 指示入れモードの線の太さを引き継ぐ
        syncLineWidthFromMainUI();

        // ボタン状態を同期（モード切替時の状態引き継ぎ）
        updateTextLayerButtonState();
        updatePageBarButtonState();

        // BUG修正: 複数の非同期更新を単一のrequestAnimationFrameに統合
        // DOM更新後に一度だけ同期（過剰な更新呼び出しを防止）
        requestAnimationFrame(() => {
            syncLineWidthFromMainUI();
            updateTextLayerButtonState();
            updatePageBarButtonState();
        });

        // 指示入れモードのカスタムカラー情報を引き継ぐ
        syncCustomColorFromMain();
    }

    /**
     * 指示入れモードの線の太さを校正モードに同期
     */
    function syncLineWidthFromMainUI() {
        // DOM要素を直接取得（キャッシュが初期化前の場合に備えて）
        const proofLineWidthInput = document.getElementById('proofLineWidthInput');
        const proofLineWidthSlider = document.getElementById('proofLineWidthSlider');

        // Storeから値を優先的に取得（より信頼性が高い）
        let value = 3;
        if (window.MojiQStore) {
            value = window.MojiQStore.get('drawing.lineWidth') || 3;
        } else {
            const mainLineWidthInput = document.getElementById('lineWidthInput');
            if (mainLineWidthInput) {
                value = parseFloat(mainLineWidthInput.value) || 3;
            }
        }

        if (proofLineWidthInput && proofLineWidthSlider) {
            // プロパティと属性の両方を更新
            proofLineWidthInput.value = value;
            proofLineWidthInput.setAttribute('value', value);
            proofLineWidthSlider.value = value;
            proofLineWidthSlider.setAttribute('value', value);
            updateSliderGradient(value);
        }
    }

    /**
     * パネルを非表示
     */
    function hide() {
        // 校正チェックモードのカスタムカラー情報を指示入れモードに引き継ぐ
        syncCustomColorToMain();

        if (panel) {
            panel.style.display = 'none';
        }
    }

    /**
     * スポイトで色を取得した時のコールバック
     */
    function onEyedropperColorPicked(color) {
        setColor(color);
        customColorSwatch.style.backgroundColor = color;
        customColorSwatch.style.border = '2px solid #ddd';
        customColorSwatch.setAttribute('data-color', color);
        updateActiveColorSwatch(customColorSwatch);

        // スポイトボタンの選択状態をリセット
        if (eyedropperBtn) {
            eyedropperBtn.classList.remove('active');
        }
    }

    /**
     * タブを切り替え
     * @param {string} tabName - 'correctness', 'proposal', 'comments'
     */
    function switchTab(tabName) {
        // タブボタンの状態更新
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // コンテンツの表示切り替え
        tabContents.forEach(content => {
            content.classList.toggle('active', content.dataset.tab === tabName);
        });

        // コメントタブ選択時、常にデータを再読み込み（MojiQテキストの追加を反映するため）
        if (tabName === 'comments') {
            loadPdfComments();
        }

        // 検索をクリア
        clearSearch();
    }

    /**
     * 現在のアクティブタブを取得
     * @returns {string} タブ名
     */
    function getActiveTab() {
        const activeTab = panel ? panel.querySelector('.proofreading-tab.active') : null;
        return activeTab ? activeTab.dataset.tab : 'correctness';
    }

    /**
     * 注釈が読み込み済み確認済みリストに含まれるかチェック
     * @param {number} pageNum - ページ番号
     * @param {string} contents - コメント内容
     * @param {Object|null} canvasRect - キャンバス座標
     * @param {Array} checkedList - 確認済みリスト
     * @returns {boolean}
     */
    function isAnnotationChecked(pageNum, contents, canvasRect, checkedList) {
        for (const checked of checkedList) {
            if (checked.pdfPage !== pageNum) continue;
            // テキスト内容が一致
            if (contents === checked.contents) {
                return true;
            }
            // 座標で判定（テキストが編集されている可能性を考慮）
            if (checked.canvasRect && canvasRect) {
                const dx = Math.abs(canvasRect.x - checked.canvasRect.x);
                const dy = Math.abs(canvasRect.y - checked.canvasRect.y);
                if (dx < 30 && dy < 30) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * PDFからコメント/注釈を読み込んで表示
     */
    async function loadPdfComments() {
        // PDF読み込み済みかチェック
        if (!window.MojiQPdfManager) {
            renderCommentsEmpty('PDFが読み込まれていません');
            return;
        }

        const pdfDocs = window.MojiQPdfManager.getPdfDocs();
        const pageMapping = window.MojiQPdfManager.getPageMapping();

        if (!pdfDocs || pdfDocs.length === 0 || !pageMapping || pageMapping.length === 0) {
            renderCommentsEmpty('PDFが読み込まれていません');
            return;
        }

        // 横長原稿（見開き内容PDF）かどうかを判定
        // 見開きモードでは白紙ページが追加されるため、pageMappingから最初の非白紙ページを探す
        let isLandscapeSpread = false;
        for (let idx = 0; idx < pageMapping.length; idx++) {
            const mapItem = pageMapping[idx];
            // 白紙ページでないPDFページを探す
            if (mapItem && mapItem.docIndex >= 0 && !mapItem.isSpreadBlank) {
                // displayWidth/Heightまたはwidth/heightを確認
                const w = mapItem.originalWidth || mapItem.displayWidth || mapItem.width;
                const h = mapItem.originalHeight || mapItem.displayHeight || mapItem.height;
                if (w && h && w > h) {
                    isLandscapeSpread = true;
                }
                break; // 最初の非白紙ページで判定完了
            }
        }

        // アプリの見開きモード（SpreadViewMode）かどうかを判定
        let isSpreadViewMode = false;
        if (window.MojiQPdfManager.isSpreadViewMode) {
            isSpreadViewMode = window.MojiQPdfManager.isSpreadViewMode();
        }

        try {
            pdfCommentsData = [];
            // 注: 確認済み状態はファイル読み込み時のみリセット（resetAllProofreadingData()）
            // リアルタイム更新時は確認済み状態を維持

            // 確認済みコメント情報を取得（済スタンプ付きコメントは除外）
            let loadedCheckedComments = null;
            if (window.MojiQPdfManager && window.MojiQPdfManager.getLoadedCheckedComments) {
                loadedCheckedComments = window.MojiQPdfManager.getLoadedCheckedComments();
            }

            // BUG修正: UIブロック対策 - 一定間隔でUIに制御を返す
            const CHUNK_SIZE = 10; // 10ページごとにUIに制御を返す
            const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

            // 各ページを走査して注釈を取得
            for (let i = 0; i < pageMapping.length; i++) {
                // UIブロック対策: 一定間隔でUIに制御を返す
                if (i > 0 && i % CHUNK_SIZE === 0) {
                    await yieldToUI();
                }
                const mapItem = pageMapping[i];
                const appPageNum = i + 1; // アプリ上のページ番号（ジャンプ用）
                const actualPdfPageNum = mapItem.pageNum; // PDFドキュメント内の実際のページ番号

                // PDFページの場合のみ注釈を取得（画像ページや白紙ページはスキップ）
                if (mapItem.docIndex >= 0 && pdfDocs[mapItem.docIndex]) {
                    const pdf = pdfDocs[mapItem.docIndex];
                    try {
                        const page = await pdf.getPage(actualPdfPageNum);
                        const annotations = await page.getAnnotations();
                        const viewport = page.getViewport({ scale: 1 });
                        const pageWidth = viewport.width;

                        for (const annot of annotations) {
                            // コメント（contents）を持つ注釈のみ対象
                            // Popup注釈は親注釈と同じ内容を持つため除外
                            if (annot.contents && annot.contents.trim() && annot.subtype !== 'Popup') {
                                // 表示用ノンブルを計算
                                let displayNombre = actualPdfPageNum;

                                if (isLandscapeSpread && actualPdfPageNum >= 2) {
                                    // 横長原稿の場合: 2ページ目以降は見開き計算
                                    // PDFページ2 → ノンブル2-3、PDFページ3 → ノンブル4-5...
                                    const baseNombre = (actualPdfPageNum - 1) * 2;

                                    // 注釈の位置から左/右ページを判定（右綴じ: 右=偶数、左=奇数）
                                    // 注釈の中心X座標を使用（rectがある場合）
                                    let annotCenterX = null;
                                    if (annot.rect && annot.rect.length >= 4) {
                                        // rect = [x1, y1, x2, y2] (左下, 右上)
                                        annotCenterX = (annot.rect[0] + annot.rect[2]) / 2;
                                    } else if (annot.rect && annot.rect[0] !== undefined) {
                                        // 最低限x1がある場合はそれを使用
                                        annotCenterX = annot.rect[0];
                                    }

                                    if (annotCenterX !== null) {
                                        if (annotCenterX < pageWidth / 2) {
                                            // 左側 = 奇数ノンブル（大きい数）
                                            displayNombre = baseNombre + 1;
                                        } else {
                                            // 右側 = 偶数ノンブル（小さい数）
                                            displayNombre = baseNombre;
                                        }
                                    } else {
                                        // 位置不明の場合は範囲表示
                                        displayNombre = baseNombre + '-' + (baseNombre + 1);
                                    }
                                } else if (isSpreadViewMode && !isLandscapeSpread) {
                                    // アプリの見開きモード（横長原稿ではない場合）
                                    // 見開きモードでは白紙ページが追加されているため、アプリページ番号からノンブルを計算
                                    // 見開きインデックス = floor((appPageNum - 1) / 2)
                                    // 見開きインデックス0: ノンブル1（表紙）
                                    // 見開きインデックスN（N>=1）: 右側=ノンブル2N、左側=ノンブル2N+1
                                    const spreadIndex = Math.floor((appPageNum - 1) / 2);
                                    if (spreadIndex === 0) {
                                        displayNombre = 1;
                                    } else {
                                        // 奇数アプリページ → 右側（偶数ノンブル）
                                        // 偶数アプリページ → 左側（奇数ノンブル）
                                        if (appPageNum % 2 === 1) {
                                            // 右側 = 偶数ノンブル
                                            displayNombre = spreadIndex * 2;
                                        } else {
                                            // 左側 = 奇数ノンブル
                                            displayNombre = spreadIndex * 2 + 1;
                                        }
                                    }
                                }

                                // PDF座標をキャンバス座標に変換
                                // rectは[x1, y1, x2, y2]形式（左下, 右上）
                                let canvasRect = null;
                                if (annot.rect && annot.rect.length >= 4) {
                                    // 表示サイズを取得（pdf-annotation-loaderと同じ座標系を使用）
                                    const displaySize = window.MojiQPdfManager.getDisplayPageSize ?
                                        window.MojiQPdfManager.getDisplayPageSize(appPageNum) : null;
                                    const displayWidth = displaySize ? displaySize.width : viewport.width;
                                    const displayHeight = displaySize ? displaySize.height : viewport.height;
                                    const scaleX = displayWidth / viewport.width;
                                    const scaleY = displayHeight / viewport.height;

                                    const [x1, y1, x2, y2] = annot.rect;
                                    // 左上座標をキャンバス座標に変換（スケール適用）
                                    const canvasX = x1 * scaleX;
                                    const canvasY = (viewport.height - y2) * scaleY; // Y軸反転
                                    canvasRect = { x: canvasX, y: canvasY };
                                }

                                // 確認済みコメントに該当する場合はスキップ（済スタンプ付きのため）
                                if (loadedCheckedComments && isAnnotationChecked(appPageNum, annot.contents, canvasRect, loadedCheckedComments)) {
                                    continue;
                                }

                                pdfCommentsData.push({
                                    page: displayNombre,
                                    pdfPage: appPageNum, // アプリ上のページ番号（ジャンプ用）
                                    type: annot.subtype,
                                    contents: annot.contents,
                                    color: annot.color,
                                    rect: annot.rect,
                                    canvasRect: canvasRect, // 変換済みキャンバス座標
                                    viewportHeight: viewport.height,
                                    viewportWidth: viewport.width
                                });
                            }
                        }
                    } catch (pageError) {
                        console.warn(`ページ${actualPdfPageNum}の注釈取得に失敗:`, pageError);
                    }
                }
            }

            // MojiQで入力したテキストオブジェクトも収集
            if (window.MojiQDrawingObjects && window.MojiQDrawingObjects.getPageObjects) {
                const totalPages = window.MojiQPdfManager.getPageCount ? window.MojiQPdfManager.getPageCount() : pageMapping.length;
                for (let appPageNum = 1; appPageNum <= totalPages; appPageNum++) {
                    const pageObjects = window.MojiQDrawingObjects.getPageObjects(appPageNum);
                    if (!pageObjects || pageObjects.length === 0) continue;

                    // pageMappingからmapItemを取得（存在する場合のみ）
                    const mapItem = (appPageNum > 0 && appPageNum <= pageMapping.length) ? pageMapping[appPageNum - 1] : null;

                    for (const obj of pageObjects) {
                        // MojiQで入力したテキスト、または図形+テキスト（annotation付き）を収集
                        let textContent = null;
                        let textPos = null;
                        let objType = null;

                        // テキストオブジェクト（PDF注釈由来でないもの）
                        if (obj.type === 'text' && !obj._pdfAnnotationSource && obj.text && obj.text.trim()) {
                            textContent = obj.text;
                            textPos = obj.startPos;
                            objType = 'MojiQ';
                        }
                        // 枠線、楕円、直線 + テキスト（annotation付き）
                        else if ((obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'line') &&
                                 obj.annotation && obj.annotation.text && obj.annotation.text.trim()) {
                            textContent = obj.annotation.text;
                            // テキストの位置を使用（annotation.x, annotation.y）
                            if (typeof obj.annotation.x === 'number' && typeof obj.annotation.y === 'number') {
                                textPos = { x: obj.annotation.x, y: obj.annotation.y };
                            }
                            objType = obj.type; // 'rect', 'ellipse', 'line'
                        }

                        if (textContent && objType) {
                            // 表示用ノンブルを計算
                            let displayNombre = appPageNum;

                            if (isLandscapeSpread && mapItem && mapItem.pageNum >= 2) {
                                // 横長原稿の場合: テキストのX座標で左右ページを判定
                                const actualPdfPageNum = mapItem.pageNum;
                                const baseNombre = (actualPdfPageNum - 1) * 2;

                                // テキストの中心X座標を取得
                                let textCenterX = null;
                                if (textPos) {
                                    textCenterX = textPos.x;
                                }

                                // 表示サイズを取得
                                const displaySize = window.MojiQPdfManager.getDisplayPageSize ?
                                    window.MojiQPdfManager.getDisplayPageSize(appPageNum) : null;
                                const pageWidth = displaySize ? displaySize.width : 800;

                                if (textCenterX !== null) {
                                    if (textCenterX < pageWidth / 2) {
                                        // 左側 = 奇数ノンブル
                                        displayNombre = baseNombre + 1;
                                    } else {
                                        // 右側 = 偶数ノンブル
                                        displayNombre = baseNombre;
                                    }
                                } else {
                                    displayNombre = baseNombre + '-' + (baseNombre + 1);
                                }
                            } else if (isSpreadViewMode && !isLandscapeSpread) {
                                // アプリの見開きモード
                                const spreadIndex = Math.floor((appPageNum - 1) / 2);
                                if (spreadIndex === 0) {
                                    displayNombre = 1;
                                } else {
                                    if (appPageNum % 2 === 1) {
                                        displayNombre = spreadIndex * 2;
                                    } else {
                                        displayNombre = spreadIndex * 2 + 1;
                                    }
                                }
                            }

                            pdfCommentsData.push({
                                page: displayNombre,
                                pdfPage: appPageNum,
                                type: objType,
                                contents: textContent,
                                color: obj.color,
                                canvasRect: textPos ? { x: textPos.x, y: textPos.y } : null,
                                _isMojiQText: true
                            });
                        }
                    }
                }
            }

            // PDFメタデータからMojiQテキスト情報を取得（保存済みPDFの再読み込み用）
            await loadMojiQTextFromMetadata(pdfDocs, pageMapping, isLandscapeSpread, isSpreadViewMode);

            renderComments(pdfCommentsData);
        } catch (e) {
            console.error('PDF注釈の読み込みに失敗:', e);
            renderCommentsEmpty('PDF注釈の読み込みに失敗しました');
        }
    }

    /**
     * PDFメタデータからMojiQテキスト情報を取得
     * @param {Array} pdfDocs - PDFドキュメント配列
     * @param {Array} pageMapping - ページマッピング
     * @param {boolean} isLandscapeSpread - 横長原稿かどうか
     * @param {boolean} isSpreadViewMode - 見開きモードかどうか
     */
    async function loadMojiQTextFromMetadata(pdfDocs, pageMapping, isLandscapeSpread, isSpreadViewMode) {
        if (!pdfDocs || pdfDocs.length === 0) return;

        try {
            // pdf-libで復元済みのMojiQテキスト情報を取得
            const textData = window.MojiQPdfManager && window.MojiQPdfManager.getLoadedMojiQTexts
                ? window.MojiQPdfManager.getLoadedMojiQTexts()
                : null;

            if (!textData || !Array.isArray(textData) || textData.length === 0) return;

            // 既存のMojiQテキスト（メモリ上のもの）のテキスト内容を収集
            const existingTexts = new Set();
            for (const comment of pdfCommentsData) {
                if (comment._isMojiQText && comment.contents) {
                    existingTexts.add(comment.contents);
                }
            }

            // メタデータから取得したテキストをコメントデータに追加
            for (const item of textData) {
                // 既にメモリ上に同じテキストがある場合はスキップ
                if (existingTexts.has(item.contents)) continue;

                const pageNum = item.pdfPage;
                let displayNombre = pageNum;

                // ノンブル計算（簡易版）
                if (isLandscapeSpread && pageNum >= 2) {
                    const baseNombre = (pageNum - 1) * 2;
                    const pageWidth = item.displayWidth || 800;
                    const itemX = item.canvasRect ? item.canvasRect.x : 0;
                    if (itemX < pageWidth / 2) {
                        displayNombre = baseNombre + 1;
                    } else {
                        displayNombre = baseNombre;
                    }
                } else if (isSpreadViewMode && !isLandscapeSpread) {
                    const spreadIndex = Math.floor((pageNum - 1) / 2);
                    if (spreadIndex === 0) {
                        displayNombre = 1;
                    } else {
                        if (pageNum % 2 === 1) {
                            displayNombre = spreadIndex * 2;
                        } else {
                            displayNombre = spreadIndex * 2 + 1;
                        }
                    }
                }

                pdfCommentsData.push({
                    page: displayNombre,
                    pdfPage: pageNum,
                    type: 'MojiQ',
                    contents: item.contents,
                    canvasRect: item.canvasRect,
                    savedDisplayWidth: item.displayWidth,  // 保存時の表示幅
                    savedDisplayHeight: item.displayHeight, // 保存時の表示高
                    _isMojiQText: true,
                    _fromMetadata: true // メタデータ由来であることを示す
                });
            }
        } catch (e) {
            console.warn('MojiQテキストメタデータの読み込みに失敗:', e);
        }
    }

    /**
     * コメントをレンダリング
     * @param {Array} comments - コメントデータ配列
     */
    function renderComments(comments) {
        if (!commentsContent) return;

        // カウント更新
        if (commentsCount) {
            commentsCount.textContent = `(${comments.length})`;
        }

        if (comments.length === 0) {
            renderCommentsEmpty('PDFコメントがありません');
            return;
        }

        let html = '';

        comments.forEach((comment, index) => {
            const typeLabel = getCommentTypeLabel(comment.type);
            const typeClass = 'type-' + comment.type.toLowerCase();
            // ジャンプ用のページ番号（pdfPageがあればそれを使用、なければpage）
            const jumpPage = comment.pdfPage || comment.page;
            // 確認済み状態
            const isChecked = checkedComments.has(index);
            const checkedClass = isChecked ? ' checked' : '';
            const checkedAttr = isChecked ? ' checked' : '';

            html += `<div class="proofreading-comment-item${checkedClass}" data-index="${index}" data-page="${jumpPage}">`;
            // チェックボックス
            html += `<label class="proofreading-comment-checkbox" onclick="event.stopPropagation()">`;
            html += `<input type="checkbox"${checkedAttr} onchange="ProofreadingPanel.toggleCommentChecked(this, ${index})">`;
            html += `<span class="proofreading-comment-checkbox-icon"></span>`;
            html += `</label>`;
            // コメント本体
            html += `<div class="proofreading-comment-body">`;
            html += `<div class="proofreading-comment-header">`;
            html += `<span class="proofreading-comment-page" onclick="ProofreadingPanel.jumpToCommentPage('${jumpPage}')">${comment.page}P</span>`;
            html += `<span class="proofreading-comment-type ${typeClass}">${escapeHtml(typeLabel)}</span>`;
            html += `</div>`;
            html += `<div class="proofreading-comment-content">${escapeHtml(comment.contents)}</div>`;
            html += `</div>`;
            html += `</div>`;
        });

        commentsContent.innerHTML = html;
    }

    /**
     * 空のコメントコンテンツをレンダリング
     * @param {string} message - 表示メッセージ
     */
    function renderCommentsEmpty(message) {
        if (commentsContent) {
            commentsContent.innerHTML = `<div class="proofreading-check-empty">${escapeHtml(message)}</div>`;
        }
        if (commentsCount) {
            commentsCount.textContent = '(0)';
        }
    }

    /**
     * 注釈タイプのラベルを取得
     * @param {string} type - 注釈タイプ
     * @returns {string} 日本語ラベル
     */
    function getCommentTypeLabel(type) {
        const labels = {
            'Text': 'コメント',
            'FreeText': 'フリーテキスト',
            'Highlight': 'ハイライト',
            'Underline': '下線',
            'StrikeOut': '取り消し線',
            'Ink': '手書き',
            'Square': '四角形',
            'Circle': '円形',
            'Line': '線',
            'Polygon': '多角形',
            'PolyLine': '折れ線',
            'Stamp': 'スタンプ',
            'Caret': 'キャレット',
            'FileAttachment': '添付ファイル',
            'MojiQ': '入力テキスト',
            'rect': '入力テキスト',
            'ellipse': '入力テキスト',
            'line': '入力テキスト'
        };
        return labels[type] || type;
    }

    /**
     * パネルの折りたたみをトグル
     */
    function toggleCollapse() {
        if (!panel) return;

        // 右サイドバーを折りたたむ（既存のサイドバー折りたたみ機能を使用）
        const rightSidebar = document.getElementById('rightSidebar');
        if (rightSidebar) {
            isCollapsed = !isCollapsed;
            rightSidebar.classList.toggle('collapsed', isCollapsed);

            // bodyにもクラスを追加（CSSでキャンバスエリア拡大用）
            document.body.classList.toggle('proofreading-sidebar-collapsed', isCollapsed);

            // トグルボタンのテキストとタイトルを更新
            if (panelToggle) {
                panelToggle.textContent = isCollapsed ? '»' : '«';
                panelToggle.title = isCollapsed ? 'パネルを展開' : 'パネルを折りたたむ';
            }
        }
    }

    /**
     * ページバーの表示/非表示をトグル
     * MojiQNavigationの関数を使用して状態を統一管理
     */
    function togglePageBar() {
        const pageBar = document.querySelector('.bottom-nav-bar');
        if (!pageBar || !window.MojiQNavigation) return;

        const isCurrentlyHidden = pageBar.classList.contains('user-hidden');

        if (isCurrentlyHidden) {
            // 表示する
            MojiQNavigation.userShowNavBar();
            updatePageBarButtonStateInternal(false);
        } else {
            // 非表示にする
            MojiQNavigation.userHideNavBar();
            updatePageBarButtonStateInternal(true);
        }
    }

    /**
     * ページバーボタンの状態を更新（内部用）
     * CSSクラスでアイコン切り替えを行う
     */
    function updatePageBarButtonStateInternal(isHidden) {
        const btn = document.getElementById('proofTogglePageBarBtn');
        if (!btn) return;

        // activeクラスでアイコン切り替え（CSSで制御）
        btn.classList.toggle('active', isHidden);
        btn.title = isHidden ? 'ページバーを表示' : 'ページバーを隠す';
    }

    /**
     * ページバーボタンの状態を同期（モード切替時用）
     */
    function updatePageBarButtonState() {
        const pageBar = document.querySelector('.bottom-nav-bar');
        // user-hiddenクラスで非表示状態を判定（両モード共通）
        const isHidden = pageBar ? pageBar.classList.contains('user-hidden') : false;
        updatePageBarButtonStateInternal(isHidden);
    }

    /**
     * コメントテキストレイヤーの表示/非表示をトグル
     * 非表示時: 赤色 + 斜線表示（指示入れモードと同様）
     */
    function toggleTextLayer() {
        // MojiQTextLayerManagerを使用してトグル
        if (window.MojiQTextLayerManager) {
            MojiQTextLayerManager.toggle();
        }

        // ボタン状態を更新
        updateTextLayerButtonState();
    }

    /**
     * テキストレイヤーボタンの状態を更新
     * CSSクラスで斜線切り替えを行う
     */
    function updateTextLayerButtonState() {
        const btn = document.getElementById('proofToggleTextLayerBtn');
        if (!btn) return;

        const isHidden = window.MojiQTextLayerManager ? MojiQTextLayerManager.isHidden() : false;

        // activeクラスで斜線切り替え（CSSで制御）
        btn.classList.toggle('active', isHidden);
        btn.title = isHidden ? 'コメントテキスト表示 (Ctrl+T)' : 'コメントテキスト非表示 (Ctrl+T)';
    }

    /**
     * アイテムを選択してスタンプモードに移行
     * @param {HTMLElement} rowElement - クリックされたtr要素
     */
    function selectItem(rowElement) {
        const content = rowElement.getAttribute('data-content');
        if (!content) return;

        // 既存の選択表示をクリア
        clearItemSelection();

        // 選択状態を視覚的に表示
        rowElement.classList.add('selected');

        // 正誤/提案に応じて色を設定
        // correctnessContent内なら赤、proposalContent内なら青
        if (correctnessContent && correctnessContent.contains(rowElement)) {
            setColor('#ff0000'); // 赤
        } else if (proposalContent && proposalContent.contains(rowElement)) {
            setColor('#0000ff'); // 青
        }

        // textモードに切り替え（文字サイズツールと同様）
        if (window.MojiQModeController) {
            MojiQModeController.setMode('text');
        }

        // activeStampTextを設定
        if (window.setProofreadingStampText) {
            window.setProofreadingStampText(content);
        }
    }

    /**
     * アイテム選択をクリア
     */
    function clearItemSelection() {
        const selected = document.querySelectorAll('.proofreading-item.selected');
        selected.forEach(el => el.classList.remove('selected'));

        // activeStampTextもクリア
        if (window.clearProofreadingStampText) {
            window.clearProofreadingStampText();
        }
    }

    // DOMContentLoadedで初期化
    document.addEventListener('DOMContentLoaded', init);

    // 公開API
    const api = {
        show,
        hide,
        toggleSection,
        toggleCategory,
        switchTab,
        getActiveTab,
        loadPdfComments,
        renderComments,
        toggleCategoryChecked,
        resetCheckedCategories,
        toggleCommentChecked,
        toggleItemChecked,
        resetCheckedComments,
        getCheckedCommentSignatures,
        jumpToPage,
        jumpToCommentPage,
        copyContent,
        renderCheckData,
        isValidProofreadingJson,
        onEyedropperColorPicked,
        toggleCollapse,
        togglePageBar,
        toggleTextLayer,
        updateTextLayerButtonState,
        updatePageBarButtonState,
        selectItem,
        clearItemSelection,
        clearSearch,
        performSearch,
        syncCustomColorFromMain,
        syncCustomColorToMain
    };

    // MojiQ名前空間 + windowオブジェクトに登録（script.jsからのアクセス用）
    window.MojiQProofreadingPanel = api;
    window.ProofreadingPanel = api; // 後方互換性

    return api;
})();
