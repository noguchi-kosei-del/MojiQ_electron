const { contextBridge, ipcRenderer } = require('electron');

function detectPackagedRuntime() {
  if (process.argv.includes('--mojiq-packaged=1')) return true;
  if (process.argv.includes('--mojiq-packaged=0')) return false;

  try {
    const info = ipcRenderer.sendSync('get-runtime-security-info-sync');
    return info && info.isPackagedRuntime === true;
  } catch (error) {
    return true;
  }
}

const isPackagedRuntime = detectPackagedRuntime();
const isCspDebugEnabled = !isPackagedRuntime && process.argv.includes('--mojiq-csp-debug=1');
const cspViolations = [];

if (isCspDebugEnabled) {
  window.addEventListener('securitypolicyviolation', (event) => {
    const violation = {
      directive: event.violatedDirective,
      blockedURI: event.blockedURI,
      effectiveDirective: event.effectiveDirective,
      originalPolicy: event.originalPolicy,
      timestamp: Date.now()
    };

    cspViolations.push(violation);
    if (cspViolations.length > 50) cspViolations.shift();
    console.warn('[MojiQ Security] CSP violation blocked', violation);
  }, true);
}

function registerDroppedFiles(event) {
  const files = Array.from(event.dataTransfer?.files || []);
  const filePaths = files
    .map((file) => file.path)
    .filter((filePath) => typeof filePath === 'string' && filePath.length > 0);

  if (filePaths.length > 0) {
    ipcRenderer.invoke('register-dropped-files', filePaths).catch(() => {});
  }
}

window.addEventListener('drop', registerDroppedFiles, true);

// レンダラープロセスに安全にAPIを公開
contextBridge.exposeInMainWorld('electronAPI', {
  // Electron環境かどうか
  isElectron: true,
  ...(isCspDebugEnabled ? { getCspViolations: () => cspViolations.slice() } : {}),

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

  // ファイルの存在確認
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),

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
  onShowCloseConfirm: (callback) => { ipcRenderer.removeAllListeners('show-close-confirm'); ipcRenderer.on('show-close-confirm', callback); },
  sendCloseAction: (action) => ipcRenderer.send('close-action', action),
  onShowUpdateAvailable: (callback) => { ipcRenderer.removeAllListeners('show-update-available'); ipcRenderer.on('show-update-available', (event, data) => callback(data)); },
  sendUpdateAction: (action) => ipcRenderer.send('update-action', action),
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
  readCalibrationFile: (filePath) => ipcRenderer.invoke('read-calibration-file', filePath),

  // ProGen連携: 校正データJSONパスを外部から受信
  onCalibrationJsonReceived: (callback) => {
    ipcRenderer.removeAllListeners('calibration-json-received');
    ipcRenderer.on('calibration-json-received', (event, data) => callback(data));
  }
});
