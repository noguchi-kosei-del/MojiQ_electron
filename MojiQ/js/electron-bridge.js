/**
 * Electron Bridge - ブラウザとElectron環境の両方で動作するための互換レイヤー
 *
 * このファイルはElectron APIとブラウザAPIの差異を吸収し、
 * 既存のコードを最小限の変更で動作させることを目的としています。
 */

window.MojiQElectron = (function() {
  'use strict';

  // Electron環境かどうかを判定
  const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);

  /**
   * PDFファイルを開くダイアログを表示
   * @returns {Promise<{canceled: boolean, filePaths: string[]}>}
   */
  async function showOpenPdfDialog() {
    if (isElectron) {
      return await window.electronAPI.showOpenDialog({
        title: 'PDF/JPEGを選択',
        filters: [
          { name: 'PDFファイル', extensions: ['pdf'] }
        ],
        properties: ['openFile']
      });
    } else {
      // ブラウザ環境: input[type=file]を使用
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf';
        input.onchange = (e) => {
          const files = e.target.files;
          if (files.length > 0) {
            resolve({ canceled: false, files: files });
          } else {
            resolve({ canceled: true });
          }
        };
        input.click();
      });
    }
  }

  /**
   * 画像ファイルを開くダイアログを表示
   * @returns {Promise<{canceled: boolean, filePaths: string[]}>}
   */
  async function showOpenImageDialog() {
    if (isElectron) {
      return await window.electronAPI.showOpenDialog({
        title: 'PDF/JPEGを選択',
        filters: [
          { name: '画像ファイル', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
        ],
        properties: ['openFile']
      });
    } else {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
          const files = e.target.files;
          if (files.length > 0) {
            resolve({ canceled: false, files: files });
          } else {
            resolve({ canceled: true });
          }
        };
        input.click();
      });
    }
  }

  /**
   * ファイルを読み込む
   * @param {string} filePath - ファイルパス（Electron環境のみ）
   * @returns {Promise<{success: boolean, data?: string, error?: string}>}
   */
  async function readFile(filePath) {
    if (isElectron) {
      return await window.electronAPI.readFile(filePath);
    } else {
      throw new Error('ブラウザ環境ではファイルパスからの読み込みはサポートされていません');
    }
  }

  /**
   * PDFを保存するダイアログを表示
   * @param {string} defaultName - デフォルトのファイル名
   * @returns {Promise<{canceled: boolean, filePath?: string}>}
   */
  async function showSavePdfDialog(defaultName = 'output.pdf') {
    if (isElectron) {
      return await window.electronAPI.showSaveDialog({
        title: 'PDFを保存',
        defaultPath: defaultName,
        filters: [
          { name: 'PDFファイル', extensions: ['pdf'] }
        ]
      });
    } else {
      // ブラウザ環境: ダウンロードリンクを使用
      return { canceled: false, useBrowserDownload: true, defaultName };
    }
  }

  /**
   * ファイルを保存
   * @param {string} filePath - 保存先パス
   * @param {string} base64Data - Base64エンコードされたデータ
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function saveFile(filePath, base64Data) {
    if (isElectron) {
      return await window.electronAPI.saveFile(filePath, base64Data);
    } else {
      throw new Error('ブラウザ環境ではファイルパスへの保存はサポートされていません');
    }
  }

  /**
   * ブラウザでファイルをダウンロード
   * @param {Blob} blob - ダウンロードするデータ
   * @param {string} fileName - ファイル名
   */
  function downloadFile(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 確認ダイアログを表示
   * @param {string} message - メッセージ
   * @param {string} title - タイトル
   * @param {Object} options - オプション（html: true でHTMLを許可）
   * @returns {Promise<boolean>}
   */
  async function showConfirm(message, title = '確認', options = {}) {
    // Electron環境でもブラウザ環境でもカスタムモーダルを使用
    if (window.MojiQModal && window.MojiQModal.showConfirm) {
      return await MojiQModal.showConfirm(message, title, options);
    } else {
      // フォールバック
      if (isElectron) {
        return await window.electronAPI.showConfirmDialog({
          title: title,
          message: message
        });
      } else {
        return confirm(message);
      }
    }
  }

  /**
   * メッセージダイアログを表示
   * @param {string} message - メッセージ
   * @param {string} title - タイトル
   * @param {string} type - タイプ ('info', 'warning', 'error')
   */
  async function showMessage(message, title = 'MojiQ', type = 'info') {
    if (isElectron) {
      await window.electronAPI.showMessageDialog({
        type: type,
        title: title,
        message: message
      });
    } else {
      // ブラウザ環境ではカスタムモーダルを使用
      if (window.MojiQModal && window.MojiQModal.showAlert) {
        await MojiQModal.showAlert(message, title);
      } else {
        alert(message);
      }
    }
  }

  // ========================================
  // ProGen連携: 校正データJSON受信
  // ========================================
  // ProGen から --calibration-json で渡された JSON ファイルパスを保持。
  // PDF未読込時はダイアログ表示のみ行い、PDF読込完了後に自動でパネルへロード。
  let pendingCalibrationPath = null;
  let pendingCalibrationPollTimer = null;

  function isPdfLoaded() {
    return !!(window.MojiQGlobal && window.MojiQGlobal.pdfLoaded);
  }

  function showAlertSafe(message, title) {
    if (window.MojiQModal && typeof window.MojiQModal.showAlert === 'function') {
      try {
        window.MojiQModal.showAlert(message, title || 'MojiQ');
        return;
      } catch (e) {
        console.warn('[MojiQ Bridge] MojiQModal.showAlert failed:', e);
      }
    }
    alert((title ? title + ': ' : '') + message);
  }

  async function loadCalibrationIntoPanel(filePath) {
    if (!filePath) {
      console.warn('[MojiQ Bridge] loadCalibrationIntoPanel called with empty path');
      return;
    }
    console.log('[MojiQ Bridge] loadCalibrationIntoPanel start:', filePath);

    // 1. ファイル読み込み
    if (!window.electronAPI || typeof window.electronAPI.readCalibrationFile !== 'function') {
      console.error('[MojiQ Bridge] electronAPI.readCalibrationFile is unavailable');
      showAlertSafe('readCalibrationFile が利用できません（preload未公開）', '校正データ読込エラー');
      return;
    }

    let result;
    try {
      result = await window.electronAPI.readCalibrationFile(filePath);
    } catch (e) {
      console.error('[MojiQ Bridge] readCalibrationFile threw:', e);
      showAlertSafe('読込中に例外: ' + (e && e.message ? e.message : String(e)), '校正データ読込エラー');
      return;
    }

    if (!result || !result.success) {
      const errMsg = (result && result.error) ? result.error : 'unknown';
      console.error('[MojiQ Bridge] readCalibrationFile failed:', errMsg, 'path:', filePath);
      showAlertSafe('読込失敗: ' + errMsg + '\nパス: ' + filePath, '校正データ読込エラー');
      return;
    }

    const data = result.data;
    console.log('[MojiQ Bridge] readCalibrationFile success, data keys:', Object.keys(data || {}));

    // 2. フォーマット検証
    if (window.ProofreadingPanel && typeof window.ProofreadingPanel.isValidProofreadingJson === 'function') {
      if (!window.ProofreadingPanel.isValidProofreadingJson(data)) {
        console.error('[MojiQ Bridge] invalid proofreading json:', data);
        showAlertSafe('この形式のJSONは読み込めません。校正チェックデータのJSONを読み込んでください。', 'エラー');
        return;
      }
    }

    // 3. タイトル生成
    const fileName = filePath.replace(/\\/g, '/').split('/').pop().replace(/\.json$/i, '');
    const workName = data.work || '';
    const title = workName ? workName + ' ' + fileName : fileName;
    const jsonData = { title: title, checks: data.checks };

    // 4. Store保存（校正モード有効化）
    if (window.MojiQStore) {
      try {
        window.MojiQStore.set('proofreadingMode.currentData', jsonData);
        window.MojiQStore.set('proofreadingMode.jsonLoaded', true);
        window.MojiQStore.set('proofreadingMode.currentFilePath', filePath);
      } catch (e) {
        console.warn('[MojiQ Bridge] MojiQStore.set failed:', e);
      }
    }

    // 5. CalibrationPanelの校正モードメニュー有効化（あれば）
    if (window.CalibrationPanel && typeof window.CalibrationPanel.closeModal === 'function') {
      try { window.CalibrationPanel.closeModal(); } catch (_) {}
    }

    // 6. ProofreadingPanelへ描画
    if (window.ProofreadingPanel && typeof window.ProofreadingPanel.renderCheckData === 'function') {
      try {
        window.ProofreadingPanel.renderCheckData(jsonData);
        console.log('[MojiQ Bridge] ProofreadingPanel.renderCheckData done');
      } catch (e) {
        console.error('[MojiQ Bridge] renderCheckData failed:', e);
        showAlertSafe('パネル描画失敗: ' + (e && e.message ? e.message : String(e)), '校正データ読込エラー');
        return;
      }
    } else {
      console.warn('[MojiQ Bridge] ProofreadingPanel.renderCheckData unavailable');
    }

    // 7. 成功通知
    const itemCount =
      (data.checks && data.checks.variation && Array.isArray(data.checks.variation.items) ? data.checks.variation.items.length : 0) +
      (data.checks && data.checks.simple && Array.isArray(data.checks.simple.items) ? data.checks.simple.items.length : 0);
    showAlertSafe('校正情報を読み込みました（' + itemCount + '件）', '読み込み完了');
  }

  // PDF読込完了を最大10分間ポーリングで待ち、検出したら校正JSONを適用する。
  // onFileOpenedPath ハンドラ経由（ファイル関連付け起動）でも、
  // ユーザーがメニュー/ボタンから手動でPDFを開いた場合でもカバーする。
  function startPendingCalibrationPolling() {
    if (pendingCalibrationPollTimer) return;
    const startedAt = Date.now();
    pendingCalibrationPollTimer = setInterval(() => {
      if (!pendingCalibrationPath) {
        clearInterval(pendingCalibrationPollTimer);
        pendingCalibrationPollTimer = null;
        return;
      }
      if (isPdfLoaded()) {
        const path = pendingCalibrationPath;
        pendingCalibrationPath = null;
        clearInterval(pendingCalibrationPollTimer);
        pendingCalibrationPollTimer = null;
        setTimeout(() => loadCalibrationIntoPanel(path), 300);
        return;
      }
      // 10分でタイムアウト
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        clearInterval(pendingCalibrationPollTimer);
        pendingCalibrationPollTimer = null;
      }
    }, 500);
  }

  // 同一パスの IPC 重複（main.js の 250ms 再送）を吸収する。
  let lastHandledCalibrationPath = null;
  let lastHandledAt = 0;
  function handleCalibrationJsonReceived(filePath) {
    if (!filePath) return;
    const now = Date.now();
    if (filePath === lastHandledCalibrationPath && (now - lastHandledAt) < 2000) {
      console.log('[MojiQ Bridge] dedup duplicate calibration-json-received:', filePath);
      return;
    }
    lastHandledCalibrationPath = filePath;
    lastHandledAt = now;

    console.log('[MojiQ Bridge] calibration-json-received:', filePath);
    if (isPdfLoaded()) {
      // PDF読込済 → 即座に校正チェックパネルへロード
      loadCalibrationIntoPanel(filePath);
    } else {
      // PDF未読込 → 保留し、ユーザーへPDF読込を促すダイアログを表示
      pendingCalibrationPath = filePath;
      startPendingCalibrationPolling();
      const message = '校正情報を受け取りました。pdfを読み込んで下さい';
      if (window.MojiQModal && typeof window.MojiQModal.showAlert === 'function') {
        window.MojiQModal.showAlert(message, '校正データ受信');
      } else {
        alert(message);
      }
    }
  }

  // ファイル関連付け起動経由でPDFが読み込まれた直後のフック
  function flushPendingCalibrationJson() {
    if (!pendingCalibrationPath) return;
    if (!isPdfLoaded()) return;
    const path = pendingCalibrationPath;
    pendingCalibrationPath = null;
    if (pendingCalibrationPollTimer) {
      clearInterval(pendingCalibrationPollTimer);
      pendingCalibrationPollTimer = null;
    }
    setTimeout(() => loadCalibrationIntoPanel(path), 300);
  }

  /**
   * メニューイベントのリスナーを設定
   */
  function setupMenuListeners() {
    if (!isElectron) return;

    // PDF保存
    window.electronAPI.onMenuSavePdf(() => {
      // 既存の保存ボタンをクリック
      const saveBtn = document.getElementById('save-pdf-btn');
      if (saveBtn) saveBtn.click();
    });

    // 名前を付けて保存
    window.electronAPI.onSavePdfAs(async (data) => {
      if (window.MojiQPdfManager && typeof window.MojiQPdfManager.exportPdfToPath === 'function') {
        await window.MojiQPdfManager.exportPdfToPath(data.path);
      }
    });

    // ファイルを開く（Base64データ経由 - 小さなファイル用、後方互換性）
    window.electronAPI.onFileOpened(async (data) => {
      if (window.MojiQPdfManager && typeof window.MojiQPdfManager.loadPdfFromBase64 === 'function') {
        await window.MojiQPdfManager.loadPdfFromBase64(data.data, data.name);
      }
    });

    // ファイルを開く（ファイルパス経由 - 大きなファイル対応）
    // アプリアイコンへのドラッグ＆ドロップ、ファイル関連付けからの起動時に使用
    // 検版ビューワー連携: data.initialPage で初期ページ番号を受け取る
    window.electronAPI.onFileOpenedPath(async (data) => {
      console.log('[MojiQ Bridge] onFileOpenedPath received:', data);
      console.log('[MojiQ Bridge] initialPage:', data.initialPage);
      if (window.MojiQPdfManager && typeof window.MojiQPdfManager.loadPdfFromPath === 'function') {
        await window.MojiQPdfManager.loadPdfFromPath(data.path, data.name, data.initialPage);
      }
      // ProGen連携: PDF読込後に保留中の校正JSONがあれば自動ロード
      flushPendingCalibrationJson();
    });

    // ProGen連携: 校正データJSONパスを外部から受信
    if (typeof window.electronAPI.onCalibrationJsonReceived === 'function') {
      window.electronAPI.onCalibrationJsonReceived((data) => {
        handleCalibrationJsonReceived(data && data.path);
      });
    }

    // 画像ファイルを開く（ファイルパス経由・単一ファイル）
    // アプリアイコンへのドラッグ＆ドロップ、ファイル関連付けからの起動時に使用
    window.electronAPI.onImageFileOpened(async (data) => {
      if (window.MojiQPdfManager && typeof window.MojiQPdfManager.loadImageFromPath === 'function') {
        await window.MojiQPdfManager.loadImageFromPath(data.path, data.name);
      }
    });

    // 複数画像ファイルを開く（ファイルパス経由・複数ファイル対応）
    // アプリアイコンへの複数ファイルドラッグ＆ドロップ時に使用
    window.electronAPI.onImageFilesOpened(async (data) => {
      if (window.MojiQPdfManager && typeof window.MojiQPdfManager.loadImagesFromPaths === 'function') {
        await window.MojiQPdfManager.loadImagesFromPaths(data.files);
      }
    });

    // Undo
    window.electronAPI.onMenuUndo(() => {
      const undoBtn = document.getElementById('undo-btn');
      if (undoBtn) undoBtn.click();
    });

    // Redo
    window.electronAPI.onMenuRedo(() => {
      const redoBtn = document.getElementById('redo-btn');
      if (redoBtn) redoBtn.click();
    });

    // すべてクリア
    window.electronAPI.onMenuClearAll(() => {
      const clearBtn = document.getElementById('clear-btn');
      if (clearBtn) clearBtn.click();
    });

    // ズーム
    window.electronAPI.onMenuZoomIn(() => {
      if (window.MojiQZoom && typeof window.MojiQZoom.zoomIn === 'function') {
        window.MojiQZoom.zoomIn();
      }
    });

    window.electronAPI.onMenuZoomOut(() => {
      if (window.MojiQZoom && typeof window.MojiQZoom.zoomOut === 'function') {
        window.MojiQZoom.zoomOut();
      }
    });

    window.electronAPI.onMenuZoom100(() => {
      if (window.MojiQZoom && typeof window.MojiQZoom.setZoom === 'function') {
        window.MojiQZoom.setZoom(1.0);
      }
    });

    window.electronAPI.onMenuZoomFit(() => {
      if (window.MojiQZoom && typeof window.MojiQZoom.fitToWindow === 'function') {
        window.MojiQZoom.fitToWindow();
      }
    });
  }

  // DOMContentLoaded後にメニューリスナーを設定
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMenuListeners);
  } else {
    setupMenuListeners();
  }

  // 公開API
  return Object.freeze({
    isElectron: isElectron,
    showOpenPdfDialog: showOpenPdfDialog,
    showOpenImageDialog: showOpenImageDialog,
    readFile: readFile,
    showSavePdfDialog: showSavePdfDialog,
    saveFile: saveFile,
    downloadFile: downloadFile,
    showConfirm: showConfirm,
    showMessage: showMessage
  });
})();

// グローバルにElectron環境かどうかを公開
window.IS_ELECTRON = window.MojiQElectron.isElectron;
