/**
 * calibration-viewer.js - 校正チェックビューワー
 * 別ウィンドウでJSONデータをテーブル表示する
 */

(function() {
    'use strict';

    // 状態
    let currentData = null;
    let currentTab = 'variation';

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
     */
    function renderTabs() {
        if (!tabsEl || !currentData || !currentData.checks) return;

        const checks = currentData.checks;
        const hasVariation = checks.variation && checks.variation.items && checks.variation.items.length > 0;
        const hasSimple = checks.simple && checks.simple.items && checks.simple.items.length > 0;

        // デフォルトタブ選択
        if (hasVariation) {
            currentTab = 'variation';
        } else if (hasSimple) {
            currentTab = 'simple';
        } else {
            tabsEl.style.display = 'none';
            return;
        }

        let html = '';

        if (hasVariation) {
            html += '<button class="calibration-tab' + (currentTab === 'variation' ? ' active' : '') +
                    '" data-type="variation" onclick="CalibrationViewer.switchTab(\'variation\')">提案チェック</button>';
        }

        if (hasSimple) {
            html += '<button class="calibration-tab' + (currentTab === 'simple' ? ' active' : '') +
                    '" data-type="simple" onclick="CalibrationViewer.switchTab(\'simple\')">正誤チェック</button>';
        }

        tabsEl.innerHTML = html;

        // 片方だけの場合はタブを非表示
        if (!hasVariation || !hasSimple) {
            tabsEl.style.display = 'none';
        }
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
     */
    function renderTable() {
        if (!contentEl || !currentData || !currentData.checks || !currentData.checks[currentTab]) {
            showError('データがありません');
            return;
        }

        const checkData = currentData.checks[currentTab];
        // picked: true の項目のみ表示
        const items = checkData.items.filter(function(item) {
            return item.picked === true;
        });

        if (items.length === 0) {
            showError('ピックアップされた項目がありません');
            return;
        }

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
                var itemId = category.replace(/[^a-zA-Z0-9]/g, '_') + '_' + index;
                html += '<tr>';
                html += '<td class="cal-page">' + escapeHtml(item.page || '') + '</td>';
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

        contentEl.innerHTML = html;
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
