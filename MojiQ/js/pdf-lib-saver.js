/**
 * MojiQ PDF-Lib Saver - 非破壊PDF合成モジュール
 * 元のPDFを保持しつつ、描画オブジェクトをPNG透過画像として重ねる
 */
window.MojiQPdfLibSaver = (function() {
    'use strict';

    // pdf-libのグローバル参照
    if (typeof PDFLib === 'undefined') {
        console.error('PDFLib が読み込まれていません。PDF保存機能は無効です。');
        return {
            saveNonDestructive: async () => ({ success: false, error: 'PDFLibが読み込まれていません' }),
            saveTransparent: async () => ({ success: false, error: 'PDFLibが読み込まれていません' }),
            renderDrawingObjectsToPng: async () => null,
            loadPdfBytes: async () => null,
            storePdfBytes: (d) => d,
            optimizePdfResources: async () => ({ success: false, error: 'PDFLibが読み込まれていません' })
        };
    }
    const { PDFDocument, rgb } = PDFLib;

    /**
     * MojiQテキスト情報を収集してJSON文字列を生成
     * @param {number} totalPages - 総ページ数
     * @param {Array} pageMapping - ページマッピング
     * @returns {string|null} - JSON文字列（Base64エンコード済み）またはnull
     */
    function collectMojiQTextData(totalPages, pageMapping) {
        // 確認済みコメント情報を取得（済スタンプ付きテキストは除外するため）
        let checkedSignatures = [];
        // 以前のメタデータから読み込んだ確認済み情報
        if (window.MojiQPdfManager && window.MojiQPdfManager.getLoadedCheckedComments) {
            const loaded = window.MojiQPdfManager.getLoadedCheckedComments();
            if (loaded) checkedSignatures = checkedSignatures.concat(loaded);
        }
        // 現在のセッションでチェックした情報
        if (window.ProofreadingPanel && window.ProofreadingPanel.getCheckedCommentSignatures) {
            const current = window.ProofreadingPanel.getCheckedCommentSignatures();
            if (current) checkedSignatures = checkedSignatures.concat(current);
        }

        // 確認済みかどうかをチェックするヘルパー関数
        function isChecked(pageNum, text) {
            for (const checked of checkedSignatures) {
                if (checked.pdfPage !== pageNum) continue;
                if (text === checked.contents) {
                    return true;
                }
            }
            return false;
        }

        const textData = [];
        const addedKeys = new Set(); // 重複防止用

        // 1. DrawingObjectsからMojiQテキストを収集
        if (window.MojiQDrawingObjects && window.MojiQDrawingObjects.getPageObjects) {
            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                const objects = window.MojiQDrawingObjects.getPageObjects(pageNum);
                if (!objects || objects.length === 0) continue;

                const mapItem = pageMapping && pageMapping[pageNum - 1];
                const displayWidth = mapItem?.displayWidth || mapItem?.width || 595;
                const displayHeight = mapItem?.displayHeight || mapItem?.height || 842;

                for (const obj of objects) {
                    let text = null;
                    let x = 0;
                    let y = 0;

                    // テキストオブジェクト（PDF注釈由来でないもの）
                    if (obj.type === 'text' && !obj._pdfAnnotationSource && obj.text && obj.text.trim()) {
                        text = obj.text;
                        x = obj.startPos?.x || 0;
                        y = obj.startPos?.y || 0;
                    }
                    // 図形+テキスト（annotation付き）
                    else if ((obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'line') &&
                             obj.annotation && obj.annotation.text && obj.annotation.text.trim()) {
                        text = obj.annotation.text;
                        x = obj.annotation.x || 0;
                        y = obj.annotation.y || 0;
                    }

                    // 確認済み（済スタンプ付き）のテキストは保存しない
                    if (text && !isChecked(pageNum, text)) {
                        const key = `${pageNum}:${text}`;
                        if (!addedKeys.has(key)) {
                            addedKeys.add(key);
                            textData.push({
                                p: pageNum,
                                t: text,
                                x: Math.round(x),
                                y: Math.round(y),
                                w: displayWidth,
                                h: displayHeight
                            });
                        }
                    }
                }
            }
        }

        // 2. 以前のメタデータから読み込んだMojiQテキストも保持
        // （MojiQ保存済みPDFを再読み込みした場合、DrawingObjectsにはテキストがないため）
        if (window.MojiQPdfManager && window.MojiQPdfManager.getLoadedMojiQTexts) {
            const loadedTexts = window.MojiQPdfManager.getLoadedMojiQTexts();
            if (loadedTexts && loadedTexts.length > 0) {
                for (const item of loadedTexts) {
                    // 確認済みテキストは除外
                    if (!isChecked(item.pdfPage, item.contents)) {
                        const key = `${item.pdfPage}:${item.contents}`;
                        if (!addedKeys.has(key)) {
                            addedKeys.add(key);
                            textData.push({
                                p: item.pdfPage,
                                t: item.contents,
                                x: item.canvasRect ? Math.round(item.canvasRect.x) : 0,
                                y: item.canvasRect ? Math.round(item.canvasRect.y) : 0,
                                w: item.displayWidth || 595,
                                h: item.displayHeight || 842
                            });
                        }
                    }
                }
            }
        }

        if (textData.length === 0) return null;

        // JSON文字列をBase64エンコード
        const jsonStr = JSON.stringify(textData);
        return btoa(unescape(encodeURIComponent(jsonStr)));
    }

    /**
     * 確認済みコメントの識別情報を収集してJSON文字列を生成
     * 以前のメタデータから読み込んだ確認済み情報と現在のチェック済み情報をマージ
     * @returns {string|null} - JSON文字列（Base64エンコード済み）またはnull
     */
    function collectCheckedCommentsData() {
        const compactData = [];
        const addedKeys = new Set(); // 重複防止用

        // 以前のメタデータから読み込んだ確認済みコメント情報を追加
        if (window.MojiQPdfManager && window.MojiQPdfManager.getLoadedCheckedComments) {
            const loadedChecked = window.MojiQPdfManager.getLoadedCheckedComments();
            if (loadedChecked && loadedChecked.length > 0) {
                for (const item of loadedChecked) {
                    const key = `${item.pdfPage}:${item.contents}`;
                    if (!addedKeys.has(key)) {
                        addedKeys.add(key);
                        compactData.push({
                            p: item.pdfPage,
                            c: item.contents,
                            x: item.canvasRect ? Math.round(item.canvasRect.x) : null,
                            y: item.canvasRect ? Math.round(item.canvasRect.y) : null
                        });
                    }
                }
            }
        }

        // 現在のセッションでチェックしたコメント情報を追加
        if (window.ProofreadingPanel && window.ProofreadingPanel.getCheckedCommentSignatures) {
            const signatures = window.ProofreadingPanel.getCheckedCommentSignatures();
            if (signatures && signatures.length > 0) {
                for (const sig of signatures) {
                    const key = `${sig.pdfPage}:${sig.contents}`;
                    if (!addedKeys.has(key)) {
                        addedKeys.add(key);
                        compactData.push({
                            p: sig.pdfPage,
                            c: sig.contents,
                            x: sig.canvasRect ? Math.round(sig.canvasRect.x) : null,
                            y: sig.canvasRect ? Math.round(sig.canvasRect.y) : null
                        });
                    }
                }
            }
        }

        if (compactData.length === 0) {
            return null;
        }

        const jsonStr = JSON.stringify(compactData);
        return btoa(unescape(encodeURIComponent(jsonStr)));
    }

    /**
     * CanvasをPNG Blobに変換（タイムアウト・エラーハンドリング付き）
     * @param {HTMLCanvasElement} canvas - 変換するCanvas
     * @param {number} timeout - タイムアウト時間（ミリ秒、デフォルト30秒）
     * @returns {Promise<{data: Uint8Array|null, timedOut: boolean}>} - PNG画像データとタイムアウトフラグ
     */
    function canvasToPngWithTimeout(canvas, timeout = 30000) {
        return new Promise((resolve) => {
            // BUG修正: 二重resolve防止フラグ
            let resolved = false;
            const safeResolve = (value) => {
                if (!resolved) {
                    resolved = true;
                    resolve(value);
                }
            };

            const timeoutId = setTimeout(() => {
                console.warn('canvasToPngWithTimeout: toBlob timeout');
                safeResolve({ data: null, timedOut: true });
            }, timeout);

            try {
                canvas.toBlob((blob) => {
                    clearTimeout(timeoutId);
                    if (!blob) {
                        safeResolve({ data: null, timedOut: false });
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                        safeResolve({ data: new Uint8Array(reader.result), timedOut: false });
                    };
                    reader.onerror = () => {
                        console.warn('canvasToPngWithTimeout: FileReader error');
                        safeResolve({ data: null, timedOut: false });
                    };
                    // BUG修正: readAsArrayBufferの例外をキャッチ
                    try {
                        reader.readAsArrayBuffer(blob);
                    } catch (readerError) {
                        console.warn('canvasToPngWithTimeout: readAsArrayBuffer exception', readerError);
                        safeResolve({ data: null, timedOut: false });
                    }
                }, 'image/png');
            } catch (e) {
                clearTimeout(timeoutId);
                console.warn('canvasToPngWithTimeout: toBlob exception', e);
                safeResolve({ data: null, timedOut: false });
            }
        });
    }

    /**
     * CanvasをJPEG Blobに変換（圧縮用、タイムアウト・エラーハンドリング付き）
     * @param {HTMLCanvasElement} canvas - 変換するCanvas
     * @param {number} quality - JPEG品質 (0.0-1.0)
     * @param {number} timeout - タイムアウト時間（ミリ秒、デフォルト30秒）
     * @returns {Promise<{data: Uint8Array|null, timedOut: boolean}>} - JPEG画像データとタイムアウトフラグ
     */
    function canvasToJpegWithTimeout(canvas, quality = 0.75, timeout = 30000) {
        return new Promise((resolve) => {
            // BUG修正: 二重resolve防止フラグ
            let resolved = false;
            const safeResolve = (value) => {
                if (!resolved) {
                    resolved = true;
                    resolve(value);
                }
            };

            const timeoutId = setTimeout(() => {
                console.warn('canvasToJpegWithTimeout: toBlob timeout');
                safeResolve({ data: null, timedOut: true });
            }, timeout);

            try {
                canvas.toBlob((blob) => {
                    clearTimeout(timeoutId);
                    if (!blob) {
                        safeResolve({ data: null, timedOut: false });
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                        safeResolve({ data: new Uint8Array(reader.result), timedOut: false });
                    };
                    reader.onerror = () => {
                        console.warn('canvasToJpegWithTimeout: FileReader error');
                        safeResolve({ data: null, timedOut: false });
                    };
                    // BUG修正: readAsArrayBufferの例外をキャッチ
                    try {
                        reader.readAsArrayBuffer(blob);
                    } catch (readerError) {
                        console.warn('canvasToJpegWithTimeout: readAsArrayBuffer exception', readerError);
                        safeResolve({ data: null, timedOut: false });
                    }
                }, 'image/jpeg', quality);
            } catch (e) {
                clearTimeout(timeoutId);
                console.warn('canvasToJpegWithTimeout: toBlob exception', e);
                safeResolve({ data: null, timedOut: false });
            }
        });
    }

    /**
     * 圧縮保存用の設定（画質最優先）
     */
    const COMPRESS_SETTINGS = {
        TARGET_SIZE_MB: 25,
        INITIAL_QUALITY: 0.95,   // ほぼ最高品質から開始
        MIN_QUALITY: 0.65,       // 最低品質（高めに維持）
        QUALITY_STEP: 0.02,      // 非常に細かいステップで調整
        INITIAL_SCALE: 2.5,      // 高解像度から開始
        MIN_SCALE: 1.5           // 最低スケール（文字の鮮明さを維持）
    };

    /**
     * キャンバスの最大メモリサイズ（ピクセル数）
     * 約200MB相当 (RGBA 4バイト/ピクセル)
     */
    const MAX_CANVAS_PIXELS = 50000000; // 50メガピクセル

    /**
     * オブジェクト数とページサイズに応じて最適なスケールを計算
     * メモリ枯渇を防ぐため、キャンバスサイズを制限する
     * @param {number} objectCount - オブジェクト数
     * @param {number} width - ページ幅（省略可）
     * @param {number} height - ページ高さ（省略可）
     * @returns {number} - スケール値（1〜4）
     */
    function getOptimalScale(objectCount, width, height) {
        // オブジェクト数に基づく基本スケール
        let baseScale;
        if (objectCount > 200) {
            baseScale = 2;  // 大量オブジェクト: 低解像度で高速化
        } else if (objectCount > 100) {
            baseScale = 3;  // 中量オブジェクト: 中解像度
        } else {
            baseScale = 4;  // 少量オブジェクト: 高解像度
        }

        // ページサイズが指定されている場合、メモリ制限を考慮
        if (width && height && width > 0 && height > 0) {
            // 現在のスケールでのピクセル数を計算
            let currentScale = baseScale;
            while (currentScale > 1) {
                const pixels = (width * currentScale) * (height * currentScale);
                if (pixels <= MAX_CANVAS_PIXELS) {
                    break;
                }
                currentScale--;
            }
            return currentScale;
        }

        return baseScale;
    }

    /**
     * オブジェクト数に応じてタイムアウトを計算
     * @param {number} objectCount - オブジェクト数
     * @returns {number} - タイムアウト値（ミリ秒）
     */
    function getOptimalTimeout(objectCount) {
        // ベース30秒 + オブジェクト1個あたり500ms
        return 30000 + (objectCount * 500);
    }

    /**
     * 描画オブジェクトをPNG透過画像としてレンダリング
     * @param {number} pageNum - ページ番号
     * @param {number} width - 出力幅
     * @param {number} height - 出力高さ
     * @param {number} displayWidth - 表示時の幅
     * @param {number} displayHeight - 表示時の高さ
     * @param {number} offsetX - X方向オフセット（見開き用）
     * @returns {Promise<Uint8Array|null>} - PNG画像データ（描画がない場合はnull）
     */
    async function renderDrawingObjectsToPng(pageNum, width, height, displayWidth, displayHeight, offsetX = 0) {
        const DrawingObjects = window.MojiQDrawingObjects;
        const DrawingRenderer = window.MojiQDrawingRenderer;

        if (!DrawingObjects || !DrawingRenderer) {
            return { data: null, timedOut: false };
        }

        const objects = DrawingObjects.getPageObjects(pageNum);
        if (!objects || objects.length === 0) {
            return { data: null, timedOut: false };
        }

        // オブジェクト数とページサイズに応じてスケールとタイムアウトを動的調整
        const objectCount = objects.length;
        const scale = getOptimalScale(objectCount, width, height);
        const timeout = getOptimalTimeout(objectCount);

        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');

        // 画像スムージング設定
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 透明な背景
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // スケーリング設定
        const scaleX = (width / displayWidth) * scale;
        const scaleY = (height / displayHeight) * scale;

        ctx.save();
        ctx.translate(offsetX * scale, 0);
        ctx.scale(scaleX, scaleY);

        // 選択状態を一時的に解除
        const savedSelectedIndex = DrawingObjects.getSelectedIndex(pageNum);
        DrawingObjects.deselectObject(pageNum);

        // エクスポートモードを有効化（マーカーの色を事前計算）
        DrawingRenderer.setExportMode(true);

        // 描画オブジェクトをレンダリング
        DrawingRenderer.renderAll(ctx, pageNum);

        // エクスポートモードを無効化
        DrawingRenderer.setExportMode(false);

        // 選択状態を復元
        if (savedSelectedIndex !== null) {
            DrawingObjects.selectObject(pageNum, savedSelectedIndex);
        }

        ctx.restore();

        // CanvasをPNG Blobに変換（動的タイムアウト付き）
        return canvasToPngWithTimeout(canvas, timeout);
    }

    /**
     * 見開きページの描画オブジェクトをPNG透過画像としてレンダリング
     * @param {object} spread - 見開き情報 { leftPage, rightPage }
     * @param {number} spreadIndex - 見開きインデックス
     * @param {number} spreadWidth - 見開き全体の幅（PDF座標系）
     * @param {number} spreadHeight - 見開き全体の高さ（PDF座標系）
     * @param {number} leftPageWidth - 左ページの幅（PDF座標系）
     * @param {number} rightPageWidth - 右ページの幅（PDF座標系）
     * @param {number} displayPageWidth - 表示時のページ幅（単ページ）
     * @param {number} displayPageHeight - 表示時のページ高さ
     * @param {number} spreadCssWidth - 見開きCSS座標系の全体幅（省略時はdisplayPageWidth*2）
     * @param {number} spreadCssHeight - 見開きCSS座標系の高さ（省略時はdisplayPageHeight）
     * @returns {Promise<Uint8Array|null>}
     */
    async function renderSpreadDrawingObjectsToPng(spread, spreadIndex, spreadWidth, spreadHeight, leftPageWidth, rightPageWidth, displayPageWidth, displayPageHeight, spreadCssWidth, spreadCssHeight) {
        const DrawingObjects = window.MojiQDrawingObjects;
        const DrawingRenderer = window.MojiQDrawingRenderer;

        if (!DrawingObjects || !DrawingRenderer) {
            return { data: null, timedOut: false };
        }

        // 見開きモード中は spread_N キーからオブジェクトを取得
        const spreadKey = DrawingObjects.getSpreadPageKey(spreadIndex);
        const spreadObjects = DrawingObjects.getPageObjects(spreadKey);

        // 見開きキーにオブジェクトがある場合はそれを使用
        // なければ左右ページから直接取得（見開きモード解除後の保存など）
        let leftObjects = [];
        let rightObjects = [];

        if (spreadObjects && spreadObjects.length > 0) {
            // 見開きキーにオブジェクトがある場合、左右に分割して描画
            // spreadObjectsには左右両方のオブジェクトが含まれている
            // 左右判定には見開きCSS座標系の半分の値を使用
            // spreadCssWidth/Heightが指定されていればそれを使用、なければdisplayPageWidth*2を使用
            const actualSpreadCssWidth = spreadCssWidth || (displayPageWidth * 2);
            const cssHalfWidth = actualSpreadCssWidth / 2;

            leftObjects = spreadObjects.filter(obj => {
                // オブジェクトの中心X座標を計算（より正確な左右判定）
                let objX = null;
                if (obj.startPos && obj.endPos) {
                    // 矩形系オブジェクト
                    objX = (obj.startPos.x + obj.endPos.x) / 2;
                } else if (obj.bounds) {
                    // テキスト系オブジェクト
                    objX = obj.bounds.x + (obj.bounds.width || 0) / 2;
                } else if (obj.x !== undefined) {
                    objX = obj.x;
                } else if (obj.points && obj.points.length > 0) {
                    // ペン・ポリライン系オブジェクト（点の平均X座標）
                    const sumX = obj.points.reduce((sum, p) => sum + (p.x || 0), 0);
                    objX = sumX / obj.points.length;
                }
                // objXが取得できない場合は左ページとして扱う（フォールバック）
                // CSS座標系の半分より小さければ左ページ
                return objX === null || objX < cssHalfWidth;
            });
            rightObjects = spreadObjects.filter(obj => {
                let objX = null;
                if (obj.startPos && obj.endPos) {
                    objX = (obj.startPos.x + obj.endPos.x) / 2;
                } else if (obj.bounds) {
                    objX = obj.bounds.x + (obj.bounds.width || 0) / 2;
                } else if (obj.x !== undefined) {
                    objX = obj.x;
                } else if (obj.points && obj.points.length > 0) {
                    const sumX = obj.points.reduce((sum, p) => sum + (p.x || 0), 0);
                    objX = sumX / obj.points.length;
                }
                // objXが有効で、CSS座標系の半分以上なら右ページ
                return objX !== null && objX >= cssHalfWidth;
            });
        } else {
            // フォールバック: 元のページ番号から直接取得
            leftObjects = spread.leftPage ? DrawingObjects.getPageObjects(spread.leftPage) : [];
            rightObjects = spread.rightPage ? DrawingObjects.getPageObjects(spread.rightPage) : [];
        }

        if ((!leftObjects || leftObjects.length === 0) && (!rightObjects || rightObjects.length === 0)) {
            return { data: null, timedOut: false };
        }

        // オブジェクト数と見開きサイズに応じてスケールとタイムアウトを動的調整
        const totalObjectCount = (spreadObjects ? spreadObjects.length : 0) +
                                 (leftObjects ? leftObjects.length : 0) +
                                 (rightObjects ? rightObjects.length : 0);
        const scale = getOptimalScale(totalObjectCount, spreadWidth, spreadHeight);
        const timeout = getOptimalTimeout(totalObjectCount);

        const canvas = document.createElement('canvas');
        canvas.width = spreadWidth * scale;
        canvas.height = spreadHeight * scale;
        const ctx = canvas.getContext('2d');

        // 画像スムージング設定
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 透明な背景
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 見開きキーにオブジェクトがある場合は、見開きキーでレンダリング
        if (spreadObjects && spreadObjects.length > 0) {
            // 見開きCSS座標系からPDF座標系へのスケール
            // spreadCssWidth/Heightが指定されていればそれを使用、なければdisplayPageWidth*2を使用
            const actualSpreadCssWidth = spreadCssWidth || (displayPageWidth * 2);
            const actualSpreadCssHeight = spreadCssHeight || displayPageHeight;
            const scaleX = (spreadWidth / actualSpreadCssWidth) * scale;
            const scaleY = (spreadHeight / actualSpreadCssHeight) * scale;

            ctx.save();
            ctx.scale(scaleX, scaleY);

            const savedSelectedIndex = DrawingObjects.getSelectedIndex(spreadKey);
            DrawingObjects.deselectObject(spreadKey);

            // エクスポートモードを有効化（マーカーの色を事前計算）
            DrawingRenderer.setExportMode(true);
            DrawingRenderer.renderAll(ctx, spreadKey);
            DrawingRenderer.setExportMode(false);

            if (savedSelectedIndex !== null) {
                DrawingObjects.selectObject(spreadKey, savedSelectedIndex);
            }

            ctx.restore();
        } else {
            // フォールバック: 左右ページを個別にレンダリング
            // エクスポートモードを有効化（マーカーの色を事前計算）
            DrawingRenderer.setExportMode(true);

            // 左ページの描画オブジェクト
            if (spread.leftPage && leftObjects && leftObjects.length > 0) {
                const scaleX = (leftPageWidth / displayPageWidth) * scale;
                const scaleY = (spreadHeight / displayPageHeight) * scale;

                ctx.save();
                ctx.scale(scaleX, scaleY);

                const savedSelectedIndex = DrawingObjects.getSelectedIndex(spread.leftPage);
                DrawingObjects.deselectObject(spread.leftPage);
                DrawingRenderer.renderAll(ctx, spread.leftPage);
                if (savedSelectedIndex !== null) {
                    DrawingObjects.selectObject(spread.leftPage, savedSelectedIndex);
                }

                ctx.restore();
            }

            // 右ページの描画オブジェクト
            if (spread.rightPage && rightObjects && rightObjects.length > 0) {
                const scaleX = (rightPageWidth / displayPageWidth) * scale;
                const scaleY = (spreadHeight / displayPageHeight) * scale;

                ctx.save();
                ctx.translate(leftPageWidth * scale, 0);
                ctx.scale(scaleX, scaleY);

                const savedSelectedIndex = DrawingObjects.getSelectedIndex(spread.rightPage);
                DrawingObjects.deselectObject(spread.rightPage);
                DrawingRenderer.renderAll(ctx, spread.rightPage);
                if (savedSelectedIndex !== null) {
                    DrawingObjects.selectObject(spread.rightPage, savedSelectedIndex);
                }

                ctx.restore();
            }

            // エクスポートモードを無効化
            DrawingRenderer.setExportMode(false);
        }

        // CanvasをPNG Blobに変換（動的タイムアウト付き）
        return canvasToPngWithTimeout(canvas, timeout);
    }

    /**
     * 元のPDFバイナリを取得
     * @param {object} state - アプリケーション状態
     * @returns {Promise<Uint8Array|null>} - PDFバイナリデータ
     */
    async function getOriginalPdfBytes(state) {
        // state.originalPdfBytes が保存されている場合はそれを使用
        if (state.originalPdfBytes) {
            return state.originalPdfBytes;
        }

        // pdfDocsから再構築（複数PDFの場合は最初のものを使用）
        if (state.pdfDocs && state.pdfDocs.length > 0) {
            const pdfDoc = state.pdfDocs[0];
            if (pdfDoc._pdfInfo && pdfDoc._pdfInfo.fingerprints) {
                // PDF.jsのドキュメントから元データは取得できないため、
                // この場合はnullを返す
                return null;
            }
        }

        return null;
    }

    /**
     * 非破壊PDF保存（pdf-lib使用）
     * @param {object} state - アプリケーション状態
     * @param {string} fileName - ファイル名
     * @param {object} options - オプション
     * @param {function} options.onProgress - 進捗コールバック (percent) => void （0-100のパーセント値）
     * @param {object} options.imagePageData - 画像ページデータ（MojiQPdfManagerから渡される）
     * @param {boolean} options.spreadMode - 見開きモードで保存するかどうか
     * @param {Array} options.spreadMapping - 見開きマッピング配列
     * @param {boolean} options.compressMode - 圧縮保存モード（25MB以下に圧縮）
     * @returns {Promise<{success: boolean, data?: Uint8Array, error?: string, compressed?: boolean, compressWarning?: string}>}
     */
    async function saveNonDestructive(state, fileName, options = {}) {
        if (!state.pdfDocs || state.pdfDocs.length === 0) {
            return { success: false, error: 'PDFが読み込まれていません' };
        }

        const onProgress = options.onProgress || (() => {});
        // ページ処理を90%、pdfDoc.save()を10%として扱う
        const PAGE_PROGRESS_RATIO = 0.9;
        const imagePageData = options.imagePageData || (window.MojiQPdfManager && window.MojiQPdfManager.getImagePageData ? window.MojiQPdfManager.getImagePageData() : {});
        const spreadMode = options.spreadMode || false;
        const spreadMapping = options.spreadMapping || [];
        const compressMode = options.compressMode || false;

        // 圧縮モードの場合は圧縮保存関数を使用
        if (compressMode) {
            return await saveWithCompression(state, fileName, options);
        }

        // 見開きモードの場合は別の保存ロジックを使用
        if (spreadMode && spreadMapping.length > 0) {
            return await saveNonDestructiveSpread(state, fileName, options, imagePageData, spreadMapping);
        }

        // タイムアウトしたページを追跡
        const timedOutPages = [];

        // PDF注釈由来テキストを一時的に非表示にする（保存時は常に非表示）
        const TextLayerManager = window.MojiQTextLayerManager;

        if (TextLayerManager) {
            TextLayerManager.setIsHiddenInternal(true);
        }

        try {
            // 新しいPDFドキュメントを作成
            const pdfDoc = await PDFDocument.create();

            // 元のPDFバイトデータを取得（保存されている場合）
            const originalPdfBytesArray = state.originalPdfBytesArray || [];

            // 元PDFをキャッシュ（同じPDFを何度も読み込まないように）
            const srcPdfCache = {};

            for (let i = 0; i < state.totalPages; i++) {
                const mapItem = state.pageMapping[i];
                if (!mapItem) {
                    console.error('pageMappingが不正です（インデックス:', i, '）');
                    continue;
                }
                const pageNum = i + 1;

                // 進捗を報告（ページ処理は全体の90%）
                const percent = Math.round((pageNum / state.totalPages) * PAGE_PROGRESS_RATIO * 100);
                onProgress(percent);

                // UIをブロックしないため次フレームまで待機
                await new Promise(resolve => setTimeout(resolve, 0));

                let pageWidth, pageHeight;
                let page;

                if (mapItem.docIndex === -2) {
                    // 画像ページ
                    const imgData = imagePageData[mapItem.imageIndex];
                    if (!imgData || !imgData.data) {
                        console.error('画像データが見つかりません:', mapItem.imageIndex);
                        continue;
                    }

                    // 画像データの検証
                    const isValidData = (typeof imgData.data === 'string') ||
                                        (imgData.data instanceof Uint8Array) ||
                                        (imgData.data instanceof ArrayBuffer);
                    if (!isValidData) {
                        console.error('画像データの形式が無効です:', mapItem.imageIndex, typeof imgData.data);
                        continue;
                    }

                    pageWidth = imgData.width;
                    pageHeight = imgData.height;
                    page = pdfDoc.addPage([pageWidth, pageHeight]);

                    // 画像をPDFに埋め込み
                    let image;
                    if (imgData.type === 'png') {
                        image = await pdfDoc.embedPng(imgData.data);
                    } else {
                        image = await pdfDoc.embedJpg(imgData.data);
                    }

                    page.drawImage(image, {
                        x: 0,
                        y: 0,
                        width: pageWidth,
                        height: pageHeight,
                    });
                } else if (mapItem.docIndex === -1) {
                    // 白紙ページ
                    pageWidth = mapItem.width || 595;
                    pageHeight = mapItem.height || 842;
                    page = pdfDoc.addPage([pageWidth, pageHeight]);

                    // 白で塗りつぶし
                    page.drawRectangle({
                        x: 0,
                        y: 0,
                        width: pageWidth,
                        height: pageHeight,
                        color: rgb(1, 1, 1),
                    });
                } else {
                    // 元のPDFからページをコピー
                    const originalBytes = originalPdfBytesArray[mapItem.docIndex];

                    if (originalBytes) {
                        // キャッシュから取得、なければ読み込み
                        if (!srcPdfCache[mapItem.docIndex]) {
                            try {
                                srcPdfCache[mapItem.docIndex] = await PDFDocument.load(originalBytes, {
                                    ignoreEncryption: true
                                });
                            } catch (loadError) {
                                console.error('元PDFの読み込みに失敗:', loadError);
                                // フォールバック: Canvas経由で処理
                                srcPdfCache[mapItem.docIndex] = null;
                            }
                        }

                        const srcPdf = srcPdfCache[mapItem.docIndex];

                        if (srcPdf) {
                            const srcPageCount = srcPdf.getPageCount();

                            if (mapItem.pageNum <= srcPageCount) {
                                const [copiedPage] = await pdfDoc.copyPages(srcPdf, [mapItem.pageNum - 1]);
                                page = pdfDoc.addPage(copiedPage);
                                const { width, height } = page.getSize();
                                pageWidth = width;
                                pageHeight = height;
                            } else {
                                throw new Error(`ページ番号が範囲外です: ${mapItem.pageNum} > ${srcPageCount}`);
                            }
                        } else {
                            // srcPdfがnullの場合（元PDFの読み込みに失敗）、Canvas経由で処理
                            const targetDoc = state.pdfDocs[mapItem.docIndex];
                            const pdfPage = await targetDoc.getPage(mapItem.pageNum);
                            const viewport = pdfPage.getViewport({ scale: 1 });
                            pageWidth = viewport.width;
                            pageHeight = viewport.height;

                            // PDFページをCanvasにレンダリング
                            const scale = 2;
                            const canvas = document.createElement('canvas');
                            canvas.width = pageWidth * scale;
                            canvas.height = pageHeight * scale;
                            const ctx = canvas.getContext('2d');

                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);

                            const scaledViewport = pdfPage.getViewport({ scale: scale });
                            await pdfPage.render({
                                canvasContext: ctx,
                                viewport: scaledViewport
                            }).promise;

                            const pngResult = await canvasToPngWithTimeout(canvas);

                            if (!pngResult || !pngResult.data) {
                                canvas.width = 0;
                                canvas.height = 0;
                                console.error('Canvas to Blob変換に失敗しました（ページ:', pageNum, '）');
                                continue;
                            }

                            page = pdfDoc.addPage([pageWidth, pageHeight]);
                            const bgImage = await pdfDoc.embedPng(pngResult.data);
                            page.drawImage(bgImage, {
                                x: 0,
                                y: 0,
                                width: pageWidth,
                                height: pageHeight,
                            });

                            canvas.width = 0;
                            canvas.height = 0;
                        }
                    } else {
                        // 元のPDFバイトデータがない場合はCanvas経由で取得（フォールバック）
                        const targetDoc = state.pdfDocs[mapItem.docIndex];
                        const pdfPage = await targetDoc.getPage(mapItem.pageNum);
                        const viewport = pdfPage.getViewport({ scale: 1 });
                        pageWidth = viewport.width;
                        pageHeight = viewport.height;

                        // PDFページをCanvasにレンダリング
                        const scale = 2;
                        const canvas = document.createElement('canvas');
                        canvas.width = pageWidth * scale;
                        canvas.height = pageHeight * scale;
                        const ctx = canvas.getContext('2d');

                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);

                        const scaledViewport = pdfPage.getViewport({ scale: scale });
                        await pdfPage.render({
                            canvasContext: ctx,
                            viewport: scaledViewport
                        }).promise;

                        const pngResult = await canvasToPngWithTimeout(canvas);

                        if (!pngResult || !pngResult.data) {
                            canvas.width = 0;
                            canvas.height = 0;
                            console.error('Canvas to Blob変換に失敗しました（ページ:', pageNum, '）');
                            continue;
                        }

                        page = pdfDoc.addPage([pageWidth, pageHeight]);
                        const bgImage = await pdfDoc.embedPng(pngResult.data);
                        page.drawImage(bgImage, {
                            x: 0,
                            y: 0,
                            width: pageWidth,
                            height: pageHeight,
                        });

                        canvas.width = 0;
                        canvas.height = 0;
                    }
                }

                // 描画オブジェクトをPNG透過画像として重ねる
                const displayWidth = mapItem.displayWidth || pageWidth;
                const displayHeight = mapItem.displayHeight || pageHeight;

                const drawingResult = await renderDrawingObjectsToPng(
                    pageNum,
                    pageWidth,
                    pageHeight,
                    displayWidth,
                    displayHeight
                );

                if (drawingResult.timedOut) {
                    timedOutPages.push(pageNum);
                    console.warn(`ページ ${pageNum} の描画オブジェクト保存がタイムアウトしました`);
                }

                // 描画データの検証: Uint8Array であることを確認
                if (drawingResult.data && drawingResult.data instanceof Uint8Array && drawingResult.data.length > 0) {
                    const drawingImage = await pdfDoc.embedPng(drawingResult.data);
                    page.drawImage(drawingImage, {
                        x: 0,
                        y: 0,
                        width: pageWidth,
                        height: pageHeight,
                    });
                }
            }

            // メタデータを設定
            pdfDoc.setTitle(fileName);
            pdfDoc.setCreator('MojiQ');
            pdfDoc.setProducer('MojiQ PDF-Lib Saver');

            // コメントテキスト非表示状態とMojiQテキストデータをSubjectに保存
            // 保存時は常にコメントテキストを非表示にするため、常にtrue
            const mojiQTextData = collectMojiQTextData(state.totalPages, state.pageMapping);
            let subjectData = 'MojiQ:commentTextHidden=true';
            if (mojiQTextData) {
                subjectData += ';MojiQText:' + mojiQTextData;
            }
            // 確認済みコメント情報を追加
            const checkedCommentsData = collectCheckedCommentsData();
            if (checkedCommentsData) {
                subjectData += ';MojiQChecked:' + checkedCommentsData;
            }
            // メタデータサイズが大きすぎる場合は警告（PDFビューアの互換性のため）
            if (subjectData.length > 100000) {
                console.warn(`[MojiQ] メタデータが大きいです（${Math.round(subjectData.length / 1024)}KB）。テキストオブジェクトが多い場合、再読み込み時にメタデータが失われる可能性があります。`);
            }
            pdfDoc.setSubject(subjectData);

            // 90%完了を報告（PDF出力処理開始）
            onProgress(90);
            await new Promise(resolve => setTimeout(resolve, 0));

            // PDFを保存（useObjectStreams: falseで高速化）
            const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

            // 保存結果の検証（破損データ防止）
            if (!pdfBytes || !(pdfBytes instanceof Uint8Array) || pdfBytes.length === 0) {
                throw new Error('PDF生成に失敗しました（出力データが空です）');
            }

            // 100%完了を報告
            onProgress(100);

            // タイムアウト警告がある場合は結果に含める
            const result = { success: true, data: pdfBytes };
            if (timedOutPages.length > 0) {
                result.warnings = timedOutPages;
            }
            return result;

        } catch (error) {
            console.error('PDF保存エラー:', error);
            return { success: false, error: error.message };
        } finally {
            // PDF注釈由来テキストを非表示状態のままボタンにも反映
            if (TextLayerManager) {
                TextLayerManager.setIsHidden(true);
            }
        }
    }

    /**
     * 圧縮保存（25MB以下になるまで段階的に圧縮、画質維持優先）
     * 各ページをCanvas経由でJPEGにラスタライズして圧縮する
     * @param {object} state - アプリケーション状態
     * @param {string} fileName - ファイル名
     * @param {object} options - オプション
     * @returns {Promise<{success: boolean, data?: Uint8Array, error?: string, compressed?: boolean, compressWarning?: string}>}
     */
    async function saveWithCompression(state, fileName, options = {}) {
        const onProgress = options.onProgress || (() => {});
        const targetSizeBytes = COMPRESS_SETTINGS.TARGET_SIZE_MB * 1024 * 1024;
        const imagePageData = options.imagePageData || (window.MojiQPdfManager && window.MojiQPdfManager.getImagePageData ? window.MojiQPdfManager.getImagePageData() : {});
        // 見開きモード関連のオプション
        const spreadMode = options.spreadMode || false;
        const spreadMapping = options.spreadMapping || [];
        const spreadCssPageWidth = options.spreadCssPageWidth || null;
        const spreadCssPageHeight = options.spreadCssPageHeight || null;

        // PDF注釈由来テキストを一時的に非表示にする（保存時は常に非表示）
        const TextLayerManager = window.MojiQTextLayerManager;

        if (TextLayerManager) {
            TextLayerManager.setIsHiddenInternal(true);
        }

        try {
            onProgress(5);

            // ステップ1: 高品質でまずサイズを確認
            let totalSkippedPages = 0;
            let compressResult = await createCompressedPdf(state, fileName, {
                quality: COMPRESS_SETTINGS.INITIAL_QUALITY,
                scale: COMPRESS_SETTINGS.INITIAL_SCALE,
                imagePageData,
                spreadMode,
                spreadMapping,
                spreadCssPageWidth,
                spreadCssPageHeight,
                onProgress: (p) => onProgress(5 + p * 0.2)
            });

            if (!compressResult) {
                return { success: false, error: '圧縮PDF生成に失敗しました' };
            }
            // createCompressedPdfの戻り値: { pdfBytes, skippedPages } または Uint8Array(従来互換)
            let pdfBytes = compressResult.pdfBytes || compressResult;
            if (compressResult.skippedPages) totalSkippedPages = compressResult.skippedPages;

            let currentSizeMB = pdfBytes.length / (1024 * 1024);
            console.log(`初期サイズ: ${currentSizeMB.toFixed(2)}MB (quality=${COMPRESS_SETTINGS.INITIAL_QUALITY}, scale=${COMPRESS_SETTINGS.INITIAL_SCALE})`);

            // skippedPages警告生成用ヘルパー
            const buildSkipWarning = () => totalSkippedPages > 0
                ? `${totalSkippedPages}ページのJPEG変換に失敗し、PDFに含まれていません。`
                : undefined;

            // すでにターゲット以下なら完了
            if (pdfBytes.length <= targetSizeBytes) {
                onProgress(100);
                const result = { success: true, data: pdfBytes, compressed: true };
                if (buildSkipWarning()) result.compressWarning = buildSkipWarning();
                return result;
            }

            // ステップ2: 必要な圧縮率を計算して最適なパラメータを推定
            const compressionRatio = targetSizeBytes / pdfBytes.length;

            // 圧縮率から適切な品質を推定（JPEGの品質とサイズは概ね比例）
            // ただし、スケールも考慮（スケール^2がサイズに影響）
            let estimatedQuality = Math.max(
                COMPRESS_SETTINGS.MIN_QUALITY,
                Math.min(COMPRESS_SETTINGS.INITIAL_QUALITY, COMPRESS_SETTINGS.INITIAL_QUALITY * Math.sqrt(compressionRatio) * 1.1)
            );
            let scale = COMPRESS_SETTINGS.INITIAL_SCALE;

            // 圧縮率が厳しい場合（50%以下）はスケールも下げる
            if (compressionRatio < 0.5) {
                scale = Math.max(COMPRESS_SETTINGS.MIN_SCALE, COMPRESS_SETTINGS.INITIAL_SCALE * Math.sqrt(compressionRatio) * 1.2);
            }

            console.log(`推定パラメータ: quality=${estimatedQuality.toFixed(2)}, scale=${scale.toFixed(2)} (圧縮率=${(compressionRatio * 100).toFixed(1)}%)`);

            // ステップ3: 推定パラメータで生成
            onProgress(30);
            compressResult = await createCompressedPdf(state, fileName, {
                quality: estimatedQuality,
                scale,
                imagePageData,
                spreadMode,
                spreadMapping,
                spreadCssPageWidth,
                spreadCssPageHeight,
                onProgress: (p) => onProgress(30 + p * 0.3)
            });

            if (!compressResult) {
                return { success: false, error: '圧縮PDF生成に失敗しました' };
            }
            pdfBytes = compressResult.pdfBytes || compressResult;
            if (compressResult.skippedPages) totalSkippedPages = compressResult.skippedPages;

            currentSizeMB = pdfBytes.length / (1024 * 1024);
            console.log(`推定後サイズ: ${currentSizeMB.toFixed(2)}MB`);

            // ターゲット以下なら完了
            if (pdfBytes.length <= targetSizeBytes) {
                onProgress(100);
                const result = { success: true, data: pdfBytes, compressed: true };
                if (buildSkipWarning()) result.compressWarning = buildSkipWarning();
                return result;
            }

            // ステップ4: まだ大きい場合は段階的に品質を下げる
            // BUG修正: 全体タイムアウトを追加（UIフリーズ防止）
            let quality = estimatedQuality;
            let bestBytes = pdfBytes;
            let attempts = 0;
            const maxAttempts = 8;
            const overallStartTime = Date.now();
            const OVERALL_TIMEOUT_MS = 180000; // 3分

            while (attempts < maxAttempts && pdfBytes.length > targetSizeBytes) {
                // 全体タイムアウトチェック
                if (Date.now() - overallStartTime > OVERALL_TIMEOUT_MS) {
                    console.warn('圧縮処理が全体タイムアウト（3分）に達しました');
                    break;
                }
                attempts++;

                // 品質を下げる
                quality -= COMPRESS_SETTINGS.QUALITY_STEP;

                // 品質が最低に達したらスケールも下げる
                if (quality < COMPRESS_SETTINGS.MIN_QUALITY) {
                    quality = COMPRESS_SETTINGS.MIN_QUALITY + 0.1;
                    scale = Math.max(COMPRESS_SETTINGS.MIN_SCALE, scale - 0.2);
                    if (scale <= COMPRESS_SETTINGS.MIN_SCALE && quality <= COMPRESS_SETTINGS.MIN_QUALITY) {
                        break;
                    }
                }

                onProgress(60 + attempts * 4);

                compressResult = await createCompressedPdf(state, fileName, {
                    quality,
                    scale,
                    imagePageData,
                    spreadMode,
                    spreadMapping,
                    spreadCssPageWidth,
                    spreadCssPageHeight,
                    onProgress: () => {}
                });

                if (!compressResult) continue;
                pdfBytes = compressResult.pdfBytes || compressResult;
                if (compressResult.skippedPages) totalSkippedPages = compressResult.skippedPages;

                currentSizeMB = pdfBytes.length / (1024 * 1024);
                console.log(`調整 ${attempts}: quality=${quality.toFixed(2)}, scale=${scale.toFixed(2)}, size=${currentSizeMB.toFixed(2)}MB`);

                bestBytes = pdfBytes;

                if (pdfBytes.length <= targetSizeBytes) {
                    onProgress(100);
                    const result = { success: true, data: pdfBytes, compressed: true };
                    if (buildSkipWarning()) result.compressWarning = buildSkipWarning();
                    return result;
                }
            }

            // ターゲット未達でも最小サイズ版を返す
            onProgress(100);
            const finalSizeMB = bestBytes.length / (1024 * 1024);
            let warning = `圧縮後のファイルサイズは ${finalSizeMB.toFixed(1)}MB です。25MB以下にできませんでした。`;
            if (buildSkipWarning()) warning += '\n' + buildSkipWarning();
            return {
                success: true,
                data: bestBytes,
                compressed: true,
                compressWarning: warning
            };

        } catch (error) {
            console.error('圧縮保存エラー:', error);
            return { success: false, error: error.message };
        } finally {
            // PDF注釈由来テキストを非表示状態のままボタンにも反映
            if (TextLayerManager) {
                TextLayerManager.setIsHidden(true);
            }
        }
    }

    /**
     * 圧縮用PDFを生成（各ページをCanvas経由でJPEGにラスタライズ）
     * @param {object} state - アプリケーション状態
     * @param {string} fileName - ファイル名
     * @param {object} options - オプション
     * @returns {Promise<Uint8Array|null>}
     */
    /**
     * 見開き圧縮保存用：個別ページをキャンバスの指定位置に描画
     * @param {CanvasRenderingContext2D} ctx - 描画先コンテキスト
     * @param {object} state - 状態
     * @param {object} mapItem - ページマッピング
     * @param {object} imagePageData - 画像ページデータ
     * @param {number} pageWidth - ページ幅（PDF座標系）
     * @param {number} pageHeight - ページ高さ（PDF座標系）
     * @param {number} scale - 圧縮スケール
     * @param {number} xOffset - X方向オフセット（キャンバス座標系、scale適用済み）
     */
    async function _renderPageToCompressCanvas(ctx, state, mapItem, imagePageData, pageWidth, pageHeight, scale, xOffset) {
        if (mapItem.docIndex === -2) {
            // 画像ページ
            const imgData = imagePageData[mapItem.imageIndex];
            if (!imgData || !imgData.data) return;

            const img = new Image();
            let blobUrl = null;
            await new Promise((resolve, reject) => {
                img.onload = () => {
                    if (blobUrl) URL.revokeObjectURL(blobUrl);
                    resolve();
                };
                img.onerror = (e) => {
                    if (blobUrl) URL.revokeObjectURL(blobUrl);
                    reject(e);
                };
                if (typeof imgData.data === 'string') {
                    img.src = imgData.data;
                } else {
                    const blob = new Blob([imgData.data], { type: imgData.type === 'png' ? 'image/png' : 'image/jpeg' });
                    blobUrl = URL.createObjectURL(blob);
                    img.src = blobUrl;
                }
            });

            // アスペクト比を保持してスケーリング
            const imgAspect = imgData.width / imgData.height;
            const pageAspect = pageWidth / pageHeight;
            let drawWidth, drawHeight, drawX, drawY;

            if (imgAspect > pageAspect) {
                drawWidth = pageWidth * scale;
                drawHeight = (pageWidth / imgAspect) * scale;
                drawX = xOffset;
                drawY = (pageHeight * scale - drawHeight) / 2;
            } else {
                drawHeight = pageHeight * scale;
                drawWidth = (pageHeight * imgAspect) * scale;
                drawX = xOffset + (pageWidth * scale - drawWidth) / 2;
                drawY = 0;
            }

            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        } else if (mapItem.docIndex === -1) {
            // 白紙ページ（背景は既に白で塗られているので何もしない）

        } else {
            // PDFページ
            const targetDoc = state.pdfDocs[mapItem.docIndex];
            const pdfPage = await targetDoc.getPage(mapItem.pageNum);
            const viewport = pdfPage.getViewport({ scale: scale });

            // 一時キャンバスにレンダリング
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = viewport.width;
            tmpCanvas.height = viewport.height;
            const tmpCtx = tmpCanvas.getContext('2d');
            tmpCtx.fillStyle = '#ffffff';
            tmpCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);

            await pdfPage.render({
                canvasContext: tmpCtx,
                viewport: viewport,
                annotationMode: 1  // ENABLE: PDF注釈（FreeText等）の見た目をJPEGに焼き込む
            }).promise;

            // 見開きキャンバスの指定位置に描画
            ctx.drawImage(tmpCanvas, xOffset, 0, pageWidth * scale, pageHeight * scale);
            tmpCanvas.width = 0;
            tmpCanvas.height = 0;
        }
    }

    async function createCompressedPdf(state, fileName, options = {}) {
        const quality = options.quality || COMPRESS_SETTINGS.INITIAL_QUALITY;
        const scale = options.scale || COMPRESS_SETTINGS.INITIAL_SCALE;
        const imagePageData = options.imagePageData || {};
        const onProgress = options.onProgress || (() => {});
        // 見開きモード関連のオプション
        const spreadMode = options.spreadMode || false;
        const spreadMapping = options.spreadMapping || [];
        const spreadCssPageWidth = options.spreadCssPageWidth || null;
        const spreadCssPageHeight = options.spreadCssPageHeight || null;
        // PDF注釈由来テキストの非表示判定用
        const TextLayerManager = window.MojiQTextLayerManager;

        try {
            const pdfDoc = await PDFDocument.create();
            let skippedPages = 0;

            const originalPdfBytesArray = state.originalPdfBytesArray || [];
            const srcPdfCacheForAnnots = {};

            // 見開きモードの場合は見開き単位で処理
            console.log(`[MojiQ] createCompressedPdf: spreadMode=${spreadMode}, spreadMapping.length=${spreadMapping.length}, totalPages=${state.totalPages}`);
            if (spreadMode && spreadMapping.length > 0) {
                for (let spreadIdx = 0; spreadIdx < spreadMapping.length; spreadIdx++) {
                    const spread = spreadMapping[spreadIdx];

                    onProgress(Math.round(((spreadIdx + 1) / spreadMapping.length) * 90));
                    await new Promise(resolve => setTimeout(resolve, 0));

                    const leftMapItem = spread.leftPage ? state.pageMapping[spread.leftPage - 1] : null;
                    const rightMapItem = spread.rightPage ? state.pageMapping[spread.rightPage - 1] : null;

                    // 基準となるページサイズを取得
                    let pageWidth = 595;
                    let pageHeight = 842;

                    if (leftMapItem) {
                        pageWidth = leftMapItem.width || leftMapItem.displayWidth || 595;
                        pageHeight = leftMapItem.height || leftMapItem.displayHeight || 842;
                    } else if (rightMapItem) {
                        pageWidth = rightMapItem.width || rightMapItem.displayWidth || 595;
                        pageHeight = rightMapItem.height || rightMapItem.displayHeight || 842;
                    }

                    const spreadWidth = pageWidth * 2;
                    const spreadHeight = pageHeight;

                    // 見開き全体のキャンバスを作成
                    const canvas = document.createElement('canvas');
                    canvas.width = spreadWidth * scale;
                    canvas.height = spreadHeight * scale;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        console.error(`[MojiQ] 見開きキャンバスのgetContext('2d')がnullを返しました（見開き: ${spreadIdx + 1}, サイズ: ${canvas.width}x${canvas.height}）`);
                        skippedPages++;
                        canvas.width = 0;
                        canvas.height = 0;
                        continue;
                    }
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // 左ページを描画
                    if (spread.leftPage && leftMapItem) {
                        await _renderPageToCompressCanvas(ctx, state, leftMapItem, imagePageData, pageWidth, pageHeight, scale, 0);
                    }

                    // 右ページを描画
                    if (spread.rightPage && rightMapItem) {
                        await _renderPageToCompressCanvas(ctx, state, rightMapItem, imagePageData, pageWidth, pageHeight, scale, pageWidth * scale);
                    }

                    // 見開き描画オブジェクトを重ねる
                    if (window.MojiQDrawingObjects && window.MojiQDrawingRenderer) {
                        const displayPageWidth = leftMapItem?.displayWidth || rightMapItem?.displayWidth || pageWidth;
                        const displayPageHeight = leftMapItem?.displayHeight || rightMapItem?.displayHeight || pageHeight;
                        const spreadCssWidth = spreadCssPageWidth ? spreadCssPageWidth * 2 : (displayPageWidth * 2);
                        const actualSpreadCssHeight = spreadCssPageHeight || displayPageHeight;

                        const spreadKey = window.MojiQDrawingObjects.getSpreadPageKey(spreadIdx);
                        const spreadObjects = window.MojiQDrawingObjects.getPageObjects(spreadKey);

                        if (spreadObjects && spreadObjects.length > 0) {
                            // 見開きCSS座標系 → キャンバス座標系のスケール
                            const scaleX = (spreadWidth * scale) / spreadCssWidth;
                            const scaleY = (spreadHeight * scale) / actualSpreadCssHeight;

                            ctx.save();
                            ctx.scale(scaleX, scaleY);
                            for (const obj of spreadObjects) {
                                if (TextLayerManager && !TextLayerManager.shouldRenderObject(obj)) {
                                    continue;
                                }
                                window.MojiQDrawingRenderer.renderObject(ctx, obj);
                            }
                            ctx.restore();
                        } else {
                            // 見開きキーにオブジェクトがない場合は左右ページから個別に取得
                            const leftObjects = spread.leftPage ? window.MojiQDrawingObjects.getPageObjects(spread.leftPage) : [];
                            const rightObjects = spread.rightPage ? window.MojiQDrawingObjects.getPageObjects(spread.rightPage) : [];

                            if (leftObjects && leftObjects.length > 0) {
                                const scaleX = (pageWidth * scale) / displayPageWidth;
                                const scaleY = (spreadHeight * scale) / displayPageHeight;
                                ctx.save();
                                ctx.scale(scaleX, scaleY);
                                for (const obj of leftObjects) {
                                    if (TextLayerManager && !TextLayerManager.shouldRenderObject(obj)) continue;
                                    window.MojiQDrawingRenderer.renderObject(ctx, obj);
                                }
                                ctx.restore();
                            }

                            if (rightObjects && rightObjects.length > 0) {
                                const scaleX = (pageWidth * scale) / displayPageWidth;
                                const scaleY = (spreadHeight * scale) / displayPageHeight;
                                ctx.save();
                                ctx.translate(pageWidth * scale, 0);
                                ctx.scale(scaleX, scaleY);
                                for (const obj of rightObjects) {
                                    if (TextLayerManager && !TextLayerManager.shouldRenderObject(obj)) continue;
                                    window.MojiQDrawingRenderer.renderObject(ctx, obj);
                                }
                                ctx.restore();
                            }
                        }
                    }

                    // CanvasをJPEGに変換
                    const jpegResult = await canvasToJpegWithTimeout(canvas, quality);
                    canvas.width = 0;
                    canvas.height = 0;

                    if (!jpegResult || !jpegResult.data) {
                        console.error('JPEG変換に失敗しました（見開き:', spreadIdx + 1, '）');
                        skippedPages++;
                        continue;
                    }

                    // PDFに見開きページとして追加
                    const page = pdfDoc.addPage([spreadWidth, spreadHeight]);
                    const jpgImage = await pdfDoc.embedJpg(jpegResult.data);
                    page.drawImage(jpgImage, {
                        x: 0,
                        y: 0,
                        width: spreadWidth,
                        height: spreadHeight,
                    });
                }
            } else {
                // 通常モード（単ページ）
                for (let i = 0; i < state.totalPages; i++) {
                    const mapItem = state.pageMapping[i];
                    if (!mapItem) continue;

                    const pageNum = i + 1;
                    onProgress(Math.round((pageNum / state.totalPages) * 90));

                    // UIをブロックしないため次フレームまで待機
                    await new Promise(resolve => setTimeout(resolve, 0));

                    let pageWidth, pageHeight;
                    let canvas, ctx;

                    if (mapItem.docIndex === -2) {
                        // 画像ページ
                        const imgData = imagePageData[mapItem.imageIndex];
                        if (!imgData || !imgData.data) continue;

                        pageWidth = imgData.width;
                        pageHeight = imgData.height;

                        // 画像をCanvasに描画してJPEG化
                        canvas = document.createElement('canvas');
                        canvas.width = pageWidth * scale;
                        canvas.height = pageHeight * scale;
                        ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);

                        // 画像データをImageに変換
                        // BUG修正: Blob URL のメモリリークを防止
                        const img = new Image();
                        let blobUrl = null;
                        await new Promise((resolve, reject) => {
                            img.onload = () => {
                                // Blob URL を解放
                                if (blobUrl) {
                                    URL.revokeObjectURL(blobUrl);
                                }
                                resolve();
                            };
                            img.onerror = (e) => {
                                // エラー時も Blob URL を解放
                                if (blobUrl) {
                                    URL.revokeObjectURL(blobUrl);
                                }
                                reject(e);
                            };
                            if (typeof imgData.data === 'string') {
                                img.src = imgData.data;
                            } else {
                                const blob = new Blob([imgData.data], { type: imgData.type === 'png' ? 'image/png' : 'image/jpeg' });
                                blobUrl = URL.createObjectURL(blob);
                                img.src = blobUrl;
                            }
                        });

                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    } else if (mapItem.docIndex === -1) {
                        // 白紙ページ
                        pageWidth = mapItem.width || 595;
                        pageHeight = mapItem.height || 842;

                        canvas = document.createElement('canvas');
                        canvas.width = pageWidth * scale;
                        canvas.height = pageHeight * scale;
                        ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);

                    } else {
                        // PDFページ
                        const targetDoc = state.pdfDocs[mapItem.docIndex];
                        const pdfPage = await targetDoc.getPage(mapItem.pageNum);
                        const viewport = pdfPage.getViewport({ scale: 1 });
                        pageWidth = viewport.width;
                        pageHeight = viewport.height;

                        canvas = document.createElement('canvas');
                        canvas.width = pageWidth * scale;
                        canvas.height = pageHeight * scale;
                        ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);

                        const scaledViewport = pdfPage.getViewport({ scale: scale });
                        await pdfPage.render({
                            canvasContext: ctx,
                            viewport: scaledViewport,
                            annotationMode: 1  // ENABLE: PDF注釈（FreeText等）の見た目をJPEGに焼き込む
                        }).promise;
                    }

                    // 描画オブジェクトを重ねる
                    const displayWidth = mapItem.displayWidth || pageWidth;
                    const displayHeight = mapItem.displayHeight || pageHeight;

                    if (window.MojiQDrawingObjects && window.MojiQDrawingRenderer) {
                        // 通常モード（単ページ）
                        const pageObjects = window.MojiQDrawingObjects.getPageObjects(pageNum);
                        if (pageObjects && pageObjects.length > 0) {
                            const scaleX = (pageWidth * scale) / displayWidth;
                            const scaleY = (pageHeight * scale) / displayHeight;

                            ctx.save();
                            ctx.scale(scaleX, scaleY);
                            for (const obj of pageObjects) {
                                // PDF注釈由来テキストの非表示状態をチェック
                                if (TextLayerManager && !TextLayerManager.shouldRenderObject(obj)) {
                                    continue;
                                }
                                window.MojiQDrawingRenderer.renderObject(ctx, obj);
                            }
                            ctx.restore();
                        }
                    }

                    // CanvasをJPEGに変換
                    const jpegResult = await canvasToJpegWithTimeout(canvas, quality);
                    canvas.width = 0;
                    canvas.height = 0;

                    if (!jpegResult || !jpegResult.data) {
                        console.error('JPEG変換に失敗しました（ページ:', pageNum, '）');
                        skippedPages++;
                        continue;
                    }

                    // PDFにJPEG画像として追加（空ページ＋JPEG、リソース最小）
                    const jpgImage = await pdfDoc.embedJpg(jpegResult.data);
                    const page = pdfDoc.addPage([pageWidth, pageHeight]);

                    // 元PDFのアノテーション（Acrobatコメント）をデータのみ再構築
                    // copyPages()は使わない（元ページのリソースがコピーされファイルが肥大化するため）
                    if (mapItem.docIndex >= 0) {
                        try {
                            const originalBytes = originalPdfBytesArray[mapItem.docIndex];
                            if (originalBytes) {
                                if (!srcPdfCacheForAnnots[mapItem.docIndex]) {
                                    srcPdfCacheForAnnots[mapItem.docIndex] = await PDFDocument.load(originalBytes, {
                                        ignoreEncryption: true
                                    });
                                }
                                const srcPdf = srcPdfCacheForAnnots[mapItem.docIndex];
                                if (srcPdf && mapItem.pageNum <= srcPdf.getPageCount()) {
                                    const { PDFName, PDFString, PDFHexString } = PDFLib;
                                    const srcPage = srcPdf.getPage(mapItem.pageNum - 1);
                                    const srcAnnots = srcPage.node.lookup(PDFName.of('Annots'));

                                    if (srcAnnots && typeof srcAnnots.size === 'function') {
                                        const newAnnotsArr = pdfDoc.context.obj([]);

                                        for (let ai = 0; ai < srcAnnots.size(); ai++) {
                                            const srcAnnot = srcAnnots.lookup(ai);
                                            if (!srcAnnot || typeof srcAnnot.get !== 'function') continue;

                                            // Popup型・FreeText型はスキップ
                                            // FreeText: MojiQテキストオブジェクトに変換済み＆MojiQTextメタデータで管理
                                            // /AP なしで再構築すると枠付きテキストとして表示されてしまうため除外
                                            const subtype = srcAnnot.lookup(PDFName.of('Subtype'));
                                            if (subtype && (subtype.encodedName === '/Popup' || subtype.encodedName === '/FreeText')) continue;

                                            // 必要なフィールドだけで新規アノテーション辞書を構築
                                            const newAnnot = pdfDoc.context.obj({});
                                            newAnnot.set(PDFName.of('Type'), PDFName.of('Annot'));

                                            // 単純コピー可能なフィールド（PDFName, PDFNumber等）
                                            const nameFields = ['Subtype', 'Name'];
                                            for (const f of nameFields) {
                                                const v = srcAnnot.get(PDFName.of(f));
                                                if (v) newAnnot.set(PDFName.of(f), v);
                                            }

                                            // Rect（座標配列）をコピー
                                            const srcRect = srcAnnot.lookup(PDFName.of('Rect'));
                                            if (srcRect && typeof srcRect.asRectangle === 'function') {
                                                const r = srcRect.asRectangle();
                                                newAnnot.set(PDFName.of('Rect'), pdfDoc.context.obj([r.x, r.y, r.x + r.width, r.y + r.height]));
                                            }

                                            // 文字列フィールド（Contents, T=著者, M=日付等）
                                            const strFields = ['Contents', 'T', 'M', 'CreationDate', 'NM', 'Subj'];
                                            for (const f of strFields) {
                                                const v = srcAnnot.get(PDFName.of(f));
                                                if (!v) continue;
                                                if (typeof v.decodeText === 'function') {
                                                    newAnnot.set(PDFName.of(f), PDFHexString.fromText(v.decodeText()));
                                                } else if (typeof v.asString === 'function') {
                                                    newAnnot.set(PDFName.of(f), PDFHexString.fromText(v.asString()));
                                                }
                                            }

                                            // C（色配列）をコピー
                                            const srcC = srcAnnot.lookup(PDFName.of('C'));
                                            if (srcC && typeof srcC.asArray === 'function') {
                                                newAnnot.set(PDFName.of('C'), pdfDoc.context.obj(srcC.asArray().map(n => typeof n.numberValue === 'function' ? n.numberValue() : n.value())));
                                            }

                                            // F（フラグ）
                                            const srcF = srcAnnot.get(PDFName.of('F'));
                                            if (srcF) newAnnot.set(PDFName.of('F'), srcF);

                                            // CA（透明度）
                                            const srcCA = srcAnnot.get(PDFName.of('CA'));
                                            if (srcCA) newAnnot.set(PDFName.of('CA'), srcCA);

                                            // /AP は意図的にコピーしない（アイコン非表示）

                                            const ref = pdfDoc.context.register(newAnnot);
                                            newAnnotsArr.push(ref);
                                        }

                                        if (newAnnotsArr.size() > 0) {
                                            page.node.set(PDFName.of('Annots'), newAnnotsArr);
                                        }
                                    }
                                }
                            }
                        } catch (annotErr) {
                            console.warn('[MojiQ] アノテーション再構築に失敗:', annotErr.message);
                        }
                    }

                    page.drawImage(jpgImage, {
                        x: 0,
                        y: 0,
                        width: pageWidth,
                        height: pageHeight,
                    });
                }
            }

            // メタデータを設定
            pdfDoc.setTitle(fileName);
            pdfDoc.setCreator('MojiQ');
            pdfDoc.setProducer('MojiQ PDF-Lib Saver (Compressed)');

            // コメントテキスト非表示状態とMojiQテキストデータをSubjectに保存
            // 保存時は常にコメントテキ���トを非表示にするため、常にtrue
            const mojiQTextData = collectMojiQTextData(state.totalPages, state.pageMapping);
            let subjectData = 'MojiQ:commentTextHidden=true';
            if (mojiQTextData) {
                subjectData += ';MojiQText:' + mojiQTextData;
            }
            // 確認済みコメント情報を追加
            const checkedCommentsData = collectCheckedCommentsData();
            if (checkedCommentsData) {
                subjectData += ';MojiQChecked:' + checkedCommentsData;
            }
            if (subjectData.length > 100000) {
                console.warn(`[MojiQ] メタデータが大きいです（${Math.round(subjectData.length / 1024)}KB）。`);
            }
            pdfDoc.setSubject(subjectData);

            onProgress(95);
            const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

            // 保存結果の検証（破損データ防止）
            if (!pdfBytes || !(pdfBytes instanceof Uint8Array) || pdfBytes.length === 0) {
                throw new Error('圧縮PDF生成に失敗しました（出力データが空です）');
            }

            onProgress(100);

            if (skippedPages > 0) {
                console.warn(`[MojiQ] 圧縮保存: ${skippedPages}ページのJPEG変換に失敗しました`);
            }
            return { pdfBytes, skippedPages };

        } catch (error) {
            console.error('圧縮PDF生成エラー:', error);
            return null;
        }
    }

    /**
     * 見開きモード用の非破壊PDF保存
     * @param {object} state - アプリケーション状態
     * @param {string} fileName - ファイル名
     * @param {object} options - オプション
     * @param {object} imagePageData - 画像ページデータ
     * @param {Array} spreadMapping - 見開きマッピング
     * @returns {Promise<{success: boolean, data?: Uint8Array, error?: string}>}
     */
    async function saveNonDestructiveSpread(state, fileName, options, imagePageData, spreadMapping) {
        const onProgress = options.onProgress || (() => {});
        const originalPdfBytesArray = state.originalPdfBytesArray || [];
        const srcPdfCache = {};
        // 見開きCSS座標系のサイズ（指定されていれば使用）
        const spreadCssPageWidth = options.spreadCssPageWidth || null;
        const spreadCssPageHeight = options.spreadCssPageHeight || null;
        // ページ処理を90%、pdfDoc.save()を10%として扱う
        const PAGE_PROGRESS_RATIO = 0.9;
        // タイムアウトした見開きを追跡
        const timedOutSpreads = [];

        // PDF注釈由来テキストを一時的に非表示にする（保存時は常に非表示）
        const TextLayerManager = window.MojiQTextLayerManager;

        if (TextLayerManager) {
            TextLayerManager.setIsHiddenInternal(true);
        }

        try {
            const pdfDoc = await PDFDocument.create();

            for (let spreadIdx = 0; spreadIdx < spreadMapping.length; spreadIdx++) {
                const spread = spreadMapping[spreadIdx];

                // 進捗を報告（ページ処理は全体の90%）
                const percent = Math.round(((spreadIdx + 1) / spreadMapping.length) * PAGE_PROGRESS_RATIO * 100);
                onProgress(percent);

                // UIをブロックしないため次フレームまで待機
                await new Promise(resolve => setTimeout(resolve, 0));

                // 左右ページのサイズを取得
                const leftMapItem = spread.leftPage ? state.pageMapping[spread.leftPage - 1] : null;
                const rightMapItem = spread.rightPage ? state.pageMapping[spread.rightPage - 1] : null;

                // 基準となるページサイズを取得
                let pageWidth = 595;
                let pageHeight = 842;

                if (leftMapItem) {
                    pageWidth = leftMapItem.width || leftMapItem.displayWidth || 595;
                    pageHeight = leftMapItem.height || leftMapItem.displayHeight || 842;
                } else if (rightMapItem) {
                    pageWidth = rightMapItem.width || rightMapItem.displayWidth || 595;
                    pageHeight = rightMapItem.height || rightMapItem.displayHeight || 842;
                }

                // 見開きページのサイズ（左右合わせて）
                const spreadWidth = pageWidth * 2;
                const spreadHeight = pageHeight;

                // 見開きページを作成
                const page = pdfDoc.addPage([spreadWidth, spreadHeight]);

                // 左ページを描画
                if (spread.leftPage && leftMapItem) {
                    await renderPageToSpreadPdf(
                        pdfDoc, page, state, leftMapItem, spread.leftPage,
                        0, pageWidth, pageHeight, imagePageData, originalPdfBytesArray, srcPdfCache
                    );
                } else {
                    // 左ページが白紙の場合
                    page.drawRectangle({
                        x: 0,
                        y: 0,
                        width: pageWidth,
                        height: pageHeight,
                        color: rgb(1, 1, 1),
                    });
                }

                // 右ページを描画
                if (spread.rightPage && rightMapItem) {
                    await renderPageToSpreadPdf(
                        pdfDoc, page, state, rightMapItem, spread.rightPage,
                        pageWidth, pageWidth, pageHeight, imagePageData, originalPdfBytesArray, srcPdfCache
                    );
                } else {
                    // 右ページが白紙または存在しない場合
                    page.drawRectangle({
                        x: pageWidth,
                        y: 0,
                        width: pageWidth,
                        height: pageHeight,
                        color: rgb(1, 1, 1),
                    });
                }

                // 描画オブジェクトを見開きで合成
                const displayPageWidth = leftMapItem?.displayWidth || rightMapItem?.displayWidth || pageWidth;
                const displayPageHeight = leftMapItem?.displayHeight || rightMapItem?.displayHeight || pageHeight;

                // 見開きCSS座標系の全体サイズを計算
                const spreadCssWidth = spreadCssPageWidth ? spreadCssPageWidth * 2 : null;
                const spreadCssHeight = spreadCssPageHeight || null;

                const drawingResult = await renderSpreadDrawingObjectsToPng(
                    spread,
                    spreadIdx,
                    spreadWidth,
                    spreadHeight,
                    pageWidth,
                    pageWidth,
                    displayPageWidth,
                    displayPageHeight,
                    spreadCssWidth,
                    spreadCssHeight
                );

                if (drawingResult.timedOut) {
                    timedOutSpreads.push(spreadIdx + 1);
                    console.warn(`見開き ${spreadIdx + 1} の描画オブジェクト保存がタイムアウトしました`);
                }

                // 描画データの検証: Uint8Array であることを確認
                if (drawingResult.data && drawingResult.data instanceof Uint8Array && drawingResult.data.length > 0) {
                    const drawingImage = await pdfDoc.embedPng(drawingResult.data);
                    page.drawImage(drawingImage, {
                        x: 0,
                        y: 0,
                        width: spreadWidth,
                        height: spreadHeight,
                    });
                }
            }

            // メタデータを設定
            pdfDoc.setTitle(fileName);
            pdfDoc.setCreator('MojiQ');
            pdfDoc.setProducer('MojiQ PDF-Lib Saver (Spread)');

            // コメントテキスト非表示状態とMojiQテキストデータをSubjectに保存
            {
                const mojiQTextData = collectMojiQTextData(state.totalPages, state.pageMapping);
                let subjectData = 'MojiQ:commentTextHidden=true';
                if (mojiQTextData) {
                    subjectData += ';MojiQText:' + mojiQTextData;
                }
                const checkedCommentsData = collectCheckedCommentsData();
                if (checkedCommentsData) {
                    subjectData += ';MojiQChecked:' + checkedCommentsData;
                }
                if (subjectData.length > 100000) {
                    console.warn(`[MojiQ] メタデータが大きいです（${Math.round(subjectData.length / 1024)}KB）。`);
                }
                pdfDoc.setSubject(subjectData);
            }

            // 90%完了を報告（PDF出力処理開始）
            onProgress(90);
            await new Promise(resolve => setTimeout(resolve, 0));

            const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

            // 保存結果の検証（破損データ防止）
            if (!pdfBytes || !(pdfBytes instanceof Uint8Array) || pdfBytes.length === 0) {
                throw new Error('PDF生成に失敗しました（出力データが空です）');
            }

            // 100%完了を報告
            onProgress(100);

            // タイムアウト警告がある場合は結果に含める
            const result = { success: true, data: pdfBytes };
            if (timedOutSpreads.length > 0) {
                result.warnings = timedOutSpreads;
            }
            return result;

        } catch (error) {
            console.error('見開きPDF保存エラー:', error);
            return { success: false, error: error.message };
        } finally {
            // PDF注釈由来テキストを非表示状態のままボタンにも反映
            if (TextLayerManager) {
                TextLayerManager.setIsHidden(true);
            }
        }
    }

    /**
     * 見開きPDFページに個別ページをレンダリング
     */
    async function renderPageToSpreadPdf(pdfDoc, page, state, mapItem, pageNum, xOffset, pageWidth, pageHeight, imagePageData, originalPdfBytesArray, srcPdfCache) {
        if (mapItem.docIndex === -2) {
            // 画像ページ
            const imgData = imagePageData[mapItem.imageIndex];
            if (!imgData || !imgData.data) return;

            // 画像データの検証
            const isValidData = (typeof imgData.data === 'string') ||
                                (imgData.data instanceof Uint8Array) ||
                                (imgData.data instanceof ArrayBuffer);
            if (!isValidData) {
                console.error('画像データの形式が無効です:', mapItem.imageIndex, typeof imgData.data);
                return;
            }

            let image;
            if (imgData.type === 'png') {
                image = await pdfDoc.embedPng(imgData.data);
            } else {
                image = await pdfDoc.embedJpg(imgData.data);
            }

            // アスペクト比を保持してスケーリング
            const imgAspect = imgData.width / imgData.height;
            const pageAspect = pageWidth / pageHeight;
            let drawWidth, drawHeight, drawX, drawY;

            if (imgAspect > pageAspect) {
                drawWidth = pageWidth;
                drawHeight = pageWidth / imgAspect;
                drawX = xOffset;
                drawY = (pageHeight - drawHeight) / 2;
            } else {
                drawHeight = pageHeight;
                drawWidth = pageHeight * imgAspect;
                drawX = xOffset + (pageWidth - drawWidth) / 2;
                drawY = 0;
            }

            page.drawImage(image, {
                x: drawX,
                y: drawY,
                width: drawWidth,
                height: drawHeight,
            });
        } else if (mapItem.docIndex === -1) {
            // 白紙ページ
            page.drawRectangle({
                x: xOffset,
                y: 0,
                width: pageWidth,
                height: pageHeight,
                color: rgb(1, 1, 1),
            });
        } else {
            // PDFページ
            const originalBytes = originalPdfBytesArray[mapItem.docIndex];

            if (originalBytes) {
                if (!srcPdfCache[mapItem.docIndex]) {
                    try {
                        srcPdfCache[mapItem.docIndex] = await PDFDocument.load(originalBytes, {
                            ignoreEncryption: true
                        });
                    } catch (loadError) {
                        srcPdfCache[mapItem.docIndex] = null;
                    }
                }

                const srcPdf = srcPdfCache[mapItem.docIndex];
                if (srcPdf) {
                    // 元PDFページをPNG経由で描画（embedPageは見開きに不向き）
                    const targetDoc = state.pdfDocs[mapItem.docIndex];
                    const pdfPage = await targetDoc.getPage(mapItem.pageNum);
                    const viewport = pdfPage.getViewport({ scale: 1 });

                    const scale = 2;
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width * scale;
                    canvas.height = viewport.height * scale;
                    const ctx = canvas.getContext('2d');

                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    const scaledViewport = pdfPage.getViewport({ scale: scale });
                    await pdfPage.render({
                        canvasContext: ctx,
                        viewport: scaledViewport
                    }).promise;

                    const pngResult = await canvasToPngWithTimeout(canvas);

                    if (!pngResult || !pngResult.data) {
                        canvas.width = 0;
                        canvas.height = 0;
                        return;
                    }

                    const bgImage = await pdfDoc.embedPng(pngResult.data);

                    // アスペクト比を保持してスケーリング
                    const imgAspect = viewport.width / viewport.height;
                    const pageAspect = pageWidth / pageHeight;
                    let drawWidth, drawHeight, drawX, drawY;

                    if (imgAspect > pageAspect) {
                        drawWidth = pageWidth;
                        drawHeight = pageWidth / imgAspect;
                        drawX = xOffset;
                        drawY = (pageHeight - drawHeight) / 2;
                    } else {
                        drawHeight = pageHeight;
                        drawWidth = pageHeight * imgAspect;
                        drawX = xOffset + (pageWidth - drawWidth) / 2;
                        drawY = 0;
                    }

                    page.drawImage(bgImage, {
                        x: drawX,
                        y: drawY,
                        width: drawWidth,
                        height: drawHeight,
                    });

                    canvas.width = 0;
                    canvas.height = 0;
                }
            } else {
                // 元のPDFバイトデータがない場合
                const targetDoc = state.pdfDocs[mapItem.docIndex];
                const pdfPage = await targetDoc.getPage(mapItem.pageNum);
                const viewport = pdfPage.getViewport({ scale: 1 });

                const scale = 2;
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width * scale;
                canvas.height = viewport.height * scale;
                const ctx = canvas.getContext('2d');

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const scaledViewport = pdfPage.getViewport({ scale: scale });
                await pdfPage.render({
                    canvasContext: ctx,
                    viewport: scaledViewport
                }).promise;

                const pngResult = await canvasToPngWithTimeout(canvas);

                if (!pngResult || !pngResult.data) {
                    canvas.width = 0;
                    canvas.height = 0;
                    return;
                }

                const bgImage = await pdfDoc.embedPng(pngResult.data);
                page.drawImage(bgImage, {
                    x: xOffset,
                    y: 0,
                    width: pageWidth,
                    height: pageHeight,
                });

                canvas.width = 0;
                canvas.height = 0;
            }
        }
    }

    /**
     * 見開きモード用の透過PDF保存
     * @param {object} state - アプリケーション状態
     * @param {string} fileName - ファイル名
     * @param {object} options - オプション
     * @param {object} imagePageData - 画像ページデータ
     * @param {Array} spreadMapping - 見開きマッピング
     * @param {number} bgOpacity - 背景の透明度 (0-1)
     * @returns {Promise<{success: boolean, data?: Uint8Array, error?: string}>}
     */
    async function saveTransparentSpread(state, fileName, options, imagePageData, spreadMapping, bgOpacity) {
        const onProgress = options.onProgress || (() => {});
        const originalPdfBytesArray = state.originalPdfBytesArray || [];
        const srcPdfCache = {};
        // 見開きCSS座標系のサイズ（指定されていれば使用）
        const spreadCssPageWidth = options.spreadCssPageWidth || null;
        const spreadCssPageHeight = options.spreadCssPageHeight || null;
        // ページ処理を90%、pdfDoc.save()を10%として扱う
        const PAGE_PROGRESS_RATIO = 0.9;

        // PDF注釈由来テキストを一時的に非表示にする（保存時は常に非表示）
        const TextLayerManager = window.MojiQTextLayerManager;

        if (TextLayerManager) {
            TextLayerManager.setIsHiddenInternal(true);
        }

        try {
            const pdfDoc = await PDFDocument.create();

            // タイムアウトした見開きを追跡
            const timedOutSpreads = [];

            for (let spreadIdx = 0; spreadIdx < spreadMapping.length; spreadIdx++) {
                const spread = spreadMapping[spreadIdx];

                // 進捗を報告（ページ処理は全体の90%）
                const percent = Math.round(((spreadIdx + 1) / spreadMapping.length) * PAGE_PROGRESS_RATIO * 100);
                onProgress(percent);

                // UIをブロックしないため次フレームまで待機
                await new Promise(resolve => setTimeout(resolve, 0));

                // 左右ページのサイズを取得
                const leftMapItem = spread.leftPage ? state.pageMapping[spread.leftPage - 1] : null;
                const rightMapItem = spread.rightPage ? state.pageMapping[spread.rightPage - 1] : null;

                // 基準となるページサイズを取得
                let pageWidth = 595;
                let pageHeight = 842;

                if (leftMapItem) {
                    pageWidth = leftMapItem.width || leftMapItem.displayWidth || 595;
                    pageHeight = leftMapItem.height || leftMapItem.displayHeight || 842;
                } else if (rightMapItem) {
                    pageWidth = rightMapItem.width || rightMapItem.displayWidth || 595;
                    pageHeight = rightMapItem.height || rightMapItem.displayHeight || 842;
                }

                // 見開きページのサイズ
                const spreadWidth = pageWidth * 2;
                const spreadHeight = pageHeight;

                // 見開きページを作成
                const page = pdfDoc.addPage([spreadWidth, spreadHeight]);

                // 背景透明度が0より大きい場合のみ背景を描画
                if (bgOpacity > 0) {
                    // 左ページを描画
                    if (spread.leftPage && leftMapItem) {
                        await renderPageToSpreadPdfWithOpacity(
                            pdfDoc, page, state, leftMapItem, spread.leftPage,
                            0, pageWidth, pageHeight, imagePageData, originalPdfBytesArray, srcPdfCache, bgOpacity
                        );
                    } else {
                        page.drawRectangle({
                            x: 0,
                            y: 0,
                            width: pageWidth,
                            height: pageHeight,
                            color: rgb(1, 1, 1),
                            opacity: bgOpacity,
                        });
                    }

                    // 右ページを描画
                    if (spread.rightPage && rightMapItem) {
                        await renderPageToSpreadPdfWithOpacity(
                            pdfDoc, page, state, rightMapItem, spread.rightPage,
                            pageWidth, pageWidth, pageHeight, imagePageData, originalPdfBytesArray, srcPdfCache, bgOpacity
                        );
                    } else {
                        page.drawRectangle({
                            x: pageWidth,
                            y: 0,
                            width: pageWidth,
                            height: pageHeight,
                            color: rgb(1, 1, 1),
                            opacity: bgOpacity,
                        });
                    }
                }

                // 描画オブジェクトを見開きで合成
                const displayPageWidth = leftMapItem?.displayWidth || rightMapItem?.displayWidth || pageWidth;
                const displayPageHeight = leftMapItem?.displayHeight || rightMapItem?.displayHeight || pageHeight;

                // 見開きCSS座標系の全体サイズを計算
                const spreadCssWidth = spreadCssPageWidth ? spreadCssPageWidth * 2 : null;
                const spreadCssHeight = spreadCssPageHeight || null;

                const drawingResult = await renderSpreadDrawingObjectsToPng(
                    spread,
                    spreadIdx,
                    spreadWidth,
                    spreadHeight,
                    pageWidth,
                    pageWidth,
                    displayPageWidth,
                    displayPageHeight,
                    spreadCssWidth,
                    spreadCssHeight
                );

                // タイムアウトを追跡
                if (drawingResult && drawingResult.timedOut) {
                    timedOutSpreads.push(spreadIdx + 1);
                    console.warn(`見開き透過PDF保存: 見開き ${spreadIdx + 1} の描画オブジェクトレンダリングがタイムアウトしました`);
                }

                // 描画データの検証: Uint8Array であることを確認
                if (drawingResult && drawingResult.data instanceof Uint8Array && drawingResult.data.length > 0) {
                    const drawingImage = await pdfDoc.embedPng(drawingResult.data);
                    page.drawImage(drawingImage, {
                        x: 0,
                        y: 0,
                        width: spreadWidth,
                        height: spreadHeight,
                    });
                }
            }

            // メタデータを設定
            pdfDoc.setTitle(fileName);
            pdfDoc.setCreator('MojiQ');
            pdfDoc.setProducer('MojiQ PDF-Lib Saver (Spread Transparent)');

            // コメントテキスト非表示状態とMojiQテキストデータをSubjectに保存
            {
                const mojiQTextData = collectMojiQTextData(state.totalPages, state.pageMapping);
                let subjectData = 'MojiQ:commentTextHidden=true';
                if (mojiQTextData) {
                    subjectData += ';MojiQText:' + mojiQTextData;
                }
                const checkedCommentsData = collectCheckedCommentsData();
                if (checkedCommentsData) {
                    subjectData += ';MojiQChecked:' + checkedCommentsData;
                }
                if (subjectData.length > 100000) {
                    console.warn(`[MojiQ] メタデータが大きいです（${Math.round(subjectData.length / 1024)}KB）。`);
                }
                pdfDoc.setSubject(subjectData);
            }

            // 90%完了を報告（PDF出力処理開始）
            onProgress(90);
            await new Promise(resolve => setTimeout(resolve, 0));

            const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

            // 保存結果の検証（破損データ防止）
            if (!pdfBytes || !(pdfBytes instanceof Uint8Array) || pdfBytes.length === 0) {
                throw new Error('PDF生成に失敗しました（出力データが空です）');
            }

            // 100%完了を報告
            onProgress(100);

            // 警告があれば結果に含める
            const result = { success: true, data: pdfBytes };
            if (timedOutSpreads.length > 0) {
                result.warnings = [`描画オブジェクトのレンダリングがタイムアウトした見開き: ${timedOutSpreads.join(', ')}`];
            }
            return result;

        } catch (error) {
            console.error('見開き透過PDF保存エラー:', error);
            return { success: false, error: error.message };
        } finally {
            // PDF注釈由来テキストを非表示状態のままボタンにも反映
            if (TextLayerManager) {
                TextLayerManager.setIsHidden(true);
            }
        }
    }

    /**
     * 見開きPDFページに個別ページをレンダリング（透明度対応）
     */
    async function renderPageToSpreadPdfWithOpacity(pdfDoc, page, state, mapItem, pageNum, xOffset, pageWidth, pageHeight, imagePageData, originalPdfBytesArray, srcPdfCache, opacity) {
        if (mapItem.docIndex === -2) {
            // 画像ページ
            const imgData = imagePageData[mapItem.imageIndex];
            if (!imgData || !imgData.data) return;

            // 画像データの検証
            const isValidData = (typeof imgData.data === 'string') ||
                                (imgData.data instanceof Uint8Array) ||
                                (imgData.data instanceof ArrayBuffer);
            if (!isValidData) {
                console.error('画像データの形式が無効です:', mapItem.imageIndex, typeof imgData.data);
                return;
            }

            let image;
            if (imgData.type === 'png') {
                image = await pdfDoc.embedPng(imgData.data);
            } else {
                image = await pdfDoc.embedJpg(imgData.data);
            }

            // アスペクト比を保持してスケーリング
            const imgAspect = imgData.width / imgData.height;
            const pageAspect = pageWidth / pageHeight;
            let drawWidth, drawHeight, drawX, drawY;

            if (imgAspect > pageAspect) {
                drawWidth = pageWidth;
                drawHeight = pageWidth / imgAspect;
                drawX = xOffset;
                drawY = (pageHeight - drawHeight) / 2;
            } else {
                drawHeight = pageHeight;
                drawWidth = pageHeight * imgAspect;
                drawX = xOffset + (pageWidth - drawWidth) / 2;
                drawY = 0;
            }

            page.drawImage(image, {
                x: drawX,
                y: drawY,
                width: drawWidth,
                height: drawHeight,
                opacity: opacity,
            });
        } else if (mapItem.docIndex === -1) {
            // 白紙ページ
            page.drawRectangle({
                x: xOffset,
                y: 0,
                width: pageWidth,
                height: pageHeight,
                color: rgb(1, 1, 1),
                opacity: opacity,
            });
        } else {
            // PDFページ
            const targetDoc = state.pdfDocs[mapItem.docIndex];
            const pdfPage = await targetDoc.getPage(mapItem.pageNum);
            const viewport = pdfPage.getViewport({ scale: 1 });

            const scale = 2;
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width * scale;
            canvas.height = viewport.height * scale;
            const ctx = canvas.getContext('2d');

            // 透明な背景
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const scaledViewport = pdfPage.getViewport({ scale: scale });
            await pdfPage.render({
                canvasContext: ctx,
                viewport: scaledViewport
            }).promise;

            // 透明度を適用
            if (opacity < 1) {
                ctx.globalCompositeOperation = 'destination-in';
                ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            const pngResult = await canvasToPngWithTimeout(canvas);

            if (!pngResult || !pngResult.data) {
                canvas.width = 0;
                canvas.height = 0;
                return;
            }

            const bgImage = await pdfDoc.embedPng(pngResult.data);

            // アスペクト比を保持してスケーリング
            const imgAspect = viewport.width / viewport.height;
            const pageAspect = pageWidth / pageHeight;
            let drawWidth, drawHeight, drawX, drawY;

            if (imgAspect > pageAspect) {
                drawWidth = pageWidth;
                drawHeight = pageWidth / imgAspect;
                drawX = xOffset;
                drawY = (pageHeight - drawHeight) / 2;
            } else {
                drawHeight = pageHeight;
                drawWidth = pageHeight * imgAspect;
                drawX = xOffset + (pageWidth - drawWidth) / 2;
                drawY = 0;
            }

            page.drawImage(bgImage, {
                x: drawX,
                y: drawY,
                width: drawWidth,
                height: drawHeight,
            });

            canvas.width = 0;
            canvas.height = 0;
        }
    }

    /**
     * PDFファイルを読み込み、バイトデータを保存
     * @param {File} file - PDFファイル
     * @returns {Promise<Uint8Array>}
     */
    async function loadPdfBytes(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                resolve(new Uint8Array(reader.result));
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * PDFの埋め込みリソースを最適化（読み込み時に使用）
     * pdf-libでPDFを再構築することで、不要なリソースを削除し、ファイルサイズを削減する
     * @param {Uint8Array} pdfBytes - 元のPDFバイトデータ
     * @param {function} onProgress - 進捗コールバック (message: string) => void
     * @returns {Promise<{success: boolean, data?: Uint8Array, error?: string}>}
     */
    async function optimizePdfResources(pdfBytes, onProgress = () => {}) {
        try {
            onProgress('PDFを解析しています...');

            // 元のPDFを読み込み
            const srcPdf = await PDFDocument.load(pdfBytes, {
                ignoreEncryption: true
            });

            const pageCount = srcPdf.getPageCount();
            onProgress(`${pageCount}ページのPDFを最適化しています...`);

            // 新しいPDFドキュメントを作成
            const pdfDoc = await PDFDocument.create();

            // 全ページをコピー（これにより参照されていないリソースは含まれない）
            const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
            const copiedPages = await pdfDoc.copyPages(srcPdf, pageIndices);

            for (let i = 0; i < copiedPages.length; i++) {
                pdfDoc.addPage(copiedPages[i]);

                // 進捗を報告（10ページごと、または最後のページ）
                if ((i + 1) % 10 === 0 || i === copiedPages.length - 1) {
                    onProgress(`ページを処理中... (${i + 1}/${pageCount})`);
                    // UIをブロックしないため次フレームまで待機
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            // 元のPDFからメタデータをコピー
            const srcTitle = srcPdf.getTitle();
            const srcSubject = srcPdf.getSubject();
            const srcCreator = srcPdf.getCreator();
            const srcKeywords = srcPdf.getKeywords();
            if (srcTitle) pdfDoc.setTitle(srcTitle);
            if (srcSubject) pdfDoc.setSubject(srcSubject);
            if (srcCreator) pdfDoc.setCreator(srcCreator);
            if (srcKeywords) pdfDoc.setKeywords([srcKeywords]);

            onProgress('最適化されたPDFを生成しています...');

            // 最適化されたPDFを出力（useObjectStreams: falseで高速化）
            const optimizedBytes = await pdfDoc.save({ useObjectStreams: false });

            return {
                success: true,
                data: new Uint8Array(optimizedBytes),
                originalSize: pdfBytes.length,
                optimizedSize: optimizedBytes.length
            };

        } catch (error) {
            console.error('PDF最適化エラー:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Uint8ArrayからPDFを読み込み、バイトデータを保存
     * @param {Uint8Array} data - PDFデータ
     * @returns {Uint8Array}
     */
    function storePdfBytes(data) {
        // そのまま返す（コピー不要）
        return data;
    }

    /**
     * PDFページを指定の透明度でレンダリングしてPNG化
     * @param {object} pdfPage - PDF.jsのページオブジェクト
     * @param {number} width - 出力幅
     * @param {number} height - 出力高さ
     * @param {number} opacity - 透明度 (0-1)
     * @returns {Promise<Uint8Array>}
     */
    async function renderPdfPageToPng(pdfPage, width, height, opacity) {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');

        // 透明な背景
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // PDFをレンダリング
        const viewport = pdfPage.getViewport({ scale: scale });
        await pdfPage.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        // 透明度を適用
        if (opacity < 1) {
            ctx.globalCompositeOperation = 'destination-in';
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // CanvasをPNG Blobに変換（タイムアウト付き）
        const result = await canvasToPngWithTimeout(canvas);
        return result ? result.data : null;
    }

    /**
     * 透過PDF保存（背景の透明度を調整可能）
     * @param {object} state - アプリケーション状態
     * @param {string} fileName - ファイル名
     * @param {object} options - オプション
     * @param {number} options.bgOpacity - 背景の透明度 (0-100, 0=完全透明, 100=不透明)
     * @param {function} options.onProgress - 進捗コールバック (percent) => void （0-100のパーセント値）
     * @param {object} options.imagePageData - 画像ページデータ（MojiQPdfManagerから渡される）
     * @param {boolean} options.spreadMode - 見開きモードで保存するかどうか
     * @param {Array} options.spreadMapping - 見開きマッピング配列
     * @returns {Promise<{success: boolean, data?: Uint8Array, error?: string}>}
     */
    async function saveTransparent(state, fileName, options = {}) {
        if (!state.pdfDocs || state.pdfDocs.length === 0) {
            return { success: false, error: 'PDFが読み込まれていません' };
        }

        const bgOpacity = (options.bgOpacity !== undefined ? options.bgOpacity : 0) / 100;
        const onProgress = options.onProgress || (() => {});
        // ページ処理を90%、pdfDoc.save()を10%として扱う
        const PAGE_PROGRESS_RATIO = 0.9;
        const imagePageData = options.imagePageData || (window.MojiQPdfManager && window.MojiQPdfManager.getImagePageData ? window.MojiQPdfManager.getImagePageData() : {});
        const spreadMode = options.spreadMode || false;
        const spreadMapping = options.spreadMapping || [];

        // 見開きモードの場合は別の保存ロジックを使用
        if (spreadMode && spreadMapping.length > 0) {
            return await saveTransparentSpread(state, fileName, options, imagePageData, spreadMapping, bgOpacity);
        }

        // PDF注釈由来テキストを一時的に非表示にする（保存時は常に非表示）
        const TextLayerManager = window.MojiQTextLayerManager;

        if (TextLayerManager) {
            TextLayerManager.setIsHiddenInternal(true);
        }

        try {
            // 新しいPDFドキュメントを作成
            const pdfDoc = await PDFDocument.create();

            // 元PDFをキャッシュ
            const srcPdfCache = {};
            const originalPdfBytesArray = state.originalPdfBytesArray || [];

            // タイムアウトしたページを追跡
            const timedOutPages = [];

            for (let i = 0; i < state.totalPages; i++) {
                const mapItem = state.pageMapping[i];
                if (!mapItem) {
                    console.error('pageMappingが不正です（インデックス:', i, '）');
                    continue;
                }
                const pageNum = i + 1;

                // 進捗を報告（ページ処理は全体の90%）
                const percent = Math.round((pageNum / state.totalPages) * PAGE_PROGRESS_RATIO * 100);
                onProgress(percent);

                // UIをブロックしないため次フレームまで待機
                await new Promise(resolve => setTimeout(resolve, 0));

                let pageWidth, pageHeight;
                let page;

                if (mapItem.docIndex === -2) {
                    // 画像ページ
                    const imgData = imagePageData[mapItem.imageIndex];
                    if (!imgData || !imgData.data) {
                        console.error('画像データが見つかりません:', mapItem.imageIndex);
                        continue;
                    }

                    // 画像データの検証
                    const isValidData = (typeof imgData.data === 'string') ||
                                        (imgData.data instanceof Uint8Array) ||
                                        (imgData.data instanceof ArrayBuffer);
                    if (!isValidData) {
                        console.error('画像データの形式が無効です:', mapItem.imageIndex, typeof imgData.data);
                        continue;
                    }

                    pageWidth = imgData.width;
                    pageHeight = imgData.height;
                    page = pdfDoc.addPage([pageWidth, pageHeight]);

                    // 背景透明度が0より大きい場合は画像を描画
                    if (bgOpacity > 0) {
                        let image;
                        if (imgData.type === 'png') {
                            image = await pdfDoc.embedPng(imgData.data);
                        } else {
                            image = await pdfDoc.embedJpg(imgData.data);
                        }

                        page.drawImage(image, {
                            x: 0,
                            y: 0,
                            width: pageWidth,
                            height: pageHeight,
                            opacity: bgOpacity,
                        });
                    }
                } else if (mapItem.docIndex === -1) {
                    // 白紙ページ
                    pageWidth = mapItem.width || 595;
                    pageHeight = mapItem.height || 842;
                    page = pdfDoc.addPage([pageWidth, pageHeight]);

                    // 背景透明度が0より大きい場合は白背景を描画
                    if (bgOpacity > 0) {
                        page.drawRectangle({
                            x: 0,
                            y: 0,
                            width: pageWidth,
                            height: pageHeight,
                            color: rgb(1, 1, 1),
                            opacity: bgOpacity,
                        });
                    }
                } else {
                    // PDFページからサイズを取得
                    const targetDoc = state.pdfDocs[mapItem.docIndex];
                    const pdfPage = await targetDoc.getPage(mapItem.pageNum);
                    const viewport = pdfPage.getViewport({ scale: 1 });
                    pageWidth = viewport.width;
                    pageHeight = viewport.height;

                    // 透明なページを作成
                    page = pdfDoc.addPage([pageWidth, pageHeight]);

                    // 背景透明度が0より大きい場合は元PDFを描画
                    if (bgOpacity > 0) {
                        const originalBytes = originalPdfBytesArray[mapItem.docIndex];

                        if (originalBytes && bgOpacity === 1) {
                            // 完全不透明の場合は元PDFをそのままコピー
                            if (!srcPdfCache[mapItem.docIndex]) {
                                try {
                                    srcPdfCache[mapItem.docIndex] = await PDFDocument.load(originalBytes, {
                                        ignoreEncryption: true
                                    });
                                } catch (loadError) {
                                    srcPdfCache[mapItem.docIndex] = null;
                                }
                            }

                            const srcPdf = srcPdfCache[mapItem.docIndex];
                            if (srcPdf) {
                                const [copiedPage] = await pdfDoc.copyPages(srcPdf, [mapItem.pageNum - 1]);
                                // 既存のページを削除して差し替え
                                pdfDoc.removePage(pdfDoc.getPageCount() - 1);
                                page = pdfDoc.addPage(copiedPage);
                            }
                        } else {
                            // 半透明の場合はPNG経由でレンダリング
                            const bgPng = await renderPdfPageToPng(pdfPage, pageWidth, pageHeight, bgOpacity);
                            if (bgPng) {
                                const bgImage = await pdfDoc.embedPng(bgPng);
                                page.drawImage(bgImage, {
                                    x: 0,
                                    y: 0,
                                    width: pageWidth,
                                    height: pageHeight,
                                });
                            }
                        }
                    }
                }

                // 描画オブジェクトをPNG透過画像としてレンダリング
                const displayWidth = mapItem.displayWidth || pageWidth;
                const displayHeight = mapItem.displayHeight || pageHeight;

                const drawingResult = await renderDrawingObjectsToPng(
                    pageNum,
                    pageWidth,
                    pageHeight,
                    displayWidth,
                    displayHeight
                );

                // タイムアウトを追跡
                if (drawingResult && drawingResult.timedOut) {
                    timedOutPages.push(pageNum);
                    console.warn(`透過PDF保存: ページ ${pageNum} の描画オブジェクトレンダリングがタイムアウトしました`);
                }

                // 描画データの検証: Uint8Array であることを確認
                if (drawingResult && drawingResult.data instanceof Uint8Array && drawingResult.data.length > 0) {
                    const drawingImage = await pdfDoc.embedPng(drawingResult.data);
                    page.drawImage(drawingImage, {
                        x: 0,
                        y: 0,
                        width: pageWidth,
                        height: pageHeight,
                    });
                }
            }

            // メタデータを設定
            pdfDoc.setTitle(fileName);
            pdfDoc.setCreator('MojiQ');
            pdfDoc.setProducer('MojiQ PDF-Lib Saver (Transparent)');

            // コメントテキスト非表示状態とMojiQテキストデータをSubjectに保存
            {
                const mojiQTextData = collectMojiQTextData(state.totalPages, state.pageMapping);
                let subjectData = 'MojiQ:commentTextHidden=true';
                if (mojiQTextData) {
                    subjectData += ';MojiQText:' + mojiQTextData;
                }
                const checkedCommentsData = collectCheckedCommentsData();
                if (checkedCommentsData) {
                    subjectData += ';MojiQChecked:' + checkedCommentsData;
                }
                if (subjectData.length > 100000) {
                    console.warn(`[MojiQ] メタデータが大きいです（${Math.round(subjectData.length / 1024)}KB）。`);
                }
                pdfDoc.setSubject(subjectData);
            }

            // 90%完了を報告（PDF出力処理開始）
            onProgress(90);
            await new Promise(resolve => setTimeout(resolve, 0));

            // PDFを保存（useObjectStreams: falseで高速化）
            const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

            // 保存結果の検証（破損データ防止）
            if (!pdfBytes || !(pdfBytes instanceof Uint8Array) || pdfBytes.length === 0) {
                throw new Error('PDF生成に失敗しました（出力データが空です）');
            }

            // 100%完了を報告
            onProgress(100);

            // 警告があれば結果に含める
            const result = { success: true, data: pdfBytes };
            if (timedOutPages.length > 0) {
                result.warnings = [`描画オブジェクトのレンダリングがタイムアウトしたページ: ${timedOutPages.join(', ')}`];
            }
            return result;

        } catch (error) {
            console.error('透過PDF保存エラー:', error);
            return { success: false, error: error.message };
        } finally {
            // PDF注釈由来テキストを非表示状態のままボタンにも反映
            if (TextLayerManager) {
                TextLayerManager.setIsHidden(true);
            }
        }
    }

    return {
        saveNonDestructive,
        saveTransparent,
        renderDrawingObjectsToPng,
        loadPdfBytes,
        storePdfBytes,
        optimizePdfResources
    };
})();
