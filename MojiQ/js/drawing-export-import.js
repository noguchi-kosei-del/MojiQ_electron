/**
 * 描画データのエクスポート/インポート機能
 * 描画情報をJSONファイルとして保存・読み込みできるようにする
 *
 * v1.1: 座標をインtrinsicサイズ（PDFのscale=1サイズ、画像の元サイズ）ベースで保存
 *       ウィンドウサイズに依存しない座標系で保存し、読み込み時に現在の表示サイズにスケーリング
 */
const DrawingExportImport = {
    VERSION: '1.1',
    FILE_EXTENSION: '.mojiq.json',

    /**
     * オブジェクトの座標をスケーリング
     * @param {Object} obj - 描画オブジェクト
     * @param {number} scaleX - X方向のスケール
     * @param {number} scaleY - Y方向のスケール
     * @returns {Object} スケーリングされたオブジェクト
     */
    _scaleObjectCoordinates(obj, scaleX, scaleY) {
        const scaled = { ...obj };

        // startPos / endPos
        if (scaled.startPos) {
            scaled.startPos = {
                x: scaled.startPos.x * scaleX,
                y: scaled.startPos.y * scaleY
            };
        }
        if (scaled.endPos) {
            scaled.endPos = {
                x: scaled.endPos.x * scaleX,
                y: scaled.endPos.y * scaleY
            };
        }

        // points 配列 (ポリライン、フリーハンドなど)
        if (scaled.points && Array.isArray(scaled.points)) {
            scaled.points = scaled.points.map(p => ({
                x: p.x * scaleX,
                y: p.y * scaleY
            }));
        }

        // bounds (テキスト入力など)
        if (scaled.bounds) {
            scaled.bounds = {
                x: scaled.bounds.x * scaleX,
                y: scaled.bounds.y * scaleY,
                width: scaled.bounds.width * scaleX,
                height: scaled.bounds.height * scaleY
            };
        }

        // width / height (画像オブジェクトなど)
        if (typeof scaled.width === 'number') {
            scaled.width = scaled.width * scaleX;
        }
        if (typeof scaled.height === 'number') {
            scaled.height = scaled.height * scaleY;
        }

        // leaderLine (引出線)
        if (scaled.leaderLine) {
            scaled.leaderLine = { ...scaled.leaderLine };
            if (scaled.leaderLine.start) {
                scaled.leaderLine.start = {
                    x: scaled.leaderLine.start.x * scaleX,
                    y: scaled.leaderLine.start.y * scaleY
                };
            }
            if (scaled.leaderLine.end) {
                scaled.leaderLine.end = {
                    x: scaled.leaderLine.end.x * scaleX,
                    y: scaled.leaderLine.end.y * scaleY
                };
            }
        }

        // textX / textY (フォント指定など)
        if (typeof scaled.textX === 'number') {
            scaled.textX = scaled.textX * scaleX;
        }
        if (typeof scaled.textY === 'number') {
            scaled.textY = scaled.textY * scaleY;
        }

        // annotation (注釈オブジェクト)
        if (scaled.annotation) {
            scaled.annotation = { ...scaled.annotation };
            if (typeof scaled.annotation.x === 'number') {
                scaled.annotation.x = scaled.annotation.x * scaleX;
            }
            if (typeof scaled.annotation.y === 'number') {
                scaled.annotation.y = scaled.annotation.y * scaleY;
            }
            if (typeof scaled.annotation.fontSize === 'number') {
                scaled.annotation.fontSize = scaled.annotation.fontSize * Math.min(scaleX, scaleY);
            }
            // annotation内の引出線
            if (scaled.annotation.leaderLine) {
                scaled.annotation.leaderLine = { ...scaled.annotation.leaderLine };
                if (scaled.annotation.leaderLine.start) {
                    scaled.annotation.leaderLine.start = {
                        x: scaled.annotation.leaderLine.start.x * scaleX,
                        y: scaled.annotation.leaderLine.start.y * scaleY
                    };
                }
                if (scaled.annotation.leaderLine.end) {
                    scaled.annotation.leaderLine.end = {
                        x: scaled.annotation.leaderLine.end.x * scaleX,
                        y: scaled.annotation.leaderLine.end.y * scaleY
                    };
                }
            }
        }

        // lineWidth (線幅)
        if (typeof scaled.lineWidth === 'number') {
            scaled.lineWidth = scaled.lineWidth * Math.min(scaleX, scaleY);
        }

        // fontSize (フォントサイズ)
        if (typeof scaled.fontSize === 'number') {
            scaled.fontSize = scaled.fontSize * Math.min(scaleX, scaleY);
        }

        // size (スタンプのサイズ)
        if (typeof scaled.size === 'number') {
            scaled.size = scaled.size * Math.min(scaleX, scaleY);
        }

        return scaled;
    },

    /**
     * 現在のキャンバスサイズを取得
     * @returns {{width: number, height: number}}
     */
    _getCurrentCanvasSize() {
        const canvas = document.getElementById('mojiqCanvas');
        if (canvas) {
            const dpr = window.devicePixelRatio || 1;
            return {
                width: canvas.width / dpr,
                height: canvas.height / dpr
            };
        }
        // フォールバック
        return window.MojiQPdfManager.getOriginalPageSize(1);
    },

    /**
     * エクスポート用データを準備（座標はそのまま、ページサイズ情報を追加）
     * @param {Object} data - ページごとの描画データ
     * @returns {Promise<{data: Object, pageSizes: Object}>} データとページサイズ情報
     */
    async _prepareExportData(data) {
        const pageSizes = {};
        // 現在のキャンバスサイズを取得（全ページ共通）
        const canvasSize = this._getCurrentCanvasSize();

        for (const pageNum in data) {
            pageSizes[pageNum] = {
                width: canvasSize.width,
                height: canvasSize.height
            };
        }

        return { data, pageSizes };
    },

    /**
     * インポート時に座標を現在の表示サイズにスケーリング
     * @param {Object} data - ページごとの描画データ
     * @param {Object} savedPageSizes - 保存時のページサイズ情報
     * @param {string} version - データのバージョン
     * @returns {Object} スケーリングされたデータ
     */
    _scaleCoordinatesForImport(data, savedPageSizes, version) {
        // v1.0以前のデータ、またはページサイズ情報がない場合はスケーリングしない
        if (version === '1.0' || !savedPageSizes) {
            return data;
        }

        const scaledData = {};
        // 現在のキャンバスサイズを取得
        const currentSize = this._getCurrentCanvasSize();

        for (const pageNum in data) {
            const objects = data[pageNum];

            // 保存時のサイズと現在のサイズを比較
            const savedSize = savedPageSizes[pageNum];

            if (savedSize && (savedSize.width !== currentSize.width || savedSize.height !== currentSize.height)) {
                const scaleX = currentSize.width / savedSize.width;
                const scaleY = currentSize.height / savedSize.height;

                scaledData[pageNum] = objects.map(obj => this._scaleObjectCoordinates(obj, scaleX, scaleY));
            } else {
                scaledData[pageNum] = objects;
            }
        }

        return scaledData;
    },

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

        // ページサイズ情報を準備（読み込み時のスケーリング用）
        const { data: exportDataContent, pageSizes } = await this._prepareExportData(data);

        const exportData = {
            version: this.VERSION,
            exportedAt: new Date().toISOString(),
            pageCount: Object.keys(exportDataContent).length,
            pageSizes: pageSizes,
            data: exportDataContent
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

        // 座標を現在の表示サイズにスケーリング（v1.1以降のデータ）
        const scaledData = this._scaleCoordinatesForImport(filteredData, importData.pageSizes, importData.version);

        // 描画データを復元
        await MojiQDrawingObjects.deserializeAllPagesData(scaledData);

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

        // ページサイズ情報を準備（読み込み時のスケーリング用）
        const { data: exportDataContent, pageSizes } = await this._prepareExportData(data);

        const exportData = {
            version: this.VERSION,
            exportedAt: new Date().toISOString(),
            pageCount: Object.keys(exportDataContent).length,
            pageSizes: pageSizes,
            data: exportDataContent
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
