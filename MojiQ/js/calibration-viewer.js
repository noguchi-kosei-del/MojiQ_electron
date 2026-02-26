/**
 * calibration-viewer.js - 校正チェックビューワー
 * 別ウィンドウでJSONデータをテーブル表示する
 */

(function() {
    'use strict';

    // 状態
    let currentData = null;
    let allItems = []; // 全アイテムを統合して保持
    let currentTab = 'both'; // 'correctness' | 'proposal' | 'both'

    // DOM要素
    let titleEl, tabsEl, contentEl;

    /**
     * 初期化
     */
    async function init() {
        titleEl = document.getElementById('viewerTitle');
        tabsEl = document.getElementById('viewerTabs');
        contentEl = document.getElementById('viewerContent');

        // ダークモード設定を確認
        applyDarkMode();

        // データ取得を試みる（複数の方法でフォールバック）
        var data = null;

        // 方法1: クエリパラメータからファイルパスを取得してelectronAPIで読み込む
        var urlParams = new URLSearchParams(window.location.search);
        var filePath = urlParams.get('file');
        if (filePath && window.electronAPI && window.electronAPI.readCalibrationFile) {
            try {
                var result = await window.electronAPI.readCalibrationFile(decodeURIComponent(filePath));
                if (result.success) {
                    // タイトル生成
                    var fileName = filePath.replace(/\\/g, '/').split('/').pop().replace('.json', '');
                    var workName = result.data.work || '';
                    var title = workName ? workName + ' ' + fileName : fileName;
                    data = {
                        title: title,
                        checks: result.data.checks
                    };
                }
            } catch (e) {
                console.error('ファイル読み込みエラー:', e);
            }
        }

        // 方法2: グローバル変数から取得（親ウィンドウから設定される - 非Electron環境用）
        if (!data && window.__calibrationData) {
            data = window.__calibrationData;
        }
        // 方法3: openerから取得
        if (!data && window.opener && window.opener.__calibrationData) {
            data = window.opener.__calibrationData;
        }
        // 方法4: sessionStorageからフォールバック（非Electron環境用）
        if (!data) {
            var dataStr = sessionStorage.getItem('calibrationData');
            if (dataStr) {
                try {
                    data = JSON.parse(dataStr);
                    sessionStorage.removeItem('calibrationData');
                } catch (e) {
                    // パースエラーは無視
                }
            }
        }

        if (!data) {
            showError('データがありません');
            return;
        }

        currentData = data;

        // 全アイテムを統合（variation と simple の両方から）
        allItems = [];
        if (currentData.checks) {
            if (currentData.checks.variation && currentData.checks.variation.items) {
                allItems = allItems.concat(currentData.checks.variation.items);
            }
            if (currentData.checks.simple && currentData.checks.simple.items) {
                allItems = allItems.concat(currentData.checks.simple.items);
            }
        }

        // タイトル設定
        if (titleEl && currentData.title) {
            titleEl.textContent = currentData.title;
            document.title = currentData.title + ' - 校正チェック';
        }

        // タブとテーブルをレンダリング
        renderTabs();
        renderTable();
    }

    /**
     * ダークモードを適用
     */
    function applyDarkMode() {
        try {
            const darkMode = localStorage.getItem('mojiqDarkMode');
            if (darkMode === 'true') {
                document.body.classList.add('dark-mode');
            }
        } catch (e) {
            // localStorageにアクセスできない場合は無視
        }
    }

    /**
     * エラー表示
     */
    function showError(message) {
        if (contentEl) {
            contentEl.innerHTML = '<div class="calibration-empty">' + escapeHtml(message) + '</div>';
        }
    }

    /**
     * タブをレンダリング
     * checkKind で「正誤チェック」(correctness) と「提案チェック」(proposal) に分ける
     * 両方ある場合は「両方表示」タブも追加
     */
    function renderTabs() {
        if (!tabsEl || allItems.length === 0) {
            if (tabsEl) tabsEl.style.display = 'none';
            return;
        }

        // checkKind でアイテムがあるかチェック（全アイテム対象）
        const hasCorrectness = allItems.some(function(item) {
            return item.checkKind === 'correctness';
        });
        const hasProposal = allItems.some(function(item) {
            return item.checkKind === 'proposal';
        });

        // デフォルトタブ選択（両方ある場合は「両方表示」を優先）
        if (hasCorrectness && hasProposal) {
            currentTab = 'both';
        } else if (hasCorrectness) {
            currentTab = 'correctness';
        } else if (hasProposal) {
            currentTab = 'proposal';
        } else {
            tabsEl.style.display = 'none';
            return;
        }

        let html = '';

        // 両方表示タブ（両方ある場合のみ）
        if (hasCorrectness && hasProposal) {
            html += '<button class="calibration-tab' + (currentTab === 'both' ? ' active' : '') +
                    '" data-type="both" onclick="CalibrationViewer.switchTab(\'both\')">両方表示</button>';
        }

        // 正誤チェックタブ
        if (hasCorrectness) {
            const correctnessCount = allItems.filter(function(item) {
                return item.checkKind === 'correctness';
            }).length;
            html += '<button class="calibration-tab' + (currentTab === 'correctness' ? ' active' : '') +
                    '" data-type="correctness" onclick="CalibrationViewer.switchTab(\'correctness\')">正誤チェック (' + correctnessCount + ')</button>';
        }

        // 提案チェックタブ
        if (hasProposal) {
            const proposalCount = allItems.filter(function(item) {
                return item.checkKind === 'proposal';
            }).length;
            html += '<button class="calibration-tab' + (currentTab === 'proposal' ? ' active' : '') +
                    '" data-type="proposal" onclick="CalibrationViewer.switchTab(\'proposal\')">提案チェック (' + proposalCount + ')</button>';
        }

        tabsEl.innerHTML = html;

        // タブを表示
        tabsEl.style.display = 'flex';
    }

    /**
     * タブ切り替え
     */
    function switchTab(type) {
        currentTab = type;

        // タブのactive状態を更新
        if (tabsEl) {
            tabsEl.querySelectorAll('.calibration-tab').forEach(function(tab) {
                tab.classList.toggle('active', tab.getAttribute('data-type') === type);
            });
        }

        renderTable();
    }

    /**
     * テーブルをレンダリング
     * checkKind でフィルタリングして表示（全アイテム対象）
     */
    function renderTable() {
        if (!contentEl || allItems.length === 0) {
            showError('データがありません');
            return;
        }

        // 「両方表示」モードの場合は2カラムレイアウト
        if (currentTab === 'both') {
            renderBothColumns();
            return;
        }

        // 現在のタブの checkKind に一致する項目を表示（picked関係なく全て）
        const items = allItems.filter(function(item) {
            return item.checkKind === currentTab;
        });

        if (items.length === 0) {
            var tabName = currentTab === 'correctness' ? '正誤チェック' : '提案チェック';
            showError('「' + tabName + '」の項目がありません');
            return;
        }

        contentEl.innerHTML = renderItemsToHtml(items);
    }

    /**
     * 両方表示モード - 2カラムで正誤と提案を並べて表示
     */
    function renderBothColumns() {
        const correctnessItems = allItems.filter(function(item) {
            return item.checkKind === 'correctness';
        });
        const proposalItems = allItems.filter(function(item) {
            return item.checkKind === 'proposal';
        });

        let html = '<div class="calibration-dual-columns">';

        // 正誤チェックカラム
        html += '<div class="calibration-column">';
        html += '<div class="calibration-column-header correctness-header">正誤チェック (' + correctnessItems.length + ')</div>';
        html += '<div class="calibration-column-content">';
        if (correctnessItems.length > 0) {
            html += renderItemsToHtml(correctnessItems);
        } else {
            html += '<div class="calibration-empty">項目がありません</div>';
        }
        html += '</div></div>';

        // 提案チェックカラム
        html += '<div class="calibration-column">';
        html += '<div class="calibration-column-header proposal-header">提案チェック (' + proposalItems.length + ')</div>';
        html += '<div class="calibration-column-content">';
        if (proposalItems.length > 0) {
            html += renderItemsToHtml(proposalItems);
        } else {
            html += '<div class="calibration-empty">項目がありません</div>';
        }
        html += '</div></div>';

        html += '</div>';

        contentEl.innerHTML = html;
    }

    /**
     * アイテムリストをHTMLに変換
     */
    function renderItemsToHtml(items) {
        // カテゴリでグループ化
        const grouped = {};
        items.forEach(function(item) {
            const cat = item.category || '未分類';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        });

        let html = '';
        const sortedKeys = Object.keys(grouped).sort();

        sortedKeys.forEach(function(category) {
            const catItems = grouped[category];
            const colorClass = getCategoryColor(category);

            html += '<div class="calibration-category ' + colorClass + '">';
            html += '<div class="calibration-category-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
            html += '<span class="calibration-category-toggle">▼</span>';
            html += '<span class="calibration-category-name">' + escapeHtml(category) + '</span>';
            html += '<span class="calibration-category-count">(' + catItems.length + ')</span>';
            html += '</div>';
            html += '<div class="calibration-category-body">';
            html += '<table class="calibration-table"><tbody>';

            catItems.forEach(function(item, index) {
                html += '<tr>';
                html += '<td class="cal-page">' + formatPage(item.page) + '</td>';
                html += '<td class="cal-excerpt">' + escapeHtml(item.excerpt || '') + '</td>';
                html += '<td class="cal-content">' + escapeHtml(item.content || '') + '</td>';
                html += '<td class="cal-copy">';
                html += '<button class="cal-copy-btn" data-content="' + escapeAttr(item.content || '') + '" onclick="CalibrationViewer.copyContent(this)" title="コピー">';
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
        var colors = ['cal-color-1', 'cal-color-2', 'cal-color-3', 'cal-color-4', 'cal-color-5',
                      'cal-color-6', 'cal-color-7', 'cal-color-8', 'cal-color-9', 'cal-color-10'];
        return colors[(num - 1) % colors.length] || 'cal-color-default';
    }

    /**
     * ページ番号を「●●P」形式にフォーマット
     */
    function formatPage(page) {
        if (!page) return '';
        var pageStr = String(page);
        // 「●ページ」形式から数字を抽出して「●P」に変換
        var match = pageStr.match(/^(\d+)/);
        if (match) {
            return escapeHtml(match[1]) + 'P';
        }
        // 数字がない場合はそのまま表示
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
     * コンテンツをクリップボードにコピー
     */
    function copyContent(btn) {
        var content = btn.getAttribute('data-content');
        if (!content) return;

        navigator.clipboard.writeText(content).then(function() {
            // 成功時: ボタンにチェックマークを表示
            var originalHtml = btn.innerHTML;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            btn.classList.add('copied');

            setTimeout(function() {
                btn.innerHTML = originalHtml;
                btn.classList.remove('copied');
            }, 1000);
        }).catch(function(err) {
            console.error('コピーに失敗しました:', err);
        });
    }

    // DOMContentLoadedで初期化（遅延付き - Electronのウィンドウ間データ共有対応）
    async function initWithRetry(retryCount) {
        retryCount = retryCount || 0;
        var maxRetries = 10;
        var retryDelay = 100;

        // クエリパラメータにファイルパスがある場合は即座に初期化
        var urlParams = new URLSearchParams(window.location.search);
        var filePath = urlParams.get('file');
        if (filePath && window.electronAPI && window.electronAPI.readCalibrationFile) {
            await init();
            return;
        }

        // 従来の方法でデータ取得を試みる
        var data = null;
        if (window.__calibrationData) {
            data = window.__calibrationData;
        } else if (window.opener && window.opener.__calibrationData) {
            data = window.opener.__calibrationData;
        } else {
            var dataStr = sessionStorage.getItem('calibrationData');
            if (dataStr) {
                try {
                    data = JSON.parse(dataStr);
                } catch (e) {
                    // パースエラーは無視
                }
            }
        }

        if (data) {
            // データが見つかった場合は初期化
            await init();
        } else if (retryCount < maxRetries) {
            // データがまだない場合はリトライ
            setTimeout(function() {
                initWithRetry(retryCount + 1);
            }, retryDelay);
        } else {
            // リトライ上限に達した場合はエラー表示
            await init();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initWithRetry(0);
        });
    } else {
        initWithRetry(0);
    }

    // グローバルに公開（onclick用）
    window.CalibrationViewer = {
        switchTab: switchTab,
        copyContent: copyContent
    };
})();
