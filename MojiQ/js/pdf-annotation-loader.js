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

        // 白に近い色（輝度が高すぎる）場合は赤色にフォールバック
        // 白い縁取りの上に白いテキストだと見えなくなるため
        const brightness = (r + g + b) / 3;
        if (brightness > 240) {
            return '#ff0000';
        }

        return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    }

    /**
     * テキストの幅と高さを計算
     * @param {string} text - テキスト内容
     * @param {number} fontSize - フォントサイズ
     * @returns {{width: number, height: number}}
     */
    function calculateTextBounds(text, fontSize) {
        const lines = (text || '').split('\n');
        const lineHeight = fontSize * 1.2;

        // 各行の幅を計算（半角文字は0.6、全角は1.0）
        let maxWidth = 0;
        for (const line of lines) {
            let width = 0;
            for (const char of line) {
                if (char.charCodeAt(0) < 128) {
                    width += fontSize * 0.6;
                } else {
                    width += fontSize;
                }
            }
            maxWidth = Math.max(maxWidth, width);
        }

        const totalHeight = lines.length * lineHeight;
        return { width: maxWidth || fontSize, height: totalHeight || lineHeight };
    }

    /**
     * テキスト位置をキャンバス境界内に収める
     * @param {number} x - テキスト開始X座標
     * @param {number} y - テキスト開始Y座標
     * @param {number} textWidth - テキストの幅
     * @param {number} textHeight - テキストの高さ
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @returns {{x: number, y: number}}
     */
    function clampTextPosition(x, y, textWidth, textHeight, canvasWidth, canvasHeight) {
        const margin = 5;
        let newX = x;
        let newY = y;

        // 右端チェック: テキストが右端をはみ出す場合、左にシフト
        if (newX + textWidth > canvasWidth - margin) {
            newX = canvasWidth - textWidth - margin;
        }

        // 左端チェック
        if (newX < margin) {
            newX = margin;
        }

        // 下端チェック: テキストが下端をはみ出す場合、上にシフト
        if (newY + textHeight > canvasHeight - margin) {
            newY = canvasHeight - textHeight - margin;
        }

        // 上端チェック
        if (newY < margin) {
            newY = margin;
        }

        return { x: newX, y: newY };
    }

    /**
     * PDF注釈をMojiQテキストオブジェクトに変換
     * @param {Object} annot - PDF.jsの注釈オブジェクト
     * @param {number} pdfHeight - PDFページの高さ
     * @param {number} scaleX - X方向スケール係数
     * @param {number} scaleY - Y方向スケール係数
     * @param {number} displayWidth - 表示時のページ幅
     * @param {number} displayHeight - 表示時のページ高さ
     * @returns {Object|null} MojiQテキストオブジェクト、変換不可の場合null
     */
    function convertPdfAnnotationToTextObject(annot, pdfHeight, scaleX, scaleY, displayWidth, displayHeight) {
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

        // テキストサイズを計算
        const textBounds = calculateTextBounds(annot.contents, fontSize);

        // 境界内に収める
        const clampedPos = clampTextPosition(
            pos.x, pos.y,
            textBounds.width, textBounds.height,
            displayWidth, displayHeight
        );

        return {
            type: 'text',
            text: annot.contents,
            startPos: { x: clampedPos.x, y: clampedPos.y },
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
                scaleY,
                displayWidth,
                displayHeight
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
