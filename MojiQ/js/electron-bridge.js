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
        title: 'PDFファイルを開く',
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
        title: '画像ファイルを開く',
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
    });

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
