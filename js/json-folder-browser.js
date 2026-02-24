/* js/json-folder-browser.js - GドライブJSONフォルダブラウザ */

window.MojiQJsonFolderBrowser = (function() {
    'use strict';

    // DOM要素
    let modal = null;
    let folderTree = null;
    let currentPathDisplay = null;
    let openBtn = null;
    let cancelBtn = null;
    let searchInput = null;
    let searchClearBtn = null;
    let searchResultsContainer = null;

    // 状態
    let basePath = '';
    let isInitialized = false;
    let searchTimeout = null;
    let allJsonFiles = []; // 検索用にキャッシュされたJSONファイル一覧

    // JSONファイル選択時のコールバック
    let onJsonFileSelectCallback = null;

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
        folderTree = document.getElementById('jsonFolderTree');
        currentPathDisplay = document.getElementById('jsonFolderCurrentPath');
        openBtn = document.getElementById('gdriveJsonBrowserBtn');
        cancelBtn = document.getElementById('jsonFolderBrowserCancelBtn');
        searchInput = document.getElementById('jsonFolderSearchInput');
        searchClearBtn = document.getElementById('jsonFolderSearchClearBtn');
        searchResultsContainer = document.getElementById('jsonFolderSearchResults');

        if (!modal || !folderTree) {
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
        folderTree.innerHTML = '<div class="json-folder-loading">読み込み中...</div>';

        // 検索フィールドをリセット
        if (searchInput) {
            searchInput.value = '';
        }
        clearSearch();

        try {
            // ベースパスを取得
            basePath = await window.electronAPI.getJsonFolderPath();
            currentPathDisplay.textContent = basePath;

            // ルートフォルダの内容を読み込み
            await loadFolderContents(basePath, folderTree);

            // バックグラウンドでJSONファイル一覧をキャッシュ
            cacheAllJsonFiles(basePath);
        } catch (error) {
            console.error('フォルダの読み込みに失敗:', error);
            // BUG-005修正: XSS対策 - エラーメッセージをサニタイズ
            folderTree.innerHTML = '<div class="json-folder-loading">読み込みに失敗しました: ' + escapeHtml(error.message) + '</div>';
        }
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

        // フォルダツリーを非表示、検索結果を表示
        folderTree.style.display = 'none';
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
            itemEl.className = 'json-folder-item file json-file json-search-result-item';

            // アイコン
            const icon = document.createElement('span');
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
                await loadJsonFile(file.path, file.name);
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
     * HTMLエスケープ
     * @param {string} text - テキスト
     * @returns {string} エスケープされたテキスト
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 検索をクリア
     */
    function clearSearch() {
        if (searchResultsContainer) {
            searchResultsContainer.style.display = 'none';
            searchResultsContainer.innerHTML = '';
        }
        if (folderTree) {
            folderTree.style.display = 'block';
        }
    }

    /**
     * モーダルを閉じる
     */
    function closeModal() {
        modal.style.display = 'none';
    }

    /**
     * フォルダ内容を読み込んで表示
     * @param {string} dirPath - ディレクトリパス
     * @param {HTMLElement} container - 表示先のコンテナ
     */
    async function loadFolderContents(dirPath, container) {
        const result = await window.electronAPI.listDirectory(dirPath);

        if (!result.success) {
            // BUG-005修正: XSS対策 - エラーメッセージをサニタイズ
            container.innerHTML = '<div class="json-folder-loading">エラー: ' + escapeHtml(result.error) + '</div>';
            return;
        }

        container.innerHTML = '';

        // フォルダを先に、ファイルを後に表示（アルファベット順）
        const folders = result.items.filter(item => item.isDirectory).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        const files = result.items.filter(item => item.isFile).sort((a, b) => a.name.localeCompare(b.name, 'ja'));

        const sortedItems = [...folders, ...files];

        if (sortedItems.length === 0) {
            container.innerHTML = '<div class="json-folder-loading">フォルダが空です</div>';
            return;
        }

        sortedItems.forEach(item => {
            const itemEl = createFolderItem(item);
            container.appendChild(itemEl);
        });
    }

    /**
     * フォルダ/ファイル項目要素を作成
     * @param {object} item - アイテム情報 {name, path, isDirectory, isFile}
     * @returns {HTMLElement}
     */
    function createFolderItem(item) {
        const wrapper = document.createElement('div');

        const itemEl = document.createElement('div');
        itemEl.className = 'json-folder-item';

        if (item.isDirectory) {
            // フォルダ
            itemEl.classList.add('folder');

            const toggle = document.createElement('span');
            toggle.className = 'folder-toggle';
            toggle.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
            itemEl.appendChild(toggle);

            const icon = document.createElement('span');
            icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
            itemEl.appendChild(icon);

            const name = document.createElement('span');
            name.textContent = item.name;
            itemEl.appendChild(name);

            // 子要素コンテナ
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'json-folder-children';

            let isLoaded = false;

            itemEl.addEventListener('click', async (e) => {
                e.stopPropagation();

                // トグル状態を切り替え
                const isExpanded = childrenContainer.classList.contains('expanded');

                if (!isExpanded) {
                    // 展開
                    toggle.classList.add('expanded');
                    childrenContainer.classList.add('expanded');

                    if (!isLoaded) {
                        childrenContainer.innerHTML = '<div class="json-folder-loading">読み込み中...</div>';
                        await loadFolderContents(item.path, childrenContainer);
                        isLoaded = true;
                    }
                } else {
                    // 折りたたみ
                    toggle.classList.remove('expanded');
                    childrenContainer.classList.remove('expanded');
                }
            });

            wrapper.appendChild(itemEl);
            wrapper.appendChild(childrenContainer);

        } else {
            // ファイル
            itemEl.classList.add('file');

            const icon = document.createElement('span');

            if (item.name.toLowerCase().endsWith('.json')) {
                itemEl.classList.add('json-file');
                icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

                itemEl.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await loadJsonFile(item.path, item.name);
                });
            } else {
                icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
                itemEl.style.opacity = '0.5';
                itemEl.style.cursor = 'default';
            }

            itemEl.appendChild(icon);

            const name = document.createElement('span');
            name.textContent = item.name;
            itemEl.appendChild(name);

            wrapper.appendChild(itemEl);
        }

        return wrapper;
    }

    /**
     * JSONファイルを読み込み
     * @param {string} filePath - ファイルパス
     * @param {string} fileName - ファイル名
     */
    async function loadJsonFile(filePath, fileName) {
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
        setOnJsonFileSelect,
        cleanup  // メモリリーク対策: イベントリスナー解除
    };
})();
