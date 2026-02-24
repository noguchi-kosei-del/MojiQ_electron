const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme, screen } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// pdf-to-printerモジュール（遅延読み込み）
let ptp = null;
function getPrinterModule() {
  if (!ptp) {
    ptp = require('pdf-to-printer');
  }
  return ptp;
}

let mainWindow;
let splashWindow;
let forceQuit = false;
let filesToOpen = []; // 起動時に開くファイルのパス（複数対応）
let initialPageNumber = null; // 起動時に開くページ番号（検版ビューワー連携用）

// シングルインスタンスロック（複数起動を防止し、second-instanceイベントを有効にする）
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// JSONフォルダのベースパス
const JSON_FOLDER_BASE_PATH = 'G:\\共有ドライブ\\CLLENN\\編集部フォルダ\\編集企画部\\編集企画_C班(AT業務推進)\\DTP制作部\\JSONフォルダ';

// 写植・校正用テキストログフォルダのベースパス（校正チェックデータ読み込み用）
const TXT_FOLDER_BASE_PATH = 'G:\\共有ドライブ\\CLLENN\\編集部フォルダ\\編集企画部\\写植・校正用テキストログ';

// 更新ファイル配置フォルダ
const UPDATE_FOLDER = 'G:\\共有ドライブ\\CLLENN\\編集部フォルダ\\編集企画部\\編集企画_C班(AT業務推進)\\DTP制作部\\App_installer';

// ファイルパス検証（パストラバーサル防止）
// QA対策 #8, #9: 特殊文字・長いパスの検証
function isPathSafe(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;

  // 空白やnull文字を含むパスは拒否
  if (filePath.includes('\0')) return false;

  // QA対策 #9: Windowsの従来のパス長制限（260文字）をチェック
  // 長すぎるパスは多くのWindowsアプリで問題を起こす
  if (process.platform === 'win32' && filePath.length > 260) {
    console.warn('[MojiQ] パスが長すぎます（260文字超）:', filePath.length);
    // ただし、拒否はせずに警告のみ（Windows 10以降は長いパスをサポート）
  }

  // パスを正規化して解決
  const normalized = path.normalize(filePath);
  const resolved = path.resolve(filePath);

  // 正規化後に .. が含まれる場合は拒否（親ディレクトリへのトラバーサル防止）
  if (normalized.includes('..')) return false;

  // Windows: UNCパスやデバイスパスの追加チェック
  if (process.platform === 'win32') {
    // \\?\や\\.\などのデバイスパスプレフィックスを拒否
    if (/^\\\\[?.]\\/.test(filePath)) return false;
    // CON, PRN, AUX, NUL などの予約デバイス名を拒否
    const baseName = path.basename(filePath).toUpperCase().split('.')[0];
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    if (reservedNames.includes(baseName)) return false;

    // QA対策 #8: Windowsで禁止されている文字をチェック
    // ファイル名に使えない文字: < > : " / \ | ? *
    const fileName = path.basename(filePath);
    if (/[<>:"|?*]/.test(fileName)) {
      console.warn('[MojiQ] ファイル名に禁止文字が含まれています:', fileName);
      return false;
    }
  }

  return true;
}

// JSONフォルダ内のパスかどうかを検証
function isPathInJsonFolder(filePath) {
  if (!isPathSafe(filePath)) return false;

  const resolved = path.resolve(filePath);
  const jsonFolderResolved = path.resolve(JSON_FOLDER_BASE_PATH);

  // JSONフォルダ内のパスかチェック（大文字小文字を区別しない - Windows対応）
  const normalizedPath = resolved.toLowerCase();
  const normalizedBase = jsonFolderResolved.toLowerCase();

  return normalizedPath.startsWith(normalizedBase + path.sep) || normalizedPath === normalizedBase;
}

// 写植・校正用テキストログフォルダ内のパスかどうかを検証
function isPathInTxtFolder(filePath) {
  if (!isPathSafe(filePath)) return false;

  const resolved = path.resolve(filePath);
  const txtFolderResolved = path.resolve(TXT_FOLDER_BASE_PATH);

  const normalizedPath = resolved.toLowerCase();
  const normalizedBase = txtFolderResolved.toLowerCase();

  return normalizedPath.startsWith(normalizedBase + path.sep) || normalizedPath === normalizedBase;
}

// ========================================
// QA対策 #46-49: ウィンドウ位置・サイズ検証
// ========================================

/**
 * ウィンドウが画面内に収まるよう位置を調整
 * マルチモニター環境でウィンドウが見えない位置に配置されることを防止
 * @param {Object} bounds - { x, y, width, height }
 * @returns {Object} 調整後の bounds
 */
function ensureWindowBoundsVisible(bounds) {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  // ウィンドウの中心点
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  // いずれかのディスプレイに中心点があるかチェック
  let isVisible = displays.some(display => {
    const { x, y, width, height } = display.bounds;
    return centerX >= x && centerX <= x + width &&
           centerY >= y && centerY <= y + height;
  });

  if (!isVisible) {
    // 見えない位置の場合、プライマリディスプレイの中央に配置
    console.log('[MojiQ] ウィンドウが見えない位置にあるため、プライマリディスプレイに移動します');
    const { width, height } = primaryDisplay.workArea;
    bounds.x = Math.round((width - bounds.width) / 2) + primaryDisplay.workArea.x;
    bounds.y = Math.round((height - bounds.height) / 2) + primaryDisplay.workArea.y;
  }

  return bounds;
}

/**
 * 画面サイズに対してウィンドウサイズを調整
 * @param {number} requestedWidth
 * @param {number} requestedHeight
 * @returns {Object} { width, height }
 */
function adjustWindowSizeToScreen(requestedWidth, requestedHeight) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;

  // 画面の90%を超えないように調整
  const maxWidth = Math.floor(screenWidth * 0.9);
  const maxHeight = Math.floor(screenHeight * 0.9);

  return {
    width: Math.min(requestedWidth, maxWidth),
    height: Math.min(requestedHeight, maxHeight)
  };
}

// ========================================
// アップデートチェック機能
// ========================================

// バージョン比較（v1 > v2 なら 1、v1 < v2 なら -1、同じなら 0）
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

// ファイル名からバージョン番号を抽出（MojiQ Setup 2.0.0.exe → 2.0.0）
function extractVersionFromFilename(filename) {
  const patterns = [
    /Setup\s+(\d+\.\d+\.\d+)\.exe$/i,
    /[_-](\d+\.\d+\.\d+)\.exe$/i,
    /\s(\d+\.\d+\.\d+)\.exe$/i
  ];
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// 起動時に更新をチェック
async function checkForUpdates() {
  const currentVersion = app.getVersion();
  console.log('[MojiQ] 現在のバージョン:', currentVersion);

  // フォルダ存在確認
  if (!fs.existsSync(UPDATE_FOLDER)) {
    console.log('[MojiQ] 更新フォルダが見つかりません:', UPDATE_FOLDER);
    return;
  }

  // フォルダ内のファイル一覧取得
  let files;
  try {
    files = fs.readdirSync(UPDATE_FOLDER);
  } catch (err) {
    console.error('[MojiQ] 更新フォルダの読み込みエラー:', err);
    return;
  }

  // MojiQのインストーラーのみフィルタ
  const installers = files.filter(f =>
    f.toLowerCase().startsWith('mojiq') && f.endsWith('.exe')
  );

  // 最新バージョンを検索
  let latestVersion = currentVersion;
  let latestInstaller = null;

  for (const installer of installers) {
    const version = extractVersionFromFilename(installer);
    if (version && compareVersions(version, latestVersion) > 0) {
      latestVersion = version;
      latestInstaller = installer;
    }
  }

  // 新バージョンが見つかった場合
  if (latestInstaller) {
    console.log('[MojiQ] 新バージョンが見つかりました:', latestVersion, latestInstaller);
    const installerPath = path.join(UPDATE_FOLDER, latestInstaller);

    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'アップデートのお知らせ',
      message: '新しいバージョンが見つかりました',
      detail: `現在のバージョン: v${currentVersion}\n最新バージョン: v${latestVersion}\n\nアップデートを開始しますか？`,
      buttons: ['今すぐ更新', '後で'],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      // インストーラーを起動してアプリ終了
      const child = spawn(installerPath, [], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      app.quit();
    }
  } else {
    console.log('[MojiQ] 更新はありません（最新バージョンです）');
  }
}

// スプラッシュウィンドウを作成
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    center: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'splash-preload.js')
    },
    icon: path.join(__dirname, '..', 'logo', 'MojiQ_icon.ico')
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

// 進捗を更新
function updateSplashProgress(progress) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-progress', progress);
  }
}

function createWindow() {
  // QA対策 #46: 画面サイズに応じてウィンドウサイズを調整
  const { width: adjustedWidth, height: adjustedHeight } = adjustWindowSizeToScreen(1400, 900);

  mainWindow = new BrowserWindow({
    width: adjustedWidth,
    height: adjustedHeight,
    minWidth: 1100, // 最小幅（これ以下に縮めるとレイアウトが崩れるため）
    minHeight: 600, // QA対策 #46: 最小高さを追加
    frame: false, // ネイティブフレームを非表示（カスタムメニューバー用）
    titleBarStyle: 'hidden', // タイトルバーを非表示
    show: false, // 最初は非表示（スプラッシュ表示中）
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, '..', 'logo', 'MojiQ_icon.ico')
  });

  // QA対策 #48: マルチモニター環境でウィンドウが見える位置にあることを確認
  const bounds = mainWindow.getBounds();
  const adjustedBounds = ensureWindowBoundsVisible(bounds);
  if (bounds.x !== adjustedBounds.x || bounds.y !== adjustedBounds.y) {
    mainWindow.setBounds(adjustedBounds);
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  // デバッグモード: DevToolsを自動で開く
  if (process.env.MOJIQ_DEBUG === '1') {
    mainWindow.webContents.openDevTools();
  }

  // 新しいウィンドウを開く際の設定（window.openで開くウィンドウにアイコンとpreloadを設定）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        icon: path.join(__dirname, '..', 'logo', 'MojiQ_icon.ico'),
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          nodeIntegration: false,
          contextIsolation: true
        }
      }
    };
  });

  // デバッグモード: 新しいウィンドウでもDevToolsを開く
  mainWindow.webContents.on('did-create-window', (childWindow) => {
    if (process.env.MOJIQ_DEBUG === '1') {
      childWindow.webContents.openDevTools();
    }
  });

  // ウィンドウ終了時の確認
  mainWindow.on('close', (e) => {
    if (forceQuit) return;

    e.preventDefault();
    mainWindow.webContents.send('check-unsaved-changes');
  });

  // QA対策 #48: ディスプレイ切断時にウィンドウが見える位置に移動
  screen.on('display-removed', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const currentBounds = mainWindow.getBounds();
      const adjustedBounds = ensureWindowBoundsVisible(currentBounds);
      if (currentBounds.x !== adjustedBounds.x || currentBounds.y !== adjustedBounds.y) {
        console.log('[MojiQ] ディスプレイ切断を検知、ウィンドウを再配置します');
        mainWindow.setBounds(adjustedBounds);
      }
    }
  });

  // QA対策 #49: DPI変更をレンダラーに通知
  screen.on('display-metrics-changed', (event, display, changedMetrics) => {
    if (changedMetrics.includes('scaleFactor') && mainWindow && !mainWindow.isDestroyed()) {
      console.log('[MojiQ] DPI変更を検知:', display.scaleFactor);
      mainWindow.webContents.send('dpi-changed', { scaleFactor: display.scaleFactor });
    }
  });

  // ネイティブメニューを非表示にする（カスタムメニューバーを使用）
  Menu.setApplicationMenu(null);
}

function createMenuTemplate() {
  return [
    {
      label: 'ファイル',
      submenu: [
        {
          label: 'PDFを開く',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'PDFファイルを開く',
              filters: [{ name: 'PDFファイル', extensions: ['pdf'] }],
              properties: ['openFile']
            });
            if (!result.canceled && result.filePaths.length > 0) {
              const filePath = result.filePaths[0];
              const data = fs.readFileSync(filePath);
              const base64 = data.toString('base64');
              const fileName = path.basename(filePath);
              mainWindow.webContents.send('file-opened', { data: base64, name: fileName });
            }
          }
        },
        {
          label: 'PDFを保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu-save-pdf')
        },
        {
          label: '名前を付けて保存',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              title: 'PDFを保存',
              filters: [{ name: 'PDFファイル', extensions: ['pdf'] }]
            });
            if (!result.canceled && result.filePath) {
              mainWindow.webContents.send('save-pdf-as', { path: result.filePath });
            }
          }
        },
        { type: 'separator' },
        { role: 'quit', label: '終了', accelerator: 'CmdOrCtrl+Q' }
      ]
    },
    {
      label: '編集',
      submenu: [
        {
          label: '元に戻す',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow.webContents.send('menu-undo')
        },
        {
          label: 'やり直し',
          accelerator: 'CmdOrCtrl+Y',
          click: () => mainWindow.webContents.send('menu-redo')
        },
        { type: 'separator' },
        {
          label: 'すべてクリア',
          click: () => mainWindow.webContents.send('menu-clear-all')
        }
      ]
    },
    {
      label: '表示',
      submenu: [
        {
          label: '拡大',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => mainWindow.webContents.send('menu-zoom-in')
        },
        {
          label: '縮小',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow.webContents.send('menu-zoom-out')
        },
        {
          label: '100%',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow.webContents.send('menu-zoom-100')
        },
        {
          label: 'ウィンドウに合わせる',
          click: () => mainWindow.webContents.send('menu-zoom-fit')
        },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '開発者ツール' }
      ]
    }
  ];
}

// IPC ハンドラ

// ファイル選択ダイアログ
ipcMain.handle('show-open-dialog', async (event, options) => {
  return await dialog.showOpenDialog(mainWindow, options);
});

// ファイル保存ダイアログ
ipcMain.handle('show-save-dialog', async (event, options) => {
  return await dialog.showSaveDialog(mainWindow, options);
});

// ファイル読み込み
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    if (!isPathSafe(filePath)) {
      return { success: false, error: '不正なファイルパスです' };
    }
    const data = fs.readFileSync(filePath);
    // JSONファイルの場合はテキストとして返す
    if (filePath.toLowerCase().endsWith('.json')) {
      return { success: true, data: data.toString('utf-8') };
    }
    // その他のファイルはbase64で返す
    return { success: true, data: data.toString('base64') };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ファイル保存（アトミック書き込み: 一時ファイルに書いてからリネーム）
// QA対策 #10: 読み取り専用ファイル判定
ipcMain.handle('save-file', async (event, filePath, base64Data) => {
  if (!isPathSafe(filePath)) {
    return { success: false, error: '不正なファイルパスです', errorCode: 'INVALID_PATH' };
  }

  // 書き込み権限チェック（QA対策 #10）
  try {
    if (fs.existsSync(filePath)) {
      fs.accessSync(filePath, fs.constants.W_OK);
    }
    const dirPath = path.dirname(filePath);
    fs.accessSync(dirPath, fs.constants.W_OK);
  } catch (accessError) {
    if (accessError.code === 'EACCES' || accessError.code === 'EPERM') {
      return {
        success: false,
        error: 'ファイルが読み取り専用です。別の場所に保存してください。',
        errorCode: 'READONLY'
      };
    }
    if (accessError.code === 'ENOENT') {
      return {
        success: false,
        error: '保存先のフォルダが存在しません。',
        errorCode: 'NO_DIRECTORY'
      };
    }
  }

  const tempFilePath = filePath + '.tmp.' + Date.now();
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(tempFilePath, buffer);
    // アトミックにリネーム（書き込み中のクラッシュでも元ファイルを破損しない）
    fs.renameSync(tempFilePath, filePath);
    return { success: true };
  } catch (error) {
    // 一時ファイルが残っている場合は削除
    try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) { /* ignore */ }

    // エラーコードに基づく詳細メッセージ（QA対策 #10）
    let errorMessage = error.message;
    let errorCode = error.code || 'UNKNOWN';

    switch (error.code) {
      case 'EACCES':
      case 'EPERM':
        errorMessage = 'ファイルが読み取り専用です。別の場所に保存してください。';
        errorCode = 'READONLY';
        break;
      case 'ENOSPC':
        errorMessage = 'ディスク容量が不足しています。';
        errorCode = 'NO_SPACE';
        break;
      case 'EBUSY':
        errorMessage = 'ファイルが他のアプリケーションで使用中です。';
        errorCode = 'FILE_BUSY';
        break;
    }

    return { success: false, error: errorMessage, errorCode: errorCode };
  }
});

// ディスク容量チェック（QA対策 #50）
ipcMain.handle('check-disk-space', async (event, filePath, requiredBytes) => {
  try {
    if (process.platform === 'win32') {
      const drive = path.parse(filePath).root.charAt(0).toUpperCase();
      // BUG-004修正: コマンドインジェクション対策 - ドライブレターの検証
      if (!/^[A-Z]$/.test(drive)) {
        console.warn('無効なドライブレター:', drive);
        return { success: true, isEnough: true };
      }
      const { execSync } = require('child_process');
      const result = execSync(
        `wmic logicaldisk where "DeviceID='${drive}:'" get FreeSpace`,
        { encoding: 'utf8', timeout: 5000 }
      );
      const lines = result.trim().split('\n');
      if (lines.length >= 2) {
        const freeSpace = parseInt(lines[1].trim(), 10);
        // 必要容量の1.5倍のマージンを確保
        const requiredWithMargin = requiredBytes * 1.5;
        return {
          success: true,
          freeSpace: freeSpace,
          isEnough: freeSpace > requiredWithMargin
        };
      }
    }
    // 非Windows環境またはコマンド失敗時はチェックをスキップ
    return { success: true, isEnough: true };
  } catch (error) {
    // エラー時はチェックせずに続行（保存処理でエラーになる）
    console.warn('ディスク容量チェックに失敗:', error.message);
    return { success: true, isEnough: true };
  }
});

// 印刷用PDFをシステムビューアで開く
ipcMain.handle('print-pdf', async (event, pdfBase64Data) => {
  try {
    const { shell } = require('electron');
    const tempDir = app.getPath('temp');
    const tempFilePath = path.join(tempDir, `mojiq-print-${Date.now()}.pdf`);

    const buffer = Buffer.from(pdfBase64Data, 'base64');
    fs.writeFileSync(tempFilePath, buffer);

    // システムのデフォルトPDFビューアで開く
    await shell.openPath(tempFilePath);

    // 60秒後に一時ファイルを削除
    setTimeout(() => {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (e) {
        console.warn('一時ファイル削除失敗:', e);
      }
    }, 60000);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// プリンター一覧を取得
ipcMain.handle('get-printers', async () => {
  try {
    const printerModule = getPrinterModule();
    const printers = await printerModule.getPrinters();
    const defaultPrinter = await printerModule.getDefaultPrinter();
    return { success: true, printers, defaultPrinter };
  } catch (error) {
    console.error('get-printers error:', error);
    return { success: false, error: error.message || String(error) };
  }
});

// 直接印刷（プリンター指定）- spawn使用で日本語プリンター名に対応
ipcMain.handle('print-pdf-direct', async (event, options) => {
  const { pdfBase64Data, printerName, copies, pageRanges } = options;
  const tempDir = app.getPath('temp');
  const tempFilePath = path.join(tempDir, `mojiq-print-${Date.now()}.pdf`);

  try {
    const buffer = Buffer.from(pdfBase64Data, 'base64');
    fs.writeFileSync(tempFilePath, buffer);

    // SumatraPDFのパスを取得
    let sumatraPath = path.join(
      __dirname, '..', 'node_modules', 'pdf-to-printer', 'dist', 'SumatraPDF-3.4.6-32.exe'
    );

    // app.asarの場合はunpackedパスに変換
    if (sumatraPath.includes('app.asar')) {
      sumatraPath = sumatraPath.replace('app.asar', 'app.asar.unpacked');
    }

    // 引数を配列で構築（spawn用）
    const args = [];
    if (printerName) {
      args.push('-print-to', printerName);
    } else {
      args.push('-print-to-default');
    }
    args.push('-silent');

    // 印刷設定
    const printSettings = [];
    if (pageRanges) printSettings.push(pageRanges);
    if (copies && copies > 1) printSettings.push(`${copies}x`);
    if (printSettings.length > 0) {
      args.push('-print-settings', printSettings.join(','));
    }

    args.push(tempFilePath);

    // spawnを使用（引数が個別に渡されるためエンコーディング問題を回避）
    const { spawn } = require('child_process');

    return new Promise((resolve) => {
      const proc = spawn(sumatraPath, args, {
        windowsHide: true,
        stdio: 'ignore'
      });

      proc.on('close', (code) => {
        // 30秒後に一時ファイル削除
        setTimeout(() => {
          try {
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          } catch (e) {
            console.warn('一時ファイル削除失敗:', e);
          }
        }, 30000);

        if (code === 0 || code === null) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: `印刷プロセスがコード ${code} で終了しました` });
        }
      });

      proc.on('error', (err) => {
        console.error('print-pdf-direct spawn error:', err);
        resolve({ success: false, error: err.message });
      });
    });
  } catch (error) {
    console.error('print-pdf-direct error:', error);
    return { success: false, error: error.message || String(error) };
  }
});

// システム印刷ダイアログで印刷（spawn版：ダイアログ終了まで待機）
ipcMain.handle('print-pdf-with-dialog', async (event, pdfBase64Data) => {
  const tempDir = app.getPath('temp');
  const tempFilePath = path.join(tempDir, `mojiq-print-${Date.now()}.pdf`);

  try {
    const buffer = Buffer.from(pdfBase64Data, 'base64');
    fs.writeFileSync(tempFilePath, buffer);

    // SumatraPDFのパスを取得
    let sumatraPath = path.join(
      __dirname, '..', 'node_modules', 'pdf-to-printer', 'dist', 'SumatraPDF-3.4.6-32.exe'
    );

    // app.asarの場合はunpackedパスに変換
    if (sumatraPath.includes('app.asar')) {
      sumatraPath = sumatraPath.replace('app.asar', 'app.asar.unpacked');
    }

    // 印刷ダイアログを表示するための引数
    const args = ['-print-dialog', tempFilePath];

    const { spawn } = require('child_process');

    return new Promise((resolve) => {
      const proc = spawn(sumatraPath, args, {
        windowsHide: false,  // ダイアログを表示するため
        stdio: 'ignore'
      });

      proc.on('close', (code) => {
        // 60秒後に一時ファイル削除
        setTimeout(() => {
          try {
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          } catch (e) {
            console.warn('一時ファイル削除失敗:', e);
          }
        }, 60000);

        // SumatraPDFはダイアログ終了後にプロセスが終了する
        resolve({ success: true });
      });

      proc.on('error', (err) => {
        console.error('print-pdf-with-dialog spawn error:', err);
        resolve({ success: false, error: err.message });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 確認ダイアログ
ipcMain.handle('show-confirm-dialog', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['はい', 'いいえ'],
    defaultId: 0,
    title: options.title || '確認',
    message: options.message
  });
  return result.response === 0;
});

// メッセージダイアログ
ipcMain.handle('show-message-dialog', async (event, options) => {
  await dialog.showMessageBox(mainWindow, {
    type: options.type || 'info',
    title: options.title || 'MojiQ',
    message: options.message
  });
});

// JSONフォルダのベースパスを取得
ipcMain.handle('get-json-folder-path', () => {
  return JSON_FOLDER_BASE_PATH;
});

// フォルダ内の一覧を取得（ファイルとサブフォルダ）
ipcMain.handle('list-directory', async (event, dirPath) => {
  try {
    const targetPath = dirPath || JSON_FOLDER_BASE_PATH;

    // パストラバーサル防止: JSONフォルダ内のパスかチェック
    if (!isPathInJsonFolder(targetPath)) {
      return { success: false, error: 'アクセスが許可されていないパスです' };
    }

    const items = fs.readdirSync(targetPath, { withFileTypes: true });

    const result = items.map(item => ({
      name: item.name,
      path: path.join(targetPath, item.name),
      isDirectory: item.isDirectory(),
      isFile: item.isFile()
    }));

    return { success: true, items: result, currentPath: targetPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ファイルサイズを取得
ipcMain.handle('get-file-size', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return { success: true, size: stats.size };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ファイルをバイナリで読み込み（Base64変換なし、大きなファイル対応）
// ElectronのIPCはArrayBufferを直接シリアライズ可能
ipcMain.handle('read-file-binary', async (event, filePath) => {
  try {
    // BUG-011修正: パストラバーサル対策 - パスの安全性チェック
    if (!isPathSafe(filePath)) {
      return { success: false, error: '不正なファイルパスです' };
    }
    const data = fs.readFileSync(filePath);
    // BufferをUint8Arrayとして返す（IPCで直接転送可能）
    return { success: true, data: new Uint8Array(data) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// JSONファイルを直接読み込み（パス指定）
ipcMain.handle('read-json-file', async (event, filePath) => {
  try {
    // パストラバーサル防止: JSONフォルダ内のパスかチェック
    if (!isPathInJsonFolder(filePath)) {
      return { success: false, error: 'アクセスが許可されていないパスです' };
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data: JSON.parse(data), rawData: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ウィンドウにフォーカスを戻す（alert後の対策）
ipcMain.handle('focus-window', async () => {
  if (mainWindow) {
    mainWindow.focus();
    // webContentsにもフォーカスを送る
    mainWindow.webContents.focus();
    return { success: true };
  }
  return { success: false };
});

// ウィンドウからフォーカスを外す（フォーカスリセット用）
ipcMain.handle('blur-window', async () => {
  if (mainWindow) {
    mainWindow.blur();
    return { success: true };
  }
  return { success: false };
});

// webContentsにフォーカスを送信（画面チラつき防止版）
ipcMain.handle('focus-webcontents', async () => {
  if (mainWindow) {
    // ウィンドウのblur/focusは行わず、webContentsのみにフォーカスを送信
    mainWindow.webContents.focus();
    return { success: true };
  }
  return { success: false };
});

// setAlwaysOnTopを使ったフォーカスリセット（チラつき防止版）
ipcMain.handle('reset-focus-always-on-top', async () => {
  if (mainWindow) {
    // moveTopでウィンドウを最前面に移動（視覚的な変化なし）
    mainWindow.moveTop();
    // フォーカスを強制的に取得
    mainWindow.focus();
    // webContentsにフォーカスを送信
    mainWindow.webContents.focus();
    // JavaScriptでフォーカスイベントを発火させる
    mainWindow.webContents.executeJavaScript('window.dispatchEvent(new FocusEvent("focus"));');
    return { success: true };
  }
  return { success: false };
});

// ダークモード設定
ipcMain.handle('set-native-theme', (event, isDark) => {
  nativeTheme.themeSource = isDark ? 'dark' : 'light';
  return { success: true };
});

// 現在のネイティブテーマを取得
ipcMain.handle('get-native-theme', () => {
  return nativeTheme.shouldUseDarkColors;
});

// ウィンドウ操作（最小化、最大化、閉じる）
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// 開発者ツールの切り替え
ipcMain.on('toggle-devtools', () => {
  if (mainWindow) mainWindow.webContents.toggleDevTools();
});

// ウィンドウの最大化状態を取得
ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// レンダラーからの未保存確認応答を受け取る
let isCloseDialogShowing = false;
ipcMain.on('respond-unsaved-changes', async (event, hasChanges) => {
  // 競合防止: ダイアログ表示中は無視
  if (isCloseDialogShowing) return;

  if (hasChanges) {
    isCloseDialogShowing = true;
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['保存して終了する', '終了する', 'キャンセル'],
        defaultId: 0,
        cancelId: 2,
        title: '終了確認',
        message: '描画内容が保存されていません。保存しますか？'
      });
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (result.response === 0) {
        // 「保存する」が選択された場合、保存処理を実行してから終了
        mainWindow.webContents.send('save-and-quit');
      } else if (result.response === 1) {
        // 「終了する」が選択された場合、保存せずに終了
        forceQuit = true;
        mainWindow.close();
      }
      // result.response === 2 は「キャンセル」なので何もしない
    } finally {
      isCloseDialogShowing = false;
    }
  } else {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    forceQuit = true;
    mainWindow.close();
  }
});

// 保存完了後に終了
ipcMain.on('save-completed-quit', () => {
  forceQuit = true;
  if (mainWindow) mainWindow.close();
});

// 対応するファイル拡張子かどうかを判定
function isSupportedFile(filePath) {
  const ext = filePath.toLowerCase();
  return ext.endsWith('.pdf') || ext.endsWith('.jpg') || ext.endsWith('.jpeg');
}

// 画像ファイルかどうかを判定
function isImageFile(filePath) {
  const ext = filePath.toLowerCase();
  return ext.endsWith('.jpg') || ext.endsWith('.jpeg');
}

// コマンドライン引数からファイルパスとページ番号を取得（Windows用・複数ファイル対応）
// 検版ビューワー連携: --page オプションで初期ページ番号を指定可能
function getFilesFromArgs(args) {
  console.log('[MojiQ] getFilesFromArgs called with:', args);
  const files = [];
  let pageNum = null;
  let hasPageFlag = false;

  // 最初の引数はアプリ自体のパス、2番目以降がファイルパス
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    console.log(`[MojiQ] arg[${i}]:`, arg);

    // --page オプションの検出
    if (arg === '--page') {
      hasPageFlag = true;
      console.log('[MojiQ] Found --page flag');
      // 次の引数が数値ならページ番号として取得
      if (i + 1 < args.length) {
        const nextArg = args[i + 1];
        const parsed = parseInt(nextArg, 10);
        if (!isNaN(parsed) && parsed > 0) {
          pageNum = parsed;
          console.log('[MojiQ] Parsed pageNum from next arg:', pageNum);
          i++; // 次の引数をスキップ
        }
      }
      continue;
    }

    // オプション引数（-で始まる）は除外
    if (arg.startsWith('-')) {
      continue;
    }

    // 数値のみの引数で、--pageフラグがあり、まだページ番号が取得できていない場合
    const numericArg = parseInt(arg, 10);
    if (hasPageFlag && pageNum === null && !isNaN(numericArg) && numericArg > 0 && arg === String(numericArg)) {
      pageNum = numericArg;
      console.log('[MojiQ] Parsed pageNum from standalone arg:', pageNum);
      continue;
    }

    // サポートされているファイル
    if (isSupportedFile(arg)) {
      files.push(arg);
    }
  }

  console.log('[MojiQ] getFilesFromArgs result:', { files, pageNum });
  return { files, pageNum };
}

// ファイルを開く処理（複数ファイル対応）
// 大きなファイル対応: Base64変換せず、ファイルパスのみをレンダラーに送信
// レンダラー側でストリーミング読み込み＆圧縮処理を行う
// pageNum: 検版ビューワー連携用の初期ページ番号
function openFilesInApp(filePaths, pageNum = null) {
  console.log('[MojiQ] openFilesInApp called with pageNum:', pageNum);
  if (!filePaths || filePaths.length === 0) return;

  // 対応ファイルのみフィルタ
  const supportedFiles = filePaths.filter(f => isSupportedFile(f));
  if (supportedFiles.length === 0) return;

  if (mainWindow && mainWindow.webContents) {
    try {
      // PDFと画像を分類
      const pdfFiles = supportedFiles.filter(f => f.toLowerCase().endsWith('.pdf'));
      const imageFiles = supportedFiles.filter(f => isImageFile(f));

      if (pdfFiles.length > 0 && imageFiles.length === 0) {
        // PDFのみの場合は最初の1つを開く
        const filePath = pdfFiles[0];
        const fileName = path.basename(filePath);
        // 検版ビューワー連携: initialPageを追加
        console.log('[MojiQ] Sending file-opened-path with initialPage:', pageNum);
        mainWindow.webContents.send('file-opened-path', { path: filePath, name: fileName, initialPage: pageNum });
      } else if (imageFiles.length > 0) {
        // 画像ファイルがある場合は複数まとめて送信
        const imageData = imageFiles.map(filePath => ({
          path: filePath,
          name: path.basename(filePath)
        }));
        mainWindow.webContents.send('image-files-opened', { files: imageData });
      }
    } catch (error) {
      console.error('ファイルを開けませんでした:', error);
    }
  } else {
    // ウィンドウがまだ準備できていない場合は保存しておく
    filesToOpen = supportedFiles;
    initialPageNumber = pageNum;
  }
}

// 起動時のコマンドライン引数をチェック
const argsResult = getFilesFromArgs(process.argv);
filesToOpen = argsResult.files;
initialPageNumber = argsResult.pageNum;

// アプリの準備ができたらウィンドウを作成
app.whenReady().then(async () => {
  // 起動時に更新をチェック
  await checkForUpdates();

  // スプラッシュウィンドウを先に表示
  createSplashWindow();

  // 少し待ってからスプラッシュを表示（描画完了を待つ）
  await new Promise(resolve => setTimeout(resolve, 100));

  // 進捗アニメーション開始
  updateSplashProgress(10);

  // メインウィンドウを作成（バックグラウンドで）
  createWindow();
  updateSplashProgress(30);

  // ウィンドウの読み込み完了後にファイルを開く
  mainWindow.webContents.on('did-finish-load', async () => {
    updateSplashProgress(60);

    // 少し待ってから進捗を更新（UIの読み込み完了を待つ）
    await new Promise(resolve => setTimeout(resolve, 300));
    updateSplashProgress(80);

    await new Promise(resolve => setTimeout(resolve, 200));
    updateSplashProgress(100);

    // 完了後、少し待ってからメインウィンドウを表示
    await new Promise(resolve => setTimeout(resolve, 300));

    // スプラッシュを閉じてメインウィンドウを表示
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();

    // ファイルが指定されていれば開く（検版ビューワー連携: 初期ページ番号も渡す）
    if (filesToOpen && filesToOpen.length > 0) {
      openFilesInApp(filesToOpen, initialPageNumber);
      filesToOpen = [];
      initialPageNumber = null;
    }
  });
});

// Windows: 2回目以降の起動で別のファイルを開こうとした場合
app.on('second-instance', (event, commandLine, workingDirectory) => {
  const result = getFilesFromArgs(commandLine);
  if (result.files.length > 0) {
    openFilesInApp(result.files, result.pageNum);
  }

  // ウィンドウを前面に出す
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// macOS: ファイルをアプリで開こうとした場合
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFilesInApp([filePath]);
});

// すべてのウィンドウが閉じられたらアプリを終了（macOS以外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOSでドックアイコンをクリックした時の処理
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ========================================
// 校正チェックデータ読み込み用IPCハンドラー
// ========================================

// 校正チェックデータ用のベースパスを取得
ipcMain.handle('get-calibration-base-path', () => {
  return TXT_FOLDER_BASE_PATH;
});

// 校正チェックデータ用のフォルダ一覧を取得
ipcMain.handle('list-calibration-directory', async (event, dirPath) => {
  try {
    const targetPath = dirPath || TXT_FOLDER_BASE_PATH;

    if (!isPathInTxtFolder(targetPath)) {
      return { success: false, error: 'アクセスが許可されていないパスです' };
    }

    const items = fs.readdirSync(targetPath, { withFileTypes: true });

    const result = items.map(item => ({
      name: item.name,
      path: path.join(targetPath, item.name),
      isDirectory: item.isDirectory(),
      isFile: item.isFile()
    }));

    return { success: true, items: result, currentPath: targetPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 校正チェックデータJSONファイルを読み込み
ipcMain.handle('read-calibration-file', async (event, filePath) => {
  try {
    if (!isPathInTxtFolder(filePath)) {
      return { success: false, error: 'アクセスが許可されていないパスです' };
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data: JSON.parse(data) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
