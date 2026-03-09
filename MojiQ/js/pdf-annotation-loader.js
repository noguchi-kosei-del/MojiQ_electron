/**
 * MojiQ PDF Annotation Loader - PDF注釈読み込みモジュール
 * PDFの注釈をMojiQ描画オブジェクトに変換
 */
window.MojiQPdfAnnotationLoader = (function() {
    'use strict';

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
     * @param {number} containerWidth - コンテナ幅
     * @param {number} containerHeight - コンテナ高さ
     */
    async function loadPdfAnnotationsForAllPages(pdf, containerWidth, containerHeight) {
        // nullチェック - デフォルト値を使用（A4サイズ相当）
        const width = containerWidth || 595;
        const height = containerHeight || 842;

        let totalAnnotations = 0;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            try {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 1 });

                // 表示サイズを計算（renderPageと同じロジック）
                const scale = Math.min(
                    width / viewport.width,
                    height / viewport.height
                );
                const displayWidth = viewport.width * scale;
                const displayHeight = viewport.height * scale;

                const objects = await extractPdfAnnotations(page, displayWidth, displayHeight);

                for (const obj of objects) {
                    window.MojiQDrawingObjects.addObject(pageNum, obj);
                }

                if (objects.length > 0) {
                    totalAnnotations += objects.length;
                }
            } catch (e) {
                console.warn('[MojiQ PdfAnnotationLoader] ページ ' + pageNum + ' の注釈読み込みに失敗:', e);
            }
        }
    }

    // --- 公開API ---
    return {
        loadPdfAnnotationsForAllPages: loadPdfAnnotationsForAllPages,
        extractPdfAnnotations: extractPdfAnnotations,
        pdfToMojiQCoordinates: pdfToMojiQCoordinates,
        pdfColorToHex: pdfColorToHex
    };
})();
