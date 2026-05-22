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

        // rectの検証（不正なPDFデータ対策）
        if (!Array.isArray(rect) || rect.length < 4 ||
            !Number.isFinite(rect[0]) || !Number.isFinite(rect[3])) {
            console.warn('[MojiQ] 不正な注釈rect、スキップ:', rect);
            return null;
        }

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

        // ゼロ除算防止
        if (!viewport.width || !viewport.height || viewport.width <= 0 || viewport.height <= 0) {
            console.warn('[MojiQ] 無効なviewportサイズ、注釈スキップ:', viewport.width, viewport.height);
            return [];
        }

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
     * 注釈が確認済みリストに含まれるかチェック
     * @param {Object} obj - MojiQテキストオブジェクト
     * @param {number} pageNum - ページ番号
     * @param {Array} checkedComments - 確認済みコメントリスト
     * @returns {boolean} 確認済みの場合true
     */
    function isCheckedAnnotation(obj, pageNum, checkedComments) {
        for (const checked of checkedComments) {
            if (checked.pdfPage !== pageNum) continue;
            // テキスト内容が一致
            if (obj.text === checked.contents) {
                return true;
            }
            // 座標で判定（テキストが編集されている可能性を考慮）
            if (checked.canvasRect && obj.startPos) {
                const dx = Math.abs(obj.startPos.x - checked.canvasRect.x);
                const dy = Math.abs(obj.startPos.y - checked.canvasRect.y);
                if (dx < 30 && dy < 30) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 注釈がMojiQで既に処理済み（ラスタライズ済み）かチェック
     * MojiQTextsメタデータに含まれている注釈はスキップすべき
     *
     * ※ 同じ「内容」かつ同じ「位置」の両方が揃ったときだけ「再投入」とみなしてスキップする。
     *   どちらか片方（=OR）で判定すると、Acrobatで新規追加した注釈が過去の
     *   MojiQテキストと内容（例: 「修正」「OK」「!?」など短くてよく出るフレーズ）が
     *   一致した瞬間に位置に関係なく除外されてしまう、または逆に内容無関係で
     *   30px以内にたまたま入っただけで除外されてしまうため不適切。
     *
     * @param {Object} obj - MojiQテキストオブジェクト
     * @param {number} pageNum - ページ番号
     * @param {Array} mojiQTexts - MojiQテキストリスト（メタデータから読み込み）
     * @param {number} displayWidth - 現在の表示幅
     * @param {number} displayHeight - 現在の表示高さ
     * @returns {boolean} 既に処理済みの場合true
     */
    function isMojiQProcessedAnnotation(obj, pageNum, mojiQTexts, displayWidth, displayHeight) {
        if (!mojiQTexts || mojiQTexts.length === 0) return false;
        if (!obj || !obj.startPos) return false;

        const POS_TOLERANCE_PX = 30;

        for (const mojiQ of mojiQTexts) {
            if (mojiQ.pdfPage !== pageNum) continue;

            // 内容と位置の「両方」が一致するときだけスキップ
            const contentsMatch = obj.text === mojiQ.contents;
            if (!contentsMatch) continue;
            if (!mojiQ.canvasRect) continue;

            // 保存時の座標を現在の表示サイズに変換
            const savedWidth = mojiQ.displayWidth || displayWidth;
            const savedHeight = mojiQ.displayHeight || displayHeight;
            const scaleX = savedWidth > 0 ? (displayWidth / savedWidth) : 1;
            const scaleY = savedHeight > 0 ? (displayHeight / savedHeight) : 1;
            const scaledX = mojiQ.canvasRect.x * scaleX;
            const scaledY = mojiQ.canvasRect.y * scaleY;

            const dx = Math.abs(obj.startPos.x - scaledX);
            const dy = Math.abs(obj.startPos.y - scaledY);
            if (dx < POS_TOLERANCE_PX && dy < POS_TOLERANCE_PX) {
                return true;
            }
        }
        return false;
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

        // pageMappingから表示サイズを取得するための参照
        const PdfManager = window.MojiQPdfManager;

        // 確認済みコメント情報を取得（済スタンプ付きコメントはスキップ）
        let checkedComments = null;
        if (PdfManager && PdfManager.getLoadedCheckedComments) {
            checkedComments = PdfManager.getLoadedCheckedComments();
        }

        // MojiQテキスト情報を取得（既にラスタライズ済みの注釈はスキップ）
        let mojiQTexts = null;
        if (PdfManager && PdfManager.getLoadedMojiQTexts) {
            mojiQTexts = PdfManager.getLoadedMojiQTexts();
        }

        let totalAnnotations = 0;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            try {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 1 });

                // pageMappingにdisplayWidthがあればそれを使用（座標計算の一貫性のため）
                let displayWidth, displayHeight;
                const pageSize = PdfManager && PdfManager.getDisplayPageSize ? PdfManager.getDisplayPageSize(pageNum) : null;
                if (pageSize && pageSize.width && pageSize.height) {
                    displayWidth = pageSize.width;
                    displayHeight = pageSize.height;
                } else {
                    // フォールバック: 表示サイズを計算（renderPageと同じロジック）
                    const scale = Math.min(
                        width / viewport.width,
                        height / viewport.height
                    );
                    displayWidth = viewport.width * scale;
                    displayHeight = viewport.height * scale;
                }

                const objects = await extractPdfAnnotations(page, displayWidth, displayHeight);

                for (const obj of objects) {
                    // 確認済みコメントに該当する場合はスキップ（ラスタライズ済みのため）
                    if (checkedComments && isCheckedAnnotation(obj, pageNum, checkedComments)) {
                        continue;
                    }
                    // MojiQで既に処理済みの注釈はスキップ（ラスタライズ済みのため）
                    // ただし、Acrobatで新しく追加された注釈はオブジェクト化する
                    if (mojiQTexts && isMojiQProcessedAnnotation(obj, pageNum, mojiQTexts, displayWidth, displayHeight)) {
                        continue;
                    }
                    window.MojiQDrawingObjects.addObject(pageNum, obj);
                }

                if (objects.length > 0) {
                    totalAnnotations += objects.length;
                }
            } catch (e) {
                console.warn('[MojiQ PdfAnnotationLoader] ページ ' + pageNum + ' の注釈読み込みに失敗:', e);
            }
        }

        // コメントテキスト非表示ボタンの有効/無効状態を更新
        if (window.MojiQTextLayerManager && window.MojiQTextLayerManager.updateButtonAvailability) {
            window.MojiQTextLayerManager.updateButtonAvailability();
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
