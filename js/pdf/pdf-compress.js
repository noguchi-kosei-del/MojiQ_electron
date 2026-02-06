/* js/pdf/pdf-compress.js - PDF圧縮・最適化モジュール */

/**
 * PDF圧縮処理を担当するモジュール
 * Canvas経由のロスレス圧縮とpdf-lib最適化を提供
 */
window._MojiQPdfCompress = (function() {
    'use strict';

    /**
     * PDFをCanvas経由で圧縮する（画質を維持したロスレス圧縮）
     * @param {Uint8Array} typedarray - 元のPDFデータ
     * @param {object} callbacks - コールバック関数群
     * @param {function} callbacks.nextFrame - UIブロック回避用
     * @param {function} callbacks.updateProgress - 進捗更新 (current, total)
     * @returns {Promise<Uint8Array>} - 圧縮されたPDFデータ
     * @throws {Error} PDF圧縮に失敗した場合
     */
    async function compressPdfViaCanvas(typedarray, callbacks) {
        var nextFrame = callbacks.nextFrame;
        var updateProgress = callbacks.updateProgress;
        var pdfDoc = null;
        var newPdf = null;

        try {
            var loadOptions = {
                data: typedarray,
                cMapUrl: window.MojiQPdfJsConfig?.cMapUrl || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/',
                cMapPacked: window.MojiQPdfJsConfig?.cMapPacked !== false,
                standardFontDataUrl: window.MojiQPdfJsConfig?.standardFontDataUrl || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/standard_fonts/'
            };
            var loadingTask = pdfjsLib.getDocument(loadOptions);
            pdfDoc = await loadingTask.promise;
            var numPages = pdfDoc.numPages;

            var jsPDFConstructor = window.jspdf.jsPDF;

            for (var i = 1; i <= numPages; i++) {
                await nextFrame();
                updateProgress(i, numPages);

                var page = null;
                try {
                    page = await pdfDoc.getPage(i);
                } catch (pageError) {
                    throw new Error('ページ ' + i + ' の読み込みに失敗しました');
                }

                var originalViewport = page.getViewport({ scale: 1.0 });
                var renderScale = 2.0;
                var viewport = page.getViewport({ scale: renderScale });

                var canvas = document.createElement('canvas');
                var context = canvas.getContext('2d');

                if (!context) {
                    throw new Error('Canvas 2Dコンテキストの取得に失敗しました');
                }

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                try {
                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise;
                } catch (renderError) {
                    canvas.width = 0;
                    canvas.height = 0;
                    throw new Error('ページ ' + i + ' のレンダリングに失敗しました');
                }

                var imgData = canvas.toDataURL('image/png');

                var pageWidthPt = originalViewport.width * 72 / 96;
                var pageHeightPt = originalViewport.height * 72 / 96;

                if (i === 1) {
                    var orientation = pageWidthPt > pageHeightPt ? 'l' : 'p';
                    newPdf = new jsPDFConstructor({
                        orientation: orientation,
                        unit: 'pt',
                        format: [pageWidthPt, pageHeightPt],
                        compress: true
                    });
                } else {
                    var orient = pageWidthPt > pageHeightPt ? 'l' : 'p';
                    newPdf.addPage([pageWidthPt, pageHeightPt], orient);
                }

                newPdf.addImage(imgData, 'PNG', 0, 0, pageWidthPt, pageHeightPt, undefined, 'SLOW');

                canvas.width = 0;
                canvas.height = 0;
            }

            if (!newPdf) {
                throw new Error('PDFの作成に失敗しました');
            }

            var compressedArrayBuffer = newPdf.output('arraybuffer');
            return new Uint8Array(compressedArrayBuffer);

        } catch (error) {
            throw error;
        }
    }

    /**
     * ファイルサイズが閾値を超えているかチェックし、必要に応じて最適化または圧縮
     * @param {File} file - PDFファイル
     * @param {object} options - オプション
     * @param {number} options.sizeThreshold - 圧縮閾値バイト数
     * @param {function} options.nextFrame - UIブロック回避用
     * @param {function} options.showProgress - 進捗表示 (message)
     * @param {function} options.updateProgress - 進捗更新 (current, total)
     * @param {function} options.updateProgressText - 進捗テキスト更新 (message)
     * @param {function} options.hideProgress - 進捗非表示
     * @returns {Promise<{data: Uint8Array|null, originalData: Uint8Array|null, wasCompressed: boolean, wasOptimized: boolean, cancelled: boolean}>}
     */
    async function checkAndCompressPdf(file, options) {
        // 大きなファイルの読み込み前にプログレスバーを表示
        options.showProgress('ファイルを読み込んでいます...');
        await options.nextFrame();

        return new Promise(function(resolve, reject) {
            var fileReader = new FileReader();

            // 大きなファイルの場合、FileReaderの進捗イベントを利用
            fileReader.onprogress = function(event) {
                if (event.lengthComputable && event.total > 0) {
                    var percent = Math.round((event.loaded / event.total) * 100);
                    options.updateProgress(percent, 100);
                }
            };

            fileReader.onload = async function() {
                var arrayBuffer = this.result;
                var typedarray = new Uint8Array(arrayBuffer);

                // ファイル読み込み完了後、プログレスを一旦非表示
                options.hideProgress();

                if (file.size >= options.sizeThreshold) {
                    // 500MB以上: Canvas経由の圧縮処理
                    var userConfirmed = await MojiQModal.showConfirm('PDFのサイズが非常に大きいため圧縮処理をします。\n処理に時間がかかる場合があります。続行しますか？');
                    if (!userConfirmed) {
                        resolve({ data: null, originalData: null, wasCompressed: false, wasOptimized: false, cancelled: true });
                        return;
                    }

                    options.showProgress('PDFを圧縮しています...');

                    try {
                        await options.nextFrame();

                        var compressedData = await compressPdfViaCanvas(typedarray, {
                            nextFrame: options.nextFrame,
                            updateProgress: options.updateProgress
                        });
                        options.hideProgress();
                        resolve({ data: compressedData, originalData: typedarray, wasCompressed: true, wasOptimized: false, cancelled: false });
                    } catch (err) {
                        options.hideProgress();
                        MojiQModal.showAlert('圧縮処理に失敗しました。元のPDFで読み込みます。', 'エラー');
                        resolve({ data: typedarray, originalData: typedarray, wasCompressed: false, wasOptimized: false, cancelled: false });
                    }
                } else {
                    // 500MB未満: pdf-lib埋め込みリソース最適化処理
                    options.showProgress('PDFを最適化しています...');

                    try {
                        await options.nextFrame();

                        var PdfLibSaver = window.MojiQPdfLibSaver;
                        if (PdfLibSaver && PdfLibSaver.optimizePdfResources) {
                            var result = await PdfLibSaver.optimizePdfResources(typedarray, function(message) {
                                options.updateProgressText(message);
                            });

                            options.hideProgress();

                            if (result.success) {
                                resolve({ data: result.data, originalData: result.data, wasCompressed: false, wasOptimized: true, cancelled: false });
                            } else {
                                resolve({ data: typedarray, originalData: typedarray, wasCompressed: false, wasOptimized: false, cancelled: false });
                            }
                        } else {
                            options.hideProgress();
                            resolve({ data: typedarray, originalData: typedarray, wasCompressed: false, wasOptimized: false, cancelled: false });
                        }
                    } catch (err) {
                        options.hideProgress();
                        resolve({ data: typedarray, originalData: typedarray, wasCompressed: false, wasOptimized: false, cancelled: false });
                    }
                }
            };
            fileReader.onerror = function() {
                options.hideProgress();
                reject(new Error('ファイルの読み込みに失敗しました'));
            };
            fileReader.readAsArrayBuffer(file);
        });
    }

    return {
        compressPdfViaCanvas: compressPdfViaCanvas,
        checkAndCompressPdf: checkAndCompressPdf
    };
})();
