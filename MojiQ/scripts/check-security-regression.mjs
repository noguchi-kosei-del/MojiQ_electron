import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const main = read('electron/main.js');
const preload = read('electron/preload.js');
const pkg = JSON.parse(read('package.json'));

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function handlerBody(channel) {
  const start = main.indexOf(`ipcMain.handle('${channel}'`);
  if (start === -1) return '';

  const next = main.indexOf('ipcMain.handle(', start + 1);
  return main.slice(start, next === -1 ? main.length : next);
}

check(/contextIsolation:\s*true/.test(main), 'BrowserWindow must use contextIsolation: true');
check(/nodeIntegration:\s*false/.test(main), 'BrowserWindow must use nodeIntegration: false');
check(/additionalArguments:\s*getSecurityPreloadArgs\(\)/.test(main), 'preload must receive packaged/runtime flag');
check(/app\.isPackaged\s*\|\|\s*!process\.defaultApp/.test(main), 'main must derive packaged runtime robustly');
check(/--mojiq-packaged=\$\{isPackagedRuntime\(\)/.test(main), 'main must pass packaged runtime flag to preload');
check(/ipcMain\.on\('get-runtime-security-info-sync'/.test(main), 'main must expose internal sync runtime check to preload');

for (const exposedName of ['allowPath', 'registerPath', 'authorize_user_paths']) {
  check(!new RegExp(`${exposedName}\\s*:`).test(preload), `${exposedName} must not be exposed on window.electronAPI`);
}

check(!/register-dropped-files\s*:/.test(preload), 'register-dropped-files must not be exposed directly on window.electronAPI');
check(/ipcRenderer\.invoke\('register-dropped-files'/.test(preload), 'D&D registration should stay inside preload drop handler');

for (const channel of ['read-file', 'get-file-size', 'read-file-binary']) {
  check(/isReadFileAllowed/.test(handlerBody(channel)), `${channel} must check isReadFileAllowed`);
}

check(/isWriteFileAllowed/.test(handlerBody('save-file')), 'save-file must check isWriteFileAllowed');
check(/isWriteFileAllowed/.test(handlerBody('check-disk-space')), 'check-disk-space must check isWriteFileAllowed');
check(/isReadFileAllowed/.test(handlerBody('file-exists')) && /isWriteFileAllowed/.test(handlerBody('file-exists')), 'file-exists must check read/write allow lists');

check(/fs\.realpathSync(?:\.native)?/.test(main), 'main must use fs.realpathSync or fs.realpathSync.native');
check(/function\s+isRealPathUnderBase/.test(main), 'main must have realpath-based base path check');
check(/function\s+getMojiqTempDir/.test(main), 'main must use a MojiQ-specific temp helper');
check(/path\.join\(app\.getPath\('temp'\),\s*'MojiQ'\)/.test(main), 'temp files must be scoped under %TEMP%\\MojiQ');
check((main.match(/app\.getPath\('temp'\)/g) || []).length === 1, 'app.getPath("temp") should only appear inside getMojiqTempDir');
check(/const\s+tempDir\s*=\s*getMojiqTempDir\(\)/.test(main), 'print temp files must use getMojiqTempDir');

check(/process\.argv\.includes\('--mojiq-packaged=1'\)/.test(preload), 'preload must detect packaged runtime from main flag');
check(/process\.argv\.includes\('--mojiq-packaged=0'\)/.test(preload), 'preload must detect development runtime from main flag');
check(/ipcRenderer\.sendSync\('get-runtime-security-info-sync'\)/.test(preload), 'preload must fall back to internal sync runtime check');
check(!preload.includes('__dirname'), 'preload must not use __dirname in sandboxed runtime');
check(/const\s+isCspDebugEnabled\s*=\s*!isPackagedRuntime\s*&&\s*process\.argv\.includes\('--mojiq-csp-debug=1'\)/.test(preload), 'CSP debug API must require explicit debug flag');
check(/if\s*\(isCspDebugEnabled\)\s*{[\s\S]*securitypolicyviolation/.test(preload), 'CSP violation details must be recorded only when debug flag is enabled');
check(/\.\.\.\(isCspDebugEnabled\s*\?\s*{\s*getCspViolations/.test(preload), 'getCspViolations must only be exposed when debug flag is enabled');
check(/"dev":\s*"electron \. --enable-logging --mojiq-csp-debug=1"/.test(JSON.stringify(pkg)), 'dev script must explicitly enable CSP debug API');

check(pkg.scripts?.['check:security'] === 'node scripts/check-security-regression.mjs', 'package.json must define check:security');

if (failures.length > 0) {
  console.error('Security regression check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Security regression check passed.');
