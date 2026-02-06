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
     * CanvasをPNG Blobに変換（タイムアウト・エラーハンドリング付き）
     * @param {HTMLCanvasElement} canvas - 変換するCanvas
     * @param {number} timeout - タイムアウト時間（ミリ秒、デフォルト30秒）
     * @returns {Promise<Uint8Array|null>} - PNG画像データ（失敗時はnull）
     */
    function canvasToPngWithTimeout(canvas, timeout = 30000) {
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                console.warn('canvasToPngWithTimeout: toBlob timeout');
                resolve(null);
            }, timeout);

            try {
                canvas.toBlob((blob) => {
                    clearTimeout(timeoutId);
                    if (!blob) {
                        resolve(null);
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                        resolve(new Uint8Array(reader.result));
                    };
                    reader.onerror = () => {
                        console.warn('canvasToPngWithTimeout: FileReader error');
                        resolve(null);
                    };
                    reader.readAsArrayBuffer(blob);
                }, 'image/png');
            } catch (e) {
                clearTimeout(timeoutId);
                console.warn('canvasToPngWithTimeout: toBlob exception', e);
                resolve(null);
            }
        });
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
            return null;
        }

        const objects = DrawingObjects.getPageObjects(pageNum);
        if (!objects || objects.length === 0) {
            return null;
        }

        // 高解像度でレンダリングするためのスケール
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');

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

        // エクスポートモードを有効化（マーカーのmultiply無効化）
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

        // CanvasをPNG Blobに変換（タイムアウト付き）
        return canvasToPngWithTimeout(canvas);
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
            return null;
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
            // X座標がleftPageWidth以下なら左ページ、それ以上なら右ページ
            leftObjects = spreadObjects.filter(obj => {
                const objX = obj.x || (obj.points && obj.points[0] ? obj.points[0].x : 0);
                return objX < leftPageWidth;
            });
            rightObjects = spreadObjects.filter(obj => {
                const objX = obj.x || (obj.points && obj.points[0] ? obj.points[0].x : 0);
                return objX >= leftPageWidth;
            });
        } else {
            // フォールバック: 元のページ番号から直接取得
            leftObjects = spread.leftPage ? DrawingObjects.getPageObjects(spread.leftPage) : [];
            rightObjects = spread.rightPage ? DrawingObjects.getPageObjects(spread.rightPage) : [];
        }

        if ((!leftObjects || leftObjects.length === 0) && (!rightObjects || rightObjects.length === 0)) {
            return null;
        }

        // 高解像度でレンダリングするためのスケール
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = spreadWidth * scale;
        canvas.height = spreadHeight * scale;
        const ctx = canvas.getContext('2d');

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

            // エクスポートモードを有効化（マーカーのmultiply無効化）
            DrawingRenderer.setExportMode(true);
            DrawingRenderer.renderAll(ctx, spreadKey);
            DrawingRenderer.setExportMode(false);

            if (savedSelectedIndex !== null) {
                DrawingObjects.selectObject(spreadKey, savedSelectedIndex);
            }

            ctx.restore();
        } else {
            // フォールバック: 左右ページを個別にレンダリング
            // エクスポートモードを有効化
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

        // CanvasをPNG Blobに変換（タイムアウト付き）
        return canvasToPngWithTimeout(canvas);
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
     * @returns {Promise<{success: boolean, data?: Uint8Array, error?: string}>}
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

        // 見開きモードの場合は別の保存ロジックを使用
        if (spreadMode && spreadMapping.length > 0) {
            return await saveNonDestructiveSpread(state, fileName, options, imagePageData, spreadMapping);
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
                    if (!imgData) {
                        console.error('画像データが見つかりません:', mapItem.imageIndex);
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

                            const pngData = await canvasToPngWithTimeout(canvas);

                            if (!pngData) {
                                canvas.width = 0;
                                canvas.height = 0;
                                console.error('Canvas to Blob変換に失敗しました（ページ:', pageNum, '）');
                                continue;
                            }

                            page = pdfDoc.addPage([pageWidth, pageHeight]);
                            const bgImage = await pdfDoc.embedPng(pngData);
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

                        const pngData = await canvasToPngWithTimeout(canvas);

                        if (!pngData) {
                            canvas.width = 0;
                            canvas.height = 0;
                            console.error('Canvas to Blob変換に失敗しました（ページ:', pageNum, '）');
                            continue;
                        }

                        page = pdfDoc.addPage([pageWidth, pageHeight]);
                        const bgImage = await pdfDoc.embedPng(pngData);
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

                const drawingPng = await renderDrawingObjectsToPng(
                    pageNum,
                    pageWidth,
                    pageHeight,
                    displayWidth,
                    displayHeight
                );

                if (drawingPng) {
                    const drawingImage = await pdfDoc.embedPng(drawingPng);
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

            // 90%完了を報告（PDF出力処理開始）
            onProgress(90);
            await new Promise(resolve => setTimeout(resolve, 0));

            // PDFを保存（useObjectStreams: falseで高速化）
            const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

            // 100%完了を報告
            onProgress(100);

            return { success: true, data: pdfBytes };

        } catch (error) {
            console.error('PDF保存エラー:', error);
            return { success: false, error: error.message };
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

                const drawingPng = await renderSpreadDrawingObjectsToPng(
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

                if (drawingPng) {
                    const drawingImage = await pdfDoc.embedPng(drawingPng);
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

            // 90%完了を報告（PDF出力処理開始）
            onProgress(90);
            await new Promise(resolve => setTimeout(resolve, 0));

            const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

            // 100%完了を報告
            onProgress(100);

            return { success: true, data: pdfBytes };

        } catch (error) {
            console.error('見開きPDF保存エラー:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 見開きPDFページに個別ページをレンダリング
     */
    async function renderPageToSpreadPdf(pdfDoc, page, state, mapItem, pageNum, xOffset, pageWidth, pageHeight, imagePageData, originalPdfBytesArray, srcPdfCache) {
        if (mapItem.docIndex === -2) {
            // 画像ページ
            const imgData = imagePageData[mapItem.imageIndex];
            if (!imgData) return;

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

                    const pngData = await canvasToPngWithTimeout(canvas);

                    if (!pngData) {
                        canvas.width = 0;
                        canvas.height = 0;
                        return;
                    }

                    const bgImage = await pdfDoc.embedPng(pngData);

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

                const pngData = await canvasToPngWithTimeout(canvas);

                if (!pngData) {
                    canvas.width = 0;
                    canvas.height = 0;
                    return;
                }

                const bgImage = await pdfDoc.embedPng(pngData);
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

                const drawingPng = await renderSpreadDrawingObjectsToPng(
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

                if (drawingPng) {
                    const drawingImage = await pdfDoc.embedPng(drawingPng);
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

            // 90%完了を報告（PDF出力処理開始）
            onProgress(90);
            await new Promise(resolve => setTimeout(resolve, 0));

            const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

            // 100%完了を報告
            onProgress(100);

            return { success: true, data: pdfBytes };

        } catch (error) {
            console.error('見開き透過PDF保存エラー:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 見開きPDFページに個別ページをレンダリング（透明度対応）
     */
    async function renderPageToSpreadPdfWithOpacity(pdfDoc, page, state, mapItem, pageNum, xOffset, pageWidth, pageHeight, imagePageData, originalPdfBytesArray, srcPdfCache, opacity) {
        if (mapItem.docIndex === -2) {
            // 画像ページ
            const imgData = imagePageData[mapItem.imageIndex];
            if (!imgData) return;

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

            const pngData = await canvasToPngWithTimeout(canvas);

            if (!pngData) {
                canvas.width = 0;
                canvas.height = 0;
                return;
            }

            const bgImage = await pdfDoc.embedPng(pngData);

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
        return canvasToPngWithTimeout(canvas);
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

        try {
            // 新しいPDFドキュメントを作成
            const pdfDoc = await PDFDocument.create();

            // 元PDFをキャッシュ
            const srcPdfCache = {};
            const originalPdfBytesArray = state.originalPdfBytesArray || [];

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
                    if (!imgData) {
                        console.error('画像データが見つかりません:', mapItem.imageIndex);
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

                const drawingPng = await renderDrawingObjectsToPng(
                    pageNum,
                    pageWidth,
                    pageHeight,
                    displayWidth,
                    displayHeight
                );

                if (drawingPng) {
                    const drawingImage = await pdfDoc.embedPng(drawingPng);
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

            // 90%完了を報告（PDF出力処理開始）
            onProgress(90);
            await new Promise(resolve => setTimeout(resolve, 0));

            // PDFを保存（useObjectStreams: falseで高速化）
            const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

            // 100%完了を報告
            onProgress(100);

            return { success: true, data: pdfBytes };

        } catch (error) {
            console.error('透過PDF保存エラー:', error);
            return { success: false, error: error.message };
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
