/**
 * calibration-panel.js - 校正チェックパネル
 * ProGenから保存された校正チェックデータをフォルダブラウザで選択し、
 * モーダルにテーブル表示する。
 */

const CalibrationPanel = (() => {
  // 状態
  let basePath = '';
  let currentPath = '';
  let currentData = null;
  let currentTab = 'variation';
  let navigationStack = []; // パンくず用
  let searchTimeout = null;
  let allJsonFiles = []; // 検索用にキャッシュされたJSONファイル一覧

  // DOM要素キャッシュ
  let toggleBtn, modal, browser, breadcrumb, folderList, resultArea, resultTitle, tableArea, tabs, cancelBtn;
  let searchInput, searchClearBtn, searchResultsContainer;

  // イベントリスナー参照（cleanup用）
  let boundHandlers = {
    toggleBtnClick: null,
    cancelBtnClick: null,
    modalClick: null,
    documentKeydown: null,
    searchInputInput: null,
    searchInputKeydown: null,
    searchClearBtnClick: null
  };

  /**
   * 初期化
   */
  function init() {
    toggleBtn = document.getElementById('calibrationToggleBtn');
    modal = document.getElementById('calibrationModal');
    browser = document.getElementById('calibrationBrowser');
    breadcrumb = document.getElementById('calibrationBreadcrumb');
    folderList = document.getElementById('calibrationFolderList');
    resultArea = document.getElementById('calibrationResult');
    resultTitle = document.getElementById('calibrationResultTitle');
    tableArea = document.getElementById('calibrationTableArea');
    tabs = document.getElementById('calibrationTabs');
    cancelBtn = document.getElementById('calibrationModalCancelBtn');
    searchInput = document.getElementById('calibrationSearchInput');
    searchClearBtn = document.getElementById('calibrationSearchClearBtn');
    searchResultsContainer = document.getElementById('calibrationSearchResults');

    if (!toggleBtn || !modal) return;

    // 開くボタン
    boundHandlers.toggleBtnClick = openModal;
    toggleBtn.addEventListener('click', boundHandlers.toggleBtnClick);

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
      if (window.MojiQModal) {
        MojiQModal.showAlert('この機能はElectronアプリでのみ使用できます', 'エラー');
      } else {
        alert('この機能はElectronアプリでのみ使用できます');
      }
      return;
    }

    modal.style.display = 'flex';
    folderList.innerHTML = '<div class="calibration-loading">読み込み中...</div>';

    // 検索フィールドをリセット
    if (searchInput) {
      searchInput.value = '';
    }
    clearSearch();

    // ブラウザを表示、結果エリアを非表示
    if (browser) browser.style.display = '';
    if (resultArea) resultArea.style.display = 'none';

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
    if (!window.electronAPI || !window.electronAPI.getCalibrationBasePath) {
      folderList.innerHTML = '<div class="calibration-empty">Electron環境でのみ利用可能です</div>';
      return;
    }

    try {
      basePath = await window.electronAPI.getCalibrationBasePath();
      currentPath = basePath;
      navigationStack = [];
      await loadFolder(basePath);
    } catch (error) {
      folderList.innerHTML = '<div class="calibration-empty">読み込みに失敗しました</div>';
    }
  }

  /**
   * フォルダの中身を読み込んで表示
   */
  async function loadFolder(dirPath) {
    folderList.innerHTML = '<div class="calibration-loading">読み込み中...</div>';
    if (resultArea) resultArea.style.display = 'none';
    if (browser) browser.style.display = '';

    try {
      const result = await window.electronAPI.listCalibrationDirectory(dirPath);
      if (!result.success) {
        // BUG-005修正: XSS対策 - エラーメッセージをサニタイズ
        folderList.innerHTML = `<div class="calibration-empty">エラー: ${escapeHtml(result.error)}</div>`;
        return;
      }

      currentPath = dirPath;
      renderFolderList(result.items);
      updateBreadcrumb();
    } catch (error) {
      // BUG-005修正: XSS対策 - エラーメッセージをサニタイズ
      folderList.innerHTML = `<div class="calibration-empty">エラー: ${escapeHtml(error.message)}</div>`;
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
      folderList.innerHTML = '<div class="calibration-empty">データがありません</div>';
      return;
    }

    let html = '';
    allItems.forEach(item => {
      if (item.isDirectory) {
        html += `<div class="calibration-item calibration-folder" data-path="${escapeAttr(item.path)}" onclick="CalibrationPanel.openFolder('${escapeAttr(item.path)}')">
          <span class="calibration-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
          <span class="calibration-name">${escapeHtml(item.name)}</span>
        </div>`;
      } else {
        html += `<div class="calibration-item calibration-file" data-path="${escapeAttr(item.path)}" onclick="CalibrationPanel.openFile('${escapeAttr(item.path)}')">
          <span class="calibration-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
          <span class="calibration-name">${escapeHtml(item.name)}</span>
        </div>`;
      }
    });

    folderList.innerHTML = html;
  }

  /**
   * パンくずリストの更新
   */
  function updateBreadcrumb() {
    if (!basePath || !currentPath) return;

    const normalizedBase = basePath.replace(/\\/g, '/');
    const normalizedCurrent = currentPath.replace(/\\/g, '/');

    let html = '<span class="calibration-crumb calibration-crumb-root" onclick="CalibrationPanel.goToRoot()">TOP</span>';

    if (normalizedCurrent !== normalizedBase) {
      const relative = normalizedCurrent.substring(normalizedBase.length + 1);
      const parts = relative.split('/');
      let accumulated = basePath;

      parts.forEach((part, i) => {
        accumulated = accumulated + '\\' + part;
        const isLast = i === parts.length - 1;
        html += `<span class="calibration-crumb-sep">›</span>`;
        if (isLast) {
          html += `<span class="calibration-crumb calibration-crumb-current">${escapeHtml(part)}</span>`;
        } else {
          html += `<span class="calibration-crumb" onclick="CalibrationPanel.openFolder('${escapeAttr(accumulated)}')">${escapeHtml(part)}</span>`;
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
    loadFolder(dirPath);
  }

  /**
   * JSONファイルを開いて別ウィンドウで表示 + Storeに保存
   */
  async function openFile(filePath) {
    try {
      // まずJSONデータを読み込む
      let jsonData = null;
      if (window.electronAPI && window.electronAPI.readCalibrationFile) {
        const result = await window.electronAPI.readCalibrationFile(filePath);
        if (result.success) {
          // タイトル生成
          const fileName = filePath.replace(/\\/g, '/').split('/').pop().replace('.json', '');
          const workName = result.data.work || '';
          const title = workName ? workName + ' ' + fileName : fileName;
          jsonData = {
            title: title,
            checks: result.data.checks
          };
        }
      }

      // Storeに保存（校正モード用）
      if (jsonData && window.MojiQStore) {
        window.MojiQStore.set('proofreadingMode.currentData', jsonData);
        window.MojiQStore.set('proofreadingMode.jsonLoaded', true);
        window.MojiQStore.set('proofreadingMode.currentFilePath', filePath);

        // 校正モードメニュー項目を有効化
        enableProofreadingModeMenu();
      }

      // 校正パネルにデータを表示
      if (window.ProofreadingPanel) {
        ProofreadingPanel.renderCheckData(jsonData);
      }

      // モーダルを閉じる
      closeModal();
    } catch (error) {
      alert('ファイルの読み込みに失敗しました: ' + error.message);
    }
  }

  /**
   * 校正モードメニュー項目を有効化（ボタンは常時有効）
   */
  function enableProofreadingModeMenu() {
    // メニュー項目
    const menuItem = document.getElementById('proofreadingModeMenuItem');
    if (menuItem) {
      menuItem.classList.remove('disabled');
    }
  }

  /**
   * タブ切り替え
   */
  function switchTab(type) {
    currentTab = type;
    tabs.querySelectorAll('.calibration-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-type') === type);
    });
    renderTable();
  }

  /**
   * テーブル描画
   */
  function renderTable() {
    if (!currentData || !currentData.checks || !currentData.checks[currentTab]) {
      tableArea.innerHTML = '<div class="calibration-empty">データがありません</div>';
      return;
    }

    const checkData = currentData.checks[currentTab];
    // picked: true の項目のみ表示
    const items = checkData.items.filter(item => item.picked);

    if (items.length === 0) {
      tableArea.innerHTML = '<div class="calibration-empty">ピックアップされた項目がありません</div>';
      return;
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

      html += `<div class="calibration-category ${colorClass}">`;
      html += `<div class="calibration-category-header" onclick="this.parentElement.classList.toggle('collapsed')">`;
      html += `<span class="calibration-category-toggle">▼</span>`;
      html += `<span class="calibration-category-name">${escapeHtml(category)}</span>`;
      html += `<span class="calibration-category-count">(${catItems.length})</span>`;
      html += `</div>`;
      html += `<div class="calibration-category-body">`;
      html += `<table class="calibration-table"><tbody>`;

      catItems.forEach(item => {
        html += `<tr>`;
        html += `<td class="cal-page">${escapeHtml(item.page || '')}</td>`;
        html += `<td class="cal-excerpt">${escapeHtml(item.excerpt || '')}</td>`;
        html += `<td class="cal-content">${escapeHtml(item.content || '')}</td>`;
        html += `</tr>`;
      });

      html += `</tbody></table></div></div>`;
    });

    tableArea.innerHTML = html;
  }

  /**
   * カテゴリに応じた色クラスを返す
   */
  function getCategoryColor(category) {
    const match = category.match(/^(\d+)\./);
    if (!match) return 'cal-color-default';
    const num = parseInt(match[1]);
    const colors = ['cal-color-1', 'cal-color-2', 'cal-color-3', 'cal-color-4', 'cal-color-5',
                     'cal-color-6', 'cal-color-7', 'cal-color-8', 'cal-color-9', 'cal-color-10'];
    return colors[(num - 1) % colors.length] || 'cal-color-default';
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
      const result = await window.electronAPI.listCalibrationDirectory(dirPath);
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
    folderList.style.display = 'none';
    breadcrumb.style.display = 'none';
    searchResultsContainer.style.display = 'block';
    searchResultsContainer.innerHTML = '';

    if (results.length === 0) {
      searchResultsContainer.innerHTML = '<div class="calibration-empty">検索結果がありません</div>';
      return;
    }

    // 結果件数を表示
    const countEl = document.createElement('div');
    countEl.className = 'calibration-search-result-count';
    countEl.textContent = `${results.length}件のJSONファイルが見つかりました`;
    searchResultsContainer.appendChild(countEl);

    // 検索結果を表示
    results.forEach(file => {
      const itemEl = document.createElement('div');
      itemEl.className = 'calibration-item calibration-file calibration-search-result-item';

      // アイコン
      const icon = document.createElement('span');
      icon.className = 'calibration-icon';
      icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      itemEl.appendChild(icon);

      // ファイル名（ハイライト）
      const nameEl = document.createElement('span');
      nameEl.className = 'calibration-search-result-name';
      nameEl.innerHTML = highlightMatch(file.name, query);
      itemEl.appendChild(nameEl);

      // 相対パス
      const pathEl = document.createElement('div');
      pathEl.className = 'calibration-search-result-path';
      pathEl.innerHTML = highlightMatch(file.relativePath, query);
      itemEl.appendChild(pathEl);

      // クリックイベント
      itemEl.addEventListener('click', async () => {
        await openFile(file.path);
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

    return escapeHtml(before) + '<mark class="calibration-search-highlight">' + escapeHtml(match) + '</mark>' + escapeHtml(after);
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

  /**
   * ルートに戻る
   */
  function goToRoot() {
    navigationStack = [];
    currentData = null;
    clearSearch();
    if (searchInput) {
      searchInput.value = '';
    }
    loadFolder(basePath);
  }

  /**
   * 一つ前に戻る
   */
  function goBack() {
    currentData = null;
    if (navigationStack.length > 0) {
      const prevPath = navigationStack.pop();
      loadFolder(prevPath);
    } else {
      loadFolder(basePath);
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
   * イベントリスナーをクリーンアップ
   */
  function cleanup() {
    // 検索タイムアウトをクリア
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }

    if (toggleBtn) toggleBtn.removeEventListener('click', boundHandlers.toggleBtnClick);
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
  }

  // DOMContentLoaded で初期化
  document.addEventListener('DOMContentLoaded', init);

  // 公開API
  return {
    openFolder,
    openFile,
    switchTab,
    goToRoot,
    goBack,
    openModal,
    closeModal,
    cleanup
  };
})();
