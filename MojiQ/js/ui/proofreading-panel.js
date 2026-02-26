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

    // 現在の状態
    let currentColor = '#ff0000';
    let isCollapsed = false;

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

        // カラースウォッチのクリック
        colorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                const color = swatch.dataset.color;
                if (color) {
                    setColor(color);
                    updateActiveColorSwatch(swatch);
                } else if (swatch === customColorSwatch) {
                    // カスタムカラーピッカーを開く
                    colorPicker.click();
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
                if (window.ModeController && window.ModeController.changeMode) {
                    window.ModeController.changeMode('eyedropper');
                    eyedropperBtn.classList.add('active');
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
        }
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
     * チェックデータをレンダリング
     */
    function renderCheckData(data) {
        if (!data || !data.checks) {
            renderEmpty();
            return;
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
    }

    /**
     * 空のコンテンツをレンダリング
     */
    function renderEmpty() {
        if (correctnessContent) {
            correctnessContent.innerHTML = '<div class="proofreading-check-empty">データがありません</div>';
        }
        if (proposalContent) {
            proposalContent.innerHTML = '<div class="proofreading-check-empty">データがありません</div>';
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
            return '<div class="proofreading-check-empty">データがありません</div>';
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

            html += '<div class="proofreading-category ' + colorClass + '">';
            html += '<div class="proofreading-category-header" onclick="ProofreadingPanel.toggleCategory(this)">';
            html += '<span class="proofreading-category-toggle">▼</span>';
            html += '<span class="proofreading-category-name">' + escapeHtml(category) + '</span>';
            html += '<span class="proofreading-category-count">(' + catItems.length + ')</span>';
            html += '</div>';
            html += '<div class="proofreading-category-body">';
            html += '<table class="proofreading-table"><tbody>';

            catItems.forEach(item => {
                html += '<tr>';
                html += '<td class="cal-page" onclick="ProofreadingPanel.jumpToPage(\'' + escapeAttr(item.page) + '\')">' + formatPage(item.page) + '</td>';
                html += '<td class="cal-excerpt">' + escapeHtml(item.excerpt || '') + '</td>';
                html += '<td class="cal-content">' + escapeHtml(item.content || '') + '</td>';
                html += '<td class="cal-copy">';
                html += '<button class="cal-copy-btn" data-content="' + escapeAttr(item.content || '') + '" onclick="ProofreadingPanel.copyContent(this)" title="コピー">';
                html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                html += '</button>';
                html += '</td>';
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

        const pageNum = parseInt(pageMatch[1], 10);
        if (isNaN(pageNum) || pageNum < 1) return;

        // ページ移動（goToPageは1-indexedを期待）
        if (window.goToPage) {
            window.goToPage(pageNum);
        } else if (window.MojiQStore) {
            // フォールバック：Storeを通じて移動
            const totalPages = window.MojiQStore.get('page.totalPages');
            if (pageNum <= totalPages) {
                window.MojiQStore.set('page.currentPageNum', pageNum - 1);
            }
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

        // ボタン状態を同期（モード切替時の状態引き継ぎ）
        updateTextLayerButtonState();
        updatePageBarButtonState();

        // DOM更新後も再度更新（確実に反映させる）
        setTimeout(() => {
            updateTextLayerButtonState();
            updatePageBarButtonState();
        }, 50);
    }

    /**
     * パネルを非表示
     */
    function hide() {
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
     * チェックセクション（正誤/提案）の折りたたみをトグル
     * @param {string} sectionType - 'correctness' または 'proposal'
     */
    function toggleCheckSection(sectionType) {
        const sectionId = sectionType === 'correctness' ? 'correctnessSection' : 'proposalSection';
        const section = document.getElementById(sectionId);
        if (section) {
            section.classList.toggle('collapsed');
        }
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
     */
    function togglePageBar() {
        const pageBar = document.querySelector('.bottom-nav-bar');
        const btn = document.getElementById('proofTogglePageBarBtn');

        if (pageBar) {
            const isHidden = pageBar.classList.toggle('hidden');
            updatePageBarButtonStateInternal(isHidden);
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
        // hidden（校正モード用）または user-hidden（指示入れモード用）どちらかがあれば非表示状態
        const isHidden = pageBar ? (pageBar.classList.contains('hidden') || pageBar.classList.contains('user-hidden')) : false;
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
        btn.title = isHidden ? 'コメントテキスト表示' : 'コメントテキスト非表示';
    }

    // DOMContentLoadedで初期化
    document.addEventListener('DOMContentLoaded', init);

    // 公開API
    const api = {
        show,
        hide,
        toggleSection,
        toggleCategory,
        toggleCheckSection,
        jumpToPage,
        copyContent,
        renderCheckData,
        onEyedropperColorPicked,
        toggleCollapse,
        togglePageBar,
        toggleTextLayer,
        updateTextLayerButtonState,
        updatePageBarButtonState
    };

    // windowオブジェクトに登録（script.jsからのアクセス用）
    window.ProofreadingPanel = api;

    return api;
})();
