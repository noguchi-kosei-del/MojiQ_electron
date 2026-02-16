const { contextBridge, ipcRenderer } = require('electron');

// レンダラープロセスに安全にAPIを公開
contextBridge.exposeInMainWorld('electronAPI', {
  // Electron環境かどうか
  isElectron: true,

  // ファイル選択ダイアログ
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),

  // ファイル保存ダイアログ
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // ファイル読み込み（JSONファイルやPDF）
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

  // ファイル保存
  saveFile: (filePath, base64Data) => ipcRenderer.invoke('save-file', filePath, base64Data),

  // ディスク容量チェック（QA対策 #50）
  checkDiskSpace: (filePath, requiredBytes) => ipcRenderer.invoke('check-disk-space', filePath, requiredBytes),

  // 確認ダイアログ
  showConfirmDialog: (options) => ipcRenderer.invoke('show-confirm-dialog', options),

  // メッセージダイアログ
  showMessageDialog: (options) => ipcRenderer.invoke('show-message-dialog', options),

  // JSONフォルダのベースパスを取得
  getJsonFolderPath: () => ipcRenderer.invoke('get-json-folder-path'),

  // フォルダ内の一覧を取得（ファイルとサブフォルダ）
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),

  // JSONファイルを直接読み込み
  readJsonFile: (filePath) => ipcRenderer.invoke('read-json-file', filePath),

  // ファイルサイズを取得
  getFileSize: (filePath) => ipcRenderer.invoke('get-file-size', filePath),

  // ファイルをバイナリで読み込み（Base64変換なし、大きなファイル対応）
  readFileBinary: (filePath) => ipcRenderer.invoke('read-file-binary', filePath),

  // ウィンドウにフォーカスを戻す（alert後の対策）
  focusWindow: () => ipcRenderer.invoke('focus-window'),
  // ウィンドウからフォーカスを外す（フォーカスリセット用）
  blurWindow: () => ipcRenderer.invoke('blur-window'),
  // webContentsにフォーカスを送信（画面チラつき防止版）
  focusWebContents: () => ipcRenderer.invoke('focus-webcontents'),
  // setAlwaysOnTopを使ったフォーカスリセット（チラつき防止版）
  resetFocusWithAlwaysOnTop: () => ipcRenderer.invoke('reset-focus-always-on-top'),

  // メニューイベントのリスナー（重複登録防止: 既存リスナーを削除してから登録）
  onMenuSavePdf: (callback) => { ipcRenderer.removeAllListeners('menu-save-pdf'); ipcRenderer.on('menu-save-pdf', callback); },
  onSavePdfAs: (callback) => { ipcRenderer.removeAllListeners('save-pdf-as'); ipcRenderer.on('save-pdf-as', (event, data) => callback(data)); },
  onFileOpened: (callback) => { ipcRenderer.removeAllListeners('file-opened'); ipcRenderer.on('file-opened', (event, data) => callback(data)); },
  onFileOpenedPath: (callback) => { ipcRenderer.removeAllListeners('file-opened-path'); ipcRenderer.on('file-opened-path', (event, data) => callback(data)); },
  onImageFileOpened: (callback) => { ipcRenderer.removeAllListeners('image-file-opened'); ipcRenderer.on('image-file-opened', (event, data) => callback(data)); },
  onImageFilesOpened: (callback) => { ipcRenderer.removeAllListeners('image-files-opened'); ipcRenderer.on('image-files-opened', (event, data) => callback(data)); },
  onMenuUndo: (callback) => { ipcRenderer.removeAllListeners('menu-undo'); ipcRenderer.on('menu-undo', callback); },
  onMenuRedo: (callback) => { ipcRenderer.removeAllListeners('menu-redo'); ipcRenderer.on('menu-redo', callback); },
  onMenuClearAll: (callback) => { ipcRenderer.removeAllListeners('menu-clear-all'); ipcRenderer.on('menu-clear-all', callback); },
  onMenuZoomIn: (callback) => { ipcRenderer.removeAllListeners('menu-zoom-in'); ipcRenderer.on('menu-zoom-in', callback); },
  onMenuZoomOut: (callback) => { ipcRenderer.removeAllListeners('menu-zoom-out'); ipcRenderer.on('menu-zoom-out', callback); },
  onMenuZoom100: (callback) => { ipcRenderer.removeAllListeners('menu-zoom-100'); ipcRenderer.on('menu-zoom-100', callback); },
  onMenuZoomFit: (callback) => { ipcRenderer.removeAllListeners('menu-zoom-fit'); ipcRenderer.on('menu-zoom-fit', callback); },

  // 終了確認用
  onCheckUnsavedChanges: (callback) => { ipcRenderer.removeAllListeners('check-unsaved-changes'); ipcRenderer.on('check-unsaved-changes', callback); },
  respondUnsavedChanges: (hasChanges) => ipcRenderer.send('respond-unsaved-changes', hasChanges),
  onSaveAndQuit: (callback) => { ipcRenderer.removeAllListeners('save-and-quit'); ipcRenderer.on('save-and-quit', callback); },
  saveCompletedQuit: () => ipcRenderer.send('save-completed-quit'),

  // ダークモード設定（ネイティブUIテーマ）
  setNativeTheme: (isDark) => ipcRenderer.invoke('set-native-theme', isDark),
  getNativeTheme: () => ipcRenderer.invoke('get-native-theme'),

  // QA対策 #49: DPI変更イベントリスナー
  onDpiChanged: (callback) => { ipcRenderer.removeAllListeners('dpi-changed'); ipcRenderer.on('dpi-changed', (event, data) => callback(data)); },

  // ウィンドウ操作（カスタムタイトルバー用）
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // 開発者ツール
  toggleDevTools: () => ipcRenderer.send('toggle-devtools'),

  // 印刷機能
  printPdf: (pdfBase64Data) => ipcRenderer.invoke('print-pdf', pdfBase64Data),

  // 直接印刷機能（pdf-to-printer）
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printPdfDirect: (options) => ipcRenderer.invoke('print-pdf-direct', options),
  printPdfWithDialog: (pdfBase64Data) => ipcRenderer.invoke('print-pdf-with-dialog', pdfBase64Data),

  // 校正チェックデータ読み込み
  getCalibrationBasePath: () => ipcRenderer.invoke('get-calibration-base-path'),
  listCalibrationDirectory: (dirPath) => ipcRenderer.invoke('list-calibration-directory', dirPath),
  readCalibrationFile: (filePath) => ipcRenderer.invoke('read-calibration-file', filePath)
});
