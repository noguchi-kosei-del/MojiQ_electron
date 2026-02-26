/* js/json-folder-browser.js - GドライブJSONフォルダブラウザ */

window.MojiQJsonFolderBrowser = (function() {
    'use strict';

    // 状態
    let basePath = '';
    let currentPath = '';
    let navigationStack = []; // パンくず用
    let searchTimeout = null;
    let allJsonFiles = []; // 検索用にキャッシュされたJSONファイル一覧

    // DOM要素
    let modal = null;
    let folderList = null;
    let breadcrumb = null;
    let openBtn = null;
    let cancelBtn = null;
    let searchInput = null;
    let searchClearBtn = null;
    let searchResultsContainer = null;

    // JSONファイル選択時のコールバック
    let onJsonFileSelectCallback = null;

    // 初期化済みフラグ
    let isInitialized = false;

    // イベントリスナー参照（cleanup用）
    let boundHandlers = {
        openBtnClick: null,
        cancelBtnClick: null,
        modalClick: null,
        documentKeydown: null,
        searchInputInput: null,
        searchInputKeydown: null,
        searchClearBtnClick: null
    };

    /**
     * 初期化
     * @param {object} callbacks - コールバック設定
     */
    function init(callbacks) {
        if (isInitialized) return;

        // DOM要素の取得
        modal = document.getElementById('jsonFolderBrowserModal');
        folderList = document.getElementById('jsonFolderList');
        breadcrumb = document.getElementById('jsonFolderBreadcrumb');
        openBtn = document.getElementById('gdriveJsonBrowserBtn');
        cancelBtn = document.getElementById('jsonFolderBrowserCancelBtn');
        searchInput = document.getElementById('jsonFolderSearchInput');
        searchClearBtn = document.getElementById('jsonFolderSearchClearBtn');
        searchResultsContainer = document.getElementById('jsonFolderSearchResults');

        if (!modal || !folderList) {
            console.warn('JSONフォルダブラウザの要素が見つかりません');
            return;
        }

        // コールバック設定
        if (callbacks && callbacks.onJsonFileSelect) {
            onJsonFileSelectCallback = callbacks.onJsonFileSelect;
        }

        // イベントリスナー設定
        setupEventListeners();

        isInitialized = true;
    }

    /**
     * イベントリスナーのセットアップ
     */
    function setupEventListeners() {
        // 開くボタン
        if (openBtn) {
            boundHandlers.openBtnClick = openModal;
            openBtn.addEventListener('click', boundHandlers.openBtnClick);
        }

        // 閉じるボタン
        if (cancelBtn) {
            boundHandlers.cancelBtnClick = closeModal;
            cancelBtn.addEventListener('click', boundHandlers.cancelBtnClick);
        }

        // モーダル外クリックで閉じる
        boundHandlers.modalClick = (e) => {
            if (e.target === modal) {
                closeModal();
            }
        };
        modal.addEventListener('click', boundHandlers.modalClick);

        // ESCキーで閉じる
        boundHandlers.documentKeydown = (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
            }
        };
        document.addEventListener('keydown', boundHandlers.documentKeydown);

        // 検索入力イベント
        if (searchInput) {
            boundHandlers.searchInputInput = (e) => {
                const query = e.target.value.trim();

                // デバウンス処理
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }

                searchTimeout = setTimeout(() => {
                    performSearch(query);
                }, 300);
            };
            searchInput.addEventListener('input', boundHandlers.searchInputInput);

            // Enterキーで検索
            boundHandlers.searchInputKeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (searchTimeout) {
                        clearTimeout(searchTimeout);
                    }
                    performSearch(searchInput.value.trim());
                }
            };
            searchInput.addEventListener('keydown', boundHandlers.searchInputKeydown);
        }

        // 検索クリアボタン
        if (searchClearBtn) {
            boundHandlers.searchClearBtnClick = () => {
                if (searchInput) {
                    searchInput.value = '';
                }
                clearSearch();
            };
            searchClearBtn.addEventListener('click', boundHandlers.searchClearBtnClick);
        }
    }

    /**
     * モーダルを開く
     */
    async function openModal() {
        if (!window.electronAPI || !window.electronAPI.isElectron) {
            MojiQModal.showAlert('この機能はElectronアプリでのみ使用できます', 'エラー');
            return;
        }

        modal.style.display = 'flex';
        folderList.innerHTML = '<div class="json-folder-loading">読み込み中...</div>';

        // 検索フィールドをリセット
        if (searchInput) {
            searchInput.value = '';
        }
        clearSearch();

        if (!basePath) {
            await loadBasePath();
        } else {
            await loadFolder(basePath);
        }

        // バックグラウンドでJSONファイル一覧をキャッシュ
        if (basePath) {
            cacheAllJsonFiles(basePath);
        }
    }

    /**
     * モーダルを閉じる
     */
    function closeModal() {
        modal.style.display = 'none';
    }

    /**
     * ベースパスを取得してルートフォルダを表示
     */
    async function loadBasePath() {
        try {
            basePath = await window.electronAPI.getJsonFolderPath();
            currentPath = basePath;
            navigationStack = [];
            await loadFolder(basePath);
        } catch (error) {
            folderList.innerHTML = '<div class="json-folder-loading">読み込みに失敗しました</div>';
        }
    }

    /**
     * フォルダの中身を読み込んで表示
     */
    async function loadFolder(dirPath) {
        folderList.innerHTML = '<div class="json-folder-loading">読み込み中...</div>';

        try {
            const result = await window.electronAPI.listDirectory(dirPath);
            if (!result.success) {
                folderList.innerHTML = `<div class="json-folder-loading">エラー: ${escapeHtml(result.error)}</div>`;
                return;
            }

            currentPath = dirPath;
            renderFolderList(result.items);
            updateBreadcrumb();
        } catch (error) {
            folderList.innerHTML = `<div class="json-folder-loading">エラー: ${escapeHtml(error.message)}</div>`;
        }
    }

    /**
     * フォルダリストの描画
     */
    function renderFolderList(items) {
        const folders = items.filter(i => i.isDirectory).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        const files = items.filter(i => i.isFile && i.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        const allItems = [...folders, ...files];

        if (allItems.length === 0) {
            folderList.innerHTML = '<div class="json-folder-loading">データがありません</div>';
            return;
        }

        let html = '';
        allItems.forEach(item => {
            if (item.isDirectory) {
                html += `<div class="json-folder-item json-folder-folder" data-path="${escapeAttr(item.path)}" onclick="MojiQJsonFolderBrowser.openFolder('${escapeAttr(item.path)}')">
                    <span class="json-folder-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
                    <span class="json-folder-name">${escapeHtml(item.name)}</span>
                </div>`;
            } else {
                html += `<div class="json-folder-item json-folder-file" data-path="${escapeAttr(item.path)}" onclick="MojiQJsonFolderBrowser.openFile('${escapeAttr(item.path)}', '${escapeAttr(item.name)}')">
                    <span class="json-folder-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                    <span class="json-folder-name">${escapeHtml(item.name)}</span>
                </div>`;
            }
        });

        folderList.innerHTML = html;
    }

    /**
     * パンくずリストの更新
     */
    function updateBreadcrumb() {
        if (!basePath || !currentPath || !breadcrumb) return;

        const normalizedBase = basePath.replace(/\\/g, '/');
        const normalizedCurrent = currentPath.replace(/\\/g, '/');

        let html = '<span class="json-folder-crumb json-folder-crumb-root" onclick="MojiQJsonFolderBrowser.goToRoot()">TOP</span>';

        if (normalizedCurrent !== normalizedBase) {
            const relative = normalizedCurrent.substring(normalizedBase.length + 1);
            const parts = relative.split('/');
            let accumulated = basePath;

            parts.forEach((part, i) => {
                accumulated = accumulated + '\\' + part;
                const isLast = i === parts.length - 1;
                html += `<span class="json-folder-crumb-sep">›</span>`;
                if (isLast) {
                    html += `<span class="json-folder-crumb json-folder-crumb-current">${escapeHtml(part)}</span>`;
                } else {
                    html += `<span class="json-folder-crumb" onclick="MojiQJsonFolderBrowser.openFolder('${escapeAttr(accumulated)}')">${escapeHtml(part)}</span>`;
                }
            });
        }

        breadcrumb.innerHTML = html;
    }

    /**
     * フォルダを開く
     */
    function openFolder(dirPath) {
        navigationStack.push(currentPath);
        clearSearch();
        if (searchInput) {
            searchInput.value = '';
        }
        loadFolder(dirPath);
    }

    /**
     * JSONファイルを読み込み
     * @param {string} filePath - ファイルパス
     * @param {string} fileName - ファイル名
     */
    async function openFile(filePath, fileName) {
        try {
            const result = await window.electronAPI.readJsonFile(filePath);

            if (!result.success) {
                MojiQModal.showAlert('JSONファイルの読み込みに失敗しました: ' + result.error, 'エラー');
                return;
            }

            // モーダルを閉じる
            closeModal();

            // 読み込み成功モーダルを表示
            MojiQModal.showAlert('JSONファイルを読み込みました', '読み込み完了');

            // コールバックでデータを渡す
            if (onJsonFileSelectCallback) {
                onJsonFileSelectCallback(result.data, fileName);
            }

        } catch (error) {
            console.error('JSONファイルの読み込みに失敗:', error);
            MojiQModal.showAlert('JSONファイルの読み込みに失敗しました: ' + error.message, 'エラー');
        }
    }

    /**
     * ルートに戻る
     */
    function goToRoot() {
        navigationStack = [];
        clearSearch();
        if (searchInput) {
            searchInput.value = '';
        }
        loadFolder(basePath);
    }

    /**
     * 全てのJSONファイルを再帰的に取得してキャッシュ
     * @param {string} dirPath - ディレクトリパス
     */
    async function cacheAllJsonFiles(dirPath) {
        allJsonFiles = [];
        await collectJsonFilesRecursive(dirPath);
    }

    /**
     * 再帰的にJSONファイルを収集
     * @param {string} dirPath - ディレクトリパス
     */
    async function collectJsonFilesRecursive(dirPath) {
        try {
            const result = await window.electronAPI.listDirectory(dirPath);
            if (!result.success) return;

            for (const item of result.items) {
                if (item.isDirectory) {
                    await collectJsonFilesRecursive(item.path);
                } else if (item.isFile && item.name.toLowerCase().endsWith('.json')) {
                    // 相対パスを計算
                    const relativePath = item.path.replace(basePath, '').replace(/^[\\\/]/, '');
                    allJsonFiles.push({
                        name: item.name,
                        path: item.path,
                        relativePath: relativePath
                    });
                }
            }
        } catch (error) {
            console.error('ファイル収集エラー:', error);
        }
    }

    /**
     * 検索を実行
     * @param {string} query - 検索クエリ
     */
    function performSearch(query) {
        if (!query) {
            clearSearch();
            return;
        }

        // 検索クエリを正規化（小文字に変換）
        const normalizedQuery = query.toLowerCase();

        // ファイル名で検索（部分一致）
        const results = allJsonFiles.filter(file => {
            return file.name.toLowerCase().includes(normalizedQuery) ||
                   file.relativePath.toLowerCase().includes(normalizedQuery);
        });

        displaySearchResults(results, query);
    }

    /**
     * 検索結果を表示
     * @param {Array} results - 検索結果
     * @param {string} query - 検索クエリ（ハイライト用）
     */
    function displaySearchResults(results, query) {
        if (!searchResultsContainer) return;

        // フォルダリストを非表示、検索結果を表示
        folderList.style.display = 'none';
        breadcrumb.style.display = 'none';
        searchResultsContainer.style.display = 'block';
        searchResultsContainer.innerHTML = '';

        if (results.length === 0) {
            searchResultsContainer.innerHTML = '<div class="json-folder-loading">検索結果がありません</div>';
            return;
        }

        // 結果件数を表示
        const countEl = document.createElement('div');
        countEl.className = 'json-search-result-count';
        countEl.textContent = `${results.length}件のJSONファイルが見つかりました`;
        searchResultsContainer.appendChild(countEl);

        // 検索結果を表示
        results.forEach(file => {
            const itemEl = document.createElement('div');
            itemEl.className = 'json-folder-item json-folder-file json-search-result-item';

            // アイコン
            const icon = document.createElement('span');
            icon.className = 'json-folder-icon';
            icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            itemEl.appendChild(icon);

            // ファイル名（ハイライト）
            const nameEl = document.createElement('span');
            nameEl.className = 'json-search-result-name';
            nameEl.innerHTML = highlightMatch(file.name, query);
            itemEl.appendChild(nameEl);

            // 相対パス
            const pathEl = document.createElement('div');
            pathEl.className = 'json-search-result-path';
            pathEl.innerHTML = highlightMatch(file.relativePath, query);
            itemEl.appendChild(pathEl);

            // クリックイベント
            itemEl.addEventListener('click', async () => {
                await openFile(file.path, file.name);
            });

            searchResultsContainer.appendChild(itemEl);
        });
    }

    /**
     * 検索クエリに一致する部分をハイライト
     * @param {string} text - テキスト
     * @param {string} query - 検索クエリ
     * @returns {string} ハイライトされたHTML
     */
    function highlightMatch(text, query) {
        if (!query) return escapeHtml(text);

        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const index = lowerText.indexOf(lowerQuery);

        if (index === -1) {
            return escapeHtml(text);
        }

        const before = text.substring(0, index);
        const match = text.substring(index, index + query.length);
        const after = text.substring(index + query.length);

        return escapeHtml(before) + '<mark class="json-search-highlight">' + escapeHtml(match) + '</mark>' + escapeHtml(after);
    }

    /**
     * 検索をクリア
     */
    function clearSearch() {
        if (searchResultsContainer) {
            searchResultsContainer.style.display = 'none';
            searchResultsContainer.innerHTML = '';
        }
        if (folderList) {
            folderList.style.display = 'block';
        }
        if (breadcrumb) {
            breadcrumb.style.display = 'flex';
        }
    }

    // ユーティリティ
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escapeAttr(str) {
        if (!str) return '';
        return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    /**
     * JSONファイル選択時のコールバックを設定
     * @param {function} callback - コールバック関数 (data, fileName) => void
     */
    function setOnJsonFileSelect(callback) {
        onJsonFileSelectCallback = callback;
    }

    /**
     * イベントリスナーをクリーンアップ
     */
    function cleanup() {
        // 検索タイムアウトをクリア
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }

        // イベントリスナーを解除
        if (openBtn) openBtn.removeEventListener('click', boundHandlers.openBtnClick);
        if (cancelBtn) cancelBtn.removeEventListener('click', boundHandlers.cancelBtnClick);
        if (modal) modal.removeEventListener('click', boundHandlers.modalClick);
        document.removeEventListener('keydown', boundHandlers.documentKeydown);
        if (searchInput) {
            searchInput.removeEventListener('input', boundHandlers.searchInputInput);
            searchInput.removeEventListener('keydown', boundHandlers.searchInputKeydown);
        }
        if (searchClearBtn) searchClearBtn.removeEventListener('click', boundHandlers.searchClearBtnClick);

        // 参照をクリア
        for (const key in boundHandlers) {
            boundHandlers[key] = null;
        }

        // キャッシュをクリア
        allJsonFiles = [];
        isInitialized = false;
    }

    return {
        init,
        openModal,
        closeModal,
        openFolder,
        openFile,
        goToRoot,
        setOnJsonFileSelect,
        cleanup
    };
})();
