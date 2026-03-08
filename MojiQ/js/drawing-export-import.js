/**
 * 描画データのエクスポート/インポート機能
 * 描画情報をJSONファイルとして保存・読み込みできるようにする
 */
const DrawingExportImport = {
    VERSION: '1.0',
    FILE_EXTENSION: '.mojiq.json',

    /**
     * 描画データをJSONファイルとしてエクスポート
     */
    async exportToFile() {
        // 見開きモードの場合は先に単ページに分割
        const isSpreadMode = window.MojiQPdfManager &&
            window.MojiQPdfManager.isSpreadViewMode &&
            window.MojiQPdfManager.isSpreadViewMode();

        let singlePageBackup = null;
        if (isSpreadMode) {
            // 単ページのデータをバックアップ（splitで上書きされるため）
            singlePageBackup = MojiQDrawingObjects.backupSinglePageObjects();
            window.MojiQPdfManager.splitSpreadDrawingsForExport();
        }

        // 描画データを取得
        const data = MojiQDrawingObjects.getAllPagesData();

        // 見開きモードの場合は元のデータに戻してから見開きを再構築
        if (isSpreadMode && singlePageBackup) {
            // バックアップから単ページのデータを復元
            MojiQDrawingObjects.restoreSinglePageObjects(singlePageBackup);
            // 見開きを再構築
            window.MojiQPdfManager.refreshSpreadDrawings();
        }

        if (Object.keys(data).length === 0) {
            if (window.MojiQModal && window.MojiQModal.showAlert) {
                await window.MojiQModal.showAlert('エクスポートする描画データがありません。', '描画データのエクスポート');
            } else {
                alert('エクスポートする描画データがありません。');
            }
            return;
        }

        const exportData = {
            version: this.VERSION,
            exportedAt: new Date().toISOString(),
            pageCount: Object.keys(data).length,
            data: data
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });

        // デフォルトのファイル名を生成（読み込んだファイル名_描画.json）
        const displayEl = document.getElementById('pdfFileNameDisplay');
        let baseName = 'drawing';
        if (displayEl && displayEl.title) {
            baseName = displayEl.title.replace(/\.(pdf|jpg|jpeg|png)$/i, '');
        }
        const defaultFileName = `${baseName}_描画.json`;

        // Electron環境の場合
        if (window.electronAPI && window.electronAPI.showSaveDialog && window.electronAPI.saveFile) {
            try {
                const result = await window.electronAPI.showSaveDialog({
                    title: '描画データを保存',
                    defaultPath: defaultFileName,
                    filters: [
                        { name: 'MojiQ描画データ', extensions: ['mojiq.json'] },
                        { name: 'すべてのファイル', extensions: ['*'] }
                    ]
                });

                if (result && result.filePath) {
                    // JSONをBase64エンコードして保存
                    const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
                    const saveResult = await window.electronAPI.saveFile(result.filePath, base64Data);
                    if (!saveResult || !saveResult.success) {
                        throw new Error(saveResult?.error || '保存に失敗しました');
                    }
                }
            } catch (error) {
                if (window.MojiQModal && window.MojiQModal.showAlert) {
                    await window.MojiQModal.showAlert('描画データのエクスポートに失敗しました。\n' + error.message, 'エラー');
                }
            }
        } else {
            // ブラウザ環境: ダウンロードリンクを使用
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    },

    /**
     * JSONファイルから描画データをインポート
     */
    async importFromFile() {
        // Electron環境の場合
        if (window.electronAPI && window.electronAPI.showOpenDialog && window.electronAPI.readFile) {
            try {
                const result = await window.electronAPI.showOpenDialog({
                    title: '描画データを読み込み',
                    filters: [
                        { name: 'MojiQ描画データ', extensions: ['mojiq.json', 'json'] },
                        { name: 'すべてのファイル', extensions: ['*'] }
                    ],
                    properties: ['openFile']
                });

                if (result && result.filePaths && result.filePaths.length > 0) {
                    const readResult = await window.electronAPI.readFile(result.filePaths[0]);
                    if (readResult && readResult.success) {
                        // JSONファイルは直接UTF-8テキストで返される
                        await this._processImportData(readResult.data);
                    } else {
                        throw new Error(readResult?.error || 'ファイルの読み込みに失敗しました');
                    }
                }
            } catch (error) {
                if (window.MojiQModal && window.MojiQModal.showAlert) {
                    await window.MojiQModal.showAlert('描画データのインポートに失敗しました。\n' + error.message, 'エラー');
                }
            }
        } else {
            // ブラウザ環境: ファイル選択ダイアログを使用
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.mojiq.json,.json';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const jsonString = await file.text();
                        await this._processImportData(jsonString);
                    } catch (error) {
                        if (window.MojiQModal && window.MojiQModal.showAlert) {
                            await window.MojiQModal.showAlert('描画データのインポートに失敗しました。\n' + error.message, 'エラー');
                        } else {
                            alert('描画データのインポートに失敗しました。\n' + error.message);
                        }
                    }
                }
            };

            input.click();
        }
    },

    /**
     * インポートデータを処理
     * @private
     */
    async _processImportData(jsonString) {
        let importData;

        try {
            importData = JSON.parse(jsonString);
        } catch (e) {
            throw new Error('JSONファイルの解析に失敗しました。ファイル形式を確認してください。');
        }

        // バリデーション
        const validation = this.validateData(importData);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // 現在のPDFのページ数を取得
        const currentPageCount = window.MojiQPdfManager ? window.MojiQPdfManager.getPageCount() : 0;
        const importPageCount = Object.keys(importData.data).length;
        const maxImportPage = Math.max(...Object.keys(importData.data).map(Number));

        // ページ数が異なる場合は警告
        if (currentPageCount > 0 && maxImportPage > currentPageCount) {
            const message = `インポートするデータには ${maxImportPage} ページ分の描画がありますが、` +
                `現在のPDFは ${currentPageCount} ページです。\n` +
                `存在するページのみに描画を適用します。続行しますか？`;

            let proceed = false;
            if (window.MojiQModal && window.MojiQModal.showConfirm) {
                proceed = await window.MojiQModal.showConfirm(message, '描画データのインポート');
            } else {
                proceed = confirm(message);
            }

            if (!proceed) {
                return;
            }
        }

        // 既存の描画をクリア（全ページ）
        if (currentPageCount > 0) {
            for (let i = 1; i <= currentPageCount; i++) {
                MojiQDrawingObjects.clearPageObjects(i);
            }
        }

        // データをフィルタリング（存在するページのみ）
        const filteredData = {};
        for (const pageNum in importData.data) {
            const pn = parseInt(pageNum);
            if (currentPageCount === 0 || pn <= currentPageCount) {
                filteredData[pageNum] = importData.data[pageNum];
            }
        }

        // 描画データを復元
        await MojiQDrawingObjects.deserializeAllPagesData(filteredData);

        // 再描画
        if (window.MojiQPdfManager) {
            // 見開きモードの場合は、単ページのデータを見開きにマージして再描画
            if (window.MojiQPdfManager.isSpreadViewMode && window.MojiQPdfManager.isSpreadViewMode()) {
                window.MojiQPdfManager.refreshSpreadDrawings();
            } else {
                const currentPage = window.MojiQPdfManager.getCurrentPage();
                window.MojiQPdfManager.invalidatePageCache(currentPage);
                window.MojiQPdfManager.renderPage(currentPage);
            }
        }

        if (window.MojiQModal && window.MojiQModal.showAlert) {
            await window.MojiQModal.showAlert(
                `${Object.keys(filteredData).length} ページ分の描画データをインポートしました。`,
                '描画データのインポート'
            );
        }
    },

    /**
     * インポートデータのバリデーション
     * @param {Object} data - インポートするデータ
     * @returns {{valid: boolean, error?: string}}
     */
    validateData(data) {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: '無効なデータ形式です。' };
        }

        if (!data.version) {
            return { valid: false, error: 'バージョン情報がありません。MojiQの描画データファイルではない可能性があります。' };
        }

        if (!data.data || typeof data.data !== 'object') {
            return { valid: false, error: '描画データが含まれていません。' };
        }

        // 各ページのオブジェクトを検証
        for (const pageNum in data.data) {
            const objects = data.data[pageNum];
            if (!Array.isArray(objects)) {
                return { valid: false, error: `ページ ${pageNum} のデータが不正です。` };
            }

            for (const obj of objects) {
                if (!obj.type || !obj.id) {
                    return { valid: false, error: `ページ ${pageNum} に不正なオブジェクトがあります。` };
                }
            }
        }

        return { valid: true };
    },

    /**
     * 指定されたパスに描画データを保存（PDF保存時の自動保存用）
     * @param {string} filePath - 保存されたファイルのパス
     * @returns {Promise<boolean>} 保存成功したかどうか
     */
    async exportToPath(filePath) {
        // 見開きモードの場合は先に単ページに分割
        const isSpreadMode = window.MojiQPdfManager &&
            window.MojiQPdfManager.isSpreadViewMode &&
            window.MojiQPdfManager.isSpreadViewMode();

        let singlePageBackup = null;
        if (isSpreadMode) {
            // 単ページのデータをバックアップ（splitで上書きされるため）
            singlePageBackup = MojiQDrawingObjects.backupSinglePageObjects();
            window.MojiQPdfManager.splitSpreadDrawingsForExport();
        }

        // 描画データを取得
        const data = MojiQDrawingObjects.getAllPagesData();

        // 見開きモードの場合は元のデータに戻してから見開きを再構築
        if (isSpreadMode && singlePageBackup) {
            // バックアップから単ページのデータを復元
            MojiQDrawingObjects.restoreSinglePageObjects(singlePageBackup);
            // 見開きを再構築
            window.MojiQPdfManager.refreshSpreadDrawings();
        }

        if (Object.keys(data).length === 0) {
            return false;
        }

        const exportData = {
            version: this.VERSION,
            exportedAt: new Date().toISOString(),
            pageCount: Object.keys(data).length,
            data: data
        };

        const jsonString = JSON.stringify(exportData, null, 2);

        // ファイルパスから描画データのパスを生成（拡張子を_描画.jsonに置換）
        const drawingFilePath = filePath.replace(/\.(pdf|jpg|jpeg|png)$/i, '_描画.json');

        // Electron環境の場合（pdf-manager.jsと同じパターンで判定）
        if (window.MojiQElectron && window.MojiQElectron.isElectron) {
            try {
                // 同名ファイルの存在確認（上書き保存時はスキップ）
                // 上書き保存の場合は毎回確認ダイアログを出す必要はない
                // → 初回保存時のみ確認（描画JSONが存在しない場合は新規作成）

                // JSONをBase64エンコードして保存
                const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
                const saveResult = await window.MojiQElectron.saveFile(drawingFilePath, base64Data);
                if (saveResult && saveResult.success) {
                    return true;
                } else {
                    console.error('描画データ保存失敗:', saveResult?.error);
                    return false;
                }
            } catch (error) {
                console.error('描画データ保存エラー:', error);
                return false;
            }
        }

        return false;
    }
};

// グローバルに公開
window.DrawingExportImport = DrawingExportImport;
