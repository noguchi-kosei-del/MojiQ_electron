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

    // DOM要素キャッシュ
    let panel, panelToggle, colorSwatches, customColorSwatch, eyedropperBtn, colorPicker, rainbowPicker;
    let lineWidthInput, lineWidthSlider;
    let correctnessContent, proposalContent, correctnessCount, proposalCount;
    let commentsContent, commentsCount;
    let tabButtons, tabContents;
    let searchInput, searchClearBtn, searchCountEl;
    let proofDoneStampBtn, proofRubyStampBtn;

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
        panel = document.getElementById('proofreadingPanel');
        if (!panel) return;

        // 折りたたみトグル
        panelToggle = document.getElementById('proofreadingPanelToggle');

        // カラー関連
        colorSwatches = panel.querySelectorAll('.proofreading-color');
        customColorSwatch = document.getElementById('proofCustomColorSwatch');
        eyedropperBtn = document.getElementById('proofEyedropperBtn');
        colorPicker = document.getElementById('proofColorPicker');
        rainbowPicker = document.getElementById('proofRainbowPicker');

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

        setupEventListeners();
    }

    /**
     * イベントリスナーの設定
     */
    function setupEventListeners() {
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
                const color = swatch.dataset.color;
                if (color) {
                    setColor(color);
                    updateActiveColorSwatch(swatch);
                } else if (swatch === customColorSwatch) {
                    // カスタムカラーパレットをクリック: 色が設定されている場合はその色を選択
                    // カラーピッカーは開かない（レインボーピッカーで色を選択する）
                    const customColor = customColorSwatch.style.backgroundColor;
                    if (customColor && customColor !== 'transparent') {
                        // RGB形式をHEX形式に変換
                        const hexColor = rgbToHex(customColor);
                        if (hexColor) {
                            setColor(hexColor);
                            updateActiveColorSwatch(customColorSwatch);
                        }
                    }
                }
            });
        });

        // カラーピッカー変更
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                const color = e.target.value;
                setColor(color);
                customColorSwatch.style.backgroundColor = color;
                customColorSwatch.style.border = '2px solid #ddd';
                updateActiveColorSwatch(customColorSwatch);
            });
        }

        // レインボーピッカー
        if (rainbowPicker) {
            rainbowPicker.addEventListener('click', (e) => {
                const rect = rainbowPicker.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const ratio = x / rect.width;

                // レインボーグラデーションから色を計算
                const color = getColorFromRainbow(ratio);
                setColor(color);
                customColorSwatch.style.backgroundColor = color;
                customColorSwatch.style.border = '2px solid #ddd';
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
        }

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
            if (mode !== 'doneStamp' && mode !== 'rubyStamp') {
                resetStampButtons();
            } else if (mode === 'doneStamp') {
                updateActiveStampButton(proofDoneStampBtn);
            } else if (mode === 'rubyStamp') {
                updateActiveStampButton(proofRubyStampBtn);
            }
        });
    }

    /**
     * レインボーグラデーションから色を取得
     */
    function getColorFromRainbow(ratio) {
        // 12段階のグラデーション
        const colors = [
            [255, 0, 0],     // 赤
            [255, 128, 0],   // オレンジ
            [255, 255, 0],   // 黄
            [128, 255, 0],   // 黄緑
            [0, 255, 0],     // 緑
            [0, 255, 128],   // 青緑
            [0, 255, 255],   // シアン
            [0, 128, 255],   // 水色
            [0, 0, 255],     // 青
            [128, 0, 255],   // 紫
            [255, 0, 255],   // マゼンタ
            [255, 0, 128],   // ピンク
            [255, 0, 0]      // 赤（ループ）
        ];

        const index = ratio * (colors.length - 1);
        const i = Math.floor(index);
        const t = index - i;

        const c1 = colors[Math.min(i, colors.length - 1)];
        const c2 = colors[Math.min(i + 1, colors.length - 1)];

        const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
        const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
        const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);

        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
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

        // 既存のカラーピッカーUIも同期
        const mainColorPicker = document.getElementById('colorPicker');
        if (mainColorPicker) {
            mainColorPicker.value = color;
        }

        // パレットの選択状態も同期
        const mainPalette = document.getElementById('colorPalette');
        if (mainPalette) {
            mainPalette.querySelectorAll('.color-swatch').forEach(s => {
                s.classList.toggle('active', s.dataset.color === color);
            });
        }

        // 選択中のオブジェクトがあればその色を変更（指示入れモードと挙動を共通化）
        const currentMode = window.MojiQStore && window.MojiQStore.get('drawing.currentMode');
        if (currentMode === 'select' && window.MojiQDrawingSelect && window.MojiQDrawingSelect.hasSelection()) {
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

        // カスタムカラースウォッチが選択されていない場合は点線に戻す
        if (customColorSwatch && activeSwatch !== customColorSwatch) {
            customColorSwatch.style.backgroundColor = 'transparent';
            customColorSwatch.style.border = '2px dashed #ccc';
        }

        // スポイトの選択状態をリセット
        if (eyedropperBtn) {
            eyedropperBtn.classList.remove('active');
        }

        // スタンプボタンの選択状態をリセット
        if (proofDoneStampBtn) proofDoneStampBtn.classList.remove('active');
        if (proofRubyStampBtn) proofRubyStampBtn.classList.remove('active');
    }

    /**
     * アクティブなスタンプボタンを更新
     * @param {HTMLElement} activeBtn - アクティブにするボタン
     */
    function updateActiveStampButton(activeBtn) {
        // 両方のスタンプボタンからactiveクラスを削除
        if (proofDoneStampBtn) proofDoneStampBtn.classList.remove('active');
        if (proofRubyStampBtn) proofRubyStampBtn.classList.remove('active');

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
     * チェックデータをレンダリング
     */
    function renderCheckData(data) {
        if (!data || !data.checks) {
            renderEmpty();
            return;
        }

        // 新しいデータ読み込み時は確認済み状態のみリセット（コメントは維持）
        checkedItems.clear();
        // コメントの確認済み状態もリセット
        resetCheckedComments();

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
                html += '<tr class="proofreading-item' + itemCheckedClass + '" data-item-key="' + escapeAttr(itemKey) + '" data-content="' + escapeAttr(item.content || '') + '" onclick="ProofreadingPanel.selectItem(this)">';
                html += '<td class="cal-checkbox" onclick="event.stopPropagation()">';
                html += '<label class="proofreading-item-checkbox">';
                html += '<input type="checkbox" ' + (isItemChecked ? 'checked' : '') + ' onchange="ProofreadingPanel.toggleItemChecked(this, \'' + escapeAttr(itemKey) + '\')">';
                html += '<span class="proofreading-item-checkbox-icon"></span>';
                html += '</label>';
                html += '</td>';
                html += '<td class="cal-page" onclick="event.stopPropagation(); ProofreadingPanel.jumpToPage(\'' + escapeAttr(item.page) + '\')">' + formatPage(item.page) + '</td>';
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
            // 済スタンプを追加
            addDoneStampForComment(commentIndex);
        } else {
            checkedComments.delete(commentIndex);
            commentItem.classList.remove('checked');
            // 済スタンプを削除
            removeDoneStampForComment(commentIndex);
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

        // タブの済状態を更新
        updateTabDoneStatus();
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

        // 既存のテキストオブジェクト（PDF注釈から読み込まれたもの）を検索
        let canvasX, canvasY;
        if (window.MojiQDrawingObjects && window.MojiQDrawingObjects.getPageObjects) {
            const pageObjects = window.MojiQDrawingObjects.getPageObjects(pdfPage);
            if (pageObjects) {
                // コメント内容と一致するテキストオブジェクトを検索
                const textObj = pageObjects.find(obj =>
                    obj.type === 'text' &&
                    obj.text === contents &&
                    obj._pdfAnnotationSource // PDF注釈から読み込まれたもの
                );
                if (textObj && textObj.startPos) {
                    canvasX = textObj.startPos.x;
                    canvasY = textObj.startPos.y;
                }
            }
        }

        // テキストオブジェクトが見つからない場合はrectから計算（フォールバック）
        if (canvasX === undefined && comment.rect) {
            const rect = comment.rect;
            const viewportHeight = comment.viewportHeight || 792;
            canvasX = rect[0];
            canvasY = viewportHeight - rect[3];
        }

        if (canvasX === undefined) {
            console.warn('コメントの座標を取得できませんでした:', comment);
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
                renderCheckData(data);
            }
        }

        // 指示入れモードの線の太さを引き継ぐ
        syncLineWidthFromMainUI();

        // ボタン状態を同期（モード切替時の状態引き継ぎ）
        updateTextLayerButtonState();
        updatePageBarButtonState();

        // DOM更新後も再度更新（確実に反映させる）
        setTimeout(() => {
            syncLineWidthFromMainUI();
            updateTextLayerButtonState();
            updatePageBarButtonState();
        }, 50);

        // さらにrequestAnimationFrameでレンダリング後にも更新
        requestAnimationFrame(() => {
            syncLineWidthFromMainUI();
            requestAnimationFrame(() => {
                syncLineWidthFromMainUI();
            });
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

        // コメントタブ選択時、まだデータがなければPDF注釈を読み込み
        if (tabName === 'comments' && pdfCommentsData.length === 0) {
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
        let isLandscapeSpread = false;
        if (window.MojiQPdfManager.getOriginalPageSize) {
            const pageSize = window.MojiQPdfManager.getOriginalPageSize(1);
            if (pageSize && pageSize.width > pageSize.height) {
                isLandscapeSpread = true;
            }
        }

        try {
            pdfCommentsData = [];
            resetCheckedComments(); // 確認済み状態をリセット

            // 各ページを走査して注釈を取得
            for (let i = 0; i < pageMapping.length; i++) {
                const mapItem = pageMapping[i];
                const pdfPageNum = i + 1; // PDFの物理ページ番号

                // PDFページの場合のみ注釈を取得（画像ページや白紙ページはスキップ）
                if (mapItem.docIndex >= 0 && pdfDocs[mapItem.docIndex]) {
                    const pdf = pdfDocs[mapItem.docIndex];
                    try {
                        const page = await pdf.getPage(mapItem.pageNum);
                        const annotations = await page.getAnnotations();
                        const viewport = page.getViewport({ scale: 1 });
                        const pageWidth = viewport.width;

                        for (const annot of annotations) {
                            // コメント（contents）を持つ注釈のみ対象
                            // Popup注釈は親注釈と同じ内容を持つため除外
                            if (annot.contents && annot.contents.trim() && annot.subtype !== 'Popup') {
                                // 表示用ノンブルを計算
                                let displayNombre = pdfPageNum;

                                if (isLandscapeSpread && pdfPageNum >= 2) {
                                    // 横長原稿の場合: 2ページ目以降は見開き計算
                                    // PDFページ2 → ノンブル2-3、PDFページ3 → ノンブル4-5...
                                    const baseNombre = (pdfPageNum - 1) * 2;

                                    // 注釈の位置から左/右ページを判定（右綴じ: 右=偶数、左=奇数）
                                    if (annot.rect && annot.rect[0] !== undefined) {
                                        const annotX = annot.rect[0];
                                        if (annotX < pageWidth / 2) {
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
                                }

                                // PDF座標をキャンバス座標に変換
                                // rectは[x1, y1, x2, y2]形式（左下, 右上）
                                let canvasRect = null;
                                if (annot.rect && annot.rect.length >= 4) {
                                    // viewportのtransformを使って座標変換
                                    // transform: [scaleX, 0, 0, -scaleY, 0, height]
                                    const [x1, y1, x2, y2] = annot.rect;
                                    // 左上座標をキャンバス座標に変換
                                    const canvasX = x1;
                                    const canvasY = viewport.height - y2; // Y軸反転
                                    canvasRect = { x: canvasX, y: canvasY };
                                }

                                pdfCommentsData.push({
                                    page: displayNombre,
                                    pdfPage: pdfPageNum, // 実際のPDFページ（ジャンプ用）
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
                        console.warn(`ページ${pdfPageNum}の注釈取得に失敗:`, pageError);
                    }
                }
            }

            renderComments(pdfCommentsData);
        } catch (e) {
            console.error('PDF注釈の読み込みに失敗:', e);
            renderCommentsEmpty('PDF注釈の読み込みに失敗しました');
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
            html += `<span class="proofreading-comment-done">済</span>`;
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
            'Text': 'テキスト',
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
            'FileAttachment': '添付ファイル'
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
        jumpToPage,
        jumpToCommentPage,
        copyContent,
        renderCheckData,
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

    // windowオブジェクトに登録（script.jsからのアクセス用）
    window.ProofreadingPanel = api;

    return api;
})();
