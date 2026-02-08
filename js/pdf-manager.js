/**
 * MojiQ PDF Manager - PDF読み込み・レンダリング・保存モジュール
 * PDFの読み込み、圧縮、レンダリング、保存を担当
 */
window.MojiQPdfManager = (function() {
    'use strict';

    const Constants = window.MojiQConstants;
    let mojiqCanvas = null;
    let bgCanvas = null;
    let simCanvas = null;
    let canvasWrapper = null;
    let canvasArea = null;
    let ctx = null;
    let pdfUpload = null;
    let insertPdfUpload = null;
    let savePdfBtn = null;
    let initialMessage = null;
    let state = null;
    let dpr = 1;

    let insertPdfOffset = 1; // 0=前, 1=後

    // 画像ページデータを保持するオブジェクト（キー: pageMapping用インデックス）
    // { imageData: Uint8Array, width: number, height: number, type: 'jpeg'|'png' }
    let imagePageData = {};
    // 画像ページのImageBitmapキャッシュ（高速描画用）
    let imageBitmapCache = {};

    // 初回レンダリング時のコンテナサイズを固定（リサイズ時に変更しないため）
    let fixedContainerWidth = null;
    let fixedContainerHeight = null;

    // 背景透過モードフラグ
    let isBgTransparentMode = false;
    // 背景透過度（0-100、0=完全透明、100=不透明）
    let bgOpacityValue = 0;

    // プログレスバー処理中フラグ（保存・読込中のファイルオープン防止）
    let isProcessing = false;

    // ページレンダリング中フラグ（連打対策）
    let isRendering = false;
    let pendingPageNum = null;  // レンダリング中に要求されたページ番号

    // 見開きモード関連
    let spreadViewMode = false;           // 見開きモードフラグ
    let spreadMapping = [];               // 見開きマッピング配列
    let currentSpreadIndex = 0;           // 現在の見開きインデックス
    let isSpreadRendering = false;        // 見開きレンダリング中フラグ
    let pendingSpreadIndex = null;        // 見開きレンダリング中に要求されたインデックス
    let spreadRenderOperationId = 0;      // 見開きレンダリング操作ID（古い描画のキャンセル用）
    let spreadBindingDirection = 'right'; // 綴じ方向: 'right'=右綴じ, 'left'=左綴じ
    let spreadBlankPagesAdded = { front: 0, back: 0 }; // 追加した白紙ページ数

    // 見開きキャッシュ（全ページを事前レンダリング）
    let spreadPageCache = {};             // { pageNum: ImageData } 形式でキャッシュ
    let spreadCacheReady = false;         // キャッシュ準備完了フラグ
    let spreadBaseScale = 1;              // 見開き用基準スケール
    let spreadDisplaying = false;         // 見開き表示処理中フラグ（外部からの再描画をブロック）

    // 単一ページ表示用レンダリングキャッシュ（LRU方式）
    let singlePageCache = null;              // PageRenderLRUCache インスタンス
    const SINGLE_PAGE_CACHE_MAX = 30;        // 最大キャッシュページ数（高解像度画像を含むPDF対応のため拡大）
    let prefetchAbortController = null;      // プリフェッチ中断制御
    let isPrefetching = false;               // プリフェッチ実行中フラグ

    // 上書き保存用: 最後に保存/読み込んだファイルパス（Electron環境のみ）
    let currentSaveFilePath = null;

    // 保存後の変更追跡フラグ（trueの場合、最後の保存から変更がある）
    let hasUnsavedChanges = false;

    // コールバック
    let toggleAppLockCallback = null;

    // イベントリスナー参照（cleanup用）
    let boundHandlers = {
        pdfUploadChange: null,
        insertPdfUploadChange: null,
        openPdfHandler: null,
        savePdfHandler: null,
        savePdfBtnClick: null,
        redrawHandler: null,
        redrawUnsubscribe: null,
        bgOpacityInput: null,
        bgOpacityMouseup: null,
        bgOpacityKeydown: null,
        bgOpacityWheel: null,
        dragEvents: null,
        canvasAreaDragenter: null,
        canvasAreaDragover: null,
        canvasAreaDragleave: null,
        canvasAreaDrop: null
    };

    // PDF圧縮の閾値（定数から取得、フォールバック: 500MB）
    const PDF_SIZE_THRESHOLD = Constants
        ? Constants.THRESHOLDS.PDF_SIZE_LIMIT
        : 500 * 1024 * 1024;

    // pdf-lib最適化の閾値（500MB未満で発動）
    const PDF_OPTIMIZE_THRESHOLD = Constants
        ? Constants.THRESHOLDS.PDF_OPTIMIZE_LIMIT
        : 500 * 1024 * 1024;

    // 画像圧縮の閾値（定数から取得、フォールバック: 300MB）
    const IMAGE_SIZE_THRESHOLD = Constants
        ? Constants.THRESHOLDS.IMAGE_SIZE_LIMIT
        : 300 * 1024 * 1024;

    // 画像圧縮品質（定数から取得、フォールバック: 0.75）
    const IMAGE_COMPRESS_QUALITY = Constants
        ? Constants.THRESHOLDS.IMAGE_COMPRESS_QUALITY
        : 0.75;

    // uint8ArrayToBase64 は _MojiQPdfUtils.uint8ArrayToBase64 を使用
    const uint8ArrayToBase64 = window._MojiQPdfUtils.uint8ArrayToBase64;

    // ========================================
    // PDF注釈読み込み機能
    // ========================================

    /**
     * PDF座標からMojiQ座標に変換
     * PDFは左下原点、MojiQは左上原点
     * @param {number} pdfX - PDF X座標
     * @param {number} pdfY - PDF Y座標
     * @param {number} pdfHeight - PDFページの高さ
     * @param {number} scaleX - X方向スケール係数
     * @param {number} scaleY - Y方向スケール係数
     * @returns {{x: number, y: number}} MojiQ座標
     */
    function pdfToMojiQCoordinates(pdfX, pdfY, pdfHeight, scaleX, scaleY) {
        return {
            x: pdfX * scaleX,
            y: (pdfHeight - pdfY) * scaleY
        };
    }

    /**
     * PDF色配列からHEX文字列に変換
     * @param {Array<number>|null} pdfColor - RGB配列（各0-1）またはnull
     * @returns {string} HEX色文字列
     */
    function pdfColorToHex(pdfColor) {
        if (!pdfColor || pdfColor.length < 3) {
            return '#ff0000';  // デフォルト: 赤
        }
        const r = Math.round(pdfColor[0] * 255);
        const g = Math.round(pdfColor[1] * 255);
        const b = Math.round(pdfColor[2] * 255);
        return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    }

    /**
     * PDF注釈をMojiQテキストオブジェクトに変換
     * @param {Object} annot - PDF.jsの注釈オブジェクト
     * @param {number} pdfHeight - PDFページの高さ
     * @param {number} scaleX - X方向スケール係数
     * @param {number} scaleY - Y方向スケール係数
     * @returns {Object|null} MojiQテキストオブジェクト、変換不可の場合null
     */
    function convertPdfAnnotationToTextObject(annot, pdfHeight, scaleX, scaleY) {
        // contentsがない注釈はスキップ
        if (!annot.contents || annot.contents.trim() === '') {
            return null;
        }

        // サポートする注釈タイプをチェック
        const supportedTypes = ['Text', 'FreeText', 'Highlight', 'Underline', 'StrikeOut'];
        if (!supportedTypes.includes(annot.subtype)) {
            return null;
        }

        const rect = annot.rect;  // [x1, y1, x2, y2]

        // 注釈の左上位置をMojiQ座標に変換
        const pos = pdfToMojiQCoordinates(rect[0], rect[3], pdfHeight, scaleX, scaleY);

        // 色の変換
        const color = pdfColorToHex(annot.color);

        // フォントサイズ（FreeTextの場合は大きめ、それ以外は標準）
        const fontSize = annot.subtype === 'FreeText' ? 16 : 14;

        return {
            type: 'text',
            text: annot.contents,
            startPos: { x: pos.x, y: pos.y },
            fontSize: fontSize,
            color: color,
            align: 'left',
            isVertical: false,
            _pdfAnnotationSource: annot.subtype
        };
    }

    /**
     * PDFページから注釈を抽出してMojiQオブジェクトを作成
     * @param {PDFPageProxy} page - PDF.jsのページオブジェクト
     * @param {number} displayWidth - 表示時のページ幅
     * @param {number} displayHeight - 表示時のページ高さ
     * @returns {Promise<Array>} MojiQ描画オブジェクトの配列
     */
    async function extractPdfAnnotations(page, displayWidth, displayHeight) {
        const annotations = await page.getAnnotations();
        const viewport = page.getViewport({ scale: 1 });

        const scaleX = displayWidth / viewport.width;
        const scaleY = displayHeight / viewport.height;

        const objects = [];

        for (const annot of annotations) {
            const obj = convertPdfAnnotationToTextObject(
                annot,
                viewport.height,
                scaleX,
                scaleY
            );
            if (obj) {
                objects.push(obj);
            }
        }

        return objects;
    }

    /**
     * 全ページのPDF注釈を読み込んでMojiQオブジェクトとして追加
     * @param {PDFDocumentProxy} pdf - PDFドキュメント
     */
    async function loadPdfAnnotationsForAllPages(pdf) {
        const containerWidth = fixedContainerWidth;
        const containerHeight = fixedContainerHeight;

        let totalAnnotations = 0;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            try {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 1 });

                // 表示サイズを計算（renderPageと同じロジック）
                const scale = Math.min(
                    containerWidth / viewport.width,
                    containerHeight / viewport.height
                );
                const displayWidth = viewport.width * scale;
                const displayHeight = viewport.height * scale;

                const objects = await extractPdfAnnotations(page, displayWidth, displayHeight);

                for (const obj of objects) {
                    window.MojiQDrawingObjects.addObject(pageNum, obj);
                }

                if (objects.length > 0) {
                    totalAnnotations += objects.length;
                    console.log('[MojiQ PdfManager] ページ ' + pageNum + ': ' + objects.length + '件の注釈を読み込みました');
                }
            } catch (e) {
                console.warn('[MojiQ PdfManager] ページ ' + pageNum + ' の注釈読み込みに失敗:', e);
            }
        }

        if (totalAnnotations > 0) {
            console.log('[MojiQ PdfManager] 合計 ' + totalAnnotations + '件の注釈を読み込みました');
        }
    }

    /**
     * ヘッダーにPDFファイル名を表示
     * @param {string} fileName - ファイル名
     */
    function updatePdfFileNameDisplay(fileName) {
        const displayEl = document.getElementById('pdfFileNameDisplay');
        if (!displayEl) return;

        // 拡張子を除いたファイル名
        const nameWithoutExt = fileName.replace(/\.pdf$/i, '');

        // 15文字を超える場合は省略表示
        let displayName;
        if (nameWithoutExt.length > 15) {
            displayName = nameWithoutExt.substring(0, 15) + '….pdf';
        } else {
            displayName = fileName;
        }

        displayEl.textContent = displayName;
        displayEl.title = fileName; // フルネームをツールチップに
    }

    /**
     * 保存用のファイル名を取得
     * @param {string} suffix - ファイル名に追加するサフィックス（省略可）
     * @returns {string} - ファイル名（拡張子なし）
     */
    function getSaveFileName(suffix = '') {
        const displayEl = document.getElementById('pdfFileNameDisplay');
        let baseName = 'download';
        if (displayEl && displayEl.title) {
            baseName = displayEl.title.replace(/\.pdf$/i, '');
        }
        return suffix ? `${baseName}${suffix}` : baseName;
    }

    /**
     * 進捗オーバーレイを表示（共通オーバーレイを使用）
     * @param {string} message - 表示メッセージ
     */
    function showProgressOverlay(message) {
        isProcessing = true;
        showLoadingOverlay(true, message);
        updateLoadingProgress(0, 100, '%');
    }

    /**
     * 進捗オーバーレイを更新
     * @param {number} current - 現在のページ
     * @param {number} total - 総ページ数
     */
    function updateProgressOverlay(current, total) {
        updateLoadingProgress(current, total);
    }

    /**
     * 進捗オーバーレイを非表示
     */
    function hideProgressOverlay() {
        isProcessing = false;
        showLoadingOverlay(false);
    }

    /**
     * 進捗オーバーレイのテキストのみを更新
     * @param {string} message - 表示メッセージ
     */
    function updateProgressOverlayText(message) {
        const titleElement = document.getElementById('loadingTitle');
        if (titleElement) {
            titleElement.textContent = message;
        }
    }

    // nextFrame は _MojiQPdfUtils.nextFrame を使用
    const nextFrame = window._MojiQPdfUtils.nextFrame;

    // 圧縮処理は _MojiQPdfCompress を使用（依存注入パターン）
    async function compressPdfViaCanvas(typedarray) {
        return window._MojiQPdfCompress.compressPdfViaCanvas(typedarray, {
            nextFrame: nextFrame,
            updateProgress: updateProgressOverlay
        });
    }

    async function checkAndCompressPdf(file) {
        return window._MojiQPdfCompress.checkAndCompressPdf(file, {
            sizeThreshold: PDF_SIZE_THRESHOLD,
            nextFrame: nextFrame,
            showProgress: showProgressOverlay,
            updateProgress: updateProgressOverlay,
            updateProgressText: updateProgressOverlayText,
            hideProgress: hideProgressOverlay
        });
    }

    // =====================================================
    // ページレンダリングLRUキャッシュ（外部モジュール使用）
    // =====================================================
    const PageRenderLRUCache = window._MojiQPdfCache.PageRenderLRUCache;

    /**
     * レンダリング結果をキャッシュに保存
     * @param {string} cacheKey - キャッシュキー
     * @param {HTMLCanvasElement} sourceCanvas - レンダリング済みキャンバス
     * @param {object} sizeInfo - { displayWidth, displayHeight }
     */
    async function storePageInCache(cacheKey, sourceCanvas, sizeInfo) {
        if (!singlePageCache) return;
        try {
            let bitmap;
            if (typeof createImageBitmap === 'function') {
                bitmap = await createImageBitmap(sourceCanvas);
            } else {
                // フォールバック: キャンバスのコピーを作成
                const copy = document.createElement('canvas');
                copy.width = sourceCanvas.width;
                copy.height = sourceCanvas.height;
                copy.getContext('2d').drawImage(sourceCanvas, 0, 0);
                bitmap = copy;
            }
            singlePageCache.set(cacheKey, {
                bitmap: bitmap,
                width: sourceCanvas.width,
                height: sourceCanvas.height,
                displayWidth: sizeInfo.displayWidth,
                displayHeight: sizeInfo.displayHeight
            });
        } catch (e) {
            console.warn('ページキャッシュ保存に失敗:', e);
        }
    }

    /**
     * 指定ページのキャッシュを無効化（描画オブジェクト変更時に呼び出す）
     * @param {number} pageNum - ページ番号
     */
    function invalidatePageCache(pageNum) {
        if (!singlePageCache) return;

        // 該当ページのキャッシュエントリを検索して削除
        // キャッシュキーは pageNum_containerWidth_containerHeight_dpr 形式
        const keysToDelete = [];
        singlePageCache._map.forEach((value, key) => {
            if (key.startsWith(pageNum + '_')) {
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach(key => {
            const entry = singlePageCache._map.get(key);
            if (entry && entry.bitmap && typeof entry.bitmap.close === 'function') {
                entry.bitmap.close();
            }
            singlePageCache._map.delete(key);
        });
    }

    /**
     * プリフェッチを中断
     */
    function cancelPrefetch() {
        if (prefetchAbortController) {
            prefetchAbortController.abort();
            prefetchAbortController = null;
        }
        isPrefetching = false;
    }

    /**
     * 隣接ページのプリフェッチをスケジュール
     * @param {number} currentPage - 現在のページ番号
     * @param {number} containerWidth - コンテナ幅
     * @param {number} containerHeight - コンテナ高さ
     */
    function schedulePrefetch(currentPage, containerWidth, containerHeight) {
        // 見開きモードではプリフェッチしない（独自キャッシュがある）
        if (spreadViewMode) return;

        // 既存のプリフェッチをキャンセル
        cancelPrefetch();
        prefetchAbortController = new AbortController();
        const signal = prefetchAbortController.signal;

        // 少し待ってから開始（ユーザーの連続ナビゲーションを考慮）
        setTimeout(() => {
            if (signal.aborted) return;
            prefetchAdjacentPages(currentPage, containerWidth, containerHeight, signal);
        }, 50);  // 50msに短縮（高解像度PDF対応）
    }

    /**
     * 隣接ページを非同期でプリフェッチ
     * @param {number} currentPage - 現在のページ番号
     * @param {number} containerWidth - コンテナ幅
     * @param {number} containerHeight - コンテナ高さ
     * @param {AbortSignal} signal - 中断シグナル
     */
    async function prefetchAdjacentPages(currentPage, containerWidth, containerHeight, signal) {
        if (isPrefetching) return;
        isPrefetching = true;

        try {
            // プリフェッチ対象: 次ページ → 前ページの順
            const targets = [];
            if (currentPage + 1 <= state.totalPages) targets.push(currentPage + 1);
            if (currentPage - 1 >= 1) targets.push(currentPage - 1);

            for (const targetPage of targets) {
                if (signal.aborted) break;

                const cacheKey = PageRenderLRUCache.makeKey(targetPage, containerWidth, containerHeight, dpr);
                // 既にキャッシュにあればスキップ
                if (singlePageCache.get(cacheKey)) continue;

                // UIブロックを防ぐためにフレーム境界で待機
                await new Promise(resolve => requestAnimationFrame(resolve));
                if (signal.aborted) break;

                // オフスクリーンキャンバスでレンダリング
                await prefetchRenderPage(targetPage, containerWidth, containerHeight, cacheKey, signal);
            }
        } finally {
            isPrefetching = false;
        }
    }

    /**
     * 単一ページをオフスクリーンでレンダリングしてキャッシュに保存
     * @param {number} pageNum - ページ番号
     * @param {number} containerWidth - コンテナ幅
     * @param {number} containerHeight - コンテナ高さ
     * @param {string} cacheKey - キャッシュキー
     * @param {AbortSignal} signal - 中断シグナル
     */
    async function prefetchRenderPage(pageNum, containerWidth, containerHeight, cacheKey, signal) {
        const mapItem = state.pageMapping[pageNum - 1];
        if (!mapItem) return;

        const offCanvas = document.createElement('canvas');
        const offCtx = offCanvas.getContext('2d');
        let displayWidth, displayHeight;

        try {
            if (mapItem.docIndex === -2) {
                // 画像ページ
                const imgData = imagePageData[mapItem.imageIndex];
                if (!imgData) return;

                const scale = Math.min(containerWidth / imgData.width, containerHeight / imgData.height);
                const contentW = imgData.width * scale * dpr;
                const contentH = imgData.height * scale * dpr;
                offCanvas.width = contentW;
                offCanvas.height = contentH;

                const blob = new Blob([imgData.data], { type: imgData.type === 'png' ? 'image/png' : 'image/jpeg' });
                const url = URL.createObjectURL(blob);

                await new Promise((resolve, reject) => {
                    if (signal.aborted) { URL.revokeObjectURL(url); reject(new Error('aborted')); return; }
                    const img = new Image();
                    img.onload = () => {
                        offCtx.drawImage(img, 0, 0, contentW, contentH);
                        URL.revokeObjectURL(url);
                        resolve();
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(url);
                        reject(new Error('画像プリフェッチエラー'));
                    };
                    img.src = url;
                });

                displayWidth = contentW / dpr;
                displayHeight = contentH / dpr;

            } else if (mapItem.docIndex === -1) {
                // 白紙ページ
                const blankW = mapItem.width || 595;
                const blankH = mapItem.height || 842;
                const scale = Math.min(containerWidth / blankW, containerHeight / blankH);
                const contentW = blankW * scale * dpr;
                const contentH = blankH * scale * dpr;
                offCanvas.width = contentW;
                offCanvas.height = contentH;

                offCtx.fillStyle = '#ffffff';
                offCtx.fillRect(0, 0, contentW, contentH);

                displayWidth = contentW / dpr;
                displayHeight = contentH / dpr;

            } else {
                // PDFページ
                const targetDoc = state.pdfDocs[mapItem.docIndex];
                if (!targetDoc) return;

                const page = await targetDoc.getPage(mapItem.pageNum);
                if (signal.aborted) return;

                const viewport = page.getViewport({ scale: 1 });
                const scale = Math.min(containerWidth / viewport.width, containerHeight / viewport.height);
                const scaledViewport = page.getViewport({ scale: scale * dpr });

                offCanvas.width = scaledViewport.width;
                offCanvas.height = scaledViewport.height;

                await page.render({ canvasContext: offCtx, viewport: scaledViewport }).promise;
                if (signal.aborted) return;

                displayWidth = scaledViewport.width / dpr;
                displayHeight = scaledViewport.height / dpr;
            }

            // 背景のみをキャッシュに保存（描画オブジェクトは含めない）
            // 描画オブジェクトはページ表示時にrenderAllで再描画される
            if (!signal.aborted) {
                await storePageInCache(cacheKey, offCanvas, {
                    displayWidth: displayWidth,
                    displayHeight: displayHeight
                });
            }
        } catch (e) {
            if (e.message !== 'aborted') {
                console.warn(`ページ ${pageNum} のプリフェッチに失敗:`, e);
            }
        } finally {
            // メモリ解放
            offCanvas.width = 0;
            offCanvas.height = 0;
        }
    }

    /**
     * 全ページを事前にキャッシュにロード（PDF読み込み時に使用）
     * @param {number} totalPages - 総ページ数
     * @param {function} onProgress - 進捗コールバック (current, total) => void
     */
    async function preloadAllPages(totalPages, onProgress) {
        // コンテナサイズを取得（初回の場合は設定）
        if (fixedContainerWidth === null || fixedContainerHeight === null) {
            fixedContainerWidth = canvasArea.clientWidth - 40;
            fixedContainerHeight = canvasArea.clientHeight - 40;
        }

        const containerWidth = fixedContainerWidth;
        const containerHeight = fixedContainerHeight;

        // バッチサイズ: 何ページごとにUIを更新するか
        const BATCH_SIZE = 3;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const cacheKey = PageRenderLRUCache.makeKey(pageNum, containerWidth, containerHeight, dpr);

            // 既にキャッシュにあればスキップ
            if (singlePageCache && singlePageCache.get(cacheKey)) {
                // 進捗を報告（スキップ時も）
                if (onProgress) {
                    onProgress(pageNum, totalPages);
                }
                continue;
            }

            // レンダリング前にUI更新の機会を与える（フリーズ防止）
            // バッチの開始時にフレーム境界で待機
            if ((pageNum - 1) % BATCH_SIZE === 0) {
                await nextFrame();
            }

            // ページをレンダリングしてキャッシュに保存
            try {
                await prefetchRenderPage(pageNum, containerWidth, containerHeight, cacheKey, { aborted: false });
            } catch (e) {
                console.warn(`ページ ${pageNum} のプリロードに失敗:`, e);
            }

            // 進捗を報告（レンダリング後）
            if (onProgress) {
                onProgress(pageNum, totalPages);
            }

            // バッチの終了時またはページ処理後にUIを更新
            if (pageNum % BATCH_SIZE === 0 || pageNum === totalPages) {
                await nextFrame();
            }
        }
    }

    /**
     * 初期化
     * @param {object} elements - DOM要素
     * @param {object} appState - アプリケーション状態への参照
     * @param {object} callbacks - コールバック関数群
     */
    function init(elements, appState, callbacks) {
        // DOM Cacheからキャンバス関連要素を取得
        if (window.MojiQDOMCache && MojiQDOMCache.isInitialized()) {
            const cached = MojiQDOMCache.getCanvasElements();
            mojiqCanvas = cached.mojiqCanvas;
            bgCanvas = cached.bgCanvas;
            simCanvas = cached.simCanvas;
            canvasWrapper = cached.canvasWrapper;
            canvasArea = cached.canvasArea;
            ctx = cached.ctx;
            dpr = cached.dpr;
        } else {
            // フォールバック：従来の方式
            mojiqCanvas = elements.mojiqCanvas;
            bgCanvas = elements.bgCanvas;
            simCanvas = elements.simCanvas;
            canvasWrapper = elements.canvasWrapper;
            canvasArea = elements.canvasArea;
            ctx = elements.ctx;
            dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
        }

        pdfUpload = elements.pdfUpload;
        insertPdfUpload = elements.insertPdfUpload;
        savePdfBtn = elements.savePdfBtn;
        initialMessage = elements.initialMessage;
        state = appState;

        toggleAppLockCallback = callbacks.toggleAppLock;

        // PDF.js worker設定
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';

        // CMap設定（日本語フォント等の正しい表示に必要）
        // これにより、埋め込みフォントがないPDFや特殊なエンコーディングのPDFでも
        // 文字が正しく表示されるようになります
        window.MojiQPdfJsConfig = {
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/standard_fonts/'
        };

        // ページレンダリングキャッシュを初期化
        singlePageCache = new PageRenderLRUCache(SINGLE_PAGE_CACHE_MAX);

        setupEventListeners();
        setupDragAndDrop();
    }

    /**
     * ページキー取得
     * @param {object} mapItem - ページマッピングアイテム
     * @returns {string}
     */
    function getPageKey(mapItem) {
        return `${mapItem.docIndex}-${mapItem.pageNum}`;
    }

    /**
     * ページレンダリング
     * @param {number} pageNum - ページ番号
     */
    async function renderPage(pageNum) {
        if (state.totalPages === 0 || pageNum < 1 || pageNum > state.totalPages) return;

        // 処理中（PDF読み込み/保存中）の場合はページ変更をブロック
        // ただし現在のページと同じ場合は再描画を許可
        if (isProcessing && pageNum !== state.currentPageNum) {
            console.warn('Processing in progress, page change blocked');
            return;
        }

        // 見開きモード時は見開きレンダリングにリダイレクト
        if (spreadViewMode) {
            // ページ番号から見開きインデックスを計算
            const spreadIndex = getSpreadIndexFromPage(pageNum);
            renderSpreadView(spreadIndex);
            return;
        }

        // 連打対策：レンダリング中の場合は最新のページ番号を保持して終了
        if (isRendering) {
            pendingPageNum = pageNum;
            return;
        }

        isRendering = true;
        pendingPageNum = null;

        try {
            await renderPageInternal(pageNum);
        } finally {
            isRendering = false;

            // レンダリング中に別のページが要求されていた場合、最新のページをレンダリング
            // awaitを使用して競合状態を防止
            if (pendingPageNum !== null && pendingPageNum !== pageNum) {
                const nextPage = pendingPageNum;
                pendingPageNum = null;
                // 次のマイクロタスクでレンダリングを開始し、再帰的なスタック増加を防止
                queueMicrotask(() => {
                    renderPage(nextPage);
                });
            }
        }
    }

    /**
     * ページレンダリング内部処理
     * @param {number} pageNum - ページ番号
     */
    async function renderPageInternal(pageNum) {
        if (state.totalPages === 0 || pageNum < 1 || pageNum > state.totalPages) return;

        const mapItem = state.pageMapping[pageNum - 1];
        if (!mapItem) {
            console.error('pageMappingが不正です（pageNum:', pageNum, '）');
            return;
        }
        const pageKey = getPageKey(mapItem);

        // 初回レンダリング時にコンテナサイズを固定（以降はリサイズしても変更しない）
        if (fixedContainerWidth === null || fixedContainerHeight === null) {
            fixedContainerWidth = canvasArea.clientWidth - 40;  // パディング20px * 2
            fixedContainerHeight = canvasArea.clientHeight - 40;
        }

        const containerWidth = fixedContainerWidth;
        const containerHeight = fixedContainerHeight;

        // --- キャッシュルックアップ ---
        const cacheKey = PageRenderLRUCache.makeKey(pageNum, containerWidth, containerHeight, dpr);
        const cachedEntry = singlePageCache ? singlePageCache.get(cacheKey) : null;

        if (cachedEntry) {
            // キャッシュヒット: bgCanvasにキャッシュ画像を即座に描画
            bgCanvas.width = mojiqCanvas.width = simCanvas.width = cachedEntry.width;
            bgCanvas.height = mojiqCanvas.height = simCanvas.height = cachedEntry.height;

            const bgContext = bgCanvas.getContext('2d');
            bgContext.drawImage(cachedEntry.bitmap, 0, 0);

            state.baseCSSExtent = { width: cachedEntry.displayWidth, height: cachedEntry.displayHeight };
            state.pdfContentOffset = { x: 0, y: 0 };
            mapItem.displayWidth = cachedEntry.displayWidth;
            mapItem.displayHeight = cachedEntry.displayHeight;
        } else {
            // キャッシュミス: 従来のレンダリングを実行
            const bgContext = bgCanvas.getContext('2d');

            if (mapItem.docIndex === -2) {
                // 画像ページ
                const imgData = imagePageData[mapItem.imageIndex];
                if (!imgData) {
                    console.error('画像データが見つかりません:', mapItem.imageIndex);
                    return;
                }

                const imgW = imgData.width;
                const imgH = imgData.height;
                const scale = Math.min(containerWidth / imgW, containerHeight / imgH);

                const contentW = imgW * scale * dpr;
                const contentH = imgH * scale * dpr;

                bgCanvas.width = mojiqCanvas.width = simCanvas.width = contentW;
                bgCanvas.height = mojiqCanvas.height = simCanvas.height = contentH;

                // ImageBitmapキャッシュを使用して高速描画
                let bitmap = imageBitmapCache[mapItem.imageIndex];
                if (!bitmap) {
                    // キャッシュミス: Blobから読み込んでImageBitmapを作成
                    const blob = new Blob([imgData.data], { type: imgData.type === 'png' ? 'image/png' : 'image/jpeg' });
                    if (typeof createImageBitmap === 'function') {
                        // createImageBitmapが使用可能な場合（高速）
                        bitmap = await createImageBitmap(blob);
                        imageBitmapCache[mapItem.imageIndex] = bitmap;
                    } else {
                        // フォールバック: Image経由で描画
                        const url = URL.createObjectURL(blob);
                        await new Promise((resolve, reject) => {
                            const img = new Image();
                            img.onload = () => {
                                bgContext.drawImage(img, 0, 0, contentW, contentH);
                                URL.revokeObjectURL(url);
                                resolve();
                            };
                            img.onerror = () => {
                                URL.revokeObjectURL(url);
                                reject(new Error('画像描画エラー'));
                            };
                            img.src = url;
                        });
                        bitmap = null; // フォールバック時は描画済み
                    }
                }

                // ImageBitmapがある場合は描画
                if (bitmap) {
                    bgContext.drawImage(bitmap, 0, 0, contentW, contentH);
                }

                state.baseCSSExtent = { width: contentW / dpr, height: contentH / dpr };
                state.pdfContentOffset = { x: 0, y: 0 };

                mapItem.displayWidth = contentW / dpr;
                mapItem.displayHeight = contentH / dpr;
            } else if (mapItem.docIndex === -1) {
                // 白紙ページ
                const blankW = mapItem.width;
                const blankH = mapItem.height;
                const scale = Math.min(containerWidth / blankW, containerHeight / blankH);

                const contentW = blankW * scale * dpr;
                const contentH = blankH * scale * dpr;

                bgCanvas.width = mojiqCanvas.width = simCanvas.width = contentW;
                bgCanvas.height = mojiqCanvas.height = simCanvas.height = contentH;

                // 背景を白で塗りつぶし
                bgContext.fillStyle = '#ffffff';
                bgContext.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

                state.baseCSSExtent = { width: contentW / dpr, height: contentH / dpr };
                state.pdfContentOffset = { x: 0, y: 0 };

                // ページごとの表示サイズを保存（描画オブジェクトのスケーリング用）
                mapItem.displayWidth = contentW / dpr;
                mapItem.displayHeight = contentH / dpr;
            } else {
                // PDFページ
                const targetDoc = state.pdfDocs[mapItem.docIndex];
                if (!targetDoc) {
                    console.error('PDFドキュメントが見つかりません（docIndex:', mapItem.docIndex, '）');
                    return;
                }
                const page = await targetDoc.getPage(mapItem.pageNum);
                const viewport = page.getViewport({ scale: 1 });
                const scale = Math.min(containerWidth / viewport.width, containerHeight / viewport.height);
                const scaledViewport = page.getViewport({ scale: scale * dpr });

                const contentW = scaledViewport.width;
                const contentH = scaledViewport.height;

                bgCanvas.width = mojiqCanvas.width = simCanvas.width = contentW;
                bgCanvas.height = mojiqCanvas.height = simCanvas.height = contentH;

                // PDFを描画
                await page.render({ canvasContext: bgContext, viewport: scaledViewport }).promise;

                state.baseCSSExtent = { width: contentW / dpr, height: contentH / dpr };
                state.pdfContentOffset = { x: 0, y: 0 };

                // ページごとの表示サイズを保存（描画オブジェクトのスケーリング用）
                mapItem.displayWidth = contentW / dpr;
                mapItem.displayHeight = contentH / dpr;
            }

            // --- 背景のみをキャッシュに保存（描画オブジェクトは含めない） ---
            // 描画オブジェクトはページ表示時に常にrenderAllで再描画されるため、
            // キャッシュには背景（PDF/画像）のみを保存する
            storePageInCache(cacheKey, bgCanvas, {
                displayWidth: mapItem.displayWidth,
                displayHeight: mapItem.displayHeight
            });
        }

        // ズームレベルを維持（初回読み込み時のみ1.0にリセット）
        if (state.currentZoom === undefined || state.currentZoom === null) {
            state.currentZoom = 1.0;
        }
        MojiQZoom.updateZoomDisplay();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        // 重要：compositeOperationをリセット（eraserモード対策）
        // initContext()はcurrentModeに基づいて設定するため、
        // eraserモードだとdestination-outになり描画が見えなくなる
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.clearRect(0, 0, state.baseCSSExtent.width, state.baseCSSExtent.height);

        // ページ切り替え前に選択を解除
        if (window.MojiQDrawingObjects && state.currentPageNum !== pageNum) {
            MojiQDrawingObjects.deselectObject(state.currentPageNum);
            // 選択ツールの操作状態もリセット
            if (window.MojiQDrawingSelect) {
                MojiQDrawingSelect.resetState();
            }
        }

        state.currentPageNum = pageNum;

        // DrawingObjectsの現在ページを更新
        if (window.MojiQDrawingObjects) {
            MojiQDrawingObjects.setCurrentPage(pageNum);
        }

        // DrawingSelectの現在ページも更新（選択ツールの状態を同期）
        if (window.MojiQDrawingSelect) {
            MojiQDrawingSelect.setCurrentPage(pageNum);
        }

        // 描画オブジェクトを再描画（キャッシュはPDF/画像背景のみを保存しているため、常に再描画が必要）
        if (window.MojiQDrawingRenderer && window.MojiQDrawingObjects) {
            MojiQDrawingRenderer.renderAll(ctx, pageNum);
        }

        // 描画履歴がなければ初期化（toDataURLは非常に重いため、必要な場合のみ実行）
        // 履歴の初期化は実際に描画が行われたときに遅延実行する
        if (!state.pageDrawingHistory[pageKey]) {
            state.pageDrawingHistory[pageKey] = [];
        }

        // Simulatorキャンバスをクリア
        const simCtx = simCanvas.getContext('2d');
        simCtx.clearRect(0, 0, simCanvas.width, simCanvas.height);

        // ナビゲーション更新
        MojiQNavigation.updatePageDisplay(pageNum, state.totalPages);
        MojiQNavigation.resetNavBarTimer();

        // グローバル状態更新
        if (!window.MojiQGlobal) window.MojiQGlobal = {};
        window.MojiQGlobal.pageNum = pageNum;
        window.MojiQGlobal.pdfLoaded = true;

        // アンドゥ・リドゥボタンの状態を更新
        MojiQPageManager.updatePageControls();

        if (window.syncSimulatorFromScript) window.syncSimulatorFromScript(pageNum);

        // --- 隣接ページのプリフェッチを開始 ---
        schedulePrefetch(pageNum, containerWidth, containerHeight);
    }

    /**
     * ヘッダーボタンを有効化
     */
    function enableHeaderButtons() {
        // 保存ボタンは描画があるまで無効のまま（updateSaveButtonStateで制御）
        // const savePdfBtn = document.getElementById('savePdfBtn');
        // if (savePdfBtn) savePdfBtn.disabled = false;

        // 背景透過スライダーを有効化
        const bgOpacitySlider = document.getElementById('bgOpacitySlider');
        if (bgOpacitySlider) bgOpacitySlider.disabled = false;

        // PDF読み込み後、pdf-requiredボタンのロックを解除（保存ボタン以外）
        const pdfRequiredButtons = document.querySelectorAll('.pdf-required');
        pdfRequiredButtons.forEach(btn => {
            // 保存ボタンはロック解除するがdisabledは維持
            btn.classList.remove('locked');
            // 保存ボタン・クリアボタン以外はdisabledを解除
            if (btn.id !== 'savePdfBtn' && btn.id !== 'clearBtn') {
                btn.disabled = false;
                btn.removeAttribute('disabled');
            }
        });

        // 保存ボタンの状態を更新（描画がなければ無効のまま）
        updateSaveButtonState();

        // clearBtnはオブジェクトの有無に応じて制御されるため、updatePageControlsで更新
        if (window.MojiQPageManager) {
            MojiQPageManager.updatePageControls();
        }
    }

    /**
     * 保存ボタンの有効/無効状態を更新
     * 描画オブジェクトがある場合、または画像ページがある場合に有効化
     */
    function updateSaveButtonState() {
        const savePdfBtn = document.getElementById('savePdfBtn');
        if (!savePdfBtn) return;

        // PDFまたは画像が読み込まれているかチェック
        const pdfLoaded = window.MojiQGlobal && window.MojiQGlobal.pdfLoaded;
        if (!pdfLoaded) {
            savePdfBtn.disabled = true;
            updateSaveMenuState(false);
            return;
        }

        // PDF/画像が読み込まれていれば保存可能
        savePdfBtn.disabled = false;

        // メニューの保存項目も更新
        updateSaveMenuState(true);
    }

    /**
     * メニューの保存項目の有効/無効状態を更新
     */
    function updateSaveMenuState(enabled) {
        const saveMenuItem = document.querySelector('[data-action="save-pdf"]');
        const saveAsMenuItem = document.querySelector('[data-action="save-pdf-as"]');

        if (saveMenuItem) {
            saveMenuItem.classList.toggle('disabled', !enabled);
        }
        if (saveAsMenuItem) {
            saveAsMenuItem.classList.toggle('disabled', !enabled);
        }
    }

    /**
     * 背景透過モードを有効化
     */
    function enableBgTransparentMode() {
        if (isBgTransparentMode) return;
        isBgTransparentMode = true;

        const wrapper = document.getElementById('canvas-wrapper');
        if (wrapper) wrapper.classList.add('bg-transparent');
        // 現在のスライダー値で透明度を適用
        applyBgOpacity(bgOpacityValue);
    }

    /**
     * 背景透過モードを無効化
     */
    function disableBgTransparentMode() {
        if (!isBgTransparentMode) return;
        isBgTransparentMode = false;

        const wrapper = document.getElementById('canvas-wrapper');
        if (wrapper) wrapper.classList.remove('bg-transparent');
        // 透過モード解除時は背景を完全表示
        if (bgCanvas) {
            bgCanvas.style.opacity = '1';
        }
    }

    /**
     * 背景透過モードを切り替え（後方互換性のため維持）
     */
    function toggleBgTransparentMode() {
        if (isBgTransparentMode) {
            disableBgTransparentMode();
        } else {
            enableBgTransparentMode();
        }
    }

    /**
     * 背景透明度を適用（リアルタイムプレビュー）
     * @param {number} opacity - 透明度（0-100）
     */
    function applyBgOpacity(opacity) {
        bgOpacityValue = opacity;

        // 透過度が100未満の場合は透過モードを有効化、100の場合は無効化
        if (opacity < 100) {
            if (!isBgTransparentMode) {
                enableBgTransparentMode();
            }
            if (bgCanvas) {
                bgCanvas.style.opacity = (opacity / 100).toString();
            }
        } else {
            if (isBgTransparentMode) {
                disableBgTransparentMode();
            }
        }

        // 表示を更新
        const valueInput = document.getElementById('bgOpacityInput');
        if (valueInput) {
            valueInput.value = opacity;
        }
    }

    /**
     * 背景透過モードを取得
     * @returns {boolean}
     */
    function isBgTransparent() {
        return isBgTransparentMode;
    }

    /**
     * 現在の背景透明度を取得
     * @returns {number} 透明度（0-100）
     */
    function getBgOpacity() {
        return bgOpacityValue;
    }

    /**
     * 画像ファイルかどうかを判定（JPEG/JPGのみ対応）
     * @param {File} file - ファイル
     * @returns {boolean}
     */
    function isImageFile(file) {
        const imageTypes = ['image/jpeg'];
        const imageExtensions = ['.jpg', '.jpeg'];

        if (imageTypes.includes(file.type)) return true;

        const fileName = file.name.toLowerCase();
        return imageExtensions.some(ext => fileName.endsWith(ext));
    }

    /**
     * 画像ファイルを読み込んでImage要素に変換（JPEGのみ対応）
     * @param {File} file - 画像ファイル
     * @returns {Promise<{image: HTMLImageElement, data: Uint8Array}>}
     */
    async function loadImageFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function() {
                const arrayBuffer = this.result;
                const data = new Uint8Array(arrayBuffer);

                // Blob URLを作成して画像を読み込み
                const blob = new Blob([data], { type: 'image/jpeg' });
                const url = URL.createObjectURL(blob);

                const img = new Image();
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve({ image: img, data });
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('画像の読み込みに失敗しました'));
                };
                img.src = url;
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * 画像をCanvas経由でJPEG圧縮する
     * @param {HTMLImageElement} image - 読み込み済み画像
     * @param {Uint8Array} originalData - 元データ（フォールバック用）
     * @param {number} quality - JPEG品質 (0.0-1.0)
     * @returns {Promise<Uint8Array>} - 圧縮されたJPEGデータ
     */
    async function compressImageViaCanvas(image, originalData, quality) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            console.warn('Canvas 2Dコンテキスト取得失敗。元データを使用');
            return originalData;
        }

        ctx.drawImage(image, 0, 0);

        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    console.warn('Blob生成失敗。元データを使用');
                    canvas.width = 0;
                    canvas.height = 0;
                    resolve(originalData);
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    const compressedData = new Uint8Array(reader.result);
                    canvas.width = 0;
                    canvas.height = 0;
                    // 圧縮後の方がサイズが大きくなった場合は元データを使用
                    if (compressedData.byteLength >= originalData.byteLength) {
                        resolve(originalData);
                        return;
                    }
                    resolve(compressedData);
                };
                reader.onerror = () => {
                    canvas.width = 0;
                    canvas.height = 0;
                    resolve(originalData);
                };
                reader.readAsArrayBuffer(blob);
            }, 'image/jpeg', quality);
        });
    }

    /**
     * 複数の画像ファイルを読み込み
     * @param {FileList|File[]} files - 画像ファイルのリスト
     */
    async function loadImagesFromFiles(files) {
        // 既存のPDFが読み込まれている場合は確認ダイアログを表示
        if (state.pdfDocs && state.pdfDocs.length > 0) {
            const confirmed = await MojiQModal.showConfirm('読み込んだページ、描画は全て削除されます。よろしいですか？');
            if (!confirmed) {
                return;
            }
        }

        // サムネイルキャッシュをクリア
        if (window.MojiQNavigation && window.MojiQNavigation.clearThumbnailCache) {
            window.MojiQNavigation.clearThumbnailCache();
        }

        try {
            // 状態をリセット
            state.pdfDocs = [null]; // ダミーとしてnullを入れる（画像モード用）
            state.pageMapping = [];
            state.totalPages = 0;
            state.currentPageNum = 1;
            state.pageDrawingHistory = {};
            state.pageRedoHistory = {};
            state.originalPdfBytesArray = [];
            state.currentZoom = 1.0;
            imagePageData = {};
            // ImageBitmapキャッシュをクリア
            for (const key in imageBitmapCache) {
                if (imageBitmapCache[key] && typeof imageBitmapCache[key].close === 'function') {
                    imageBitmapCache[key].close();
                }
            }
            imageBitmapCache = {};

            // Simulatorの全データをリセット
            if (window.SimulatorState) {
                window.SimulatorState.resetAllData();
                const adjustMessage = document.getElementById('adjustMessage');
                if (adjustMessage) adjustMessage.classList.remove('active');
                const sizeTooltip = document.getElementById('sizeTooltip');
                if (sizeTooltip) sizeTooltip.style.display = 'none';
            }

            // 描画オブジェクトをリセット
            if (window.MojiQDrawingObjects) {
                window.MojiQDrawingObjects.clearAllObjects();
            }

            // 見開きモードをリセット
            if (spreadViewMode) {
                spreadViewMode = false;
                spreadMapping = [];
                const spreadBtn = document.getElementById('spreadViewBtn');
                if (spreadBtn) {
                    spreadBtn.classList.remove('active');
                }
                spreadPageCache = {};
                spreadCacheReady = false;
            }

            // 単一ページキャッシュもクリア
            if (singlePageCache) singlePageCache.clear();
            cancelPrefetch();

            // ファイルを配列に変換してソート（ファイル名順）
            const fileArray = Array.from(files).filter(f => isImageFile(f));
            fileArray.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

            if (fileArray.length === 0) {
                MojiQModal.showAlert('対応する画像ファイルがありません。', 'エラー');
                return;
            }

            // 合計ファイルサイズをチェック
            const totalSize = fileArray.reduce((sum, f) => sum + f.size, 0);
            let shouldCompress = false;

            if (totalSize >= IMAGE_SIZE_THRESHOLD) {
                const totalMB = (totalSize / 1024 / 1024).toFixed(0);
                const userConfirmed = await MojiQModal.showConfirm(
                    `画像の合計サイズが${totalMB}MBあるため、圧縮処理をします。\n` +
                    '処理に時間がかかる場合があります。続行しますか？'
                );
                if (!userConfirmed) {
                    return; // 読み込み中止
                }
                shouldCompress = true;
            }

            // 進捗オーバーレイを表示
            showProgressOverlay(shouldCompress ? '画像を圧縮しています...' : '画像を読み込んでいます...');
            // プログレスバーが表示されるまでUIを更新
            await nextFrame();

            // 各画像を読み込み
            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];
                updateProgressOverlay(i + 1, fileArray.length);
                await nextFrame();

                try {
                    const { image, data } = await loadImageFile(file);

                    const width = image.width;
                    const height = image.height;

                    // 圧縮が必要な場合はCanvas経由で圧縮
                    let finalData = data;
                    if (shouldCompress) {
                        finalData = await compressImageViaCanvas(image, data, IMAGE_COMPRESS_QUALITY);
                    }

                    // ページマッピングに追加（docIndex: -2は画像ページを示す）
                    const pageIndex = state.pageMapping.length;
                    state.pageMapping.push({
                        docIndex: -2,  // -2 = 画像ページ
                        pageNum: pageIndex + 1,
                        width: width,
                        height: height,
                        imageIndex: pageIndex
                    });

                    // 画像データを保存（JPEGのみ対応）
                    imagePageData[pageIndex] = {
                        data: finalData,
                        width: width,
                        height: height,
                        type: 'jpeg'
                    };

                } catch (imgErr) {
                    console.error(`画像読み込みエラー (${file.name}):`, imgErr);
                    // エラーでもスキップして続行
                }
            }

            if (state.pageMapping.length === 0) {
                hideProgressOverlay();
                MojiQModal.showAlert('画像の読み込みに失敗しました。', 'エラー');
                return;
            }

            state.totalPages = state.pageMapping.length;

            if (!window.MojiQGlobal) window.MojiQGlobal = {};
            window.MojiQGlobal.pdfLoaded = true;

            if (initialMessage) initialMessage.style.display = 'none';

            if (toggleAppLockCallback) {
                toggleAppLockCallback(false);
            }

            if (typeof window.unlockApp === 'function') {
                window.unlockApp();
            }

            // サイドバー・ツールバーを表示
            if (typeof window.showAppSidebars === 'function') {
                window.showAppSidebars();
            }

            // ヘッダーにファイル名を表示（最初のファイル名を使用）
            const firstName = fileArray[0].name;
            const displayName = fileArray.length > 1
                ? `${firstName.replace(/\.[^.]+$/, '')} 他${fileArray.length - 1}件`
                : firstName;
            updatePdfFileNameDisplay(displayName);

            // 上書き保存用: ブラウザ経由でファイルを開いた場合はパスが不明なのでリセット
            currentSaveFilePath = null;

            // 変更フラグをリセット（新規読み込み時は変更なし）
            hasUnsavedChanges = false;

            // 全ページを事前にキャッシュ（ページ移動時の遅延を防止）
            updateProgressOverlay(0, state.totalPages);
            await preloadAllPages(state.totalPages, (current, total) => {
                updateProgressOverlay(current, total);
            });

            hideProgressOverlay();
            renderPage(1);
            enableHeaderButtons();

        } catch (err) {
            console.error('画像読み込みエラー:', err);
            hideProgressOverlay();
            MojiQModal.showAlert('画像読み込み失敗: ' + err.message, 'エラー');
        }
    }

    /**
     * ファイルリストから読み込み（PDFまたは画像を自動判別）
     * @param {FileList|File[]} files - ファイルのリスト
     */
    async function loadFilesFromInput(files) {
        if (!files || files.length === 0) return;

        // 処理中（保存・読込・変換等）はファイルオープンを無視
        if (isProcessing) return;

        // サムネイルキャッシュをクリア
        if (window.MojiQNavigation && window.MojiQNavigation.clearThumbnailCache) {
            window.MojiQNavigation.clearThumbnailCache();
        }

        // 単一ファイルでPDFの場合は従来の処理
        if (files.length === 1 && files[0].type === 'application/pdf') {
            await loadPdfFromFile(files[0]);
            return;
        }

        // 画像ファイルがあるかチェック
        const imageFiles = Array.from(files).filter(f => isImageFile(f));
        const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');

        if (imageFiles.length > 0 && pdfFiles.length > 0) {
            // 両方ある場合は確認
            const choice = await MojiQModal.showConfirm(
                `PDFファイル${pdfFiles.length}件と画像ファイル${imageFiles.length}件が選択されています。\n` +
                '画像ファイルのみを読み込みますか？\n\n' +
                '「OK」→ 画像ファイルのみ読み込み\n' +
                '「キャンセル」→ 最初のPDFを読み込み'
            );
            if (choice) {
                await loadImagesFromFiles(imageFiles);
            } else {
                await loadPdfFromFile(pdfFiles[0]);
            }
        } else if (imageFiles.length > 0) {
            await loadImagesFromFiles(imageFiles);
        } else if (pdfFiles.length > 0) {
            await loadPdfFromFile(pdfFiles[0]);
        } else {
            MojiQModal.showAlert('対応するファイル形式ではありません。\nPDF、JPEGファイルを選択してください。', 'エラー');
        }
    }

    /**
     * PDFファイルから読み込み
     * @param {File} file - PDFファイル
     */
    async function loadPdfFromFile(file) {
        if (!file || file.type !== 'application/pdf') {
            MojiQModal.showAlert('PDFファイルを選択してください。', 'エラー');
            return;
        }

        // 既存のPDFが読み込まれている場合は確認ダイアログを表示
        if (state.pdfDocs && state.pdfDocs.length > 0) {
            const confirmed = await MojiQModal.showConfirm('読み込んだページ、描画は全て削除されます。よろしいですか？');
            if (!confirmed) {
                return;
            }
        }

        // サムネイルキャッシュをクリア
        if (window.MojiQNavigation && window.MojiQNavigation.clearThumbnailCache) {
            window.MojiQNavigation.clearThumbnailCache();
        }

        try {
            // ファイルサイズをチェックし、必要に応じて最適化または圧縮
            // 注意: checkAndCompressPdf内で確認ダイアログが表示されるため、
            // プログレスオーバーレイはこの関数の後に表示する
            const { data: typedarray, originalData, wasCompressed, wasOptimized, cancelled } = await checkAndCompressPdf(file);

            // キャンセルされた場合は読み込みを中止
            if (cancelled) {
                return;
            }

            // PDF.js読み込み開始時にプログレスオーバーレイを表示
            isProcessing = true;
            showLoadingOverlay(true, 'PDFを読み込み中...');
            updateLoadingProgress(0, 100, '%');
            // プログレスバーが表示されるまでUIを更新
            await nextFrame();

            if (!window.MojiQGlobal) window.MojiQGlobal = {};

            // CMap設定を含めてPDFを読み込み（日本語フォント等の正しい表示に必要）
            const loadOptions = {
                data: typedarray,
                cMapUrl: window.MojiQPdfJsConfig?.cMapUrl || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/',
                cMapPacked: window.MojiQPdfJsConfig?.cMapPacked !== false,
                standardFontDataUrl: window.MojiQPdfJsConfig?.standardFontDataUrl || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/standard_fonts/'
            };

            // PDF読み込みタスクを作成（プログレス付き）
            const loadingTask = pdfjsLib.getDocument(loadOptions);
            loadingTask.onProgress = (progressData) => {
                if (progressData.total > 0) {
                    const percent = Math.round((progressData.loaded / progressData.total) * 100);
                    updateLoadingProgress(percent, 100, '%');
                }
            };
            const pdf = await loadingTask.promise;

            state.pdfDocs = [pdf];

            // 元のPDFバイトデータを保存（非破壊保存用）
            // 大きなPDFの場合は元データを保存しない（メモリ節約）
            if (wasCompressed) {
                // Canvas圧縮された場合、元データが大きすぎるので保存しない
                // 保存時はCanvas経由のフォールバックを使用
                state.originalPdfBytesArray = [];
            } else {
                // 最適化されたデータ、または元のデータを保存
                state.originalPdfBytesArray = [originalData.slice()];
            }

            // pageMappingを新規作成
            state.pageMapping = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                state.pageMapping.push({ docIndex: 0, pageNum: i });
            }

            state.totalPages = state.pageMapping.length;
            state.currentPageNum = 1;
            state.pageDrawingHistory = {};
            state.pageRedoHistory = {};

            // ズームを100%にリセット
            state.currentZoom = 1.0;

            // 画像ページデータをクリア
            imagePageData = {};
            // ImageBitmapキャッシュをクリア
            for (const key in imageBitmapCache) {
                if (imageBitmapCache[key] && typeof imageBitmapCache[key].close === 'function') {
                    imageBitmapCache[key].close();
                }
            }
            imageBitmapCache = {};

            // Simulatorの全データをリセット（グリッド、Undo/Redo履歴など）
            if (window.SimulatorState) {
                window.SimulatorState.resetAllData();
                // SimulatorのUI状態もリセット
                const adjustMessage = document.getElementById('adjustMessage');
                if (adjustMessage) adjustMessage.classList.remove('active');
                const sizeTooltip = document.getElementById('sizeTooltip');
                if (sizeTooltip) sizeTooltip.style.display = 'none';
            }

            // 描画オブジェクトをリセット
            if (window.MojiQDrawingObjects) {
                window.MojiQDrawingObjects.clearAllObjects();
            }

            // 見開きモードをリセット
            if (spreadViewMode) {
                spreadViewMode = false;
                spreadMapping = [];
                // 見開きボタンの状態もリセット
                const spreadBtn = document.getElementById('spreadViewBtn');
                if (spreadBtn) {
                    spreadBtn.classList.remove('active');
                }
                // 見開きキャッシュをクリア
                spreadPageCache = {};
                spreadCacheReady = false;
            }

            // 単一ページキャッシュもクリア
            if (singlePageCache) singlePageCache.clear();
            cancelPrefetch();

            if (initialMessage) initialMessage.style.display = 'none';

            if (toggleAppLockCallback) {
                toggleAppLockCallback(false);
            }

            if (typeof window.unlockApp === 'function') {
                window.unlockApp();
            }

            // サイドバー・ツールバーを表示
            if (typeof window.showAppSidebars === 'function') {
                window.showAppSidebars();
            }

            // ヘッダーにPDFファイル名を表示
            updatePdfFileNameDisplay(file.name);

            // 上書き保存用: ブラウザ経由でファイルを開いた場合はパスが不明なのでリセット
            currentSaveFilePath = null;

            // 変更フラグをリセット（新規読み込み時は変更なし）
            hasUnsavedChanges = false;

            // 全ページを事前にキャッシュ（ページ移動時の遅延を防止）
            updateLoadingProgress(0, state.totalPages, 'ページ');
            await preloadAllPages(state.totalPages, (current, total) => {
                updateLoadingProgress(current, total, 'ページ');
            });

            // PDF注釈を読み込み
            updateProgressOverlayText('注釈を読み込み中...');
            await loadPdfAnnotationsForAllPages(pdf);

            // プログレスオーバーレイを非表示
            isProcessing = false;
            showLoadingOverlay(false);

            renderPage(1);
            enableHeaderButtons();

        } catch (err) {
            console.error(err);
            isProcessing = false;
            showLoadingOverlay(false);
            MojiQModal.showAlert('PDF読み込み失敗', 'エラー');
        }
    }

    /**
     * PDF保存（非破壊合成方式 - pdf-lib使用）
     * 背景透過モードがオンの場合は透過PDFとして保存
     */
    async function savePdf() {
        if (state.pdfDocs.length === 0) return;

        // 処理中の場合は保存をスキップ（ロード中に保存されるのを防止）
        if (isProcessing) return;

        // 背景透過モードがオンの場合は透過PDF保存を実行
        if (isBgTransparentMode) {
            await saveTransparentPdfDirect();
            return;
        }

        // 処理中フラグを立てる（ファイルオープン防止）
        isProcessing = true;

        // 保存中の表示（titleを変更）
        const originalTitle = savePdfBtn ? savePdfBtn.title : '';
        if (savePdfBtn) {
            savePdfBtn.title = "保存中...";
            savePdfBtn.disabled = true;
        }

        // 描画中のストロークがあれば強制的に確定させる（選択解除より先に実行）
        if (window.MojiQDrawing && window.MojiQDrawing.finalizeCurrentStroke) {
            window.MojiQDrawing.finalizeCurrentStroke();
        }

        // 選択状態を解除（選択枠がPDFに残らないようにする）
        const DrawingObjects = window.MojiQDrawingObjects;
        if (DrawingObjects) {
            DrawingObjects.deselectObject(state.currentPageNum);
            // キャンバスを再描画して選択枠を消す
            if (window.MojiQDrawing) {
                window.MojiQDrawing.redrawCanvas();
            }
        }

        // 現在の描画を保存
        MojiQPageManager.saveCurrentCanvasToHistory();

        // ファイル名取得
        const fileName = getSaveFileName();

        // ページ数が多い場合はプログレスオーバーレイを表示
        const showProgress = state.totalPages >= 3;
        if (showProgress) {
            showProgressOverlay('PDFを保存しています...');
        }

        try {
            // pdf-libを使用した非破壊保存
            const PdfLibSaver = window.MojiQPdfLibSaver;
            if (!PdfLibSaver) {
                throw new Error('PDF-Lib Saverモジュールが見つかりません');
            }

            // 見開きモード時は見開きマッピングを渡す
            const saveOptions = {
                onProgress: (percent) => {
                    if (showProgress) {
                        updateLoadingProgress(percent, 100, '%');
                    }
                }
            };

            // 見開きモード時は見開き状態で保存
            if (spreadViewMode && spreadMapping.length > 0) {
                saveOptions.spreadMode = true;
                saveOptions.spreadMapping = spreadMapping;
                // 見開きモードでの座標変換に必要な情報を追加
                saveOptions.spreadCssPageWidth = spreadBasePageSize.width * spreadBaseScale;
                saveOptions.spreadCssPageHeight = spreadBasePageSize.height * spreadBaseScale;
            }

            const result = await PdfLibSaver.saveNonDestructive(state, fileName, saveOptions);

            if (!result.success) {
                throw new Error(result.error || 'PDF保存に失敗しました');
            }

            const pdfBytes = result.data;

            // Electron環境かどうかでPDF保存方法を分岐
            if (window.MojiQElectron && window.MojiQElectron.isElectron) {
                // 上書き保存用のパスが設定されている場合はダイアログを表示せずに保存
                if (currentSaveFilePath) {
                    // Uint8ArrayをBase64に変換（大きなファイル対応）
                    const pdfBase64 = uint8ArrayToBase64(pdfBytes);
                    const saveResult = await window.MojiQElectron.saveFile(currentSaveFilePath, pdfBase64);
                    if (!saveResult.success) {
                        throw new Error(saveResult.error || '保存に失敗しました');
                    }
                    // 保存成功: 変更フラグをリセット
                    hasUnsavedChanges = false;
                    // 上書き保存完了のポップアップを表示
                    MojiQModal.showAlert('上書き保存が完了しました。', '保存完了');
                } else {
                    // 初回保存時: Electronネイティブ保存ダイアログを使用
                    const dialogResult = await window.MojiQElectron.showSavePdfDialog(fileName + '.pdf');
                    if (!dialogResult.canceled && dialogResult.filePath) {
                        // Uint8ArrayをBase64に変換（大きなファイル対応）
                        const pdfBase64 = uint8ArrayToBase64(pdfBytes);
                        const saveResult = await window.MojiQElectron.saveFile(dialogResult.filePath, pdfBase64);
                        if (!saveResult.success) {
                            throw new Error(saveResult.error || '保存に失敗しました');
                        }
                        // 保存成功: 変更フラグをリセット
                        hasUnsavedChanges = false;
                        // 上書き保存用: ファイルパスを記憶
                        currentSaveFilePath = dialogResult.filePath;
                        // ヘッダーのファイル名も更新
                        const savedFileName = dialogResult.filePath.split(/[/\\]/).pop();
                        updatePdfFileNameDisplay(savedFileName);
                    }
                }
            } else {
                // ブラウザ環境: Blobでダウンロード
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName + '.pdf';
                link.click();
                URL.revokeObjectURL(url);
                // 保存成功: 変更フラグをリセット
                hasUnsavedChanges = false;
            }

        } catch (e) {
            console.error('PDF保存エラー:', e);
            MojiQModal.showAlert('保存エラー: ' + e.message, 'エラー');
        } finally {
            if (showProgress) {
                hideProgressOverlay();
            }
            isProcessing = false;
            if (savePdfBtn) {
                savePdfBtn.title = originalTitle;
                savePdfBtn.disabled = false;
            }
        }
    }

    /**
     * 名前を付けて保存（常にダイアログを表示）
     * 非破壊合成方式（pdf-lib使用）
     */
    async function saveAsNew() {
        if (state.pdfDocs.length === 0) return;

        // 処理中の場合は保存をスキップ（ロード中に保存されるのを防止）
        if (isProcessing) return;

        // 背景透過モードがオンの場合は透過PDF保存を実行
        if (isBgTransparentMode) {
            await saveTransparentPdfDirect();
            return;
        }

        // 処理中フラグを立てる（ファイルオープン防止）
        isProcessing = true;

        // 保存中の表示（titleを変更）
        const originalTitle = savePdfBtn ? savePdfBtn.title : '';
        if (savePdfBtn) {
            savePdfBtn.title = "保存中...";
            savePdfBtn.disabled = true;
        }

        // 描画中のストロークがあれば強制的に確定させる（選択解除より先に実行）
        if (window.MojiQDrawing && window.MojiQDrawing.finalizeCurrentStroke) {
            window.MojiQDrawing.finalizeCurrentStroke();
        }

        // 選択状態を解除（選択枠がPDFに残らないようにする）
        const DrawingObjects = window.MojiQDrawingObjects;
        if (DrawingObjects) {
            DrawingObjects.deselectObject(state.currentPageNum);
            // キャンバスを再描画して選択枠を消す
            if (window.MojiQDrawing) {
                window.MojiQDrawing.redrawCanvas();
            }
        }

        // 現在の描画を保存
        MojiQPageManager.saveCurrentCanvasToHistory();

        // ファイル名取得
        const fileName = getSaveFileName();

        // ページ数が多い場合はプログレスオーバーレイを表示
        const showProgress = state.totalPages >= 3;
        if (showProgress) {
            showProgressOverlay('PDFを保存しています...');
        }

        try {
            // pdf-libを使用した非破壊保存
            const PdfLibSaver = window.MojiQPdfLibSaver;
            if (!PdfLibSaver) {
                throw new Error('PDF-Lib Saverモジュールが見つかりません');
            }

            // 見開きモード時は見開きマッピングを渡す
            const saveOptions = {
                onProgress: (percent) => {
                    if (showProgress) {
                        updateLoadingProgress(percent, 100, '%');
                    }
                }
            };

            // 見開きモード時は見開き状態で保存
            if (spreadViewMode && spreadMapping.length > 0) {
                saveOptions.spreadMode = true;
                saveOptions.spreadMapping = spreadMapping;
                // 見開きモードでの座標変換に必要な情報を追加
                saveOptions.spreadCssPageWidth = spreadBasePageSize.width * spreadBaseScale;
                saveOptions.spreadCssPageHeight = spreadBasePageSize.height * spreadBaseScale;
            }

            const result = await PdfLibSaver.saveNonDestructive(state, fileName, saveOptions);

            if (!result.success) {
                throw new Error(result.error || 'PDF保存に失敗しました');
            }

            const pdfBytes = result.data;

            // Electron環境かどうかでPDF保存方法を分岐
            if (window.MojiQElectron && window.MojiQElectron.isElectron) {
                // 常にダイアログを表示（名前を付けて保存）
                const dialogResult = await window.MojiQElectron.showSavePdfDialog(fileName + '.pdf');
                if (!dialogResult.canceled && dialogResult.filePath) {
                    // Uint8ArrayをBase64に変換（大きなファイル対応）
                    const pdfBase64 = uint8ArrayToBase64(pdfBytes);
                    const saveResult = await window.MojiQElectron.saveFile(dialogResult.filePath, pdfBase64);
                    if (!saveResult.success) {
                        throw new Error(saveResult.error || '保存に失敗しました');
                    }
                    // 保存成功: 変更フラグをリセット
                    hasUnsavedChanges = false;
                    // 上書き保存用: ファイルパスを記憶
                    currentSaveFilePath = dialogResult.filePath;
                    // ヘッダーのファイル名も更新
                    const savedFileName = dialogResult.filePath.split(/[/\\]/).pop();
                    updatePdfFileNameDisplay(savedFileName);
                }
            } else {
                // ブラウザ環境: Blobでダウンロード
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName + '.pdf';
                link.click();
                URL.revokeObjectURL(url);
                // 保存成功: 変更フラグをリセット
                hasUnsavedChanges = false;
            }

        } catch (e) {
            console.error('PDF保存エラー:', e);
            MojiQModal.showAlert('保存エラー: ' + e.message, 'エラー');
        } finally {
            if (showProgress) {
                hideProgressOverlay();
            }
            isProcessing = false;
            if (savePdfBtn) {
                savePdfBtn.title = originalTitle;
                savePdfBtn.disabled = false;
            }
        }
    }

    /**
     * PDF保存（パス指定） - Electronメニューからの「名前を付けて保存」用
     * 非破壊合成方式（pdf-lib使用）
     * @param {string} filePath - 保存先パス
     */
    async function exportPdfToPath(filePath) {
        if (state.pdfDocs.length === 0) return;
        if (isProcessing) return;

        // 処理中フラグを立てる（ファイルオープン防止）
        isProcessing = true;

        // 保存中の表示
        const originalTitle = savePdfBtn ? savePdfBtn.title : '';
        if (savePdfBtn) {
            savePdfBtn.title = "保存中...";
            savePdfBtn.disabled = true;
        }

        // 描画中のストロークがあれば強制的に確定させる（選択解除より先に実行）
        if (window.MojiQDrawing && window.MojiQDrawing.finalizeCurrentStroke) {
            window.MojiQDrawing.finalizeCurrentStroke();
        }

        // 選択状態を解除
        const DrawingObjects = window.MojiQDrawingObjects;
        if (DrawingObjects) {
            DrawingObjects.deselectObject(state.currentPageNum);
            if (window.MojiQDrawing) {
                window.MojiQDrawing.redrawCanvas();
            }
        }

        MojiQPageManager.saveCurrentCanvasToHistory();

        // ファイル名をパスから抽出
        const fileName = filePath.split(/[/\\]/).pop().replace(/\.pdf$/i, '') || 'download';

        // ページ数が多い場合はプログレスオーバーレイを表示
        const showProgress = state.totalPages >= 3;
        if (showProgress) {
            showProgressOverlay('PDFを保存しています...');
        }

        try {
            // pdf-libを使用した非破壊保存
            const PdfLibSaver = window.MojiQPdfLibSaver;
            if (!PdfLibSaver) {
                throw new Error('PDF-Lib Saverモジュールが見つかりません');
            }

            // 見開きモード時は見開きマッピングを渡す
            const saveOptions = {
                onProgress: (percent) => {
                    if (showProgress) {
                        updateLoadingProgress(percent, 100, '%');
                    }
                }
            };

            // 見開きモード時は見開き状態で保存
            if (spreadViewMode && spreadMapping.length > 0) {
                saveOptions.spreadMode = true;
                saveOptions.spreadMapping = spreadMapping;
                // 見開きモードでの座標変換に必要な情報を追加
                saveOptions.spreadCssPageWidth = spreadBasePageSize.width * spreadBaseScale;
                saveOptions.spreadCssPageHeight = spreadBasePageSize.height * spreadBaseScale;
            }

            const result = await PdfLibSaver.saveNonDestructive(state, fileName, saveOptions);

            if (!result.success) {
                throw new Error(result.error || 'PDF保存に失敗しました');
            }

            // Uint8ArrayをBase64に変換（大きなファイル対応）
            const pdfBytes = result.data;
            const pdfBase64 = uint8ArrayToBase64(pdfBytes);

            // 指定パスに保存
            const saveResult = await window.MojiQElectron.saveFile(filePath, pdfBase64);
            if (!saveResult.success) {
                throw new Error(saveResult.error || '保存に失敗しました');
            }

            // 上書き保存用: ファイルパスを記憶
            currentSaveFilePath = filePath;

            // 保存成功: 変更フラグをリセット
            hasUnsavedChanges = false;

            // ヘッダーのファイル名も更新
            updatePdfFileNameDisplay(fileName + '.pdf');

        } catch (e) {
            console.error('PDF保存エラー:', e);
            MojiQModal.showAlert('保存エラー: ' + e.message, 'エラー');
        } finally {
            if (showProgress) {
                hideProgressOverlay();
            }
            isProcessing = false;
            if (savePdfBtn) {
                savePdfBtn.title = originalTitle;
                savePdfBtn.disabled = false;
            }
        }
    }

    /**
     * 印刷用PDFを生成（保存せずにバイトデータを返す）
     * @param {object} options - オプション
     * @param {function} options.onProgress - 進捗コールバック
     * @returns {Promise<{success: boolean, data?: Uint8Array, error?: string}>}
     */
    async function generatePdfForPrint(options = {}) {
        if (!state.pdfDocs || state.pdfDocs.length === 0) {
            return { success: false, error: 'PDFが読み込まれていません' };
        }

        // 描画中のストロークがあれば強制的に確定させる
        if (window.MojiQDrawing && window.MojiQDrawing.finalizeCurrentStroke) {
            window.MojiQDrawing.finalizeCurrentStroke();
        }

        // 選択状態を解除（選択枠がPDFに残らないようにする）
        const DrawingObjects = window.MojiQDrawingObjects;
        if (DrawingObjects) {
            DrawingObjects.deselectObject(state.currentPageNum);
            if (window.MojiQDrawing) {
                window.MojiQDrawing.redrawCanvas();
            }
        }

        // 現在の描画を保存
        MojiQPageManager.saveCurrentCanvasToHistory();

        try {
            const PdfLibSaver = window.MojiQPdfLibSaver;
            if (!PdfLibSaver) {
                return { success: false, error: 'PDF-Lib Saverモジュールが見つかりません' };
            }

            // 見開きモード時は見開きマッピングを渡す
            const saveOptions = {
                onProgress: options.onProgress || (() => {})
            };

            if (spreadViewMode && spreadMapping.length > 0) {
                saveOptions.spreadMode = true;
                saveOptions.spreadMapping = spreadMapping;
                saveOptions.spreadCssPageWidth = spreadBasePageSize.width * spreadBaseScale;
                saveOptions.spreadCssPageHeight = spreadBasePageSize.height * spreadBaseScale;
            }

            const result = await PdfLibSaver.saveNonDestructive(state, 'print-temp', saveOptions);

            if (!result.success) {
                return { success: false, error: result.error || 'PDF生成に失敗しました' };
            }

            return { success: true, data: result.data };

        } catch (e) {
            console.error('印刷用PDF生成エラー:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * イベントリスナーのセットアップ
     */
    function setupEventListeners() {
        // PDF/画像アップロード
        if (pdfUpload) {
            boundHandlers.pdfUploadChange = (e) => {
                // 処理中はファイルオープンを無視
                if (isProcessing) {
                    e.target.value = '';
                    return;
                }
                loadFilesFromInput(e.target.files);
                e.target.value = '';
            };
            pdfUpload.addEventListener('change', boundHandlers.pdfUploadChange);
        }

        // PDF/JPEG追加挿入処理
        if (insertPdfUpload) {
            boundHandlers.insertPdfUploadChange = async (e) => {
                // 処理中はファイルオープンを無視
                if (isProcessing) {
                    e.target.value = '';
                    return;
                }
                const files = e.target.files;
                if (!files || files.length === 0) return;

                // ファイルをPDFと画像に分類
                const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
                const imageFiles = Array.from(files).filter(f => isImageFile(f));

                if (pdfFiles.length === 0 && imageFiles.length === 0) {
                    MojiQModal.showAlert('PDFまたはJPEGファイルを選択してください。', 'エラー');
                    e.target.value = '';
                    return;
                }

                // PDFと画像が混在している場合はPDFを優先（最初の1件のみ）
                if (pdfFiles.length > 0 && imageFiles.length > 0) {
                    MojiQModal.showAlert('PDFと画像ファイルを同時に挿入することはできません。\nどちらか一方を選択してください。', 'エラー');
                    e.target.value = '';
                    return;
                }

                try {
                    if (pdfFiles.length > 0) {
                        // PDF挿入処理（最初の1ファイルのみ）
                        const file = pdfFiles[0];
                        const { data: typedarray, originalData, wasCompressed, wasOptimized, cancelled } = await checkAndCompressPdf(file);

                        if (cancelled) {
                            e.target.value = '';
                            return;
                        }

                        const loadOptions = {
                            data: typedarray,
                            cMapUrl: window.MojiQPdfJsConfig?.cMapUrl || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/',
                            cMapPacked: window.MojiQPdfJsConfig?.cMapPacked !== false,
                            standardFontDataUrl: window.MojiQPdfJsConfig?.standardFontDataUrl || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/standard_fonts/'
                        };
                        const pdf = await pdfjsLib.getDocument(loadOptions).promise;
                        state.pdfDocs.push(pdf);
                        const newDocIndex = state.pdfDocs.length - 1;

                        if (!state.originalPdfBytesArray) {
                            state.originalPdfBytesArray = [];
                        }
                        if (!wasCompressed) {
                            state.originalPdfBytesArray[newDocIndex] = originalData.slice();
                        }

                        const newPagesMap = [];
                        for (let i = 1; i <= pdf.numPages; i++) {
                            newPagesMap.push({ docIndex: newDocIndex, pageNum: i });
                        }

                        // 見開きモード時は現在表示中の見開きからページ番号を取得
                        let effectivePageNum = state.currentPageNum;
                        if (spreadViewMode && spreadMapping.length > 0) {
                            const spread = spreadMapping[currentSpreadIndex];
                            if (spread) {
                                effectivePageNum = spread.rightPage || spread.leftPage || state.currentPageNum;
                            }
                        }
                        const insertIndex = (state.totalPages === 0) ? 0 : (effectivePageNum - 1 + insertPdfOffset);

                        if (window.MojiQDrawingObjects) {
                            MojiQDrawingObjects.shiftPageNumbersAfterInsert(insertIndex, pdf.numPages);
                        }

                        if (window.SimulatorState) {
                            SimulatorState.shiftPageNumbersAfterInsert(insertIndex, pdf.numPages);
                        }

                        state.pageMapping.splice(insertIndex, 0, ...newPagesMap);
                        state.totalPages = state.pageMapping.length;

                        if (state.totalPages > 0 && toggleAppLockCallback) {
                            toggleAppLockCallback(false);
                        }

                        // サイドバー・ツールバーを表示
                        if (typeof window.showAppSidebars === 'function') {
                            window.showAppSidebars();
                        }

                        // ページ挿入によりキャッシュが無効になるためクリア
                        if (singlePageCache) singlePageCache.clear();
                        cancelPrefetch();
                        if (window.MojiQNavigation && window.MojiQNavigation.clearThumbnailCache) {
                            window.MojiQNavigation.clearThumbnailCache();
                        }

                        if (spreadViewMode) {
                            // 見開きモード中: 見開きを再構築
                            await rebuildSpreadAfterPageChange(insertIndex + 1);
                        } else {
                            await renderPage(insertIndex + 1);
                        }
                        enableHeaderButtons();

                        const positionText = insertPdfOffset === 0 ? '前' : '後';
                        MojiQModal.showAlert(`${pdf.numPages}ページを現在のページの${positionText}に追加しました。`, '追加完了');

                    } else {
                        // JPEG画像挿入処理（複数ファイル対応）
                        // ファイル名順にソート
                        imageFiles.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

                        // 合計サイズチェック
                        const totalSize = imageFiles.reduce((sum, f) => sum + f.size, 0);
                        let shouldCompress = false;
                        if (totalSize >= IMAGE_SIZE_THRESHOLD) {
                            const userConfirmed = await MojiQModal.showConfirm(
                                `画像の合計サイズが${(totalSize / 1024 / 1024).toFixed(0)}MBあるため、圧縮処理をします。\n` +
                                '続行しますか？'
                            );
                            if (!userConfirmed) {
                                e.target.value = '';
                                return;
                            }
                            shouldCompress = true;
                        }

                        // 見開きモード時は現在表示中の見開きからページ番号を取得
                        let effectivePageNum = state.currentPageNum;
                        if (spreadViewMode && spreadMapping.length > 0) {
                            const spread = spreadMapping[currentSpreadIndex];
                            if (spread) {
                                effectivePageNum = spread.rightPage || spread.leftPage || state.currentPageNum;
                            }
                        }
                        const insertIndex = (state.totalPages === 0) ? 0 : (effectivePageNum - 1 + insertPdfOffset);
                        const imageCount = imageFiles.length;

                        if (window.MojiQDrawingObjects) {
                            MojiQDrawingObjects.shiftPageNumbersAfterInsert(insertIndex, imageCount);
                        }

                        if (window.SimulatorState) {
                            SimulatorState.shiftPageNumbersAfterInsert(insertIndex, imageCount);
                        }

                        const newPageMaps = [];
                        for (let i = 0; i < imageFiles.length; i++) {
                            const file = imageFiles[i];
                            const { image, data } = await loadImageFile(file);

                            let finalData = data;
                            if (shouldCompress) {
                                finalData = await compressImageViaCanvas(image, data, IMAGE_COMPRESS_QUALITY);
                            }

                            // imagePageDataのインデックスを決定（既存の最大値+1）
                            const existingImageIndices = Object.keys(imagePageData).map(Number);
                            const newImageIndex = existingImageIndices.length > 0 ? Math.max(...existingImageIndices) + 1 : 0;

                            // 画像データを保存
                            imagePageData[newImageIndex] = {
                                data: finalData,
                                width: image.width,
                                height: image.height,
                                type: 'jpeg'
                            };

                            // ページマッピングに追加（docIndex: -2は画像ページを示す）
                            newPageMaps.push({
                                docIndex: -2,
                                pageNum: newImageIndex + 1,
                                width: image.width,
                                height: image.height,
                                imageIndex: newImageIndex
                            });
                        }

                        state.pageMapping.splice(insertIndex, 0, ...newPageMaps);
                        state.totalPages = state.pageMapping.length;

                        if (state.totalPages > 0 && toggleAppLockCallback) {
                            toggleAppLockCallback(false);
                        }

                        // サイドバー・ツールバーを表示
                        if (typeof window.showAppSidebars === 'function') {
                            window.showAppSidebars();
                        }

                        // ページ挿入によりキャッシュが無効になるためクリア
                        if (singlePageCache) singlePageCache.clear();
                        cancelPrefetch();
                        if (window.MojiQNavigation && window.MojiQNavigation.clearThumbnailCache) {
                            window.MojiQNavigation.clearThumbnailCache();
                        }

                        if (spreadViewMode) {
                            // 見開きモード中: 見開きを再構築
                            await rebuildSpreadAfterPageChange(insertIndex + 1);
                        } else {
                            await renderPage(insertIndex + 1);
                        }
                        enableHeaderButtons();

                        const positionText = insertPdfOffset === 0 ? '前' : '後';
                        MojiQModal.showAlert(`${imageCount}ページを現在のページの${positionText}に追加しました。`, '追加完了');
                    }

                } catch (err) {
                    console.error(err);
                    MojiQModal.showAlert('ファイルの追加読み込みに失敗しました', 'エラー');
                }
                e.target.value = '';
            };
            insertPdfUpload.addEventListener('change', boundHandlers.insertPdfUploadChange);
        }

        // ショートカットからのPDFオープン
        boundHandlers.openPdfHandler = () => {
            if (isProcessing) return;
            if (pdfUpload) {
                pdfUpload.click();
            }
        };
        window.addEventListener('mojiq:open-pdf', boundHandlers.openPdfHandler);

        // ショートカットからのPDF保存 (Ctrl+S)
        boundHandlers.savePdfHandler = () => {
            savePdf();
        };
        window.addEventListener('mojiq:save-pdf', boundHandlers.savePdfHandler);

        // 名前を付けて保存 (Ctrl+Shift+S)
        boundHandlers.saveAsNewHandler = () => {
            saveAsNew();
        };
        window.addEventListener('mojiq:save-pdf-as', boundHandlers.saveAsNewHandler);

        // PDF保存ボタンのクリックはscript.jsでドロップダウン経由で処理

        // PDF印刷
        const printPdfBtn = document.getElementById('printPdfBtn');
        if (printPdfBtn) {
            boundHandlers.printPdfBtnClick = () => {
                if (window.MojiQPrintManager) {
                    window.MojiQPrintManager.printPdf();
                }
            };
            printPdfBtn.addEventListener('click', boundHandlers.printPdfBtnClick);
        }

        // 描画変更時に保存ボタンの状態を更新
        boundHandlers.redrawHandler = () => {
            updateSaveButtonState();
        };
        // MojiQEventsを使用（カスタムイベントバス経由）
        if (window.MojiQEvents && window.MojiQEvents.on) {
            boundHandlers.redrawUnsubscribe = window.MojiQEvents.on('mojiq:request-redraw', boundHandlers.redrawHandler);
        }

        // 背景透明度スライダー（サイドバー）
        const bgOpacitySlider = document.getElementById('bgOpacitySlider');
        const bgOpacityInputField = document.getElementById('bgOpacityInput');
        if (bgOpacitySlider) {
            // 初期値を100（不透明）に設定
            bgOpacitySlider.value = 100;
            bgOpacityValue = 100;
            if (bgOpacityInputField) {
                bgOpacityInputField.value = 100;
            }

            boundHandlers.bgOpacitySliderInput = (e) => {
                const opacity = parseInt(e.target.value, 10);
                applyBgOpacity(opacity);
                // 入力フィールドも更新
                if (bgOpacityInputField) {
                    bgOpacityInputField.value = opacity;
                }
            };
            bgOpacitySlider.addEventListener('input', boundHandlers.bgOpacitySliderInput);

            // 入力フィールドのイベントハンドラ
            if (bgOpacityInputField) {
                boundHandlers.bgOpacityFieldInput = (e) => {
                    let opacity = parseInt(e.target.value, 10);
                    if (isNaN(opacity)) opacity = 100;
                    opacity = Math.max(0, Math.min(100, opacity));
                    e.target.value = opacity;
                    bgOpacitySlider.value = opacity;
                    applyBgOpacity(opacity);
                };
                bgOpacityInputField.addEventListener('input', boundHandlers.bgOpacityFieldInput);

                // 入力フィールド上でマウスホイールで値を変更
                boundHandlers.bgOpacityFieldWheel = (e) => {
                    // スライダーが無効の場合は何もしない
                    if (bgOpacitySlider.disabled) return;

                    e.preventDefault();

                    const currentValue = parseInt(bgOpacityInputField.value, 10) || 100;
                    // ホイール上（負の値）で増加、下（正の値）で減少
                    const step = e.deltaY < 0 ? 1 : -1;
                    const newValue = Math.max(0, Math.min(100, currentValue + step));

                    bgOpacityInputField.value = newValue;
                    bgOpacitySlider.value = newValue;
                    applyBgOpacity(newValue);
                };
                bgOpacityInputField.addEventListener('wheel', boundHandlers.bgOpacityFieldWheel, { passive: false });
            }

            // マウス操作完了後にフォーカスを外す（方向キーでのページ移動を有効にするため）
            boundHandlers.bgOpacityMouseup = () => {
                bgOpacitySlider.blur();
            };
            bgOpacitySlider.addEventListener('mouseup', boundHandlers.bgOpacityMouseup);

            // 方向キーでの値変更を無効化
            boundHandlers.bgOpacityKeydown = (e) => {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                }
            };
            bgOpacitySlider.addEventListener('keydown', boundHandlers.bgOpacityKeydown);

            // マウスホイールでスライダー値を変更
            boundHandlers.bgOpacityWheel = (e) => {
                // スライダーが無効の場合は何もしない
                if (bgOpacitySlider.disabled) return;

                e.preventDefault();

                const currentValue = parseInt(bgOpacitySlider.value, 10);
                // ホイール上（負の値）で増加、下（正の値）で減少
                const step = e.deltaY < 0 ? 5 : -5;
                const newValue = Math.max(0, Math.min(100, currentValue + step));

                bgOpacitySlider.value = newValue;
                if (bgOpacityInputField) {
                    bgOpacityInputField.value = newValue;
                }
                applyBgOpacity(newValue);
            };
            bgOpacitySlider.addEventListener('wheel', boundHandlers.bgOpacityWheel, { passive: false });
        }

        // リサイズ時の再レンダリングは無効化（キャンバスサイズ固定のため）
        // window.addEventListener('resize', MojiQUtils.debounce(() => {
        //     if (state.pdfDocs.length > 0) renderPage(state.currentPageNum);
        // }, 300));
    }

    /**
     * ドラッグ＆ドロップのセットアップ
     */
    function setupDragAndDrop() {
        if (!canvasArea) return;

        boundHandlers.dragEvents = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            window.addEventListener(eventName, boundHandlers.dragEvents, { passive: false });
        });

        boundHandlers.canvasAreaDragenter = (e) => {
            canvasArea.classList.add('drag-over');
        };
        canvasArea.addEventListener('dragenter', boundHandlers.canvasAreaDragenter);

        boundHandlers.canvasAreaDragover = (e) => {
            e.preventDefault();  // ドロップを許可するために必要
            e.dataTransfer.dropEffect = 'copy';
            canvasArea.classList.add('drag-over');
        };
        canvasArea.addEventListener('dragover', boundHandlers.canvasAreaDragover);

        boundHandlers.canvasAreaDragleave = (e) => {
            if (!canvasArea.contains(e.relatedTarget)) {
                canvasArea.classList.remove('drag-over');
            }
        };
        canvasArea.addEventListener('dragleave', boundHandlers.canvasAreaDragleave);

        boundHandlers.canvasAreaDrop = (e) => {
            canvasArea.classList.remove('drag-over');
            // 処理中はファイルオープンを無視
            if (isProcessing) return;
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                // PDF/画像ファイルを読み込み
                loadFilesFromInput(files);
            }
        };
        canvasArea.addEventListener('drop', boundHandlers.canvasAreaDrop);
    }

    /**
     * イベントリスナーをクリーンアップ
     */
    function cleanup() {
        if (pdfUpload) pdfUpload.removeEventListener('change', boundHandlers.pdfUploadChange);
        if (insertPdfUpload) insertPdfUpload.removeEventListener('change', boundHandlers.insertPdfUploadChange);
        if (savePdfBtn) savePdfBtn.removeEventListener('click', boundHandlers.savePdfBtnClick);
        const printPdfBtn = document.getElementById('printPdfBtn');
        if (printPdfBtn) printPdfBtn.removeEventListener('click', boundHandlers.printPdfBtnClick);

        window.removeEventListener('mojiq:open-pdf', boundHandlers.openPdfHandler);
        window.removeEventListener('mojiq:save-pdf', boundHandlers.savePdfHandler);
        // MojiQEventsの登録解除
        if (boundHandlers.redrawUnsubscribe) {
            boundHandlers.redrawUnsubscribe();
        }

        const bgOpacitySlider = document.getElementById('bgOpacitySlider');
        if (bgOpacitySlider) {
            bgOpacitySlider.removeEventListener('input', boundHandlers.bgOpacitySliderInput);
            bgOpacitySlider.removeEventListener('mouseup', boundHandlers.bgOpacityMouseup);
            bgOpacitySlider.removeEventListener('keydown', boundHandlers.bgOpacityKeydown);
            bgOpacitySlider.removeEventListener('wheel', boundHandlers.bgOpacityWheel);
        }
        const bgOpacityInputField = document.getElementById('bgOpacityInput');
        if (bgOpacityInputField) {
            bgOpacityInputField.removeEventListener('input', boundHandlers.bgOpacityFieldInput);
            bgOpacityInputField.removeEventListener('wheel', boundHandlers.bgOpacityFieldWheel);
        }

        // ドラッグ＆ドロップのクリーンアップ
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            window.removeEventListener(eventName, boundHandlers.dragEvents);
        });
        if (canvasArea) {
            canvasArea.removeEventListener('dragenter', boundHandlers.canvasAreaDragenter);
            canvasArea.removeEventListener('dragover', boundHandlers.canvasAreaDragover);
            canvasArea.removeEventListener('dragleave', boundHandlers.canvasAreaDragleave);
            canvasArea.removeEventListener('drop', boundHandlers.canvasAreaDrop);
        }

        // 参照をクリア
        for (const key in boundHandlers) {
            boundHandlers[key] = null;
        }
    }

    /**
     * ファイルパスからPDFを読み込む（大きなファイル対応）
     * アプリアイコンへのドラッグ＆ドロップ、ファイル関連付けからの起動時に使用
     *
     * 500MB以上のファイルの場合:
     * 1. アプリが先に表示される
     * 2. 確認ダイアログを表示
     * 3. チャンク読み込み＆圧縮処理を開始
     *
     * @param {string} filePath - ファイルパス
     * @param {string} fileName - ファイル名
     * @param {number|null} initialPage - 初期表示ページ番号（検版ビューワー連携用、省略時は1ページ目）
     */
    async function loadPdfFromPath(filePath, fileName, initialPage = null) {
        console.log('[MojiQ PdfManager] loadPdfFromPath called with initialPage:', initialPage);
        // 処理中はファイルオープンを無視
        if (isProcessing) return;

        if (!window.electronAPI) {
            console.error('Electron環境でのみ使用可能です');
            return;
        }

        // サムネイルキャッシュをクリア
        if (window.MojiQNavigation && window.MojiQNavigation.clearThumbnailCache) {
            window.MojiQNavigation.clearThumbnailCache();
        }

        try {
            // 既存のPDFが読み込まれている場合は確認ダイアログを表示
            if (state.pdfDocs && state.pdfDocs.length > 0) {
                const confirmed = await MojiQModal.showConfirm('読み込んだページ、描画は全て削除されます。よろしいですか？');
                if (!confirmed) {
                    return;
                }
            }

            // ファイルサイズを先に取得
            const sizeResult = await window.electronAPI.getFileSize(filePath);
            if (!sizeResult.success) {
                throw new Error(sizeResult.error || 'ファイルサイズの取得に失敗しました');
            }

            const fileSize = sizeResult.size;
            const isLargeFile = fileSize >= PDF_SIZE_THRESHOLD;

            // 500MB以上の場合は確認ダイアログを表示（アプリは既に表示されている状態）
            if (isLargeFile) {
                const userConfirmed = await MojiQModal.showConfirm(
                    `PDFのサイズが非常に大きいです（${(fileSize / 1024 / 1024 / 1024).toFixed(2)}GB）。\n` +
                    '圧縮処理を行います。処理に時間がかかる場合があります。\n\n' +
                    '続行しますか？'
                );
                if (!userConfirmed) {
                    return;
                }
            }

            // 進捗オーバーレイを表示（ファイル読み込み前に確実に表示）
            showProgressOverlay('ファイルを読み込んでいます...');

            // UIを確実に更新するために複数フレーム待機（大きいファイルのIPC処理前に表示を確定）
            await nextFrame();
            await nextFrame();

            // ファイルをバイナリで読み込み（Base64変換なし、文字列長制限を回避）
            const result = await window.electronAPI.readFileBinary(filePath);
            if (!result.success) {
                throw new Error(result.error || 'ファイルの読み込みに失敗しました');
            }

            // ファイル読み込み完了、UI更新
            updateProgressOverlayText('PDFを解析しています...');
            await nextFrame();

            // IPCから返されたデータをUint8Arrayに変換
            const typedarray = new Uint8Array(result.data);

            let processedData;
            let originalData;
            let wasCompressed = false;

            if (isLargeFile) {
                // 500MB以上: Canvas経由の圧縮処理
                updateProgressOverlayText('PDFを圧縮しています...');
                await nextFrame();

                try {
                    processedData = await compressPdfViaCanvas(typedarray);
                    originalData = typedarray;
                    wasCompressed = true;
                } catch (compressErr) {
                    console.error('PDF圧縮エラー:', compressErr);
                    hideProgressOverlay();
                    MojiQModal.showAlert('圧縮処理に失敗しました。元のPDFで読み込みます。', 'エラー');
                    processedData = typedarray;
                    originalData = typedarray;
                    wasCompressed = false;
                }
            } else {
                // 500MB未満: pdf-lib埋め込みリソース最適化処理
                updateProgressOverlayText('PDFを最適化しています...');
                await nextFrame();

                try {
                    const PdfLibSaver = window.MojiQPdfLibSaver;
                    if (PdfLibSaver && PdfLibSaver.optimizePdfResources) {
                        const optimizeResult = await PdfLibSaver.optimizePdfResources(typedarray, (message) => {
                            updateProgressOverlayText(message);
                        });

                        if (optimizeResult.success) {
                            processedData = optimizeResult.data;
                            originalData = optimizeResult.data;
                        } else {
                            console.warn('PDF最適化に失敗、元のPDFで読み込みます:', optimizeResult.error);
                            processedData = typedarray;
                            originalData = typedarray;
                        }
                    } else {
                        processedData = typedarray;
                        originalData = typedarray;
                    }
                } catch (optimizeErr) {
                    console.error('PDF最適化エラー:', optimizeErr);
                    processedData = typedarray;
                    originalData = typedarray;
                }
            }

            // プログレスオーバーレイは表示したまま継続（hideしない）
            updateProgressOverlayText('PDFを読み込み中...');
            await nextFrame();

            if (!window.MojiQGlobal) window.MojiQGlobal = {};

            // CMap設定を含めてPDFを読み込み
            const loadOptions = {
                data: processedData,
                cMapUrl: window.MojiQPdfJsConfig?.cMapUrl || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/',
                cMapPacked: window.MojiQPdfJsConfig?.cMapPacked !== false,
                standardFontDataUrl: window.MojiQPdfJsConfig?.standardFontDataUrl || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/standard_fonts/'
            };

            // PDF読み込みタスクを作成（プログレス付き）
            const loadingTask = pdfjsLib.getDocument(loadOptions);
            loadingTask.onProgress = (progressData) => {
                if (progressData.total > 0) {
                    const percent = Math.round((progressData.loaded / progressData.total) * 100);
                    updateLoadingProgress(percent, 100, '%');
                }
            };
            const pdf = await loadingTask.promise;

            state.pdfDocs = [pdf];

            // 元のPDFバイトデータを保存（非破壊保存用）
            if (wasCompressed) {
                state.originalPdfBytesArray = [];
            } else {
                state.originalPdfBytesArray = [originalData.slice()];
            }

            // pageMappingを新規作成
            state.pageMapping = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                state.pageMapping.push({ docIndex: 0, pageNum: i });
            }

            state.totalPages = state.pageMapping.length;
            // 検版ビューワー連携: 初期ページ番号が指定されている場合はそのページから開始
            // ページ番号が範囲外の場合は1ページ目にフォールバック
            console.log('[MojiQ PdfManager] initialPage:', initialPage, 'totalPages:', state.totalPages);
            const startPage = (initialPage && initialPage >= 1 && initialPage <= state.totalPages) ? initialPage : 1;
            console.log('[MojiQ PdfManager] Calculated startPage:', startPage);
            state.currentPageNum = startPage;
            state.pageDrawingHistory = {};
            state.pageRedoHistory = {};

            // ズームを100%にリセット
            state.currentZoom = 1.0;

            // Simulatorの全データをリセット
            if (window.SimulatorState) {
                window.SimulatorState.resetAllData();
                const adjustMessage = document.getElementById('adjustMessage');
                if (adjustMessage) adjustMessage.classList.remove('active');
                const sizeTooltip = document.getElementById('sizeTooltip');
                if (sizeTooltip) sizeTooltip.style.display = 'none';
            }

            // 描画オブジェクトをリセット
            if (window.MojiQDrawingObjects) {
                window.MojiQDrawingObjects.clearAllObjects();
            }

            // 見開きモードをリセット
            if (spreadViewMode) {
                spreadViewMode = false;
                spreadMapping = [];
                const spreadBtn = document.getElementById('spreadViewBtn');
                if (spreadBtn) {
                    spreadBtn.classList.remove('active');
                }
                spreadPageCache = {};
                spreadCacheReady = false;
            }

            // 単一ページキャッシュもクリア
            if (singlePageCache) singlePageCache.clear();
            cancelPrefetch();

            if (initialMessage) initialMessage.style.display = 'none';

            if (toggleAppLockCallback) {
                toggleAppLockCallback(false);
            }

            if (typeof window.unlockApp === 'function') {
                window.unlockApp();
            }

            // サイドバー・ツールバーを表示
            if (typeof window.showAppSidebars === 'function') {
                window.showAppSidebars();
            }

            // ヘッダーにPDFファイル名を表示
            updatePdfFileNameDisplay(fileName);

            // 上書き保存用: ファイルパスを記憶
            currentSaveFilePath = filePath;

            // 変更フラグをリセット（新規読み込み時は変更なし）
            hasUnsavedChanges = false;

            // 全ページを事前にキャッシュ（ページ移動時の遅延を防止）
            updateProgressOverlayText('ページを読み込み中...');
            updateLoadingProgress(0, state.totalPages, 'ページ');
            await preloadAllPages(state.totalPages, (current, total) => {
                updateLoadingProgress(current, total, 'ページ');
            });

            // PDF注釈を読み込み
            updateProgressOverlayText('注釈を読み込み中...');
            await loadPdfAnnotationsForAllPages(pdf);

            hideProgressOverlay();
            // 検版ビューワー連携: 指定された初期ページを表示
            renderPage(startPage);
            enableHeaderButtons();

        } catch (err) {
            console.error('PDF読み込みエラー:', err);
            hideProgressOverlay();
            MojiQModal.showAlert('PDF読み込み失敗: ' + err.message, 'エラー');
        }
    }

    /**
     * Base64データからPDFを読み込む（Electronメニューからのファイル読み込み用）
     * @param {string} base64Data - Base64エンコードされたPDFデータ
     * @param {string} fileName - ファイル名
     */
    async function loadPdfFromBase64(base64Data, fileName) {
        // 処理中はファイルオープンを無視
        if (isProcessing) return;

        try {
            // Base64をUint8Arrayに変換
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // CMap設定を含めてPDFを読み込み（日本語フォント等の正しい表示に必要）
            // 注意: ロード成功前にステートをクリアしない（失敗時のデータ損失防止）
            const loadOptions = {
                data: bytes,
                cMapUrl: window.MojiQPdfJsConfig?.cMapUrl || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/',
                cMapPacked: window.MojiQPdfJsConfig?.cMapPacked !== false,
                standardFontDataUrl: window.MojiQPdfJsConfig?.standardFontDataUrl || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/standard_fonts/'
            };
            const pdf = await pdfjsLib.getDocument(loadOptions).promise;

            // ロード成功後に既存のPDFをクリア
            state.pdfDocs = [];
            state.pageMapping = [];
            state.totalPages = 0;
            state.currentPageNum = 1;
            state.pageDrawingHistory = {};
            state.pageRedoHistory = {};

            // ズームを100%にリセット
            state.currentZoom = 1.0;

            state.pdfDocs.push(pdf);

            // 元のPDFバイトデータを保存（非破壊保存用）
            state.originalPdfBytesArray = [bytes.slice()];

            // ページマッピングを作成
            for (let i = 1; i <= pdf.numPages; i++) {
                state.pageMapping.push({ docIndex: 0, pageNum: i });
            }
            state.totalPages = pdf.numPages;

            // Simulatorの全データをリセット
            if (window.SimulatorState) {
                window.SimulatorState.resetAllData();
                const adjustMessage = document.getElementById('adjustMessage');
                if (adjustMessage) adjustMessage.classList.remove('active');
                const sizeTooltip = document.getElementById('sizeTooltip');
                if (sizeTooltip) sizeTooltip.style.display = 'none';
            }

            // 描画オブジェクトをリセット
            if (window.MojiQDrawingObjects) {
                window.MojiQDrawingObjects.clearAllObjects();
            }

            // 見開きモードをリセット
            if (spreadViewMode) {
                spreadViewMode = false;
                spreadMapping = [];
                const spreadBtn = document.getElementById('spreadViewBtn');
                if (spreadBtn) {
                    spreadBtn.classList.remove('active');
                }
                spreadPageCache = {};
                spreadCacheReady = false;
            }

            // 単一ページキャッシュもクリア
            if (singlePageCache) singlePageCache.clear();
            cancelPrefetch();

            // 初期メッセージを非表示
            if (initialMessage) initialMessage.style.display = 'none';

            // ロック解除
            if (toggleAppLockCallback) {
                toggleAppLockCallback(false);
            }

            // app-lockedクラスを削除（UI全体のロック解除）
            if (typeof window.unlockApp === 'function') {
                window.unlockApp();
            }

            // サイドバー・ツールバーを表示
            if (typeof window.showAppSidebars === 'function') {
                window.showAppSidebars();
            }

            // ファイル名を更新
            updatePdfFileNameDisplay(fileName);

            // 上書き保存用: Base64経由でファイルを開いた場合はパスが不明なのでリセット
            currentSaveFilePath = null;

            // 変更フラグをリセット（新規読み込み時は変更なし）
            hasUnsavedChanges = false;

            // 全ページを事前にキャッシュ（ページ移動時の遅延を防止）
            showProgressOverlay('ページを読み込み中...');
            await preloadAllPages(state.totalPages, (current, total) => {
                updateProgressOverlay(current, total);
            });

            // PDF注釈を読み込み
            showProgressOverlay('注釈を読み込み中...');
            await loadPdfAnnotationsForAllPages(pdf);

            hideProgressOverlay();

            // 最初のページをレンダリング
            await renderPage(1);

            // ヘッダーボタンを有効化
            enableHeaderButtons();

            // ナビゲーションを更新
            if (window.MojiQPageManager) {
                MojiQPageManager.updatePageControls();
            }
        } catch (e) {
            console.error('PDF読み込みエラー:', e);
            MojiQModal.showAlert('PDFの読み込みに失敗しました: ' + e.message, 'エラー');
        }
    }

    /**
     * 透過PDF設定モーダルを表示（現在は未使用 - サイドバースライダーで直接制御）
     * @returns {Promise<{cancelled: boolean, bgOpacity?: number}>}
     */
    function showTransparentPdfModal() {
        return new Promise((resolve) => {
            const modal = document.getElementById('transparentPdfModal');
            const slider = document.getElementById('modalBgOpacitySlider');
            const valueDisplay = document.getElementById('modalBgOpacityValue');
            const previewBgLayer = document.querySelector('#opacityPreviewBox .preview-bg-layer');
            const cancelBtn = document.getElementById('transparentPdfCancelBtn');
            const saveBtn = document.getElementById('transparentPdfSaveBtn');

            // 初期値設定
            slider.value = 0;
            valueDisplay.textContent = '0%';
            if (previewBgLayer) {
                previewBgLayer.style.opacity = '0';
            }

            // スライダー変更時のプレビュー更新
            const updatePreview = () => {
                const value = parseInt(slider.value, 10);
                valueDisplay.textContent = value + '%';
                if (previewBgLayer) {
                    previewBgLayer.style.opacity = (value / 100).toString();
                }
            };
            slider.addEventListener('input', updatePreview);

            // モーダル表示
            modal.style.display = 'flex';

            // クリーンアップ関数
            const cleanup = () => {
                modal.style.display = 'none';
                slider.removeEventListener('input', updatePreview);
                cancelBtn.removeEventListener('click', handleCancel);
                saveBtn.removeEventListener('click', handleSave);
            };

            const handleCancel = () => {
                cleanup();
                resolve({ cancelled: true });
            };

            const handleSave = () => {
                const bgOpacity = parseInt(slider.value, 10);
                cleanup();
                resolve({ cancelled: false, bgOpacity: bgOpacity });
            };

            cancelBtn.addEventListener('click', handleCancel);
            saveBtn.addEventListener('click', handleSave);
        });
    }

    /**
     * 透過PDF保存（背景の透明度を調整可能）
     */
    async function saveTransparentPdf() {
        if (state.pdfDocs.length === 0) return;

        // 設定モーダルを表示
        const settings = await showTransparentPdfModal();
        if (settings.cancelled) return;

        // 保存中の表示
        const saveTransparentBtn = document.getElementById('saveTransparentPdfBtn');
        const originalTitle = saveTransparentBtn ? saveTransparentBtn.title : '';
        if (saveTransparentBtn) {
            saveTransparentBtn.title = "保存中...";
            saveTransparentBtn.disabled = true;
        }

        // 描画中のストロークがあれば強制的に確定させる（選択解除より先に実行）
        if (window.MojiQDrawing && window.MojiQDrawing.finalizeCurrentStroke) {
            window.MojiQDrawing.finalizeCurrentStroke();
        }

        // 選択状態を解除（選択枠がPDFに残らないようにする）
        const DrawingObjects = window.MojiQDrawingObjects;
        if (DrawingObjects) {
            DrawingObjects.deselectObject(state.currentPageNum);
            if (window.MojiQDrawing) {
                window.MojiQDrawing.redrawCanvas();
            }
        }

        // 現在の描画を保存
        MojiQPageManager.saveCurrentCanvasToHistory();

        // ファイル名取得
        const fileName = getSaveFileName('_transparent');

        try {
            // pdf-libを使用した透過保存
            const PdfLibSaver = window.MojiQPdfLibSaver;
            if (!PdfLibSaver) {
                throw new Error('PDF-Lib Saverモジュールが見つかりません');
            }

            // 見開きモード時は見開きマッピングを渡す
            const saveOptions = {
                bgOpacity: settings.bgOpacity
            };

            // 見開きモード時は見開き状態で保存
            if (spreadViewMode && spreadMapping.length > 0) {
                saveOptions.spreadMode = true;
                saveOptions.spreadMapping = spreadMapping;
                // 見開きモードでの座標変換に必要な情報を追加
                saveOptions.spreadCssPageWidth = spreadBasePageSize.width * spreadBaseScale;
                saveOptions.spreadCssPageHeight = spreadBasePageSize.height * spreadBaseScale;
            }

            const result = await PdfLibSaver.saveTransparent(state, fileName, saveOptions);

            if (!result.success) {
                throw new Error(result.error || '透過PDF保存に失敗しました');
            }

            const pdfBytes = result.data;

            // Electron環境かどうかでPDF保存方法を分岐
            if (window.MojiQElectron && window.MojiQElectron.isElectron) {
                // Electronネイティブ保存ダイアログを使用
                const dialogResult = await window.MojiQElectron.showSavePdfDialog(fileName + '_transparent.pdf');
                if (!dialogResult.canceled && dialogResult.filePath) {
                    const pdfBase64 = uint8ArrayToBase64(pdfBytes);
                    const saveResult = await window.MojiQElectron.saveFile(dialogResult.filePath, pdfBase64);
                    if (!saveResult.success) {
                        throw new Error(saveResult.error || '保存に失敗しました');
                    }
                }
            } else {
                // ブラウザ環境: Blobでダウンロード
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName + '_transparent.pdf';
                link.click();
                URL.revokeObjectURL(url);
            }

        } catch (e) {
            console.error('透過PDF保存エラー:', e);
            MojiQModal.showAlert('保存エラー: ' + e.message, 'エラー');
        } finally {
            if (saveTransparentBtn) {
                saveTransparentBtn.title = originalTitle;
                saveTransparentBtn.disabled = false;
            }
        }
    }

    /**
     * 透過PDF直接保存（背景透過モードからの保存用、設定モーダルなし）
     * スライダーで設定した背景透明度で保存
     */
    async function saveTransparentPdfDirect() {
        if (state.pdfDocs.length === 0) return;

        // 処理中フラグを立てる（ファイルオープン防止）
        isProcessing = true;

        // 保存中の表示
        const originalTitle = savePdfBtn ? savePdfBtn.title : '';
        if (savePdfBtn) {
            savePdfBtn.title = "保存中...";
            savePdfBtn.disabled = true;
        }

        // 描画中のストロークがあれば強制的に確定させる（選択解除より先に実行）
        if (window.MojiQDrawing && window.MojiQDrawing.finalizeCurrentStroke) {
            window.MojiQDrawing.finalizeCurrentStroke();
        }

        // 選択状態を解除（選択枠がPDFに残らないようにする）
        const DrawingObjects = window.MojiQDrawingObjects;
        if (DrawingObjects) {
            DrawingObjects.deselectObject(state.currentPageNum);
            if (window.MojiQDrawing) {
                window.MojiQDrawing.redrawCanvas();
            }
        }

        // 現在の描画を保存
        MojiQPageManager.saveCurrentCanvasToHistory();

        // ファイル名取得
        const fileName = getSaveFileName();

        // ページ数が多い場合はプログレスオーバーレイを表示
        const showProgress = state.totalPages >= 3;
        if (showProgress) {
            showProgressOverlay('透過PDFを保存しています...');
        }

        try {
            // pdf-libを使用した透過保存（スライダーで設定した透明度）
            const PdfLibSaver = window.MojiQPdfLibSaver;
            if (!PdfLibSaver) {
                throw new Error('PDF-Lib Saverモジュールが見つかりません');
            }

            // 見開きモード時は見開きマッピングを渡す
            const saveOptions = {
                bgOpacity: bgOpacityValue,  // スライダーで設定した透明度
                onProgress: (percent) => {
                    if (showProgress) {
                        updateLoadingProgress(percent, 100, '%');
                    }
                }
            };

            // 見開きモード時は見開き状態で保存
            if (spreadViewMode && spreadMapping.length > 0) {
                saveOptions.spreadMode = true;
                saveOptions.spreadMapping = spreadMapping;
                // 見開きモードでの座標変換に必要な情報を追加
                saveOptions.spreadCssPageWidth = spreadBasePageSize.width * spreadBaseScale;
                saveOptions.spreadCssPageHeight = spreadBasePageSize.height * spreadBaseScale;
            }

            const result = await PdfLibSaver.saveTransparent(state, fileName, saveOptions);

            if (!result.success) {
                throw new Error(result.error || '透過PDF保存に失敗しました');
            }

            const pdfBytes = result.data;

            // Electron環境かどうかでPDF保存方法を分岐
            if (window.MojiQElectron && window.MojiQElectron.isElectron) {
                // Electronネイティブ保存ダイアログを使用
                const dialogResult = await window.MojiQElectron.showSavePdfDialog(fileName + '.pdf');
                if (!dialogResult.canceled && dialogResult.filePath) {
                    const pdfBase64 = uint8ArrayToBase64(pdfBytes);
                    const saveResult = await window.MojiQElectron.saveFile(dialogResult.filePath, pdfBase64);
                    if (!saveResult.success) {
                        throw new Error(saveResult.error || '保存に失敗しました');
                    }
                }
            } else {
                // ブラウザ環境: Blobでダウンロード
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName + '.pdf';
                link.click();
                URL.revokeObjectURL(url);
            }

        } catch (e) {
            console.error('透過PDF保存エラー:', e);
            MojiQModal.showAlert('保存エラー: ' + e.message, 'エラー');
        } finally {
            if (showProgress) {
                hideProgressOverlay();
            }
            isProcessing = false;
            if (savePdfBtn) {
                savePdfBtn.title = originalTitle;
                savePdfBtn.disabled = false;
            }
        }
    }

    /**
     * PDF挿入をトリガー
     * @param {number} offset - 0=前, 1=後
     */
    function triggerInsertPdf(offset) {
        insertPdfOffset = offset;
        if (insertPdfUpload) {
            insertPdfUpload.click();
        }
    }

    /**
     * 画像ファイルをパスから読み込み（Electron環境専用）
     * アプリアイコンへのドラッグ＆ドロップ、ファイル関連付けからの起動時に使用
     * @param {string} filePath - ファイルパス
     * @param {string} fileName - ファイル名
     */
    async function loadImageFromPath(filePath, fileName) {
        // 処理中はファイルオープンを無視
        if (isProcessing) return;

        if (!window.electronAPI) {
            console.error('Electron環境でのみ使用可能です');
            return;
        }

        // サムネイルキャッシュをクリア
        if (window.MojiQNavigation && window.MojiQNavigation.clearThumbnailCache) {
            window.MojiQNavigation.clearThumbnailCache();
        }

        try {
            // 既存のPDFが読み込まれている場合は確認ダイアログを表示
            if (state.pdfDocs && state.pdfDocs.length > 0) {
                const confirmed = await MojiQModal.showConfirm('読み込んだページ、描画は全て削除されます。よろしいですか？');
                if (!confirmed) {
                    return;
                }
            }

            // 進捗オーバーレイを表示
            showProgressOverlay('画像を読み込んでいます...');

            // ファイルをバイナリで読み込み
            const result = await window.electronAPI.readFileBinary(filePath);
            if (!result.success) {
                throw new Error(result.error || 'ファイルの読み込みに失敗しました');
            }

            // Fileオブジェクトを生成
            const data = new Uint8Array(result.data);
            const blob = new Blob([data], { type: 'image/jpeg' });
            const file = new File([blob], fileName, { type: 'image/jpeg' });

            hideProgressOverlay();

            // 既存の画像読み込み処理を使用
            await loadImagesFromFiles([file]);

        } catch (err) {
            console.error('画像読み込みエラー:', err);
            hideProgressOverlay();
            MojiQModal.showAlert('画像読み込み失敗: ' + err.message, 'エラー');
        }
    }

    /**
     * 複数の画像ファイルをパスから読み込み（Electron環境専用）
     * アプリアイコンへの複数ファイルドラッグ＆ドロップ時に使用
     * @param {Array<{path: string, name: string}>} files - ファイル情報の配列
     */
    async function loadImagesFromPaths(files) {
        // 処理中はファイルオープンを無視
        if (isProcessing) return;

        if (!window.electronAPI) {
            console.error('Electron環境でのみ使用可能です');
            return;
        }

        if (!files || files.length === 0) return;

        // サムネイルキャッシュをクリア
        if (window.MojiQNavigation && window.MojiQNavigation.clearThumbnailCache) {
            window.MojiQNavigation.clearThumbnailCache();
        }

        try {
            // 既存のPDFが読み込まれている場合は確認ダイアログを表示
            if (state.pdfDocs && state.pdfDocs.length > 0) {
                const confirmed = await MojiQModal.showConfirm('読み込んだページ、描画は全て削除されます。よろしいですか？');
                if (!confirmed) {
                    return;
                }
            }

            // 進捗オーバーレイを表示
            showProgressOverlay('画像を読み込んでいます...');

            // 各ファイルをバイナリで読み込んでFileオブジェクトに変換
            const fileObjects = [];
            for (let i = 0; i < files.length; i++) {
                const fileInfo = files[i];
                updateProgressOverlay(i + 1, files.length);
                await nextFrame();

                const result = await window.electronAPI.readFileBinary(fileInfo.path);
                if (result.success) {
                    const data = new Uint8Array(result.data);
                    const blob = new Blob([data], { type: 'image/jpeg' });
                    const file = new File([blob], fileInfo.name, { type: 'image/jpeg' });
                    fileObjects.push(file);
                }
            }

            hideProgressOverlay();

            if (fileObjects.length === 0) {
                MojiQModal.showAlert('画像の読み込みに失敗しました。', 'エラー');
                return;
            }

            // 既存の画像読み込み処理を使用
            await loadImagesFromFiles(fileObjects);

        } catch (err) {
            console.error('画像読み込みエラー:', err);
            hideProgressOverlay();
            MojiQModal.showAlert('画像読み込み失敗: ' + err.message, 'エラー');
        }
    }

    /**
     * 画像ページデータを取得（pdf-lib-saverから使用）
     * @returns {object}
     */
    function getImagePageData() {
        return imagePageData;
    }

    /**
     * サムネイル用にページをレンダリング
     * @param {number} pageNum - ページ番号
     * @param {HTMLCanvasElement} canvas - 描画先Canvas
     * @param {number} maxWidth - サムネイルの最大幅
     * @returns {Promise<boolean>}
     */
    async function renderThumbnail(pageNum, canvas, maxWidth = 120) {
        if (!canvas || pageNum < 1 || pageNum > state.totalPages) return false;

        const mapItem = state.pageMapping[pageNum - 1];
        if (!mapItem) return false;

        const ctx = canvas.getContext('2d');

        try {
            // 画像ページの場合
            if (mapItem.docIndex === -2 && imagePageData[mapItem.imageIndex]) {
                const imgData = imagePageData[mapItem.imageIndex];
                const img = new Image();
                return new Promise((resolve) => {
                    img.onload = () => {
                        const scale = maxWidth / img.width;
                        canvas.width = maxWidth;
                        canvas.height = img.height * scale;
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        URL.revokeObjectURL(img.src);  // Blob URLを解放
                        resolve(true);
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(img.src);  // Blob URLを解放
                        resolve(false);
                    };
                    // dataからBlob URLを作成
                    const blob = new Blob([imgData.data], { type: 'image/jpeg' });
                    img.src = URL.createObjectURL(blob);
                });
            }

            // PDFページの場合
            if (mapItem.docIndex >= 0 && state.pdfDocs[mapItem.docIndex]) {
                const pdfDoc = state.pdfDocs[mapItem.docIndex];
                const page = await pdfDoc.getPage(mapItem.pageNum);
                const baseViewport = page.getViewport({ scale: 1 });
                const scale = maxWidth / baseViewport.width;
                const viewport = page.getViewport({ scale: scale });

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({
                    canvasContext: ctx,
                    viewport: viewport
                }).promise;

                return true;
            }

            return false;
        } catch (e) {
            console.warn('Thumbnail rendering failed:', e);
            return false;
        }
    }

    /**
     * 見開きサムネイルをレンダリング
     * @param {number} spreadIndex - 見開きインデックス（0始まり）
     * @param {HTMLCanvasElement} canvas - 描画先キャンバス
     * @param {number} maxWidth - 最大幅（見開き2ページ分）
     * @returns {Promise<boolean>} - 成功/失敗
     */
    async function renderSpreadThumbnail(spreadIndex, canvas, maxWidth = 200) {
        if (!canvas || !spreadViewMode || spreadMapping.length === 0) return false;
        if (spreadIndex < 0 || spreadIndex >= spreadMapping.length) return false;

        const spread = spreadMapping[spreadIndex];
        if (!spread) return false;

        const ctx = canvas.getContext('2d');
        const singlePageWidth = maxWidth / 2;

        // 左右ページのサイズを取得（1ページ分の高さを基準にする）
        let pageHeight = 0;
        const leftPage = spread.leftPage;
        const rightPage = spread.rightPage;

        // 高さを取得するために最初の有効なページを確認
        if (leftPage !== null && state.pageMapping[leftPage - 1]) {
            const mapItem = state.pageMapping[leftPage - 1];
            const aspectRatio = mapItem.displayHeight / mapItem.displayWidth;
            pageHeight = singlePageWidth * aspectRatio;
        } else if (rightPage !== null && state.pageMapping[rightPage - 1]) {
            const mapItem = state.pageMapping[rightPage - 1];
            const aspectRatio = mapItem.displayHeight / mapItem.displayWidth;
            pageHeight = singlePageWidth * aspectRatio;
        }

        if (pageHeight === 0) return false;

        // キャンバスサイズを設定（見開き2ページ分）
        canvas.width = maxWidth;
        canvas.height = pageHeight;

        // 背景を白で塗りつぶし
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        try {
            // 左ページを描画
            if (leftPage !== null) {
                await renderSinglePageToContext(ctx, leftPage, 0, 0, singlePageWidth, pageHeight);
            }

            // 右ページを描画
            if (rightPage !== null) {
                await renderSinglePageToContext(ctx, rightPage, singlePageWidth, 0, singlePageWidth, pageHeight);
            }

            return true;
        } catch (e) {
            console.warn('Spread thumbnail rendering failed:', e);
            return false;
        }
    }

    /**
     * 単一ページをコンテキストに描画（サムネイル用）
     * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
     * @param {number} pageNum - ページ番号
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {number} width - 描画幅
     * @param {number} height - 描画高さ
     */
    async function renderSinglePageToContext(ctx, pageNum, x, y, width, height) {
        if (pageNum < 1 || pageNum > state.totalPages) return;

        const mapItem = state.pageMapping[pageNum - 1];
        if (!mapItem) return;

        // 画像ページの場合
        if (mapItem.docIndex === -2 && imagePageData[mapItem.imageIndex]) {
            const imgData = imagePageData[mapItem.imageIndex];
            const img = new Image();
            return new Promise((resolve) => {
                img.onload = () => {
                    ctx.drawImage(img, x, y, width, height);
                    URL.revokeObjectURL(img.src);
                    resolve();
                };
                img.onerror = () => {
                    URL.revokeObjectURL(img.src);
                    resolve();
                };
                const blob = new Blob([imgData.data], { type: 'image/jpeg' });
                img.src = URL.createObjectURL(blob);
            });
        }

        // PDFページの場合
        if (mapItem.docIndex >= 0 && state.pdfDocs[mapItem.docIndex]) {
            const pdfDoc = state.pdfDocs[mapItem.docIndex];
            const page = await pdfDoc.getPage(mapItem.pageNum);
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = width / baseViewport.width;
            const viewport = page.getViewport({ scale: scale });

            // 一時キャンバスにレンダリング
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;
            const tempCtx = tempCanvas.getContext('2d');

            await page.render({
                canvasContext: tempCtx,
                viewport: viewport
            }).promise;

            // メインキャンバスに転写
            ctx.drawImage(tempCanvas, x, y, width, height);
        }
    }

    /**
     * コンテナサイズをリセット（ビューワーモード用）
     * 次回レンダリング時に新しいコンテナサイズで再計算される
     */
    function resetContainerSize() {
        fixedContainerWidth = null;
        fixedContainerHeight = null;
        // コンテナサイズ変更時はキャッシュ無効化
        if (singlePageCache) singlePageCache.clear();
        cancelPrefetch();
    }

    // =====================================================
    // 見開き表示モード関連
    // =====================================================

    /**
     * 見開きマッピングを生成
     * 右綴じ: 1ページ目は右側に配置（左に白紙）、最終ページが奇数なら左側に配置（右に白紙）
     * 左綴じ: 1ページ目は左側に配置（右に白紙）、最終ページが偶数なら右側に配置（左に白紙）
     * 白紙ページはpageMappingに実際に追加される
     */
    function generateSpreadMapping() {
        spreadMapping = [];
        spreadBlankPagesAdded = { front: 0, back: 0 };
        const originalTotalPages = state.totalPages;

        if (originalTotalPages === 0) return;

        // 1ページ目のサイズを取得（白紙ページのサイズ基準）
        const firstMap = state.pageMapping[0];
        let blankWidth = 595;
        let blankHeight = 842;
        if (firstMap) {
            if (firstMap.displayWidth && firstMap.displayHeight) {
                blankWidth = firstMap.displayWidth;
                blankHeight = firstMap.displayHeight;
            } else if (firstMap.width && firstMap.height) {
                blankWidth = firstMap.width;
                blankHeight = firstMap.height;
            }
        }

        const createBlankPage = () => ({
            docIndex: -1,
            pageNum: 1,
            width: blankWidth,
            height: blankHeight,
            displayWidth: blankWidth,
            displayHeight: blankHeight,
            isSpreadBlank: true
        });

        const newPageMapping = [];
        let frontBlankAdded = false;
        let backBlankAdded = false;

        if (spreadBindingDirection === 'right') {
            // 右綴じ: 1ページ目を右側に配置するため、先頭に白紙を追加
            newPageMapping.push(createBlankPage());
            frontBlankAdded = true;
            spreadBlankPagesAdded.front = 1;

            // 元のページを追加
            for (let i = 0; i < state.pageMapping.length; i++) {
                newPageMapping.push(state.pageMapping[i]);
            }

            // 総ページ数が奇数になった場合（元が偶数）、最後に白紙を追加
            if (newPageMapping.length % 2 !== 0) {
                newPageMapping.push(createBlankPage());
                backBlankAdded = true;
                spreadBlankPagesAdded.back = 1;
            }
        } else {
            // 左綴じ: 1ページ目を右側に配置するため、先頭に白紙を追加（右綴じの反転）
            newPageMapping.push(createBlankPage());
            frontBlankAdded = true;
            spreadBlankPagesAdded.front = 1;

            // 元のページを追加
            for (let i = 0; i < state.pageMapping.length; i++) {
                newPageMapping.push(state.pageMapping[i]);
            }

            // 総ページ数が奇数になった場合（元が偶数）、最後に白紙を追加
            if (newPageMapping.length % 2 !== 0) {
                newPageMapping.push(createBlankPage());
                backBlankAdded = true;
                spreadBlankPagesAdded.back = 1;
            }
        }

        state.pageMapping = newPageMapping;
        state.totalPages = newPageMapping.length;

        // 描画オブジェクトのページ番号をシフト
        // 先頭に白紙が挿入されたので、全ページを+1シフト（insertIndex=0）
        if (window.MojiQDrawingObjects && frontBlankAdded) {
            MojiQDrawingObjects.shiftPageNumbersAfterInsert(0);
        }

        // 見開きマッピングを生成
        if (spreadBindingDirection === 'right') {
            // 右綴じ: 右から左に読む（見開きの左側が後のページ）
            for (let i = 1; i <= state.totalPages; i += 2) {
                const leftPage = i;
                const rightPage = i + 1 <= state.totalPages ? i + 1 : null;
                spreadMapping.push({
                    leftPage: rightPage,  // 右綴じでは右側のページが先
                    rightPage: leftPage,
                    leftBlank: rightPage ? (state.pageMapping[rightPage - 1]?.isSpreadBlank || false) : true,
                    rightBlank: state.pageMapping[leftPage - 1]?.isSpreadBlank || false
                });
            }
        } else {
            // 左綴じ: 左から右に読む（見開きの右側が先のページ、右綴じの反転）
            // 先頭に白紙が追加されているので、白紙が左側、1ページ目が右側になる
            for (let i = 1; i <= state.totalPages; i += 2) {
                const leftPage = i;
                const rightPage = i + 1 <= state.totalPages ? i + 1 : null;
                spreadMapping.push({
                    leftPage: leftPage,
                    rightPage: rightPage,
                    leftBlank: state.pageMapping[leftPage - 1]?.isSpreadBlank || false,
                    rightBlank: rightPage ? (state.pageMapping[rightPage - 1]?.isSpreadBlank || false) : true
                });
            }
        }
    }

    /**
     * ページのサイズを取得
     * @param {number|null} pageNum - ページ番号（nullの場合は1ページ目と同じサイズを返す）
     * @param {boolean} isBlank - 仮想白紙かどうか
     * @returns {{width: number, height: number}}
     */
    function getPageSize(pageNum, isBlank = false) {
        if (isBlank || pageNum === null) {
            // 1ページ目と同じサイズを返す
            const firstMap = state.pageMapping[0];
            if (firstMap && firstMap.displayWidth && firstMap.displayHeight) {
                return { width: firstMap.displayWidth, height: firstMap.displayHeight };
            }
            // displayWidth/Heightがまだ設定されていない場合はデフォルト値
            return { width: 595, height: 842 }; // A4サイズ相当
        }

        const mapItem = state.pageMapping[pageNum - 1];
        if (mapItem && mapItem.displayWidth && mapItem.displayHeight) {
            return { width: mapItem.displayWidth, height: mapItem.displayHeight };
        }
        return { width: 595, height: 842 };
    }

    /**
     * ページのサイズを非同期で取得（PDFから直接サイズを取得）
     * @param {number} pageNum - ページ番号
     * @returns {Promise<{width: number, height: number}>}
     */
    async function getPageSizeAsync(pageNum) {
        const mapItem = state.pageMapping[pageNum - 1];
        if (!mapItem) {
            return { width: 595, height: 842 };
        }

        // displayWidth/Heightが既にある場合はそれを使用
        if (mapItem.displayWidth && mapItem.displayHeight) {
            return { width: mapItem.displayWidth, height: mapItem.displayHeight };
        }

        // width/heightがある場合はそれを使用
        if (mapItem.width && mapItem.height) {
            return { width: mapItem.width, height: mapItem.height };
        }

        // PDFから直接サイズを取得
        if (mapItem.docIndex >= 0 && state.pdfDocs[mapItem.docIndex]) {
            try {
                const page = await state.pdfDocs[mapItem.docIndex].getPage(mapItem.pageNum);
                const viewport = page.getViewport({ scale: 1 });
                return { width: viewport.width, height: viewport.height };
            } catch (e) {
                console.error('ページサイズ取得エラー:', e);
            }
        }

        // 画像ページ
        if (mapItem.docIndex === -2 && imagePageData[mapItem.imageIndex]) {
            const imgData = imagePageData[mapItem.imageIndex];
            return { width: imgData.width, height: imgData.height };
        }

        return { width: 595, height: 842 };
    }

    /**
     * 見開きモードでページをレンダリング
     * @param {number} spreadIndex - 見開きインデックス
     */
    async function renderSpreadView(spreadIndex) {
        if (!spreadViewMode || spreadMapping.length === 0) {
            return;
        }
        if (spreadIndex < 0 || spreadIndex >= spreadMapping.length) {
            return;
        }

        // 同じインデックスで既にレンダリング済みの場合はスキップ
        if (currentSpreadIndex === spreadIndex && !isSpreadRendering) {
            // 既に表示中なのでスキップ（ただし初回は除く）
            if (state.spreadMetadata) {
                return;
            }
        }

        // 連打対策（見開き専用フラグ）
        if (isSpreadRendering) {
            pendingSpreadIndex = spreadIndex;
            return;
        }
        isSpreadRendering = true;
        pendingSpreadIndex = null;

        // 操作IDをインクリメント（古い描画をキャンセルするため）
        const currentOperationId = ++spreadRenderOperationId;

        try {
            currentSpreadIndex = spreadIndex;
            const spread = spreadMapping[spreadIndex];

            // 初回レンダリング時にコンテナサイズを固定
            if (fixedContainerWidth === null || fixedContainerHeight === null) {
                fixedContainerWidth = canvasArea.clientWidth - 40;
                fixedContainerHeight = canvasArea.clientHeight - 40;
            }

            const containerWidth = fixedContainerWidth;
            const containerHeight = fixedContainerHeight;

            // 左右のページサイズを取得
            // 1ページ目のサイズを基準にする
            let basePageSize = await getPageSizeAsync(1);

            // 操作IDチェック：古い操作の場合は中断
            if (currentOperationId !== spreadRenderOperationId) {
                return;
            }

            // 見開き全体のサイズを計算（左右同じサイズと仮定）
            const spreadWidth = basePageSize.width * 2;
            const spreadHeight = basePageSize.height;

            // コンテナに収まるようにスケーリング
            const scale = Math.min(
                containerWidth / spreadWidth,
                containerHeight / spreadHeight
            );

            const scaledSpreadWidth = spreadWidth * scale;
            const scaledSpreadHeight = spreadHeight * scale;
            const scaledPageWidth = basePageSize.width * scale;

            // キャンバスサイズを設定
            const canvasWidth = scaledSpreadWidth * dpr;
            const canvasHeight = scaledSpreadHeight * dpr;

            // オフスクリーンキャンバスを使用してダブルバッファリング（背景用）
            const offscreenBgCanvas = document.createElement('canvas');
            offscreenBgCanvas.width = canvasWidth;
            offscreenBgCanvas.height = canvasHeight;
            const offscreenBgContext = offscreenBgCanvas.getContext('2d');
            offscreenBgContext.fillStyle = '#ffffff';
            offscreenBgContext.fillRect(0, 0, canvasWidth, canvasHeight);

            // 左ページをオフスクリーンに描画
            if (spread.leftPage !== null) {
                await renderPageToSpreadCanvasOffscreen(offscreenBgContext, spread.leftPage, 0, scale, currentOperationId);
            }

            // 操作IDチェック：古い操作の場合は中断（キャンバスに反映せず終了）
            if (currentOperationId !== spreadRenderOperationId) {
                return;
            }

            // 右ページをオフスクリーンに描画
            if (spread.rightPage !== null) {
                await renderPageToSpreadCanvasOffscreen(offscreenBgContext, spread.rightPage, scaledPageWidth * dpr, scale, currentOperationId);
            }

            // 操作IDチェック：古い操作の場合は中断（キャンバスに反映せず終了）
            if (currentOperationId !== spreadRenderOperationId) {
                return;
            }

            // 見開きメタデータを先に保存（描画オブジェクトのオフセット計算に必要）
            const newSpreadMetadata = {
                leftOffset: 0,
                rightOffset: scaledPageWidth,
                leftWidth: scaledPageWidth,
                rightWidth: scaledPageWidth,
                scale: scale,
                leftPageNum: spread.leftPage,
                rightPageNum: spread.rightPage,
                canvasWidth: scaledSpreadWidth,
                canvasHeight: scaledSpreadHeight
            };

            // 各ページのdisplayWidth/Heightを更新（描画オブジェクト用）
            if (spread.leftPage !== null) {
                const leftMapItem = state.pageMapping[spread.leftPage - 1];
                if (leftMapItem) {
                    leftMapItem.displayWidth = basePageSize.width;
                    leftMapItem.displayHeight = basePageSize.height;
                }
            }
            if (spread.rightPage !== null) {
                const rightMapItem = state.pageMapping[spread.rightPage - 1];
                if (rightMapItem) {
                    rightMapItem.displayWidth = basePageSize.width;
                    rightMapItem.displayHeight = basePageSize.height;
                }
            }

            // オフスクリーンキャンバス（描画オブジェクト用）
            const offscreenMojiqCanvas = document.createElement('canvas');
            offscreenMojiqCanvas.width = canvasWidth;
            offscreenMojiqCanvas.height = canvasHeight;
            const offscreenMojiqContext = offscreenMojiqCanvas.getContext('2d');
            offscreenMojiqContext.setTransform(1, 0, 0, 1, 0, 0);
            offscreenMojiqContext.scale(dpr, dpr);
            offscreenMojiqContext.clearRect(0, 0, scaledSpreadWidth, scaledSpreadHeight);

            // 見開きページのオブジェクトをオフスクリーンに描画
            if (window.MojiQDrawingRenderer && window.MojiQDrawingObjects) {
                renderSpreadObjectsToContext(offscreenMojiqContext, spreadIndex);
            }

            // 操作IDチェック：古い操作の場合は中断（キャンバスに反映せず終了）
            if (currentOperationId !== spreadRenderOperationId) {
                return;
            }

            // === ここから同期的にメインキャンバスに転送 ===
            // すべてのオフスクリーン描画が完了した後、一度にメインキャンバスに転送
            bgCanvas.width = mojiqCanvas.width = simCanvas.width = canvasWidth;
            bgCanvas.height = mojiqCanvas.height = simCanvas.height = canvasHeight;

            // 背景を転送
            const bgContext = bgCanvas.getContext('2d');
            bgContext.drawImage(offscreenBgCanvas, 0, 0);

            // 描画オブジェクトを転送
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            // 重要：compositeOperationをリセット（eraserモード対策）
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            ctx.drawImage(offscreenMojiqCanvas, 0, 0);

            // 写植グリッドを描画（見開きモード対応）
            renderSpreadSimulatorGrids(spread, scaledPageWidth);

            // メタデータを確定
            state.spreadMetadata = newSpreadMetadata;
            state.baseCSSExtent = { width: scaledSpreadWidth, height: scaledSpreadHeight };
            state.pdfContentOffset = { x: 0, y: 0 };

            // ビューワーモード中はズームを維持、それ以外はリセット
            if (window.MojiQViewerMode && MojiQViewerMode.isActive()) {
                // ビューワーモード中: ズームを維持してfitToScreenを再適用
                MojiQZoom.updateZoomDisplay();
                // スクロール位置をリセット
                if (canvasArea) {
                    canvasArea.scrollLeft = 0;
                    canvasArea.scrollTop = 0;
                }
                // fitToScreenを再適用して画面にフィット
                setTimeout(() => {
                    if (window.MojiQViewerMode && MojiQViewerMode.isActive()) {
                        MojiQViewerMode.fitToScreen();
                    }
                }, 0);
            } else {
                // 通常モード: ズームをリセット（見開きモードでは常に1.0から開始）
                state.currentZoom = 1.0;
                MojiQZoom.updateZoomDisplay();
                // スクロール位置をリセット
                if (canvasArea) {
                    canvasArea.scrollLeft = 0;
                    canvasArea.scrollTop = 0;
                }
            }

            // ナビゲーション更新（レイアウト再計算後にスライダー位置を同期するためrAFで遅延）
            requestAnimationFrame(() => {
                updateSpreadNavigation();
            });

            // グローバル状態更新
            if (!window.MojiQGlobal) window.MojiQGlobal = {};
            window.MojiQGlobal.pdfLoaded = true;

        } finally {
            isSpreadRendering = false;
            if (pendingSpreadIndex !== null && pendingSpreadIndex !== spreadIndex) {
                const nextSpread = pendingSpreadIndex;
                pendingSpreadIndex = null;
                renderSpreadView(nextSpread);
            }
        }
    }

    /**
     * 指定ページをオフスクリーンキャンバスに描画（ダブルバッファリング用）
     * @param {CanvasRenderingContext2D} offscreenContext - オフスクリーンコンテキスト
     * @param {number} pageNum - ページ番号
     * @param {number} xOffset - X方向オフセット（ピクセル単位）
     * @param {number} scale - スケール係数
     * @param {number} operationId - 操作ID（古い描画キャンセル用）
     */
    async function renderPageToSpreadCanvasOffscreen(offscreenContext, pageNum, xOffset, scale, operationId) {
        const mapItem = state.pageMapping[pageNum - 1];
        if (!mapItem) return;

        if (mapItem.docIndex === -2) {
            // 画像ページ
            const imgData = imagePageData[mapItem.imageIndex];
            if (!imgData) return;

            const blob = new Blob([imgData.data], { type: imgData.type === 'png' ? 'image/png' : 'image/jpeg' });
            const url = URL.createObjectURL(blob);

            await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    // 操作IDチェック：古い操作の場合は描画をスキップ
                    if (operationId !== spreadRenderOperationId) {
                        URL.revokeObjectURL(url);
                        resolve();
                        return;
                    }
                    const w = (mapItem.displayWidth || imgData.width) * scale * dpr;
                    const h = (mapItem.displayHeight || imgData.height) * scale * dpr;
                    offscreenContext.drawImage(img, xOffset, 0, w, h);
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('画像描画エラー'));
                };
                img.src = url;
            });
        } else if (mapItem.docIndex === -1) {
            // 白紙ページ
            const w = (mapItem.displayWidth || mapItem.width || 595) * scale * dpr;
            const h = (mapItem.displayHeight || mapItem.height || 842) * scale * dpr;
            offscreenContext.fillStyle = '#ffffff';
            offscreenContext.fillRect(xOffset, 0, w, h);
        } else {
            // PDFページ
            const targetDoc = state.pdfDocs[mapItem.docIndex];
            const page = await targetDoc.getPage(mapItem.pageNum);

            // 操作IDチェック：古い操作の場合は描画をスキップ
            if (operationId !== spreadRenderOperationId) {
                return;
            }

            const viewport = page.getViewport({ scale: 1 });
            const pageScale = Math.min(
                (mapItem.displayWidth || viewport.width) / viewport.width,
                (mapItem.displayHeight || viewport.height) / viewport.height
            ) * scale;
            const scaledViewport = page.getViewport({ scale: pageScale * dpr });

            // オフセットを適用して描画
            offscreenContext.save();
            offscreenContext.translate(xOffset, 0);
            await page.render({ canvasContext: offscreenContext, viewport: scaledViewport }).promise;
            offscreenContext.restore();
        }
    }

    /**
     * 見開きモードで見開きページの描画オブジェクトを指定コンテキストに描画
     * 見開きモードではspread_Nキーで統合管理されているオブジェクトを描画
     * @param {CanvasRenderingContext2D} targetCtx - 描画先コンテキスト
     * @param {number} spreadIndex - 見開きインデックス
     */
    function renderSpreadObjectsToContext(targetCtx, spreadIndex) {
        if (!window.MojiQDrawingRenderer || !window.MojiQDrawingObjects) return;

        // 見開きページキーを使用してオブジェクトを描画
        const spreadKey = MojiQDrawingObjects.getSpreadPageKey(spreadIndex);
        MojiQDrawingRenderer.renderAll(targetCtx, spreadKey, 0);
    }

    /**
     * 見開きモードのナビゲーションを更新
     */
    function updateSpreadNavigation() {
        const spread = spreadMapping[currentSpreadIndex];
        if (!spread) return;

        // ページ表示を更新
        let pageDisplay = '';
        if (spread.rightPage === null) {
            pageDisplay = `${spread.leftPage} / ${state.totalPages}`;
        } else {
            pageDisplay = `${spread.leftPage}-${spread.rightPage} / ${state.totalPages}`;
        }

        // ナビゲーションバーを更新
        const navPageCount = document.getElementById('navPageCount');
        if (navPageCount) {
            navPageCount.textContent = pageDisplay;
        }

        // スライダーとバブルを更新（見開きモード用）
        if (window.MojiQNavigation) {
            MojiQNavigation.updateSpreadDisplay(currentSpreadIndex + 1, spreadMapping.length);
            // ナビゲーションバーを表示（通常モードのrenderPageと同様）
            MojiQNavigation.resetNavBarTimer();
        }

        // 見開きモードでは見開きページキーをcurrentPageNumとして設定
        if (window.MojiQDrawingObjects) {
            const spreadKey = MojiQDrawingObjects.getSpreadPageKey(currentSpreadIndex);
            MojiQDrawingObjects.setCurrentPage(spreadKey);
            // DrawingSelectの現在ページも更新（選択ツールの状態を同期）
            if (window.MojiQDrawingSelect) {
                MojiQDrawingSelect.setCurrentPage(spreadKey);
            }
        }
    }

    /**
     * 見開きモードを切り替え
     */
    async function toggleSpreadViewMode() {
        if (state.pdfDocs.length === 0) return;

        spreadViewMode = !spreadViewMode;

        // ボタンのアクティブ状態を更新
        const spreadBtn = document.getElementById('spreadViewBtn');
        if (spreadBtn) {
            spreadBtn.classList.toggle('active', spreadViewMode);
        }

        if (spreadViewMode) {
            // 見開きモードをON
            // コンテナサイズをリセットして見開き用に再計算
            resetContainerSize();

            // 作業履歴（Undo/Redo）をクリア（見開きモードでは単ページの履歴は使えないため）
            if (window.MojiQDrawingObjects && MojiQDrawingObjects.clearAllHistory) {
                MojiQDrawingObjects.clearAllHistory();
            }

            // ナビゲーションのサムネイルキャッシュをクリア（綴じ方向変更時の対応）
            if (window.MojiQNavigation) {
                if (MojiQNavigation.clearThumbnailCache) {
                    MojiQNavigation.clearThumbnailCache();
                }
                // スライダーの向きを綴じ方向に応じて設定
                if (MojiQNavigation.setSliderDirection) {
                    MojiQNavigation.setSliderDirection(spreadBindingDirection);
                }
            }

            generateSpreadMapping();

            // 全ページを事前にキャッシュ
            await buildSpreadCache();

            // 写植グリッドのスケールを見開き用に調整
            scaleSimulatorGridsForSpread(true);

            // 最初の見開きインデックスを計算
            currentSpreadIndex = 0;

            // 描画オブジェクトを見開きページに統合
            mergeObjectsToSpreadPages();

            // キャッシュから表示
            displaySpreadFromCache(currentSpreadIndex);
        } else {
            // 写植グリッドのスケールを単ページ用に復元
            scaleSimulatorGridsForSpread(false);

            // 見開きモードをOFF - 見開きページから元のページにオブジェクトを分割
            splitObjectsFromSpreadPages();

            // 白紙ページを削除
            removeSpreadBlankPage();

            // 各ページの描画オブジェクトをページサイズ内にクリップ
            // （見開きモードでページ境界を超えて描画されたオブジェクトを処理）
            if (window.MojiQDrawingObjects) {
                for (let pageNum = 1; pageNum <= state.totalPages; pageNum++) {
                    const mapItem = state.pageMapping[pageNum - 1];
                    if (mapItem) {
                        const pageWidth = mapItem.displayWidth || 595;
                        const pageHeight = mapItem.displayHeight || 842;
                        MojiQDrawingObjects.clipObjectsToPageBounds(pageNum, pageWidth, pageHeight);
                    }
                }
                // 見開きページデータをクリア
                MojiQDrawingObjects.clearAllSpreadPages();
            }

            // キャッシュをクリア
            clearSpreadCache();

            spreadMapping = [];
            state.spreadMetadata = null;

            // コンテナサイズをリセットして再計算
            resetContainerSize();

            // スライダーの向きを右綴じ（RTL）に戻す
            if (window.MojiQNavigation && MojiQNavigation.setSliderDirection) {
                MojiQNavigation.setSliderDirection('right');
            }

            // 通常レンダリング（白紙削除後のページ番号を調整）
            if (state.currentPageNum > state.totalPages) {
                state.currentPageNum = state.totalPages;
            }
            renderPage(state.currentPageNum);
        }
    }

    /**
     * 見開きモード用：全てのページオブジェクトを見開きページに統合
     */
    function mergeObjectsToSpreadPages() {
        if (!window.MojiQDrawingObjects || spreadMapping.length === 0) return;

        // 見開きモードでの1ページのCSSサイズ
        const spreadCssPageWidth = spreadBasePageSize.width * spreadBaseScale;
        const spreadCssPageHeight = spreadBasePageSize.height * spreadBaseScale;

        // 単ページモードでの基準displayWidth/Heightを取得
        // 見開きモードでは白紙が追加されている可能性があるため、
        // isSpreadBlankでないページから取得する
        let singlePageDisplayWidth = null;
        let singlePageDisplayHeight = null;

        for (let i = 0; i < state.pageMapping.length; i++) {
            const mapItem = state.pageMapping[i];
            // 白紙ページではなく、displayWidth/Heightが設定されているページを探す
            if (mapItem && !mapItem.isSpreadBlank && mapItem.displayWidth && mapItem.displayHeight) {
                singlePageDisplayWidth = mapItem.displayWidth;
                singlePageDisplayHeight = mapItem.displayHeight;
                break;
            }
        }

        // displayWidth/Heightが見つからない場合はスケーリングなし
        const defaultScaleX = singlePageDisplayWidth ? spreadCssPageWidth / singlePageDisplayWidth : 1;
        const defaultScaleY = singlePageDisplayHeight ? spreadCssPageHeight / singlePageDisplayHeight : 1;

        for (let i = 0; i < spreadMapping.length; i++) {
            const spread = spreadMapping[i];
            const spreadKey = MojiQDrawingObjects.getSpreadPageKey(i);

            // 各ページの単ページ時のdisplayWidth/Heightを取得してスケール比を計算
            let leftScaleX = defaultScaleX, leftScaleY = defaultScaleY;
            let rightScaleX = defaultScaleX, rightScaleY = defaultScaleY;

            if (spread.leftPage !== null) {
                const leftMapItem = state.pageMapping[spread.leftPage - 1];
                // 白紙ページでなく、displayWidth/Heightがある場合はそれを使用
                if (leftMapItem && !leftMapItem.isSpreadBlank && leftMapItem.displayWidth && leftMapItem.displayHeight) {
                    // 単ページ座標系 → 見開き座標系へのスケール
                    leftScaleX = spreadCssPageWidth / leftMapItem.displayWidth;
                    leftScaleY = spreadCssPageHeight / leftMapItem.displayHeight;
                }
            }

            if (spread.rightPage !== null) {
                const rightMapItem = state.pageMapping[spread.rightPage - 1];
                // 白紙ページでなく、displayWidth/Heightがある場合はそれを使用
                if (rightMapItem && !rightMapItem.isSpreadBlank && rightMapItem.displayWidth && rightMapItem.displayHeight) {
                    // 単ページ座標系 → 見開き座標系へのスケール
                    rightScaleX = spreadCssPageWidth / rightMapItem.displayWidth;
                    rightScaleY = spreadCssPageHeight / rightMapItem.displayHeight;
                }
            }

            const scaleInfo = {
                leftScaleX: leftScaleX,
                leftScaleY: leftScaleY,
                rightScaleX: rightScaleX,
                rightScaleY: rightScaleY
            };

            MojiQDrawingObjects.mergeToSpreadPage(
                spreadKey,
                spread.leftPage,
                spread.rightPage,
                spreadCssPageWidth,
                scaleInfo
            );
        }
    }

    /**
     * 写植グリッドのpixelsPerMmとグリッド座標を見開き/単ページ間でスケーリング
     * @param {boolean} toSpread - true: 単ページ→見開き, false: 見開き→単ページ
     */
    function scaleSimulatorGridsForSpread(toSpread) {
        if (!window.SimulatorState) return;

        const State = window.SimulatorState;
        if (!State.get('isCalibrated')) return;

        // 単ページ時のdisplayWidthを取得（スケール比の基準）
        let singlePageDisplayWidth = null;
        for (let i = 0; i < state.pageMapping.length; i++) {
            const mapItem = state.pageMapping[i];
            if (mapItem && !mapItem.isSpreadBlank && mapItem.displayWidth) {
                singlePageDisplayWidth = mapItem.displayWidth;
                break;
            }
        }
        if (!singlePageDisplayWidth) return;

        // 見開き時の1ページのCSSピクセル幅
        const spreadCssPageWidth = spreadBasePageSize.width * spreadBaseScale;

        // スケール比率: 見開き座標系 / 単ページ座標系
        const scaleRatio = spreadCssPageWidth / singlePageDisplayWidth;

        // 実際に適用するスケール（見開きへ行くなら縮小、戻るなら拡大）
        const applyRatio = toSpread ? scaleRatio : (1 / scaleRatio);

        // pixelsPerMmをスケーリング（キャンバスピクセルあたりのmm換算が変わる）
        const currentPixelsPerMm = State.get('pixelsPerMm');
        State.set('pixelsPerMm', currentPixelsPerMm * applyRatio);

        // 全ページの全グリッドの座標をスケーリング
        const pageGridStates = State.get('pageGridStates');
        if (!pageGridStates) return;

        for (const pageNum in pageGridStates) {
            const pageData = pageGridStates[pageNum];
            if (!pageData) continue;

            const grids = Array.isArray(pageData.grids) ? pageData.grids : (pageData.startPos ? [pageData] : []);

            for (const grid of grids) {
                if (grid.startPos) {
                    grid.startPos.x *= applyRatio;
                    grid.startPos.y *= applyRatio;
                }
                if (grid.centerPos) {
                    grid.centerPos.x *= applyRatio;
                    grid.centerPos.y *= applyRatio;
                }
                if (grid.constraint) {
                    if (grid.constraint.rawW) grid.constraint.rawW *= applyRatio;
                    if (grid.constraint.rawH) grid.constraint.rawH *= applyRatio;
                }
            }
        }

        // pendingGridStateもスケーリング
        const pendingGridState = State.get('pendingGridState');
        if (pendingGridState) {
            if (pendingGridState.startPos) {
                pendingGridState.startPos.x *= applyRatio;
                pendingGridState.startPos.y *= applyRatio;
            }
            if (pendingGridState.centerPos) {
                pendingGridState.centerPos.x *= applyRatio;
                pendingGridState.centerPos.y *= applyRatio;
            }
            if (pendingGridState.constraint) {
                if (pendingGridState.constraint.rawW) pendingGridState.constraint.rawW *= applyRatio;
                if (pendingGridState.constraint.rawH) pendingGridState.constraint.rawH *= applyRatio;
            }
        }
    }

    /**
     * 見開きモード時に写植グリッドをsimキャンバスに描画
     * @param {Object} spread - 見開きデータ { leftPage, rightPage }
     * @param {number} cssPageWidth - 見開き時の1ページのCSSピクセル幅
     */
    function renderSpreadSimulatorGrids(spread, cssPageWidth) {
        if (!window.SimulatorState || !window.SimulatorGridDrawing || !simCanvas) return;

        const State = window.SimulatorState;
        if (!State.get('isCalibrated')) return;

        const simCtx = simCanvas.getContext('2d');
        simCtx.setTransform(1, 0, 0, 1, 0, 0);
        simCtx.clearRect(0, 0, simCanvas.width, simCanvas.height);

        // 右ページのオフセット（raw pixel座標系、buildSpreadCacheと同じ計算）
        const cacheWidth = Math.floor(spreadBasePageSize.width * spreadBaseScale * dpr);

        const pages = [];
        if (spread.leftPage !== null) pages.push({ pageNum: spread.leftPage, offsetX: 0 });
        if (spread.rightPage !== null) pages.push({ pageNum: spread.rightPage, offsetX: cacheWidth });

        for (const pageInfo of pages) {
            const grids = State.getPageGrids(pageInfo.pageNum);
            if (!grids || grids.length === 0) continue;

            for (const grid of grids) {
                if (!grid || !grid.startPos) continue;

                // グリッドをオフセット付きで描画
                // drawFixedGridはDOM.getCtx()を使うので、直接simCtxで描画する
                const pixelsPerMm = State.get('pixelsPerMm');
                const cellSize = grid.ptSize * State.MM_PER_PT * pixelsPerMm;
                const isHorizontal = grid.writingMode === 'horizontal';
                const width = (isHorizontal ? grid.chars : grid.lines) * cellSize;
                const height = (isHorizontal ? grid.lines : grid.chars) * cellSize;

                const drawX = grid.startPos.x + pageInfo.offsetX;
                const drawY = grid.startPos.y;

                simCtx.save();
                simCtx.globalAlpha = 0.7;

                // 背景
                simCtx.fillStyle = "rgba(255, 255, 255, 0.05)";
                simCtx.fillRect(drawX, drawY, width, height);

                // 外枠
                simCtx.beginPath();
                simCtx.rect(drawX, drawY, width, height);
                simCtx.strokeStyle = grid.isLocked ? "#fbc02d" : "#008000";
                simCtx.lineWidth = 1.5;
                simCtx.stroke();

                // 内部グリッド線
                simCtx.beginPath();
                const hLineCount = isHorizontal ? grid.lines : grid.chars;
                const vLineCount = isHorizontal ? grid.chars : grid.lines;

                for (let i = 1; i < hLineCount; i++) {
                    const y = drawY + i * cellSize;
                    simCtx.moveTo(drawX, y);
                    simCtx.lineTo(drawX + width, y);
                }
                for (let i = 1; i < vLineCount; i++) {
                    const x = drawX + i * cellSize;
                    simCtx.moveTo(x, drawY);
                    simCtx.lineTo(x, drawY + height);
                }
                simCtx.strokeStyle = "rgba(0, 0, 0, 0.2)";
                simCtx.lineWidth = 1;
                simCtx.stroke();

                // テキスト描画
                if (grid.textData && grid.textData.trim().length > 0) {
                    const textLines = grid.textData.split(/\r\n|\n/);
                    const fontSize = cellSize * 0.85;
                    simCtx.font = `${fontSize}px sans-serif`;
                    simCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
                    simCtx.textAlign = "center";
                    simCtx.textBaseline = "middle";

                    const punctuationChars = ['、', '。', '，', '．', '｡', '､'];
                    const halfWidthSymbols = ['!', '?', '？', '！'];

                    if (isHorizontal) {
                        for (let lineIdx = 0; lineIdx < textLines.length && lineIdx < grid.lines; lineIdx++) {
                            const lineText = textLines[lineIdx];
                            const tokens = [];
                            let ti = 0;
                            while (ti < lineText.length) {
                                const ch = lineText[ti];
                                const nch = lineText[ti + 1];
                                if (halfWidthSymbols.includes(ch) && nch && halfWidthSymbols.includes(nch)) {
                                    tokens.push(ch + nch);
                                    ti += 2;
                                } else {
                                    tokens.push(ch);
                                    ti++;
                                }
                            }
                            for (let tokenIdx = 0; tokenIdx < tokens.length && tokenIdx < grid.chars; tokenIdx++) {
                                const token = tokens[tokenIdx];
                                const cx = drawX + tokenIdx * cellSize + cellSize / 2;
                                const cy = drawY + lineIdx * cellSize + cellSize / 2;
                                if (token.length === 2) {
                                    const halfWidth = fontSize * 0.3;
                                    simCtx.fillText(token[0], cx - halfWidth, cy);
                                    simCtx.fillText(token[1], cx + halfWidth, cy);
                                } else if (punctuationChars.includes(token)) {
                                    simCtx.save();
                                    simCtx.textAlign = 'left';
                                    simCtx.textBaseline = 'bottom';
                                    simCtx.fillText(token, drawX + tokenIdx * cellSize + cellSize * 0.1, drawY + (lineIdx + 1) * cellSize - cellSize * 0.1);
                                    simCtx.restore();
                                } else {
                                    simCtx.fillText(token, cx, cy);
                                }
                            }
                        }
                    } else {
                        const needsRotation = ['ー', '−', '―', '…', '(', ')', '（', '）', '[', ']', '「', '」', '～', '〜', '＝', '='];
                        for (let lineIdx = 0; lineIdx < textLines.length && lineIdx < grid.lines; lineIdx++) {
                            const lineText = textLines[lineIdx];
                            const colX = drawX + (grid.lines - 1 - lineIdx) * cellSize;
                            const tokens = [];
                            let ti = 0;
                            while (ti < lineText.length) {
                                const ch = lineText[ti];
                                const nch = lineText[ti + 1];
                                if (halfWidthSymbols.includes(ch) && nch && halfWidthSymbols.includes(nch)) {
                                    tokens.push(ch + nch);
                                    ti += 2;
                                } else {
                                    tokens.push(ch);
                                    ti++;
                                }
                            }
                            for (let tokenIdx = 0; tokenIdx < tokens.length && tokenIdx < grid.chars; tokenIdx++) {
                                const token = tokens[tokenIdx];
                                const cx = colX + cellSize / 2;
                                const cy = drawY + tokenIdx * cellSize + cellSize / 2;
                                if (token.length === 2) {
                                    const halfWidth = fontSize * 0.3;
                                    simCtx.fillText(token[0], cx - halfWidth, cy);
                                    simCtx.fillText(token[1], cx + halfWidth, cy);
                                } else if (needsRotation.includes(token)) {
                                    simCtx.save();
                                    simCtx.translate(cx, cy);
                                    simCtx.rotate(Math.PI / 2);
                                    simCtx.fillText(token, 0, 0);
                                    simCtx.restore();
                                } else if (punctuationChars.includes(token)) {
                                    simCtx.save();
                                    simCtx.textAlign = 'left';
                                    simCtx.textBaseline = 'bottom';
                                    simCtx.fillText(token, colX + cellSize - cellSize * 0.25, drawY + tokenIdx * cellSize + cellSize * 0.25);
                                    simCtx.restore();
                                } else {
                                    simCtx.fillText(token, cx, cy);
                                }
                            }
                        }
                    }
                }

                simCtx.restore();
            }
        }
    }

    /**
     * 見開きモード解除用：見開きページから元のページにオブジェクトを分割
     */
    function splitObjectsFromSpreadPages() {
        if (!window.MojiQDrawingObjects || spreadMapping.length === 0) return;

        // 見開きモードでの1ページのCSSサイズ
        const spreadCssPageWidth = spreadBasePageSize.width * spreadBaseScale;
        const spreadCssPageHeight = spreadBasePageSize.height * spreadBaseScale;

        // 単ページモードでの基準displayWidth/Heightを取得
        // 白紙ページではないページから取得する
        let singlePageDisplayWidth = null;
        let singlePageDisplayHeight = null;

        for (let i = 0; i < state.pageMapping.length; i++) {
            const mapItem = state.pageMapping[i];
            // 白紙ページではなく、displayWidth/Heightが設定されているページを探す
            if (mapItem && !mapItem.isSpreadBlank && mapItem.displayWidth && mapItem.displayHeight) {
                singlePageDisplayWidth = mapItem.displayWidth;
                singlePageDisplayHeight = mapItem.displayHeight;
                break;
            }
        }

        // displayWidth/Heightが見つからない場合はスケーリングなし
        const defaultScaleX = singlePageDisplayWidth ? singlePageDisplayWidth / spreadCssPageWidth : 1;
        const defaultScaleY = singlePageDisplayHeight ? singlePageDisplayHeight / spreadCssPageHeight : 1;

        for (let i = 0; i < spreadMapping.length; i++) {
            const spread = spreadMapping[i];
            const spreadKey = MojiQDrawingObjects.getSpreadPageKey(i);

            // 各ページの単ページ時のdisplayWidth/Heightを取得してスケール比を計算
            let leftScaleX = defaultScaleX, leftScaleY = defaultScaleY;
            let rightScaleX = defaultScaleX, rightScaleY = defaultScaleY;

            if (spread.leftPage !== null) {
                const leftMapItem = state.pageMapping[spread.leftPage - 1];
                // 白紙ページでなく、displayWidth/Heightがある場合はそれを使用
                if (leftMapItem && !leftMapItem.isSpreadBlank && leftMapItem.displayWidth && leftMapItem.displayHeight) {
                    // 見開き座標系 → 単ページ座標系へのスケール（逆数）
                    leftScaleX = leftMapItem.displayWidth / spreadCssPageWidth;
                    leftScaleY = leftMapItem.displayHeight / spreadCssPageHeight;
                }
            }

            if (spread.rightPage !== null) {
                const rightMapItem = state.pageMapping[spread.rightPage - 1];
                // 白紙ページでなく、displayWidth/Heightがある場合はそれを使用
                if (rightMapItem && !rightMapItem.isSpreadBlank && rightMapItem.displayWidth && rightMapItem.displayHeight) {
                    // 見開き座標系 → 単ページ座標系へのスケール（逆数）
                    rightScaleX = rightMapItem.displayWidth / spreadCssPageWidth;
                    rightScaleY = rightMapItem.displayHeight / spreadCssPageHeight;
                }
            }

            const scaleInfo = {
                leftScaleX: leftScaleX,
                leftScaleY: leftScaleY,
                rightScaleX: rightScaleX,
                rightScaleY: rightScaleY
            };

            MojiQDrawingObjects.splitFromSpreadPage(
                spreadKey,
                spread.leftPage,
                spread.rightPage,
                spreadCssPageWidth,
                spreadCssPageWidth,
                scaleInfo
            );
        }
    }

    /**
     * 見開きキャッシュをクリア
     */
    function clearSpreadCache() {
        spreadPageCache = {};
        spreadCacheReady = false;
        // 単一ページキャッシュもクリア
        if (singlePageCache) singlePageCache.clear();
        cancelPrefetch();
    }

    /**
     * プログレスオーバーレイを表示/非表示（汎用）
     * @param {boolean} show - 表示/非表示
     * @param {string} [title] - タイトルテキスト（オプション）
     */
    function showLoadingOverlay(show, title) {
        const overlay = document.getElementById('loadingOverlay');
        const titleElement = document.getElementById('loadingTitle');
        if (overlay) {
            if (show) {
                if (titleElement && title) {
                    titleElement.textContent = title;
                }
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
            }
        }
    }

    /**
     * プログレスバーを更新（汎用）
     * @param {number} current - 現在の進捗
     * @param {number} total - 総数
     * @param {string} [unit='ページ'] - 単位テキスト
     */
    function updateLoadingProgress(current, total, unit = 'ページ') {
        const progressFill = document.getElementById('loadingProgressFill');
        const progressText = document.getElementById('loadingProgressText');
        if (progressFill) {
            const percent = total > 0 ? (current / total) * 100 : 0;
            progressFill.style.width = percent + '%';
        }
        if (progressText) {
            progressText.textContent = `${current} / ${total} ${unit}`;
        }
    }

    // 見開き用基準ページサイズ（全ページ共通）
    let spreadBasePageSize = { width: 595, height: 842 };

    /**
     * 全ページを事前にキャッシュ（見開き用）
     */
    async function buildSpreadCache() {
        const totalPages = state.totalPages;
        if (totalPages === 0) return;

        // プログレスオーバーレイを表示
        isProcessing = true;
        showLoadingOverlay(true, '見開き表示を準備中...');
        updateLoadingProgress(0, totalPages);

        // キャッシュをリセット
        spreadPageCache = {};
        spreadCacheReady = false;
        // 単一ページキャッシュもクリア（見開きモード移行時）
        if (singlePageCache) singlePageCache.clear();
        cancelPrefetch();

        // コンテナサイズを取得
        if (fixedContainerWidth === null || fixedContainerHeight === null) {
            fixedContainerWidth = canvasArea.clientWidth - 40;
            fixedContainerHeight = canvasArea.clientHeight - 40;
        }

        const containerWidth = fixedContainerWidth;
        const containerHeight = fixedContainerHeight;

        // 1ページ目のサイズを基準にスケールを計算（全ページ共通）
        spreadBasePageSize = await getPageSizeAsync(1);
        const spreadWidth = spreadBasePageSize.width * 2;
        const spreadHeight = spreadBasePageSize.height;
        spreadBaseScale = Math.min(
            containerWidth / spreadWidth,
            containerHeight / spreadHeight
        );

        // キャッシュ用のキャンバスサイズ（全ページ共通）
        const cacheWidth = Math.floor(spreadBasePageSize.width * spreadBaseScale * dpr);
        const cacheHeight = Math.floor(spreadBasePageSize.height * spreadBaseScale * dpr);

        // バッチサイズ: 何ページごとにUIを更新するか
        const BATCH_SIZE = 3;

        // 各ページをレンダリングしてキャッシュ
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            // バッチの開始時にUI更新の機会を与える（フリーズ防止）
            if ((pageNum - 1) % BATCH_SIZE === 0) {
                await nextFrame();
            }

            try {
                const cachedImage = await renderPageForCache(pageNum, cacheWidth, cacheHeight);
                spreadPageCache[pageNum] = cachedImage;
            } catch (e) {
                console.error(`ページ ${pageNum} のキャッシュ作成に失敗:`, e);
            }

            // プログレス更新
            updateLoadingProgress(pageNum, totalPages);

            // バッチの終了時またはページ処理後にUIを更新
            if (pageNum % BATCH_SIZE === 0 || pageNum === totalPages) {
                await nextFrame();
            }
        }

        spreadCacheReady = true;

        // プログレスオーバーレイを非表示
        isProcessing = false;
        showLoadingOverlay(false);
    }

    /**
     * 単一ページをキャッシュ用にレンダリング
     * @param {number} pageNum - ページ番号
     * @param {number} targetWidth - キャッシュキャンバスの幅（固定）
     * @param {number} targetHeight - キャッシュキャンバスの高さ（固定）
     * @returns {Promise<HTMLCanvasElement>} キャッシュ用キャンバス
     */
    async function renderPageForCache(pageNum, targetWidth, targetHeight) {
        const mapItem = state.pageMapping[pageNum - 1];

        // オフスクリーンキャンバスを作成（固定サイズ）
        const cacheCanvas = document.createElement('canvas');
        cacheCanvas.width = targetWidth;
        cacheCanvas.height = targetHeight;
        const cacheCtx = cacheCanvas.getContext('2d');

        // 白で塗りつぶし
        cacheCtx.fillStyle = '#ffffff';
        cacheCtx.fillRect(0, 0, targetWidth, targetHeight);

        if (!mapItem) {
            return cacheCanvas;
        }

        if (mapItem.docIndex === -2) {
            // 画像ページ
            const imgData = imagePageData[mapItem.imageIndex];
            if (imgData) {
                const blob = new Blob([imgData.data], { type: imgData.type === 'png' ? 'image/png' : 'image/jpeg' });
                const url = URL.createObjectURL(blob);
                await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        // 固定サイズに収まるようにアスペクト比を維持して描画
                        const imgAspect = img.width / img.height;
                        const canvasAspect = targetWidth / targetHeight;
                        let drawWidth, drawHeight, drawX, drawY;
                        if (imgAspect > canvasAspect) {
                            drawWidth = targetWidth;
                            drawHeight = targetWidth / imgAspect;
                            drawX = 0;
                            drawY = (targetHeight - drawHeight) / 2;
                        } else {
                            drawHeight = targetHeight;
                            drawWidth = targetHeight * imgAspect;
                            drawX = (targetWidth - drawWidth) / 2;
                            drawY = 0;
                        }
                        cacheCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
                        URL.revokeObjectURL(url);
                        resolve();
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(url);
                        reject(new Error('画像読み込みエラー'));
                    };
                    img.src = url;
                });
            }
        } else if (mapItem.docIndex === -1) {
            // 白紙ページ（既に白で塗りつぶし済み）
        } else {
            // PDFページ
            const targetDoc = state.pdfDocs[mapItem.docIndex];
            if (targetDoc) {
                const page = await targetDoc.getPage(mapItem.pageNum);
                const viewport = page.getViewport({ scale: 1 });

                // 固定サイズに収まるようにスケーリング
                const pageScale = Math.min(
                    targetWidth / viewport.width,
                    targetHeight / viewport.height
                );
                const scaledViewport = page.getViewport({ scale: pageScale });

                // 中央揃えでオフセット計算
                const offsetX = (targetWidth - scaledViewport.width) / 2;
                const offsetY = (targetHeight - scaledViewport.height) / 2;

                cacheCtx.save();
                cacheCtx.translate(offsetX, offsetY);
                await page.render({ canvasContext: cacheCtx, viewport: scaledViewport }).promise;
                cacheCtx.restore();
            }
        }

        // displayWidth/Heightを基準サイズで統一
        mapItem.displayWidth = spreadBasePageSize.width;
        mapItem.displayHeight = spreadBasePageSize.height;

        return cacheCanvas;
    }

    /**
     * キャッシュから見開きを表示
     * @param {number} spreadIndex - 見開きインデックス
     */
    function displaySpreadFromCache(spreadIndex) {
        if (spreadMapping.length === 0) {
            return;
        }
        if (spreadIndex < 0 || spreadIndex >= spreadMapping.length) {
            return;
        }
        // キャッシュが準備できていない場合はrenderSpreadViewにフォールバック
        if (!spreadCacheReady) {
            renderSpreadView(spreadIndex);
            return;
        }

        // 表示処理中フラグをON（外部からのredrawCanvasをブロック）
        spreadDisplaying = true;

        currentSpreadIndex = spreadIndex;
        const spread = spreadMapping[spreadIndex];

        // キャッシュのサイズ（固定、buildSpreadCacheと同じ計算）
        const cacheWidth = Math.floor(spreadBasePageSize.width * spreadBaseScale * dpr);
        const cacheHeight = Math.floor(spreadBasePageSize.height * spreadBaseScale * dpr);

        // キャンバスサイズを設定（見開き2ページ分）
        const canvasWidth = cacheWidth * 2;
        const canvasHeight = cacheHeight;

        bgCanvas.width = mojiqCanvas.width = simCanvas.width = canvasWidth;
        bgCanvas.height = mojiqCanvas.height = simCanvas.height = canvasHeight;

        // 背景を白で塗りつぶし
        const bgContext = bgCanvas.getContext('2d');
        bgContext.fillStyle = '#ffffff';
        bgContext.fillRect(0, 0, canvasWidth, canvasHeight);

        // 左ページを描画
        if (spread.leftPage !== null && spreadPageCache[spread.leftPage]) {
            const leftCache = spreadPageCache[spread.leftPage];
            bgContext.drawImage(leftCache, 0, 0);
        }

        // 右ページを描画（キャッシュサイズ分オフセット）
        if (spread.rightPage !== null && spreadPageCache[spread.rightPage]) {
            const rightCache = spreadPageCache[spread.rightPage];
            bgContext.drawImage(rightCache, cacheWidth, 0);
        }

        // CSS座標系での幅（dprを含まない）
        // 注意: mergeObjectsToSpreadPages()と同じ計算式を使用して丸め誤差を防ぐ
        const cssPageWidth = spreadBasePageSize.width * spreadBaseScale;
        const cssSpreadWidth = canvasWidth / dpr;
        const cssSpreadHeight = canvasHeight / dpr;

        // 見開きメタデータを保存
        state.spreadMetadata = {
            leftOffset: 0,
            rightOffset: cssPageWidth,
            leftWidth: cssPageWidth,
            rightWidth: cssPageWidth,
            scale: spreadBaseScale,
            leftPageNum: spread.leftPage,
            rightPageNum: spread.rightPage,
            canvasWidth: cssSpreadWidth,
            canvasHeight: cssSpreadHeight
        };

        state.baseCSSExtent = { width: cssSpreadWidth, height: cssSpreadHeight };
        state.pdfContentOffset = { x: 0, y: 0 };

        // 描画オブジェクトを再描画
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        // 重要：initContext()の前にcompositeOperationをリセット
        // initContext()はcurrentModeに基づいて設定するため、
        // eraserモードだとdestination-outになり描画が見えなくなる
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.clearRect(0, 0, cssSpreadWidth, cssSpreadHeight);

        // 見開きページのオブジェクトを描画
        if (window.MojiQDrawingRenderer && window.MojiQDrawingObjects) {
            renderSpreadObjectsToContext(ctx, spreadIndex);
        }

        // 写植グリッドを描画（見開きモード対応）
        renderSpreadSimulatorGrids(spread, cssPageWidth);

        // ビューワーモード中はズームを維持、それ以外はリセット
        if (window.MojiQViewerMode && MojiQViewerMode.isActive()) {
            // ビューワーモード中: fitToScreenを直接適用（setTimeoutを使わない）
            MojiQViewerMode.fitToScreen();
            // スクロール位置をリセット（ビューワーモードでも必要）
            if (canvasArea) {
                canvasArea.scrollLeft = 0;
                canvasArea.scrollTop = 0;
            }
        } else {
            // 通常モード: ズームをリセット
            state.currentZoom = 1.0;
            if (window.MojiQZoom) {
                MojiQZoom.updateZoomDisplay();
            }
            // スクロール位置をリセット
            if (canvasArea) {
                canvasArea.scrollLeft = 0;
                canvasArea.scrollTop = 0;
            }
        }

        // ナビゲーション更新（レイアウト再計算後にスライダー位置を同期するためrAFで遅延）
        requestAnimationFrame(() => {
            updateSpreadNavigation();
        });

        // グローバル状態更新
        if (!window.MojiQGlobal) window.MojiQGlobal = {};
        window.MojiQGlobal.pdfLoaded = true;

        // 表示処理中フラグをOFF
        spreadDisplaying = false;
    }

    /**
     * 見開き表示処理中かどうか
     * @returns {boolean}
     */
    function isSpreadDisplaying() {
        return spreadDisplaying;
    }

    /**
     * 見開き用白紙ページを削除（複数対応）
     * 描画オブジェクトがある白紙ページは削除せずに保持する
     */
    function removeSpreadBlankPage() {
        // isSpreadBlankフラグが付いたページをすべて検索
        const blankIndices = [];
        for (let i = 0; i < state.pageMapping.length; i++) {
            if (state.pageMapping[i].isSpreadBlank) {
                blankIndices.push(i);
            }
        }

        if (blankIndices.length === 0) return;

        // 削除対象を特定（描画オブジェクトがない白紙ページのみ削除）
        const indicesToDelete = [];
        for (let i = 0; i < blankIndices.length; i++) {
            const blankIndex = blankIndices[i];
            const blankPageNum = blankIndex + 1;

            // 描画オブジェクトがあるかチェック
            let hasDrawings = false;
            if (window.MojiQDrawingObjects) {
                const objects = MojiQDrawingObjects.getPageObjects(blankPageNum);
                hasDrawings = objects && objects.length > 0;
            }

            if (hasDrawings) {
                // 描画がある場合はisSpreadBlankフラグを外して通常のページとして扱う
                // ただし、docIndex: -1 のままなので白紙ページとして表示される
                state.pageMapping[blankIndex].isSpreadBlank = false;
            } else {
                // 描画がない場合は削除対象
                indicesToDelete.push(blankIndex);
            }
        }

        // 後ろから削除（インデックスがずれないように）
        for (let i = indicesToDelete.length - 1; i >= 0; i--) {
            const blankIndex = indicesToDelete[i];
            const blankPageNum = blankIndex + 1;

            // pageMappingから削除
            state.pageMapping.splice(blankIndex, 1);

            // 描画オブジェクトのページ番号をシフト
            if (window.MojiQDrawingObjects) {
                MojiQDrawingObjects.clearPageObjects(blankPageNum);
                // shiftPageNumbersAfterDeleteは0-based indexを受け取る
                MojiQDrawingObjects.shiftPageNumbersAfterDelete(blankIndex);
            }

            // 現在のページ番号を調整
            if (state.currentPageNum > blankPageNum) {
                state.currentPageNum--;
            } else if (state.currentPageNum === blankPageNum) {
                state.currentPageNum = Math.max(1, blankPageNum - 1);
            }
        }

        state.totalPages = state.pageMapping.length;
        spreadBlankPagesAdded = { front: 0, back: 0 };
    }

    /**
     * 見開きモード中にページ追加/削除があった場合に見開きを再構築する
     * @param {number} targetPageNum - 表示対象のページ番号（元のページ番号）
     */
    async function rebuildSpreadAfterPageChange(targetPageNum) {
        if (!spreadViewMode) return;

        // グリッドスケールを単ページ用に戻す
        scaleSimulatorGridsForSpread(false);

        // 描画オブジェクトを見開きから単ページに分割
        splitObjectsFromSpreadPages();

        // 既存の見開き用白紙ページを削除
        removeSpreadBlankPage();

        // 見開きオブジェクトデータをクリア
        if (window.MojiQDrawingObjects) {
            MojiQDrawingObjects.clearAllSpreadPages();
        }

        // キャッシュをクリア
        clearSpreadCache();
        spreadMapping = [];
        state.spreadMetadata = null;

        // コンテナサイズをリセット
        resetContainerSize();

        // 見開きを再生成
        generateSpreadMapping();
        await buildSpreadCache();

        // グリッドスケールを見開き用に再調整
        scaleSimulatorGridsForSpread(true);

        // 描画オブジェクトを再統合
        mergeObjectsToSpreadPages();

        // 対象ページの見開きインデックスを計算して表示
        currentSpreadIndex = getSpreadIndexFromPage(targetPageNum);
        displaySpreadFromCache(currentSpreadIndex);
    }

    /**
     * 見開きモードかどうかを取得
     * @returns {boolean}
     */
    function isSpreadViewMode() {
        return spreadViewMode;
    }

    /**
     * 見開きレンダリング中かどうかを返す
     * @returns {boolean}
     */
    function isSpreadRenderingNow() {
        // キャッシュ方式では、キャッシュ準備中の場合にtrueを返す
        return spreadViewMode && !spreadCacheReady;
    }

    /**
     * 現在の見開きインデックスを取得
     * @returns {number}
     */
    function getCurrentSpreadIndex() {
        return currentSpreadIndex;
    }

    /**
     * 現在の見開き情報を取得
     * @returns {{leftPage: number|null, rightPage: number|null}|null}
     */
    function getCurrentSpread() {
        if (!spreadViewMode || spreadMapping.length === 0) return null;
        return spreadMapping[currentSpreadIndex] || null;
    }

    /**
     * 見開きマッピングを取得
     * @returns {Array}
     */
    function getSpreadMapping() {
        return spreadMapping;
    }

    /**
     * 見開きメタデータを取得
     * @returns {object|null}
     */
    function getSpreadMetadata() {
        return state.spreadMetadata || null;
    }

    /**
     * 見開きモードで次の見開きへ移動（右開き仕様: 左ボタンで呼ばれる）
     */
    function prevSpread() {
        if (!spreadViewMode || !spreadCacheReady) return;
        // 次の見開きへ = インデックスを増やす
        if (currentSpreadIndex < spreadMapping.length - 1) {
            displaySpreadFromCache(currentSpreadIndex + 1);
        }
    }

    /**
     * 見開きモードで前の見開きへ移動（右開き仕様: 右ボタンで呼ばれる）
     */
    function nextSpread() {
        if (!spreadViewMode || !spreadCacheReady) return;
        // 前の見開きへ = インデックスを減らす
        if (currentSpreadIndex > 0) {
            displaySpreadFromCache(currentSpreadIndex - 1);
        }
    }

    /**
     * ページ番号から見開きインデックスを取得
     * @param {number} pageNum - ページ番号
     * @returns {number} - 見開きインデックス
     */
    function getSpreadIndexFromPage(pageNum) {
        for (let i = 0; i < spreadMapping.length; i++) {
            const spread = spreadMapping[i];
            if (spread.leftPage === pageNum || spread.rightPage === pageNum) {
                return i;
            }
        }
        return 0; // 見つからない場合は最初の見開き
    }

    /**
     * クリック座標から対象ページを特定（見開きモード用）
     * @param {number} x - キャンバス上のX座標（CSS座標）
     * @returns {{pageNum: number, localX: number, isLeftPage: boolean}}
     */
    function getSpreadPageInfo(x) {
        if (!spreadViewMode || !state.spreadMetadata) {
            return { pageNum: state.currentPageNum, localX: x, isLeftPage: false };
        }

        const meta = state.spreadMetadata;
        const spread = spreadMapping[currentSpreadIndex];

        if (x < meta.leftWidth) {
            // 左ページ上の座標
            return {
                pageNum: spread.leftPage,
                localX: x,
                isLeftPage: true
            };
        } else {
            // 右ページ上の座標
            return {
                pageNum: spread.rightPage,
                localX: x - meta.rightOffset,
                isLeftPage: false
            };
        }
    }

    /**
     * 綴じ方向を設定
     * @param {string} direction - 'right' または 'left'
     */
    function setSpreadBindingDirection(direction) {
        if (direction === 'right' || direction === 'left') {
            spreadBindingDirection = direction;
        }
    }

    /**
     * 綴じ方向を取得
     * @returns {string} - 'right' または 'left'
     */
    function getSpreadBindingDirection() {
        return spreadBindingDirection;
    }

    /**
     * 現在の見開きページキーを取得（見開きモードでない場合はnull）
     * @returns {string|null} - 見開きページキー（例：'spread_0'）
     */
    function getCurrentSpreadPageKey() {
        if (!spreadViewMode || !window.MojiQDrawingObjects) return null;
        return MojiQDrawingObjects.getSpreadPageKey(currentSpreadIndex);
    }

    return {
        init,
        cleanup,  // メモリリーク対策: イベントリスナー解除
        // 処理中フラグ（保存・読込中のファイルオープン防止用）
        setProcessing: (value) => { isProcessing = !!value; },
        isProcessingNow: () => isProcessing,
        renderPage,
        loadPdfFromFile,
        loadFilesFromInput,  // 画像/PDF統合読み込み
        loadImagesFromFiles, // 複数画像読み込み
        loadPdfFromPath,  // 大きなファイル対応（ドラッグ＆ドロップ起動用）
        loadImageFromPath,  // 画像ファイル読み込み（ドラッグ＆ドロップ起動用）
        loadImagesFromPaths, // 複数画像ファイル読み込み（ドラッグ＆ドロップ起動用）
        loadPdfFromBase64,
        savePdf,
        saveTransparentPdf,
        exportPdfToPath,
        generatePdfForPrint,  // 印刷用PDF生成
        getPageKey,
        toggleBgTransparentMode,
        isBgTransparent,
        applyBgOpacity,
        getBgOpacity,
        triggerInsertPdf,
        updateSaveButtonState,  // 保存ボタン状態更新
        getImagePageData,  // 画像ページデータ取得
        renderThumbnail,   // サムネイル用レンダリング
        renderSpreadThumbnail,  // 見開きサムネイル用レンダリング
        resetContainerSize,  // コンテナサイズリセット（ビューワーモード用）
        // 見開きモード関連
        toggleSpreadViewMode,
        isSpreadViewMode,
        isSpreadRenderingNow,  // 見開きレンダリング中かどうか
        isSpreadDisplaying,    // 見開き表示処理中かどうか
        renderSpreadView,
        getCurrentSpreadIndex,
        getCurrentSpread,      // 現在の見開き情報取得
        getSpreadMapping,
        getSpreadMetadata,
        nextSpread,
        prevSpread,
        displaySpreadFromCache,  // キャッシュからの高速表示（ページ移動用）
        getSpreadPageInfo,
        setSpreadBindingDirection,  // 綴じ方向設定
        getSpreadBindingDirection,  // 綴じ方向取得
        getCurrentSpreadPageKey,    // 現在の見開きページキー取得
        rebuildSpreadAfterPageChange,  // ページ追加/削除後の見開き再構築
        clearPageCache: () => { if (singlePageCache) singlePageCache.clear(); },
        invalidatePageCache,  // 指定ページのキャッシュ無効化（描画変更時用）
        // 変更フラグ関連（上書き保存時のスキップ判定用）
        markAsChanged: () => { hasUnsavedChanges = true; },
        hasChanges: () => hasUnsavedChanges,
        clearChanges: () => { hasUnsavedChanges = false; },
        // 上書き保存可否判定用（ファイルパスが設定されているか）
        canOverwriteSave: () => !!currentSaveFilePath,
        // 名前を付けて保存（常に新規ダイアログを表示）
        saveAsNew
    };
})();
