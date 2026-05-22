/**
 * 描画データのエクスポート/インポート機能
 * 描画情報をJSONファイルとして保存・読み込みできるようにする
 *
 * v1.1: 座標をインtrinsicサイズ（PDFのscale=1サイズ、画像の元サイズ）ベースで保存
 *       ウィンドウサイズに依存しない座標系で保存し、読み込み時に現在の表示サイズにスケーリング
 */

// UIブロック回避用のnextFrame関数
function _drawingExportNextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

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
        // 現在のキャンバスサイズをフォールバック用に取得
        const fallbackSize = this._getCurrentCanvasSize();

        // 確認済みコメントの情報を取得（PDF注釈由来オブジェクトを除外するため）
        let checkedSignatures = [];
        if (window.ProofreadingPanel && window.ProofreadingPanel.getCheckedCommentSignatures) {
            checkedSignatures = window.ProofreadingPanel.getCheckedCommentSignatures();
        }

        const filteredData = {};

        for (const pageNum in data) {
            // 各ページのサイズを取得（ページごとに異なる場合に対応）
            let pageSize = null;
            if (window.MojiQPdfManager && window.MojiQPdfManager.getDisplayPageSize) {
                // 表示サイズ（CSS座標系）を取得
                pageSize = window.MojiQPdfManager.getDisplayPageSize(parseInt(pageNum));
            }
            if (!pageSize || !pageSize.width || !pageSize.height) {
                // フォールバック: 現在のキャンバスサイズを使用
                pageSize = fallbackSize;
            }
            pageSizes[pageNum] = {
                width: pageSize.width,
                height: pageSize.height
            };

            // PDF注釈由来オブジェクトをJSONから除外（PDF読み込み時に動的に再生成されるため）
            // 確認済みコメント（済スタンプ付き）に対応する済スタンプも除外
            filteredData[pageNum] = data[pageNum].filter(obj => {
                // PDF注釈由来テキストは常に除外（動的ロードで再生成される）
                if (obj._pdfAnnotationSource) {
                    return false;
                }
                // 確認済みコメントの済スタンプも除外
                if (checkedSignatures.length > 0 &&
                    this._isCheckedPdfAnnotation(obj, checkedSignatures, parseInt(pageNum))) {
                    return false;
                }
                return true;
            });
        }

        return { data: filteredData, pageSizes };
    },

    /**
     * PDF注釈由来のテキストオブジェクトをコメントデータとして準備する
     * _pdfAnnotationSourceを除去して通常テキストとして保存可能にする
     * @param {Object} data - ページごとの描画データ
     * @returns {Promise<{data: Object, pageSizes: Object}>} コメントデータとページサイズ情報
     */
    async _prepareCommentData(data) {
        const pageSizes = {};
        const fallbackSize = this._getCurrentCanvasSize();
        const commentData = {};

        // ソース1: DrawingObjects上のPDF注釈由来オブジェクト
        for (const pageNum in data) {
            let pageSize = null;
            if (window.MojiQPdfManager && window.MojiQPdfManager.getDisplayPageSize) {
                pageSize = window.MojiQPdfManager.getDisplayPageSize(parseInt(pageNum));
            }
            if (!pageSize || !pageSize.width || !pageSize.height) {
                pageSize = fallbackSize;
            }
            pageSizes[pageNum] = { width: pageSize.width, height: pageSize.height };

            // _pdfAnnotationSource付きオブジェクトのみ抽出し、プロパティを削除
            commentData[pageNum] = data[pageNum]
                .filter(obj => obj._pdfAnnotationSource)
                .map(obj => {
                    const newObj = MojiQClone.deep(obj);
                    delete newObj._pdfAnnotationSource;
                    return newObj;
                });
        }

        // ソース2: メタデータから復元したMojiQテキスト（再保存時にDrawingObjectsに無い場合）
        if (window.MojiQPdfManager && window.MojiQPdfManager.getLoadedMojiQTexts) {
            const loadedTexts = window.MojiQPdfManager.getLoadedMojiQTexts();
            if (loadedTexts && loadedTexts.length > 0) {
                for (const item of loadedTexts) {
                    const pageNum = String(item.pdfPage);
                    if (!commentData[pageNum]) {
                        commentData[pageNum] = [];
                        let pageSize = null;
                        if (window.MojiQPdfManager && window.MojiQPdfManager.getDisplayPageSize) {
                            pageSize = window.MojiQPdfManager.getDisplayPageSize(parseInt(pageNum));
                        }
                        if (!pageSize || !pageSize.width || !pageSize.height) {
                            pageSize = fallbackSize;
                        }
                        pageSizes[pageNum] = { width: pageSize.width, height: pageSize.height };
                    }

                    // ページ+テキスト内容で重複排除
                    const isDuplicate = commentData[pageNum].some(
                        existing => existing.text === item.contents
                    );
                    if (!isDuplicate) {
                        commentData[pageNum].push({
                            type: 'text',
                            text: item.contents,
                            startPos: {
                                x: item.canvasRect ? item.canvasRect.x : 0,
                                y: item.canvasRect ? item.canvasRect.y : 0
                            },
                            fontSize: 14,
                            color: '#000000',
                            align: 'left',
                            isVertical: false
                        });
                    }
                }
            }
        }

        return { data: commentData, pageSizes };
    },

    /**
     * オブジェクトが確認済みPDF注釈または関連する済スタンプかどうかを判定
     * @param {Object} obj - 描画オブジェクト
     * @param {Array} checkedSignatures - 確認済みコメントの識別情報
     * @param {number} pageNum - ページ番号
     * @returns {boolean} 除外対象の場合true
     */
    _isCheckedPdfAnnotation(obj, checkedSignatures, pageNum) {
        // コメントタブから配置された済スタンプ（commentIndexを持つ）は除外
        // 済スタンプツールで手動配置したものはcommentIndexを持たないので残る
        if (obj.type === 'doneStamp' && obj.commentIndex !== undefined) {
            return true;
        }

        // PDF注釈由来でなければfalse
        if (obj.type !== 'text' || !obj._pdfAnnotationSource) {
            return false;
        }

        for (const sig of checkedSignatures) {
            if (sig.pdfPage !== pageNum) continue;

            // テキスト内容が一致
            if (obj.text === sig.contents) {
                return true;
            }

            // テキストが編集されている場合は座標で判定
            if (sig.canvasRect && obj.startPos) {
                const dx = Math.abs(obj.startPos.x - sig.canvasRect.x);
                const dy = Math.abs(obj.startPos.y - sig.canvasRect.y);
                if (dx < 30 && dy < 30) {
                    return true;
                }
            }
        }
        return false;
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
        // フォールバック用: 現在のキャンバスサイズを取得
        const fallbackSize = this._getCurrentCanvasSize();

        for (const pageNum in data) {
            const objects = data[pageNum];

            // 保存時のサイズを取得
            const savedSize = savedPageSizes[pageNum];

            // 現在のサイズを取得（ページごとに異なる場合に対応）
            // PDF保存時と同じ getDisplayPageSize を使用して一貫性を保つ
            let currentSize = null;
            if (window.MojiQPdfManager && window.MojiQPdfManager.getDisplayPageSize) {
                currentSize = window.MojiQPdfManager.getDisplayPageSize(parseInt(pageNum));
            }
            // getDisplayPageSize が無効な場合はフォールバック
            if (!currentSize || !currentSize.width || currentSize.width <= 0 ||
                !currentSize.height || currentSize.height <= 0 ||
                !Number.isFinite(currentSize.width) || !Number.isFinite(currentSize.height)) {
                currentSize = fallbackSize;
            }

            // currentSizeの検証（NaN/Infinity防止）
            if (!currentSize || !currentSize.width || currentSize.width <= 0 ||
                !currentSize.height || currentSize.height <= 0 ||
                !Number.isFinite(currentSize.width) || !Number.isFinite(currentSize.height)) {
                console.warn('[MojiQ DrawingExportImport] 無効な現在のサイズを検出:', currentSize);
                scaledData[pageNum] = objects;
                continue;
            }

            if (savedSize && (savedSize.width !== currentSize.width || savedSize.height !== currentSize.height)) {
                // 0除算防止: savedSize.width/heightが0または負の場合はスケーリングをスキップ
                if (!savedSize.width || savedSize.width <= 0 || !savedSize.height || savedSize.height <= 0) {
                    console.warn('[MojiQ DrawingExportImport] 無効な保存サイズを検出:', savedSize);
                    scaledData[pageNum] = objects;
                    continue;
                }
                const scaleX = currentSize.width / savedSize.width;
                const scaleY = currentSize.height / savedSize.height;

                // BUG修正: スケール値の検証（NaN/Infinity防止）
                if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
                    console.warn('[MojiQ DrawingExportImport] 無効なスケール値を検出:', { scaleX, scaleY, savedSize, currentSize });
                    scaledData[pageNum] = objects;
                    continue;
                }

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
        // 確認済みコメントとその済スタンプはここで除外される
        const { data: exportDataContent, pageSizes } = await this._prepareExportData(data);

        // フィルタリング後にデータが空かチェック
        // （すべてのコメントが確認済みで他の描画がない場合）
        const hasObjects = Object.values(exportDataContent).some(pageData => pageData.length > 0);
        if (!hasObjects) {
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
            pageCount: Object.keys(exportDataContent).length,
            pageSizes: pageSizes,
            data: exportDataContent
        };

        // UIブロック回避: JSON処理前にフレームを待機
        await _drawingExportNextFrame();
        const jsonString = JSON.stringify(exportData, null, 2);
        await _drawingExportNextFrame();
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
            try {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = defaultFileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (error) {
                if (window.MojiQModal && window.MojiQModal.showAlert) {
                    await window.MojiQModal.showAlert('描画データのエクスポートに失敗しました。\n' + error.message, 'エラー');
                } else {
                    alert('描画データのエクスポートに失敗しました。\n' + error.message);
                }
            }
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
            // UIブロック回避: JSON処理前にフレームを待機
            await _drawingExportNextFrame();
            importData = JSON.parse(jsonString);
            await _drawingExportNextFrame();
        } catch (e) {
            // BUG修正: 元のエラーメッセージを含めてデバッグを容易にする
            const errorDetail = e.message ? `: ${e.message}` : '';
            throw new Error(`JSONファイルの解析に失敗しました${errorDetail}。ファイル形式を確認してください。`);
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

        // JSONに含まれていない既存オブジェクトを全ページから退避
        // （PDF注釈由来テキスト、ペースト由来テキスト等を保護）
        const savedNonJsonObjects = {};
        const jsonObjectIds = new Set();
        for (const pageNum in importData.data) {
            if (importData.data[pageNum]) {
                importData.data[pageNum].forEach(obj => {
                    if (obj.id) jsonObjectIds.add(obj.id);
                });
            }
        }
        if (currentPageCount > 0) {
            for (let i = 1; i <= currentPageCount; i++) {
                const objects = MojiQDrawingObjects.getPageObjects(i);
                if (objects && objects.length > 0) {
                    const nonJsonObjs = objects.filter(obj => obj && !jsonObjectIds.has(obj.id));
                    if (nonJsonObjs.length > 0) {
                        savedNonJsonObjects[i] = nonJsonObjs;
                    }
                }
            }
        }

        // 既存の描画をクリア（全ページ）
        if (currentPageCount > 0) {
            for (let i = 1; i <= currentPageCount; i++) {
                MojiQDrawingObjects.clearPageObjects(i);
            }
        }

        // データをフィルタリング（存在するページのみ、PDF注釈由来オブジェクトを除外）
        const filteredData = {};
        for (const pageNum in importData.data) {
            const pn = parseInt(pageNum);
            if (currentPageCount === 0 || pn <= currentPageCount) {
                // 古いJSONに含まれるPDF注釈由来オブジェクトを除外
                // （PDF読み込み時に動的に再生成されるため）
                filteredData[pageNum] = importData.data[pageNum].filter(obj =>
                    !obj._pdfAnnotationSource
                );
            }
        }

        // 座標を現在の表示サイズにスケーリング（v1.1以降のデータ）
        const scaledData = this._scaleCoordinatesForImport(filteredData, importData.pageSizes, importData.version);

        // 描画データを復元（失敗しても退避オブジェクトは必ず復元する）
        try {
            await MojiQDrawingObjects.deserializeAllPagesData(scaledData);
        } catch (deserializeError) {
            console.error('[MojiQ] 描画データのデシリアライズに失敗:', deserializeError);
        }

        // 退避したオブジェクト（PDF注釈由来テキスト、ペースト由来テキスト等）を復元
        for (const pageNum in savedNonJsonObjects) {
            savedNonJsonObjects[pageNum].forEach(obj => {
                MojiQDrawingObjects.addObject(parseInt(pageNum), obj);
            });
        }

        // オブジェクト変更イベントを発火（コメントタブ等の更新のため）
        window.dispatchEvent(new CustomEvent('mojiq:objects-changed', {
            detail: { action: 'import', objectType: 'text' }
        }));

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
     * 同名ファイルが存在する場合、末尾に(1),(2)...を付与したユニークなパスを返す
     * @param {string} filePath - 元のファイルパス
     * @returns {Promise<string>} ユニークなファイルパス
     */
    async _getUniqueFilePath(filePath) {
        const result = await window.electronAPI.fileExists(filePath);
        if (!result || !result.success || !result.exists) {
            return filePath;
        }

        // 拡張子部分を分離（.mojiq.json のような複合拡張子に対応）
        const mojiqJsonMatch = filePath.match(/^(.+)(\.mojiq\.json)$/i);
        let basePath, ext;
        if (mojiqJsonMatch) {
            basePath = mojiqJsonMatch[1];
            ext = mojiqJsonMatch[2];
        } else {
            const lastDot = filePath.lastIndexOf('.');
            basePath = lastDot > 0 ? filePath.substring(0, lastDot) : filePath;
            ext = lastDot > 0 ? filePath.substring(lastDot) : '';
        }

        for (let i = 1; i <= 999; i++) {
            const candidate = `${basePath}(${i})${ext}`;
            const check = await window.electronAPI.fileExists(candidate);
            if (!check || !check.success || !check.exists) {
                return candidate;
            }
        }

        return filePath;
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
        // 確認済みコメントとその済スタンプはここで除外される
        const { data: exportDataContent, pageSizes } = await this._prepareExportData(data);

        // フィルタリング後にデータが空かチェック
        // （すべてのコメントが確認済みで他の描画がない場合は保存不要）
        const hasObjects = Object.values(exportDataContent).some(pageData => pageData.length > 0);
        if (!hasObjects) {
            return false;
        }

        const exportData = {
            version: this.VERSION,
            exportedAt: new Date().toISOString(),
            pageCount: Object.keys(exportDataContent).length,
            pageSizes: pageSizes,
            data: exportDataContent
        };

        // UIブロック回避: JSON処理前にフレームを待機
        await _drawingExportNextFrame();
        const jsonString = JSON.stringify(exportData, null, 2);
        await _drawingExportNextFrame();

        // ファイルパスから描画データのパスを生成（拡張子を_描画.jsonに置換）
        let drawingFilePath = filePath.replace(/\.(pdf|jpg|jpeg|png)$/i, '_描画.json');

        // Electron環境の場合（pdf-manager.jsと同じパターンで判定）
        if (window.MojiQElectron && window.MojiQElectron.isElectron) {
            try {
                // 同名ファイルが存在する場合は番号を付与して上書きを防止
                if (window.electronAPI && window.electronAPI.fileExists) {
                    drawingFilePath = await this._getUniqueFilePath(drawingFilePath);
                }

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
    },

    /**
     * PDF注釈由来のコメントデータをJSONファイルとして保存する
     * @param {string} filePath - 保存されたPDFファイルのパス
     * @returns {Promise<boolean>} 保存成功したかどうか
     */
    async exportCommentsToPath(filePath) {
        // 見開きモードの場合は先に単ページに分割
        const isSpreadMode = window.MojiQPdfManager &&
            window.MojiQPdfManager.isSpreadViewMode &&
            window.MojiQPdfManager.isSpreadViewMode();

        let singlePageBackup = null;
        if (isSpreadMode) {
            singlePageBackup = MojiQDrawingObjects.backupSinglePageObjects();
            window.MojiQPdfManager.splitSpreadDrawingsForExport();
        }

        const data = MojiQDrawingObjects.getAllPagesData();

        if (isSpreadMode && singlePageBackup) {
            MojiQDrawingObjects.restoreSinglePageObjects(singlePageBackup);
            window.MojiQPdfManager.refreshSpreadDrawings();
        }

        // コメントデータを準備（_pdfAnnotationSource付きオブジェクト + メタデータ）
        const { data: commentDataContent, pageSizes } = await this._prepareCommentData(data);

        // コメントオブジェクトが存在するかチェック
        const hasComments = Object.values(commentDataContent).some(pageData => pageData.length > 0);
        if (!hasComments) {
            return false; // コメントがない場合はエラーではなくスキップ
        }

        const exportData = {
            version: this.VERSION,
            exportedAt: new Date().toISOString(),
            pageCount: Object.keys(commentDataContent).length,
            pageSizes: pageSizes,
            data: commentDataContent
        };

        await _drawingExportNextFrame();
        const jsonString = JSON.stringify(exportData, null, 2);
        await _drawingExportNextFrame();

        // ファイルパスから_コメント.jsonのパスを生成
        let commentFilePath = filePath.replace(/\.(pdf|jpg|jpeg|png)$/i, '_コメント.json');

        if (window.MojiQElectron && window.MojiQElectron.isElectron) {
            try {
                // 同名ファイルが存在する場合は番号を付与して上書きを防止
                if (window.electronAPI && window.electronAPI.fileExists) {
                    commentFilePath = await this._getUniqueFilePath(commentFilePath);
                }

                const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
                const saveResult = await window.MojiQElectron.saveFile(commentFilePath, base64Data);
                if (saveResult && saveResult.success) {
                    return true;
                } else {
                    console.error('コメントデータ保存失敗:', saveResult?.error);
                    return false;
                }
            } catch (error) {
                console.error('コメントデータ保存エラー:', error);
                return false;
            }
        }

        return false;
    }
};

// グローバルに公開（MojiQ名前空間 + 後方互換性エイリアス）
window.MojiQDrawingExportImport = DrawingExportImport;
window.DrawingExportImport = DrawingExportImport; // 後方互換性
