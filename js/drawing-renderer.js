/**
 * MojiQ Drawing Renderer - 描画レンダラーモジュール
 * オブジェクトからキャンバスへの描画を担当
 */
window.MojiQDrawingRenderer = (function() {
    'use strict';

    // 定数への参照
    const Constants = window.MojiQConstants;

    // 選択ハンドル関連の定数（Constantsから取得、フォールバック値あり）
    const HANDLE_SIZE = Constants ? Constants.SELECTION.HANDLE_SIZE : 8;
    const SELECTION_COLOR = Constants ? Constants.COLORS.SELECTION : '#2196F3';
    const SELECTION_HANDLE_COLOR = Constants ? Constants.COLORS.SELECTION_HANDLE : '#FFFFFF';

    // 削除ボタン関連の定数
    const DELETE_BUTTON_SIZE = 24;  // 削除ボタンのサイズ
    const DELETE_BUTTON_OFFSET = 8; // 選択枠からのオフセット

    // ビューポートカリング設定（定数から取得）
    const cullingConfig = {
        enabled: Constants ? Constants.CULLING.ENABLED : true,
        margin: Constants ? Constants.CULLING.MARGIN : 100,
        debugMode: false
    };

    // カリング統計情報
    const cullingStats = {
        totalObjects: 0,
        renderedObjects: 0,
        culledObjects: 0,
        lastRenderTime: 0
    };

    // --- ビューポートカリング関連関数 ---

    /**
     * 現在のビューポート（表示領域）を取得
     * @returns {Object} { x, y, width, height } キャンバス座標系
     */
    function getVisibleViewport() {
        const canvasArea = document.getElementById('canvas-area');
        if (!canvasArea) {
            return null;
        }

        // スクロール位置とビューポートサイズを取得
        const scrollLeft = canvasArea.scrollLeft;
        const scrollTop = canvasArea.scrollTop;
        const viewWidth = canvasArea.clientWidth;
        const viewHeight = canvasArea.clientHeight;

        // ズーム倍率を取得
        let zoom = 1.0;
        if (window.MojiQStore) {
            zoom = window.MojiQStore.get('canvas.currentZoom') || 1.0;
        } else if (window.MojiQScript && window.MojiQScript.getZoom) {
            zoom = window.MojiQScript.getZoom();
        }

        // キャンバス座標系に変換（ズームを考慮）
        return {
            x: scrollLeft / zoom,
            y: scrollTop / zoom,
            width: viewWidth / zoom,
            height: viewHeight / zoom
        };
    }

    /**
     * 2つの矩形が交差するかを判定
     * @param {Object} rect1 - { x, y, width, height }
     * @param {Object} rect2 - { x, y, width, height }
     * @returns {boolean}
     */
    function intersectsViewport(bounds, viewport) {
        if (!viewport || !bounds) return true; // ビューポート情報がなければ描画

        // マージンを追加
        const margin = cullingConfig.margin;
        const expandedViewport = {
            x: viewport.x - margin,
            y: viewport.y - margin,
            width: viewport.width + margin * 2,
            height: viewport.height + margin * 2
        };

        // 交差判定
        return !(
            bounds.x + bounds.width < expandedViewport.x ||
            bounds.x > expandedViewport.x + expandedViewport.width ||
            bounds.y + bounds.height < expandedViewport.y ||
            bounds.y > expandedViewport.y + expandedViewport.height
        );
    }

    /**
     * オブジェクトがビューポート内にあるかを判定
     * @param {Object} obj - 描画オブジェクト
     * @param {Object} viewport - ビューポート { x, y, width, height }
     * @returns {boolean}
     */
    function isObjectVisible(obj, viewport) {
        if (!cullingConfig.enabled || !viewport) return true;

        const bounds = getBounds(obj);
        return intersectsViewport(bounds, viewport);
    }

    // --- ヘルパー関数 ---

    /**
     * オブジェクトのバウンディングボックスを取得
     */
    function getBounds(obj) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        switch (obj.type) {
            case 'line':
            case 'arrow':
            case 'doubleArrow':
            case 'doubleArrowAnnotated':
                minX = Math.min(obj.startPos.x, obj.endPos.x);
                maxX = Math.max(obj.startPos.x, obj.endPos.x);
                minY = Math.min(obj.startPos.y, obj.endPos.y);
                maxY = Math.max(obj.startPos.y, obj.endPos.y);
                break;

            case 'rect':
                minX = Math.min(obj.startPos.x, obj.endPos.x);
                maxX = Math.max(obj.startPos.x, obj.endPos.x);
                minY = Math.min(obj.startPos.y, obj.endPos.y);
                maxY = Math.max(obj.startPos.y, obj.endPos.y);
                break;

            case 'labeledRect':
                minX = Math.min(obj.startPos.x, obj.endPos.x);
                maxX = Math.max(obj.startPos.x, obj.endPos.x);
                minY = Math.min(obj.startPos.y, obj.endPos.y);
                maxY = Math.max(obj.startPos.y, obj.endPos.y);
                // 引出線がある場合はその範囲も含める
                if (obj.leaderLine) {
                    minX = Math.min(minX, obj.leaderLine.start.x, obj.leaderLine.end.x);
                    maxX = Math.max(maxX, obj.leaderLine.start.x, obj.leaderLine.end.x);
                    minY = Math.min(minY, obj.leaderLine.start.y, obj.leaderLine.end.y);
                    maxY = Math.max(maxY, obj.leaderLine.start.y, obj.leaderLine.end.y);
                }
                break;

            case 'fontLabel':
                // 枠線部分
                minX = Math.min(obj.startPos.x, obj.endPos.x);
                maxX = Math.max(obj.startPos.x, obj.endPos.x);
                minY = Math.min(obj.startPos.y, obj.endPos.y);
                maxY = Math.max(obj.startPos.y, obj.endPos.y);
                // フォント名ラベル部分も含める
                if (obj.textX !== undefined && obj.textY !== undefined) {
                    const fontSize = obj.fontSize || 12;
                    const fontName = obj.fontName || '';
                    const textWidth = fontName.length * fontSize * 0.7; // 概算
                    if (obj.textAlign === 'left') {
                        maxX = Math.max(maxX, obj.textX + textWidth);
                    } else {
                        minX = Math.min(minX, obj.textX - textWidth);
                    }
                    minY = Math.min(minY, obj.textY - fontSize);
                    maxY = Math.max(maxY, obj.textY + fontSize);
                }
                break;

            case 'ellipse':
            case 'semicircle':
            case 'chevron':
            case 'lshape':
            case 'zshape':
            case 'bracket':
            case 'rectSymbolStamp':
            case 'triangleSymbolStamp':
                const w = Math.abs(obj.endPos.x - obj.startPos.x);
                const h = Math.abs(obj.endPos.y - obj.startPos.y);
                const cx = obj.startPos.x + (obj.endPos.x - obj.startPos.x) / 2;
                const cy = obj.startPos.y + (obj.endPos.y - obj.startPos.y) / 2;
                minX = cx - w / 2;
                maxX = cx + w / 2;
                minY = cy - h / 2;
                maxY = cy + h / 2;
                break;

            case 'pen':
            case 'marker':
            case 'eraser':
            case 'polyline':
                if (obj.points && obj.points.length > 0) {
                    obj.points.forEach(p => {
                        minX = Math.min(minX, p.x);
                        maxX = Math.max(maxX, p.x);
                        minY = Math.min(minY, p.y);
                        maxY = Math.max(maxY, p.y);
                    });
                }
                break;

            case 'text':
                const fontSize = obj.fontSize || 16;
                const text = obj.text || '';
                const lines = text.split('\n');
                const x = obj.startPos.x;
                const y = obj.startPos.y;

                if (obj.isVertical) {
                    // 縦書きの場合
                    const lineHeight = fontSize * 1.1;
                    // 各行の文字数（Unicode対応）
                    const charCounts = lines.map(line => Array.from(line).length);
                    const maxCharsInLine = Math.max(...charCounts, 1);
                    const textHeight = maxCharsInLine * fontSize;
                    const totalWidth = Math.max(lines.length, 1) * lineHeight;

                    // 縦書きは右から左に進むので、startPos.xが右端
                    minX = x - totalWidth;
                    maxX = x + fontSize / 2;
                    minY = y - fontSize / 2;
                    maxY = y + textHeight + fontSize / 2;
                } else {
                    // 横書きの場合
                    // textBaseline: 'top' なので y がテキストの上端
                    const lineHeight = fontSize * 1.2;
                    // 文字幅を推定（日本語は全角なので fontSize に近い）
                    const charWidths = lines.map(line => {
                        let width = 0;
                        for (const char of line) {
                            // ASCII文字は半角、それ以外は全角として計算
                            if (char.charCodeAt(0) < 128) {
                                width += fontSize * 0.6;
                            } else {
                                width += fontSize;
                            }
                        }
                        return width;
                    });
                    const maxLineWidth = Math.max(...charWidths, fontSize);
                    const textHeight = lines.length * lineHeight;

                    if (obj.align === 'right') {
                        minX = x - maxLineWidth;
                        maxX = x;
                    } else {
                        minX = x;
                        maxX = x + maxLineWidth;
                    }
                    minY = y;
                    maxY = y + textHeight;
                }

                // 引出線がある場合はその領域も含める
                if (obj.leaderLine) {
                    if (obj.leaderLine.start) {
                        minX = Math.min(minX, obj.leaderLine.start.x);
                        maxX = Math.max(maxX, obj.leaderLine.start.x);
                        minY = Math.min(minY, obj.leaderLine.start.y);
                        maxY = Math.max(maxY, obj.leaderLine.start.y);
                    }
                    if (obj.leaderLine.end) {
                        minX = Math.min(minX, obj.leaderLine.end.x);
                        maxX = Math.max(maxX, obj.leaderLine.end.x);
                        minY = Math.min(minY, obj.leaderLine.end.y);
                        maxY = Math.max(maxY, obj.leaderLine.end.y);
                    }
                }
                break;

            case 'image':
                minX = obj.startPos.x;
                minY = obj.startPos.y;
                maxX = obj.endPos.x;
                maxY = obj.endPos.y;
                break;

            case 'doneStamp':
                // 済スタンプは中心位置からサイズで計算
                const stampSize = obj.size || 28;
                const halfSize = stampSize / 2;
                minX = obj.startPos.x - halfSize;
                maxX = obj.startPos.x + halfSize;
                minY = obj.startPos.y - halfSize;
                maxY = obj.startPos.y + halfSize;
                break;

            case 'komojiStamp':
                // 小文字スタンプは中心位置からサイズで計算
                const komojiStampSize = obj.size || 28;
                const komojiHalfSize = komojiStampSize / 2;
                minX = obj.startPos.x - komojiHalfSize;
                maxX = obj.startPos.x + komojiHalfSize;
                minY = obj.startPos.y - komojiHalfSize;
                maxY = obj.startPos.y + komojiHalfSize;
                break;

            case 'rubyStamp':
                // ルビスタンプは角丸長方形なので幅と高さが異なる
                const rubySize = obj.size || 28;
                const rubyWidth = rubySize * 1.8 / 2;
                const rubyHeight = rubySize * 0.9 / 2;
                minX = obj.startPos.x - rubyWidth;
                maxX = obj.startPos.x + rubyWidth;
                minY = obj.startPos.y - rubyHeight;
                maxY = obj.startPos.y + rubyHeight;
                break;

            case 'toruStamp':
                // トルスタンプは角丸長方形なので幅と高さが異なる
                const toruSize = obj.size || 28;
                const toruWidth = toruSize * 1.8 / 2;
                const toruHeight = toruSize * 0.9 / 2;
                minX = obj.startPos.x - toruWidth;
                maxX = obj.startPos.x + toruWidth;
                minY = obj.startPos.y - toruHeight;
                maxY = obj.startPos.y + toruHeight;
                break;

            case 'torutsumeStamp':
                // トルツメスタンプは文字が長いので幅を広く
                const torutsumeSize = obj.size || 28;
                const torutsumeWidth = torutsumeSize * 2.5 / 2;
                const torutsumeHeight = torutsumeSize * 0.9 / 2;
                minX = obj.startPos.x - torutsumeWidth;
                maxX = obj.startPos.x + torutsumeWidth;
                minY = obj.startPos.y - torutsumeHeight;
                maxY = obj.startPos.y + torutsumeHeight;
                break;

            case 'torumamaStamp':
                // トルママスタンプは文字が長いので幅を広く
                const torumamaSize = obj.size || 28;
                const torumamaWidth = torumamaSize * 2.5 / 2;
                const torumamaHeight = torumamaSize * 0.9 / 2;
                minX = obj.startPos.x - torumamaWidth;
                maxX = obj.startPos.x + torumamaWidth;
                minY = obj.startPos.y - torumamaHeight;
                maxY = obj.startPos.y + torumamaHeight;
                break;

            case 'zenkakuakiStamp':
                // 全角アキスタンプは文字が長いので幅を広く
                const zenkakuakiSize = obj.size || 28;
                const zenkakuakiWidth = zenkakuakiSize * 3.0 / 2;
                const zenkakuakiHeight = zenkakuakiSize * 0.9 / 2;
                minX = obj.startPos.x - zenkakuakiWidth;
                maxX = obj.startPos.x + zenkakuakiWidth;
                minY = obj.startPos.y - zenkakuakiHeight;
                maxY = obj.startPos.y + zenkakuakiHeight;
                break;

            case 'nibunakiStamp':
                // 半角アキスタンプ
                const nibunakiSize = obj.size || 28;
                const nibunakiWidth = nibunakiSize * 3.0 / 2;
                const nibunakiHeight = nibunakiSize * 0.9 / 2;
                minX = obj.startPos.x - nibunakiWidth;
                maxX = obj.startPos.x + nibunakiWidth;
                minY = obj.startPos.y - nibunakiHeight;
                maxY = obj.startPos.y + nibunakiHeight;
                break;

            case 'shibunakiStamp':
                // 四分アキスタンプ
                const shibunakiSize = obj.size || 28;
                const shibunakiWidth = shibunakiSize * 3.0 / 2;
                const shibunakiHeight = shibunakiSize * 0.9 / 2;
                minX = obj.startPos.x - shibunakiWidth;
                maxX = obj.startPos.x + shibunakiWidth;
                minY = obj.startPos.y - shibunakiHeight;
                maxY = obj.startPos.y + shibunakiHeight;
                break;

            case 'kaigyouStamp':
                // 改行スタンプ
                const kaigyouSize = obj.size || 28;
                const kaigyouWidth = kaigyouSize * 1.5 / 2;
                const kaigyouHeight = kaigyouSize * 0.9 / 2;
                minX = obj.startPos.x - kaigyouWidth;
                maxX = obj.startPos.x + kaigyouWidth;
                minY = obj.startPos.y - kaigyouHeight;
                maxY = obj.startPos.y + kaigyouHeight;
                break;

            default:
                if (obj.startPos) {
                    minX = obj.startPos.x;
                    minY = obj.startPos.y;
                }
                if (obj.endPos) {
                    maxX = obj.endPos.x;
                    maxY = obj.endPos.y;
                }
        }

        // 線の太さを考慮
        const padding = (obj.lineWidth || 2) / 2 + 2;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        // アノテーションがある場合はその領域も含める
        if (obj.annotation) {
            const ann = obj.annotation;
            const fontSize = ann.fontSize || 16;
            const textWidth = (ann.text || '').length * fontSize * 0.6;
            const textHeight = fontSize * 1.2 * (ann.text || '').split('\n').length;

            // アノテーションテキストの位置
            if (ann.x !== undefined && ann.y !== undefined) {
                minX = Math.min(minX, ann.x - textWidth / 2);
                maxX = Math.max(maxX, ann.x + textWidth);
                minY = Math.min(minY, ann.y - fontSize);
                maxY = Math.max(maxY, ann.y + textHeight);
            }

            // 引出線の位置
            if (ann.leaderLine) {
                if (ann.leaderLine.start) {
                    minX = Math.min(minX, ann.leaderLine.start.x);
                    maxX = Math.max(maxX, ann.leaderLine.start.x);
                    minY = Math.min(minY, ann.leaderLine.start.y);
                    maxY = Math.max(maxY, ann.leaderLine.start.y);
                }
                if (ann.leaderLine.end) {
                    minX = Math.min(minX, ann.leaderLine.end.x);
                    maxX = Math.max(maxX, ann.leaderLine.end.x);
                    minY = Math.min(minY, ann.leaderLine.end.y);
                    maxY = Math.max(maxY, ann.leaderLine.end.y);
                }
            }
        }

        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    /**
     * 点がオブジェクト上にあるかヒットテスト
     */
    function hitTest(pos, obj, tolerance) {
        tolerance = tolerance || 5;

        let hitOnObject = false;

        switch (obj.type) {
            case 'line':
            case 'arrow':
            case 'doubleArrow':
            case 'doubleArrowAnnotated':
                hitOnObject = hitTestLine(pos, obj.startPos, obj.endPos, tolerance + (obj.lineWidth || 2) / 2);
                break;

            case 'rect':
                hitOnObject = hitTestRect(pos, obj, tolerance);
                break;

            case 'labeledRect':
                // 枠線部分のヒットテスト
                hitOnObject = hitTestRect(pos, obj, tolerance);
                // 引出線のヒットテスト
                if (!hitOnObject && obj.leaderLine) {
                    hitOnObject = hitTestLine(pos, obj.leaderLine.start, obj.leaderLine.end, tolerance + (obj.lineWidth || 2) / 2);
                }
                break;

            case 'fontLabel':
                // 枠線部分のヒットテスト
                hitOnObject = hitTestRect(pos, obj, tolerance);
                // フォント名ラベル部分のヒットテスト
                if (!hitOnObject && obj.textX !== undefined && obj.textY !== undefined) {
                    const fontSize = obj.fontSize || 12;
                    const fontName = obj.fontName || '';
                    const textWidth = fontName.length * fontSize * 0.7;
                    let textMinX, textMaxX;
                    if (obj.textAlign === 'left') {
                        textMinX = obj.textX;
                        textMaxX = obj.textX + textWidth;
                    } else {
                        textMinX = obj.textX - textWidth;
                        textMaxX = obj.textX;
                    }
                    const textMinY = obj.textY - fontSize / 2;
                    const textMaxY = obj.textY + fontSize / 2;
                    hitOnObject = pos.x >= textMinX - tolerance && pos.x <= textMaxX + tolerance &&
                                  pos.y >= textMinY - tolerance && pos.y <= textMaxY + tolerance;
                }
                break;

            case 'ellipse':
                hitOnObject = hitTestEllipse(pos, obj, tolerance);
                break;

            case 'semicircle':
                hitOnObject = hitTestSemicircle(pos, obj, tolerance);
                break;

            case 'chevron':
                hitOnObject = hitTestChevron(pos, obj, tolerance);
                break;

            case 'lshape':
                hitOnObject = hitTestLshape(pos, obj, tolerance);
                break;

            case 'zshape':
                hitOnObject = hitTestZshape(pos, obj, tolerance);
                break;

            case 'bracket':
                hitOnObject = hitTestBracket(pos, obj, tolerance);
                break;

            case 'rectSymbolStamp':
                hitOnObject = hitTestRect(pos, obj, tolerance);
                break;

            case 'triangleSymbolStamp':
                hitOnObject = hitTestTriangle(pos, obj, tolerance);
                break;

            case 'pen':
            case 'marker':
            case 'eraser':
                hitOnObject = hitTestPath(pos, obj.points, tolerance + (obj.lineWidth || 2) / 2);
                break;

            case 'polyline':
                // 折れ線のヒットテスト（連続した線分として判定）
                hitOnObject = hitTestPolyline(pos, obj.points, tolerance + (obj.lineWidth || 2) / 2);
                break;

            case 'text':
            case 'image':
                const bounds = getBounds(obj);
                hitOnObject = pos.x >= bounds.x && pos.x <= bounds.x + bounds.width &&
                       pos.y >= bounds.y && pos.y <= bounds.y + bounds.height;
                break;

            case 'doneStamp':
                // 済スタンプの円形ヒットテスト
                const stampSizeHit = obj.size || 28;
                const radiusHit = stampSizeHit / 2 + tolerance;
                const dxStamp = pos.x - obj.startPos.x;
                const dyStamp = pos.y - obj.startPos.y;
                hitOnObject = (dxStamp * dxStamp + dyStamp * dyStamp) <= (radiusHit * radiusHit);
                break;

            case 'komojiStamp':
                // 小文字スタンプの円形ヒットテスト
                const komojiStampSizeHit = obj.size || 28;
                const komojiRadiusHit = komojiStampSizeHit / 2 + tolerance;
                const dxKomoji = pos.x - obj.startPos.x;
                const dyKomoji = pos.y - obj.startPos.y;
                hitOnObject = (dxKomoji * dxKomoji + dyKomoji * dyKomoji) <= (komojiRadiusHit * komojiRadiusHit);
                break;

            case 'rubyStamp':
                // ルビスタンプの矩形ヒットテスト
                const rubySizeHit = obj.size || 28;
                const rubyWidthHit = rubySizeHit * 1.8 / 2 + tolerance;
                const rubyHeightHit = rubySizeHit * 0.9 / 2 + tolerance;
                hitOnObject = Math.abs(pos.x - obj.startPos.x) <= rubyWidthHit &&
                              Math.abs(pos.y - obj.startPos.y) <= rubyHeightHit;
                break;

            case 'toruStamp':
                // トルスタンプの矩形ヒットテスト
                const toruSizeHit = obj.size || 28;
                const toruWidthHit = toruSizeHit * 1.8 / 2 + tolerance;
                const toruHeightHit = toruSizeHit * 0.9 / 2 + tolerance;
                hitOnObject = Math.abs(pos.x - obj.startPos.x) <= toruWidthHit &&
                              Math.abs(pos.y - obj.startPos.y) <= toruHeightHit;
                break;

            case 'torutsumeStamp':
                // トルツメスタンプの矩形ヒットテスト
                const torutsumeSizeHit = obj.size || 28;
                const torutsumeWidthHit = torutsumeSizeHit * 2.5 / 2 + tolerance;
                const torutsumeHeightHit = torutsumeSizeHit * 0.9 / 2 + tolerance;
                hitOnObject = Math.abs(pos.x - obj.startPos.x) <= torutsumeWidthHit &&
                              Math.abs(pos.y - obj.startPos.y) <= torutsumeHeightHit;
                break;

            case 'torumamaStamp':
                // トルママスタンプの矩形ヒットテスト
                const torumamaSizeHit = obj.size || 28;
                const torumamaWidthHit = torumamaSizeHit * 2.5 / 2 + tolerance;
                const torumamaHeightHit = torumamaSizeHit * 0.9 / 2 + tolerance;
                hitOnObject = Math.abs(pos.x - obj.startPos.x) <= torumamaWidthHit &&
                              Math.abs(pos.y - obj.startPos.y) <= torumamaHeightHit;
                break;

            case 'zenkakuakiStamp':
                // 全角アキスタンプの矩形ヒットテスト
                const zenkakuakiSizeHit = obj.size || 28;
                const zenkakuakiWidthHit = zenkakuakiSizeHit * 3.0 / 2 + tolerance;
                const zenkakuakiHeightHit = zenkakuakiSizeHit * 0.9 / 2 + tolerance;
                hitOnObject = Math.abs(pos.x - obj.startPos.x) <= zenkakuakiWidthHit &&
                              Math.abs(pos.y - obj.startPos.y) <= zenkakuakiHeightHit;
                break;

            case 'nibunakiStamp':
                // 半角アキスタンプの矩形ヒットテスト
                const nibunakiSizeHit = obj.size || 28;
                const nibunakiWidthHit = nibunakiSizeHit * 3.0 / 2 + tolerance;
                const nibunakiHeightHit = nibunakiSizeHit * 0.9 / 2 + tolerance;
                hitOnObject = Math.abs(pos.x - obj.startPos.x) <= nibunakiWidthHit &&
                              Math.abs(pos.y - obj.startPos.y) <= nibunakiHeightHit;
                break;

            case 'shibunakiStamp':
                // 四分アキスタンプの矩形ヒットテスト
                const shibunakiSizeHit = obj.size || 28;
                const shibunakiWidthHit = shibunakiSizeHit * 3.0 / 2 + tolerance;
                const shibunakiHeightHit = shibunakiSizeHit * 0.9 / 2 + tolerance;
                hitOnObject = Math.abs(pos.x - obj.startPos.x) <= shibunakiWidthHit &&
                              Math.abs(pos.y - obj.startPos.y) <= shibunakiHeightHit;
                break;

            case 'kaigyouStamp':
                // 改行スタンプの矩形ヒットテスト
                const kaigyouSizeHit = obj.size || 28;
                const kaigyouWidthHit = kaigyouSizeHit * 1.5 / 2 + tolerance;
                const kaigyouHeightHit = kaigyouSizeHit * 0.9 / 2 + tolerance;
                hitOnObject = Math.abs(pos.x - obj.startPos.x) <= kaigyouWidthHit &&
                              Math.abs(pos.y - obj.startPos.y) <= kaigyouHeightHit;
                break;

            default:
                hitOnObject = false;
        }

        // オブジェクト本体にヒットした場合
        if (hitOnObject) return true;

        // アノテーション部分のヒットテスト（テキスト領域）
        if (obj.annotation && hitTestAnnotation(pos, obj, tolerance)) {
            return true;
        }

        // アノテーションの引出線のヒットテスト
        if (obj.annotation && obj.annotation.leaderLine) {
            const ll = obj.annotation.leaderLine;
            if (hitTestLine(pos, ll.start, ll.end, tolerance + 2)) {
                return true;
            }
        }

        // 指示スタンプなどの引出線（obj.leaderLine）のヒットテスト
        if (obj.leaderLine && obj.leaderLine.start && obj.leaderLine.end) {
            if (hitTestLine(pos, obj.leaderLine.start, obj.leaderLine.end, tolerance + 2)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 折れ線のヒットテスト
     */
    function hitTestPolyline(pos, points, tolerance) {
        if (!points || points.length < 2) return false;

        // 各線分に対してヒットテスト
        for (let i = 0; i < points.length - 1; i++) {
            if (hitTestLine(pos, points[i], points[i + 1], tolerance)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 線のヒットテスト
     */
    function hitTestLine(pos, p1, p2, tolerance) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len === 0) {
            return Math.sqrt(Math.pow(pos.x - p1.x, 2) + Math.pow(pos.y - p1.y, 2)) <= tolerance;
        }

        const t = Math.max(0, Math.min(1, ((pos.x - p1.x) * dx + (pos.y - p1.y) * dy) / (len * len)));
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        const dist = Math.sqrt(Math.pow(pos.x - projX, 2) + Math.pow(pos.y - projY, 2));

        return dist <= tolerance;
    }

    /**
     * 矩形のヒットテスト（枠線のみ）
     */
    function hitTestRect(pos, obj, tolerance) {
        const minX = Math.min(obj.startPos.x, obj.endPos.x);
        const maxX = Math.max(obj.startPos.x, obj.endPos.x);
        const minY = Math.min(obj.startPos.y, obj.endPos.y);
        const maxY = Math.max(obj.startPos.y, obj.endPos.y);

        // 枠線上かどうか
        const onTop = Math.abs(pos.y - minY) <= tolerance && pos.x >= minX - tolerance && pos.x <= maxX + tolerance;
        const onBottom = Math.abs(pos.y - maxY) <= tolerance && pos.x >= minX - tolerance && pos.x <= maxX + tolerance;
        const onLeft = Math.abs(pos.x - minX) <= tolerance && pos.y >= minY - tolerance && pos.y <= maxY + tolerance;
        const onRight = Math.abs(pos.x - maxX) <= tolerance && pos.y >= minY - tolerance && pos.y <= maxY + tolerance;

        return onTop || onBottom || onLeft || onRight;
    }

    /**
     * 楕円のヒットテスト
     */
    function hitTestEllipse(pos, obj, tolerance) {
        const w = Math.abs(obj.endPos.x - obj.startPos.x);
        const h = Math.abs(obj.endPos.y - obj.startPos.y);
        const cx = obj.startPos.x + (obj.endPos.x - obj.startPos.x) / 2;
        const cy = obj.startPos.y + (obj.endPos.y - obj.startPos.y) / 2;
        const rx = w / 2;
        const ry = h / 2;

        if (rx === 0 || ry === 0) return false;

        // 楕円上の距離を計算
        const normalizedX = (pos.x - cx) / rx;
        const normalizedY = (pos.y - cy) / ry;
        const dist = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);

        const toleranceNormalized = tolerance / Math.min(rx, ry);
        return Math.abs(dist - 1) <= toleranceNormalized;
    }

    /**
     * 半円のヒットテスト
     */
    function hitTestSemicircle(pos, obj, tolerance) {
        const w = Math.abs(obj.endPos.x - obj.startPos.x);
        const h = Math.abs(obj.endPos.y - obj.startPos.y);
        const cx = obj.startPos.x + (obj.endPos.x - obj.startPos.x) / 2;
        const cy = obj.startPos.y + (obj.endPos.y - obj.startPos.y) / 2;
        const rx = w / 2;
        const ry = h / 2;

        if (rx === 0 || ry === 0) return false;

        // 楕円上の距離を計算
        const normalizedX = (pos.x - cx) / rx;
        const normalizedY = (pos.y - cy) / ry;
        const dist = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);

        const toleranceNormalized = tolerance / Math.min(rx, ry);

        // orientationプロパティで弧の向きを判定（後方互換性のためデフォルトはhorizontal）
        const orientation = obj.orientation || (h > w ? 'vertical' : 'horizontal');

        // まず、弧の部分（円周上）かどうかをチェック
        if (Math.abs(dist - 1) <= toleranceNormalized) {
            if (orientation === 'vertical') {
                // 縦向きの弧（右側の弧: x > cx）
                if (pos.x >= cx - tolerance) {
                    return true;
                }
            } else {
                // 横向きの弧（上側の弧: y < cy）
                if (pos.y <= cy + tolerance) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * くの字のヒットテスト
     */
    function hitTestChevron(pos, obj, tolerance) {
        const w = Math.abs(obj.endPos.x - obj.startPos.x);
        const h = Math.abs(obj.endPos.y - obj.startPos.y);

        const orientation = obj.orientation || (h > w ? 'vertical' : 'horizontal');
        const flipped = obj.flipped || false;

        let p1, p2, p3;
        if (orientation === 'vertical') {
            const topY = Math.min(obj.startPos.y, obj.endPos.y);
            const bottomY = Math.max(obj.startPos.y, obj.endPos.y);
            const leftX = Math.min(obj.startPos.x, obj.endPos.x);
            const rightX = Math.max(obj.startPos.x, obj.endPos.x);
            const midY = (topY + bottomY) / 2;

            if (flipped) {
                // 反転: ＞の形（頂点が左側）
                p1 = { x: rightX, y: topY };
                p2 = { x: leftX, y: midY };
                p3 = { x: rightX, y: bottomY };
            } else {
                // 通常: ＜の形（頂点が右側）
                p1 = { x: leftX, y: topY };
                p2 = { x: rightX, y: midY };
                p3 = { x: leftX, y: bottomY };
            }
        } else {
            // 横向きのくの字
            const leftX = Math.min(obj.startPos.x, obj.endPos.x);
            const rightX = Math.max(obj.startPos.x, obj.endPos.x);
            const topY = Math.min(obj.startPos.y, obj.endPos.y);
            const bottomY = Math.max(obj.startPos.y, obj.endPos.y);
            const midX = (leftX + rightX) / 2;

            if (flipped) {
                // 反転: ∨の形（頂点が下側）
                p1 = { x: leftX, y: topY };
                p2 = { x: midX, y: bottomY };
                p3 = { x: rightX, y: topY };
            } else {
                // 通常: ∧の形（頂点が上側）
                p1 = { x: leftX, y: bottomY };
                p2 = { x: midX, y: topY };
                p3 = { x: rightX, y: bottomY };
            }
        }

        // 2つの線分のヒットテスト
        const lineWidth = (obj.lineWidth || 2) / 2;
        if (hitTestLine(pos, p1, p2, tolerance + lineWidth)) return true;
        if (hitTestLine(pos, p2, p3, tolerance + lineWidth)) return true;

        return false;
    }

    /**
     * L字のヒットテスト
     */
    function hitTestLshape(pos, obj, tolerance) {
        const topY = Math.min(obj.startPos.y, obj.endPos.y);
        const bottomY = Math.max(obj.startPos.y, obj.endPos.y);
        const leftX = Math.min(obj.startPos.x, obj.endPos.x);
        const rightX = Math.max(obj.startPos.x, obj.endPos.x);

        const direction = obj.direction || 0;

        let p1, p2, p3;
        switch (direction) {
            case 0: // L（標準形、左上が角）
                p1 = { x: leftX, y: bottomY };
                p2 = { x: leftX, y: topY };
                p3 = { x: rightX, y: topY };
                break;
            case 1: // ⌐（右上が角）
                p1 = { x: rightX, y: bottomY };
                p2 = { x: rightX, y: topY };
                p3 = { x: leftX, y: topY };
                break;
            case 2: // Γ（左下が角）
                p1 = { x: leftX, y: topY };
                p2 = { x: leftX, y: bottomY };
                p3 = { x: rightX, y: bottomY };
                break;
            case 3: // ⌝（右下が角）
                p1 = { x: rightX, y: topY };
                p2 = { x: rightX, y: bottomY };
                p3 = { x: leftX, y: bottomY };
                break;
            default:
                p1 = { x: leftX, y: bottomY };
                p2 = { x: leftX, y: topY };
                p3 = { x: rightX, y: topY };
        }

        // 2つの線分のヒットテスト
        const lineWidth = (obj.lineWidth || 2) / 2;
        if (hitTestLine(pos, p1, p2, tolerance + lineWidth)) return true;
        if (hitTestLine(pos, p2, p3, tolerance + lineWidth)) return true;

        return false;
    }

    /**
     * Z字のヒットテスト（クランク形状）
     * rotated: trueの場合は横→縦→横の形状
     */
    function hitTestZshape(pos, obj, tolerance) {
        let p1, p2, p3, p4;

        if (obj.rotated) {
            // 回転形状: 横→縦→横
            const dx = obj.endPos.x - obj.startPos.x;
            const midX = obj.startPos.x + dx / 2;

            p1 = { x: obj.startPos.x, y: obj.startPos.y }; // 開始点
            p2 = { x: midX, y: obj.startPos.y };           // 最初の折れ曲がり点
            p3 = { x: midX, y: obj.endPos.y };             // 2番目の折れ曲がり点
            p4 = { x: obj.endPos.x, y: obj.endPos.y };     // 終点
        } else {
            // 通常形状: 縦→横→縦
            const dy = obj.endPos.y - obj.startPos.y;
            const midY = obj.startPos.y + dy / 2;

            p1 = { x: obj.startPos.x, y: obj.startPos.y }; // 開始点
            p2 = { x: obj.startPos.x, y: midY };           // 最初の折れ曲がり点
            p3 = { x: obj.endPos.x, y: midY };             // 2番目の折れ曲がり点
            p4 = { x: obj.endPos.x, y: obj.endPos.y };     // 終点
        }

        // 3つの線分のヒットテスト
        const lineWidth = (obj.lineWidth || 2) / 2;
        if (hitTestLine(pos, p1, p2, tolerance + lineWidth)) return true;
        if (hitTestLine(pos, p2, p3, tolerance + lineWidth)) return true;
        if (hitTestLine(pos, p3, p4, tolerance + lineWidth)) return true;

        return false;
    }

    /**
     * コの字のヒットテスト
     */
    function hitTestBracket(pos, obj, tolerance) {
        const w = Math.abs(obj.endPos.x - obj.startPos.x);
        const h = Math.abs(obj.endPos.y - obj.startPos.y);

        const orientation = obj.orientation || (h > w ? 'vertical' : 'horizontal');
        const flipped = obj.flipped || false;

        let p1, p2, p3, p4;
        if (orientation === 'vertical') {
            const topY = Math.min(obj.startPos.y, obj.endPos.y);
            const bottomY = Math.max(obj.startPos.y, obj.endPos.y);
            const leftX = Math.min(obj.startPos.x, obj.endPos.x);
            const rightX = Math.max(obj.startPos.x, obj.endPos.x);

            if (flipped) {
                // 反転: ⊏の形（開口部が右側）
                p1 = { x: rightX, y: topY };
                p2 = { x: leftX, y: topY };
                p3 = { x: leftX, y: bottomY };
                p4 = { x: rightX, y: bottomY };
            } else {
                // 通常: ⊐の形（開口部が左側）
                p1 = { x: leftX, y: topY };
                p2 = { x: rightX, y: topY };
                p3 = { x: rightX, y: bottomY };
                p4 = { x: leftX, y: bottomY };
            }
        } else {
            // 横向きのコの字
            const leftX = Math.min(obj.startPos.x, obj.endPos.x);
            const rightX = Math.max(obj.startPos.x, obj.endPos.x);
            const topY = Math.min(obj.startPos.y, obj.endPos.y);
            const bottomY = Math.max(obj.startPos.y, obj.endPos.y);

            if (flipped) {
                // 反転: ⊔の形（開口部が上側）
                p1 = { x: leftX, y: topY };
                p2 = { x: leftX, y: bottomY };
                p3 = { x: rightX, y: bottomY };
                p4 = { x: rightX, y: topY };
            } else {
                // 通常: ⊓の形（開口部が下側）
                p1 = { x: leftX, y: bottomY };
                p2 = { x: leftX, y: topY };
                p3 = { x: rightX, y: topY };
                p4 = { x: rightX, y: bottomY };
            }
        }

        // 3つの線分のヒットテスト
        const lineWidth = (obj.lineWidth || 2) / 2;
        if (hitTestLine(pos, p1, p2, tolerance + lineWidth)) return true;
        if (hitTestLine(pos, p2, p3, tolerance + lineWidth)) return true;
        if (hitTestLine(pos, p3, p4, tolerance + lineWidth)) return true;

        return false;
    }

    /**
     * 三角形のヒットテスト（半角アキ △）
     */
    function hitTestTriangle(pos, obj, tolerance) {
        const topY = Math.min(obj.startPos.y, obj.endPos.y);
        const bottomY = Math.max(obj.startPos.y, obj.endPos.y);
        const leftX = Math.min(obj.startPos.x, obj.endPos.x);
        const rightX = Math.max(obj.startPos.x, obj.endPos.x);
        const midX = (leftX + rightX) / 2;

        // 三角形の3頂点
        const p1 = { x: midX, y: topY };       // 上頂点
        const p2 = { x: leftX, y: bottomY };   // 左下
        const p3 = { x: rightX, y: bottomY };  // 右下

        // 3つの辺のヒットテスト
        const lineWidth = (obj.lineWidth || 2) / 2;
        if (hitTestLine(pos, p1, p2, tolerance + lineWidth)) return true;
        if (hitTestLine(pos, p2, p3, tolerance + lineWidth)) return true;
        if (hitTestLine(pos, p3, p1, tolerance + lineWidth)) return true;

        return false;
    }

    /**
     * パスのヒットテスト
     */
    function hitTestPath(pos, points, tolerance) {
        if (!points || points.length < 2) return false;

        for (let i = 1; i < points.length; i++) {
            if (hitTestLine(pos, points[i - 1], points[i], tolerance)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 選択ハンドルの位置を取得
     */
    function getHandlePositions(bounds) {
        const { x, y, width, height } = bounds;
        return {
            tl: { x: x, y: y },
            tm: { x: x + width / 2, y: y },
            tr: { x: x + width, y: y },
            ml: { x: x, y: y + height / 2 },
            mr: { x: x + width, y: y + height / 2 },
            bl: { x: x, y: y + height },
            bm: { x: x + width / 2, y: y + height },
            br: { x: x + width, y: y + height }
        };
    }

    /**
     * ハンドルのヒットテスト
     */
    function hitTestHandle(pos, bounds) {
        const handles = getHandlePositions(bounds);
        const hs = HANDLE_SIZE / 2 + 2;

        for (const [key, hp] of Object.entries(handles)) {
            if (Math.abs(pos.x - hp.x) <= hs && Math.abs(pos.y - hp.y) <= hs) {
                return key;
            }
        }
        return null;
    }

    // --- 描画関数 ---

    /**
     * 直線を描画
     */
    function renderLine(ctx, obj) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(obj.startPos.x, obj.startPos.y);
        ctx.lineTo(obj.endPos.x, obj.endPos.y);
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    }

    /**
     * 矢頭を描画するヘルパー関数
     */
    function drawArrowHead(ctx, x, y, angle, headLen) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
            x - headLen * Math.cos(angle - Math.PI / 6),
            y - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(x, y);
        ctx.lineTo(
            x - headLen * Math.cos(angle + Math.PI / 6),
            y - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
    }

    /**
     * 矢印を描画（片方向）
     */
    function renderArrow(ctx, obj) {
        ctx.save();
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const { startPos, endPos } = obj;

        // 直線を描画
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(endPos.x, endPos.y);
        ctx.stroke();

        // 矢頭のサイズ（lineWidthに比例）
        const headLen = Math.max(5, (obj.lineWidth || 2) * 2);
        const angle = Math.atan2(endPos.y - startPos.y, endPos.x - startPos.x);

        // endPos側の矢頭
        drawArrowHead(ctx, endPos.x, endPos.y, angle, headLen);

        ctx.restore();
    }

    /**
     * 両矢印を描画（両方向）
     */
    function renderDoubleArrow(ctx, obj) {
        ctx.save();
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const { startPos, endPos } = obj;

        // 直線を描画
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(endPos.x, endPos.y);
        ctx.stroke();

        // 矢頭のサイズ（lineWidthに比例）
        const headLen = Math.max(5, (obj.lineWidth || 2) * 2);
        const angle = Math.atan2(endPos.y - startPos.y, endPos.x - startPos.x);

        // endPos側の矢頭
        drawArrowHead(ctx, endPos.x, endPos.y, angle, headLen);
        // startPos側の矢頭（反対方向）
        drawArrowHead(ctx, startPos.x, startPos.y, angle + Math.PI, headLen);

        ctx.restore();
    }

    /**
     * 外向き矢頭を描画するヘルパー関数（字間指示入れ用）
     */
    function drawArrowHeadOutward(ctx, x, y, angle, headLen) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
            x + headLen * Math.cos(angle - Math.PI / 6),
            y + headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(x, y);
        ctx.lineTo(
            x + headLen * Math.cos(angle + Math.PI / 6),
            y + headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
    }

    /**
     * 字間指示入れ用の両矢印を描画（外向き矢頭）
     */
    function renderDoubleArrowAnnotated(ctx, obj) {
        ctx.save();
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const { startPos, endPos } = obj;

        // 直線を描画
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(endPos.x, endPos.y);
        ctx.stroke();

        // 矢頭のサイズ（lineWidthに比例）
        const headLen = Math.max(5, (obj.lineWidth || 2) * 2);
        const angle = Math.atan2(endPos.y - startPos.y, endPos.x - startPos.x);

        // endPos側の矢頭（外向き）
        drawArrowHeadOutward(ctx, endPos.x, endPos.y, angle, headLen);
        // startPos側の矢頭（外向き）
        drawArrowHeadOutward(ctx, startPos.x, startPos.y, angle + Math.PI, headLen);

        ctx.restore();
    }

    /**
     * 矩形を描画
     */
    function renderRect(ctx, obj) {
        ctx.save();
        ctx.beginPath();
        const w = obj.endPos.x - obj.startPos.x;
        const h = obj.endPos.y - obj.startPos.y;
        ctx.rect(obj.startPos.x, obj.startPos.y, w, h);
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * ラベル付き枠線を描画（正方形 + 引出線）
     */
    function renderLabeledRect(ctx, obj) {
        ctx.save();

        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;

        // 引出線を描画
        if (obj.leaderLine) {
            ctx.beginPath();
            ctx.moveTo(obj.leaderLine.start.x, obj.leaderLine.start.y);
            ctx.lineTo(obj.leaderLine.end.x, obj.leaderLine.end.y);
            ctx.stroke();

            // 引出線の先端に●を描画
            const dotRadius = Math.max(ctx.lineWidth, 2);
            ctx.beginPath();
            ctx.arc(obj.leaderLine.start.x, obj.leaderLine.start.y, dotRadius, 0, 2 * Math.PI);
            ctx.fillStyle = obj.color || '#000000';
            ctx.fill();
        }

        // 正方形の計算（短い辺に合わせる）
        const minX = Math.min(obj.startPos.x, obj.endPos.x);
        const minY = Math.min(obj.startPos.y, obj.endPos.y);
        const w = Math.abs(obj.endPos.x - obj.startPos.x);
        const h = Math.abs(obj.endPos.y - obj.startPos.y);
        const size = Math.min(w, h);

        // 枠線を描画（正方形）
        ctx.beginPath();
        ctx.rect(minX, minY, size, size);
        ctx.stroke();

        // ラベルを右下に描画
        if (obj.label) {
            // ラベルのフォントサイズ（正方形のサイズに応じて調整）
            const fontSize = Math.max(10, Math.min(16, size * 0.4));

            // ラベル位置（右下内側、パディングを設ける）
            const padding = 3;
            const labelX = minX + size - padding;
            const labelY = minY + size - padding;

            // ラベルテキストを描画（白フチ付き）
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';

            // 白フチを描画
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.strokeText(obj.label, labelX, labelY);

            // テキスト本体を描画
            ctx.fillStyle = obj.color || '#000000';
            ctx.fillText(obj.label, labelX, labelY);
        }

        ctx.restore();
    }

    /**
     * 楕円を描画
     */
    function renderEllipse(ctx, obj) {
        ctx.save();
        ctx.beginPath();
        const w = Math.abs(obj.endPos.x - obj.startPos.x);
        const h = Math.abs(obj.endPos.y - obj.startPos.y);
        const cx = obj.startPos.x + (obj.endPos.x - obj.startPos.x) / 2;
        const cy = obj.startPos.y + (obj.endPos.y - obj.startPos.y) / 2;
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * 半円を描画
     */
    function renderSemicircle(ctx, obj) {
        ctx.save();
        ctx.beginPath();
        const w = Math.abs(obj.endPos.x - obj.startPos.x);
        const h = Math.abs(obj.endPos.y - obj.startPos.y);
        const cx = obj.startPos.x + (obj.endPos.x - obj.startPos.x) / 2;
        const cy = obj.startPos.y + (obj.endPos.y - obj.startPos.y) / 2;
        // orientationプロパティで弧の向きを判定（後方互換性のためデフォルトはhorizontal）
        const orientation = obj.orientation || (h > w ? 'vertical' : 'horizontal');
        if (orientation === 'vertical') {
            // 縦向きの弧（右側の弧）
            ctx.ellipse(cx, cy, w / 2, h / 2, 0, -0.5 * Math.PI, 0.5 * Math.PI);
        } else {
            // 横向きの弧（上側の弧）
            ctx.ellipse(cx, cy, w / 2, h / 2, 0, Math.PI, 2 * Math.PI);
        }
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * くの字を描画
     */
    function renderChevron(ctx, obj) {
        ctx.save();
        ctx.beginPath();

        const w = Math.abs(obj.endPos.x - obj.startPos.x);
        const h = Math.abs(obj.endPos.y - obj.startPos.y);
        const orientation = obj.orientation || (h > w ? 'vertical' : 'horizontal');

        if (orientation === 'vertical') {
            // vertical: ＜の形（頂点が左側）
            const topY = Math.min(obj.startPos.y, obj.endPos.y);
            const bottomY = Math.max(obj.startPos.y, obj.endPos.y);
            const leftX = Math.min(obj.startPos.x, obj.endPos.x);
            const rightX = Math.max(obj.startPos.x, obj.endPos.x);
            const midY = (topY + bottomY) / 2;

            // 頂点が左側
            ctx.moveTo(rightX, topY);
            ctx.lineTo(leftX, midY);
            ctx.lineTo(rightX, bottomY);
        } else {
            // horizontal: ∨の形（頂点が下側）- Ctrl押下時
            const leftX = Math.min(obj.startPos.x, obj.endPos.x);
            const rightX = Math.max(obj.startPos.x, obj.endPos.x);
            const topY = Math.min(obj.startPos.y, obj.endPos.y);
            const bottomY = Math.max(obj.startPos.y, obj.endPos.y);
            const midX = (leftX + rightX) / 2;

            // 常に頂点が下側
            ctx.moveTo(leftX, topY);
            ctx.lineTo(midX, bottomY);
            ctx.lineTo(rightX, topY);
        }

        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }

    /**
     * L字を描画
     */
    function renderLshape(ctx, obj) {
        ctx.save();
        ctx.beginPath();

        const topY = Math.min(obj.startPos.y, obj.endPos.y);
        const bottomY = Math.max(obj.startPos.y, obj.endPos.y);
        const leftX = Math.min(obj.startPos.x, obj.endPos.x);
        const rightX = Math.max(obj.startPos.x, obj.endPos.x);

        const direction = obj.direction || 0;

        switch (direction) {
            case 0: // L（標準形、左上が角）
                ctx.moveTo(leftX, bottomY);
                ctx.lineTo(leftX, topY);
                ctx.lineTo(rightX, topY);
                break;
            case 1: // ⌐（右上が角）
                ctx.moveTo(rightX, bottomY);
                ctx.lineTo(rightX, topY);
                ctx.lineTo(leftX, topY);
                break;
            case 2: // Γ（左下が角）
                ctx.moveTo(leftX, topY);
                ctx.lineTo(leftX, bottomY);
                ctx.lineTo(rightX, bottomY);
                break;
            case 3: // ⌝（右下が角）
                ctx.moveTo(rightX, topY);
                ctx.lineTo(rightX, bottomY);
                ctx.lineTo(leftX, bottomY);
                break;
        }

        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Z字を描画（クランク形状）
     * rotated: trueの場合は横→縦→横の形状
     */
    function renderZshape(ctx, obj) {
        ctx.save();
        ctx.beginPath();

        if (obj.rotated) {
            // 回転形状: 横→縦→横
            // ──┐
            //   │
            //   └──
            const dx = obj.endPos.x - obj.startPos.x;
            const midX = obj.startPos.x + dx / 2;

            ctx.moveTo(obj.startPos.x, obj.startPos.y);
            ctx.lineTo(midX, obj.startPos.y);
            ctx.lineTo(midX, obj.endPos.y);
            ctx.lineTo(obj.endPos.x, obj.endPos.y);
        } else {
            // 通常形状: 縦→横→縦
            // │
            // └──┐
            //    │
            const dy = obj.endPos.y - obj.startPos.y;
            const midY = obj.startPos.y + dy / 2;

            ctx.moveTo(obj.startPos.x, obj.startPos.y);
            ctx.lineTo(obj.startPos.x, midY);
            ctx.lineTo(obj.endPos.x, midY);
            ctx.lineTo(obj.endPos.x, obj.endPos.y);
        }

        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }

    /**
     * コの字を描画
     */
    function renderBracket(ctx, obj) {
        ctx.save();

        const w = Math.abs(obj.endPos.x - obj.startPos.x);
        const h = Math.abs(obj.endPos.y - obj.startPos.y);
        const orientation = obj.orientation || (h > w ? 'vertical' : 'horizontal');
        const flipped = obj.flipped || false;

        // セリフ（はみ出し部分）のサイズ
        const serifSize = Math.min(w, h) * 0.15;

        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (orientation === 'vertical') {
            const topY = Math.min(obj.startPos.y, obj.endPos.y);
            const bottomY = Math.max(obj.startPos.y, obj.endPos.y);
            const leftX = Math.min(obj.startPos.x, obj.endPos.x);
            const rightX = Math.max(obj.startPos.x, obj.endPos.x);

            if (flipped) {
                // 反転: ⊏の形（開口部が右側）
                // メインのコの字
                ctx.beginPath();
                ctx.moveTo(rightX, topY);
                ctx.lineTo(leftX, topY);
                ctx.lineTo(leftX, bottomY);
                ctx.lineTo(rightX, bottomY);
                ctx.stroke();
                // 上端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(rightX, topY);
                ctx.lineTo(rightX, topY - serifSize);
                ctx.stroke();
                // 下端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(rightX, bottomY);
                ctx.lineTo(rightX, bottomY + serifSize);
                ctx.stroke();
            } else {
                // 通常: ⊐の形（開口部が左側）
                // メインのコの字
                ctx.beginPath();
                ctx.moveTo(leftX, topY);
                ctx.lineTo(rightX, topY);
                ctx.lineTo(rightX, bottomY);
                ctx.lineTo(leftX, bottomY);
                ctx.stroke();
                // 上端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(leftX, topY);
                ctx.lineTo(leftX, topY - serifSize);
                ctx.stroke();
                // 下端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(leftX, bottomY);
                ctx.lineTo(leftX, bottomY + serifSize);
                ctx.stroke();
            }
        } else {
            // 横向きのコの字
            const leftX = Math.min(obj.startPos.x, obj.endPos.x);
            const rightX = Math.max(obj.startPos.x, obj.endPos.x);
            const topY = Math.min(obj.startPos.y, obj.endPos.y);
            const bottomY = Math.max(obj.startPos.y, obj.endPos.y);

            if (flipped) {
                // 反転: ⊔の形（開口部が上側）
                // メインのコの字
                ctx.beginPath();
                ctx.moveTo(leftX, topY);
                ctx.lineTo(leftX, bottomY);
                ctx.lineTo(rightX, bottomY);
                ctx.lineTo(rightX, topY);
                ctx.stroke();
                // 左端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(leftX, topY);
                ctx.lineTo(leftX - serifSize, topY);
                ctx.stroke();
                // 右端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(rightX, topY);
                ctx.lineTo(rightX + serifSize, topY);
                ctx.stroke();
            } else {
                // 通常: ⊓の形（開口部が下側）
                // メインのコの字
                ctx.beginPath();
                ctx.moveTo(leftX, bottomY);
                ctx.lineTo(leftX, topY);
                ctx.lineTo(rightX, topY);
                ctx.lineTo(rightX, bottomY);
                ctx.stroke();
                // 左端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(leftX, bottomY);
                ctx.lineTo(leftX - serifSize, bottomY);
                ctx.stroke();
                // 右端のセリフ（90度外側）
                ctx.beginPath();
                ctx.moveTo(rightX, bottomY);
                ctx.lineTo(rightX + serifSize, bottomY);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    /**
     * 全角アキ（□）スタンプを描画
     */
    function renderRectSymbolStamp(ctx, obj) {
        ctx.save();
        ctx.beginPath();
        const w = obj.endPos.x - obj.startPos.x;
        const h = obj.endPos.y - obj.startPos.y;
        ctx.rect(obj.startPos.x, obj.startPos.y, w, h);
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * 半角アキ（△）スタンプを描画
     */
    function renderTriangleSymbolStamp(ctx, obj) {
        ctx.save();
        ctx.beginPath();

        const topY = Math.min(obj.startPos.y, obj.endPos.y);
        const bottomY = Math.max(obj.startPos.y, obj.endPos.y);
        const leftX = Math.min(obj.startPos.x, obj.endPos.x);
        const rightX = Math.max(obj.startPos.x, obj.endPos.x);
        const midX = (leftX + rightX) / 2;

        // 上向きの三角形
        ctx.moveTo(midX, topY);
        ctx.lineTo(leftX, bottomY);
        ctx.lineTo(rightX, bottomY);
        ctx.closePath();

        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * 折れ線を描画
     */
    function renderPolyline(ctx, obj) {
        if (!obj.points || obj.points.length < 2) return;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(obj.points[0].x, obj.points[0].y);

        for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
        }

        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }

    /**
     * ペンストロークを描画
     */
    function renderPen(ctx, obj) {
        if (!obj.points || obj.points.length < 2) return;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(obj.points[0].x, obj.points[0].y);

        for (let i = 1; i < obj.points.length - 1; i++) {
            const c = (obj.points[i].x + obj.points[i + 1].x) / 2;
            const d = (obj.points[i].y + obj.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(obj.points[i].x, obj.points[i].y, c, d);
        }

        const last = obj.points[obj.points.length - 1];
        ctx.lineTo(last.x, last.y);

        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }

    /**
     * マーカーストロークを描画
     */
    function renderMarker(ctx, obj) {
        if (!obj.points || obj.points.length < 2) return;

        ctx.save();
        ctx.globalAlpha = obj.opacity || 0.3;
        // エクスポートモードではmultiplyを使わない（透明背景で正しく表示するため）
        if (!exportMode) {
            ctx.globalCompositeOperation = 'multiply';
        }

        ctx.beginPath();
        ctx.moveTo(obj.points[0].x, obj.points[0].y);

        for (let i = 1; i < obj.points.length - 1; i++) {
            const c = (obj.points[i].x + obj.points[i + 1].x) / 2;
            const d = (obj.points[i].y + obj.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(obj.points[i].x, obj.points[i].y, c, d);
        }

        const last = obj.points[obj.points.length - 1];
        ctx.lineTo(last.x, last.y);

        ctx.strokeStyle = obj.color || '#ffff00';
        ctx.lineWidth = obj.lineWidth || 20;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }

    /**
     * 消しゴムストロークを描画
     */
    function renderEraser(ctx, obj) {
        if (!obj.points || obj.points.length < 2) return;

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';

        ctx.beginPath();
        ctx.moveTo(obj.points[0].x, obj.points[0].y);

        for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
        }

        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = obj.lineWidth || 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }

    /**
     * フォントラベル（枠線+フォント名）を描画
     */
    function renderFontLabel(ctx, obj) {
        ctx.save();

        // 枠線を描画
        const rectX = Math.min(obj.startPos.x, obj.endPos.x);
        const rectY = Math.min(obj.startPos.y, obj.endPos.y);
        const rectW = Math.abs(obj.endPos.x - obj.startPos.x);
        const rectH = Math.abs(obj.endPos.y - obj.startPos.y);

        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.lineWidth || 2;
        ctx.strokeRect(rectX, rectY, rectW, rectH);

        // フォント名ラベルを描画
        const fontSize = obj.fontSize || 12;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = obj.color || '#000000';
        ctx.textAlign = obj.textAlign || 'left';
        ctx.textBaseline = obj.endPos.y > obj.startPos.y ? 'top' : 'bottom';

        // 白い縁取り
        ctx.save();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(obj.fontName || '', obj.textX, obj.textY);
        ctx.restore();

        // テキスト本体
        ctx.fillText(obj.fontName || '', obj.textX, obj.textY);

        ctx.restore();
    }

    /**
     * テキストを描画
     */
    function renderText(ctx, obj) {
        ctx.save();
        const fontSize = obj.fontSize || 16;
        ctx.font = `${fontSize}px ${obj.fontFamily || 'sans-serif'}`;
        ctx.fillStyle = obj.color || '#000000';

        const lines = (obj.text || '').split('\n');
        const x = obj.startPos.x;
        const y = obj.startPos.y;

        // 白い縁取り付きでテキストを描画
        const drawWithOutline = (char, px, py) => {
            ctx.save();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.strokeText(char, px, py);
            ctx.restore();
            ctx.fillText(char, px, py);
        };

        if (obj.isVertical) {
            // 縦書き
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const lineHeight = fontSize * 1.1;

            // 句読点など右上に移動させる文字 - 中点「・」は中央配置のため含めない
            const punctuationChars = ['、', '。', '，', '．', '｡', '､'];

            lines.forEach((line, colIndex) => {
                const currentX = x - (colIndex * lineHeight);
                let cursorY = 0;
                const charData = Array.from(line).map(char => {
                    let h = fontSize;
                    if (char === ' ') h = fontSize * 0.3;
                    const centerY = cursorY + (h / 2);
                    cursorY += h;
                    return { char, centerY };
                });

                charData.forEach((item) => {
                    const char = item.char;
                    const currentY = y + item.centerY;
                    if (char === ' ') return;

                    const needsRotation = ['ー', '−', '―', '…', '(', ')', '（', '）', '[', ']', '「', '」', '～', '〜', '＝', '='].includes(char);
                    const isPunctuation = punctuationChars.includes(char);

                    if (needsRotation) {
                        ctx.save();
                        ctx.translate(currentX, currentY);
                        ctx.rotate(Math.PI / 2);
                        drawWithOutline(char, 0, 0);
                        ctx.restore();
                    } else if (isPunctuation) {
                        // 句読点は右上に移動（文字の右端に配置）
                        const offsetX = fontSize * 0.7;
                        const offsetY = -fontSize * 0.55;
                        drawWithOutline(char, currentX + offsetX, currentY + offsetY);
                    } else {
                        drawWithOutline(char, currentX, currentY);
                    }
                });
            });
        } else {
            // 横書き
            ctx.textAlign = obj.align || 'left';
            ctx.textBaseline = 'top';
            const lineHeight = fontSize * 1.2;

            lines.forEach((line, index) => {
                const currentY = y + (index * lineHeight);
                drawWithOutline(line, x, currentY);
            });
        }

        ctx.restore();
    }

    /**
     * 画像を描画
     */
    function renderImage(ctx, obj) {
        if (!obj.imageData) return;

        ctx.save();
        // 高品質スムージングを明示的に設定
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const w = obj.endPos.x - obj.startPos.x;
        const h = obj.endPos.y - obj.startPos.y;
        ctx.drawImage(obj.imageData, obj.startPos.x, obj.startPos.y, w, h);
        ctx.restore();
    }

    /**
     * 済スタンプを描画
     */
    function renderDoneStamp(ctx, obj) {
        ctx.save();

        const x = obj.startPos.x;
        const y = obj.startPos.y;
        const size = obj.size || 28;
        const color = obj.color || '#ff0000';
        const radius = size / 2;

        // 外側の円（白フチ）
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.stroke();

        // 外側の円（枠線）
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 「済」の文字（白フチ）
        ctx.font = `bold ${size * 0.6}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeText('済', x, y);

        // 「済」の文字
        ctx.fillStyle = color;
        ctx.fillText('済', x, y);

        ctx.restore();
    }

    /**
     * 小文字スタンプを描画（○に小）
     */
    function renderKomojiStamp(ctx, obj) {
        ctx.save();

        const x = obj.startPos.x;
        const y = obj.startPos.y;
        const size = obj.size || 28;
        const color = obj.color || '#ff0000';
        const radius = size / 2;

        // 外側の円（白フチ）
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 外側の円（枠線）
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();

        // 「小」の文字（白フチ）
        ctx.font = `bold ${size * 0.6}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeText('小', x, y);

        // 「小」の文字
        ctx.fillStyle = color;
        ctx.fillText('小', x, y);

        ctx.restore();
    }

    /**
     * ルビスタンプを描画（角丸長方形内にルビ）
     */
    function renderRubyStamp(ctx, obj) {
        ctx.save();

        const x = obj.startPos.x;
        const y = obj.startPos.y;
        const size = obj.size || 28;
        const color = obj.color || '#ff0000';

        // 角丸長方形のサイズ
        const width = size * 1.8;
        const height = size * 0.9;
        const cornerRadius = size * 0.15;

        // 中心位置から左上位置を計算
        const rectX = x - width / 2;
        const rectY = y - height / 2;

        // 角丸長方形のパスを作成
        const drawRoundedRect = (rx, ry, rw, rh, r) => {
            ctx.beginPath();
            ctx.moveTo(rx + r, ry);
            ctx.lineTo(rx + rw - r, ry);
            ctx.arcTo(rx + rw, ry, rx + rw, ry + r, r);
            ctx.lineTo(rx + rw, ry + rh - r);
            ctx.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
            ctx.lineTo(rx + r, ry + rh);
            ctx.arcTo(rx, ry + rh, rx, ry + rh - r, r);
            ctx.lineTo(rx, ry + r);
            ctx.arcTo(rx, ry, rx + r, ry, r);
            ctx.closePath();
        };

        // 外側の角丸長方形（白フチ）
        drawRoundedRect(rectX, rectY, width, height, cornerRadius);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 外側の角丸長方形（枠線）
        drawRoundedRect(rectX, rectY, width, height, cornerRadius);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();

        // 「ルビ」の文字（白フチ）
        ctx.font = `bold ${size * 0.45}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeText('ルビ', x, y);

        // 「ルビ」の文字
        ctx.fillStyle = color;
        ctx.fillText('ルビ', x, y);

        ctx.restore();
    }

    /**
     * トルスタンプを描画（角丸長方形内にトル）
     */
    function renderToruStamp(ctx, obj) {
        ctx.save();

        const x = obj.startPos.x;
        const y = obj.startPos.y;
        const size = obj.size || 28;
        const color = obj.color || '#ff0000';

        // 角丸長方形のサイズ
        const width = size * 1.8;
        const height = size * 0.9;
        const cornerRadius = size * 0.15;

        // 中心位置から左上位置を計算
        const rectX = x - width / 2;
        const rectY = y - height / 2;

        // 角丸長方形のパスを作成
        const drawRoundedRect = (rx, ry, rw, rh, r) => {
            ctx.beginPath();
            ctx.moveTo(rx + r, ry);
            ctx.lineTo(rx + rw - r, ry);
            ctx.arcTo(rx + rw, ry, rx + rw, ry + r, r);
            ctx.lineTo(rx + rw, ry + rh - r);
            ctx.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
            ctx.lineTo(rx + r, ry + rh);
            ctx.arcTo(rx, ry + rh, rx, ry + rh - r, r);
            ctx.lineTo(rx, ry + r);
            ctx.arcTo(rx, ry, rx + r, ry, r);
            ctx.closePath();
        };

        // 「トル」の文字（白フチ）
        ctx.font = `bold ${size * 0.9}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeText('トル', x, y);

        // 「トル」の文字
        ctx.fillStyle = color;
        ctx.fillText('トル', x, y);

        ctx.restore();
    }

    /**
     * トルツメスタンプを描画
     */
    function renderTorutsumeStamp(ctx, obj) {
        ctx.save();

        const x = obj.startPos.x;
        const y = obj.startPos.y;
        const size = obj.size || 28;
        const color = obj.color || '#ff0000';

        // 「トルツメ」の文字（白フチ）
        ctx.font = `bold ${size * 0.9}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeText('トルツメ', x, y);

        // 「トルツメ」の文字
        ctx.fillStyle = color;
        ctx.fillText('トルツメ', x, y);

        ctx.restore();
    }

    /**
     * トルママスタンプを描画
     */
    function renderTorumamaStamp(ctx, obj) {
        ctx.save();

        const x = obj.startPos.x;
        const y = obj.startPos.y;
        const size = obj.size || 28;
        const color = obj.color || '#ff0000';

        // 「トルママ」の文字（白フチ）
        ctx.font = `bold ${size * 0.9}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeText('トルママ', x, y);

        // 「トルママ」の文字
        ctx.fillStyle = color;
        ctx.fillText('トルママ', x, y);

        ctx.restore();
    }

    /**
     * 全角アキスタンプを描画
     */
    function renderZenkakuakiStamp(ctx, obj) {
        ctx.save();

        const x = obj.startPos.x;
        const y = obj.startPos.y;
        const size = obj.size || 28;
        const color = obj.color || '#ff0000';

        // 「全角アキ」の文字（白フチ）
        ctx.font = `bold ${size * 0.9}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeText('全角アキ', x, y);

        // 「全角アキ」の文字
        ctx.fillStyle = color;
        ctx.fillText('全角アキ', x, y);

        ctx.restore();
    }

    /**
     * 半角アキスタンプを描画
     */
    function renderNibunakiStamp(ctx, obj) {
        ctx.save();

        const x = obj.startPos.x;
        const y = obj.startPos.y;
        const size = obj.size || 28;
        const color = obj.color || '#ff0000';

        // 「半角アキ」の文字（白フチ）
        ctx.font = `bold ${size * 0.9}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeText('半角アキ', x, y);

        // 「半角アキ」の文字
        ctx.fillStyle = color;
        ctx.fillText('半角アキ', x, y);

        ctx.restore();
    }

    /**
     * 四分アキスタンプを描画
     */
    function renderShibunakiStamp(ctx, obj) {
        ctx.save();

        const x = obj.startPos.x;
        const y = obj.startPos.y;
        const size = obj.size || 28;
        const color = obj.color || '#ff0000';

        // 「四分アキ」の文字（白フチ）
        ctx.font = `bold ${size * 0.9}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeText('四分アキ', x, y);

        // 「四分アキ」の文字
        ctx.fillStyle = color;
        ctx.fillText('四分アキ', x, y);

        ctx.restore();
    }

    /**
     * 改行スタンプを描画
     */
    function renderKaigyouStamp(ctx, obj) {
        ctx.save();

        const x = obj.startPos.x;
        const y = obj.startPos.y;
        const size = obj.size || 28;
        const color = obj.color || '#ff0000';

        // 「改行」の文字（白フチ）
        ctx.font = `bold ${size * 0.9}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeText('改行', x, y);

        // 「改行」の文字
        ctx.fillStyle = color;
        ctx.fillText('改行', x, y);

        ctx.restore();
    }

    /**
     * 引出線を描画
     * トル系スタンプ・アキスタンプの場合は先端に●を描画
     */
    function renderLeaderLine(ctx, obj) {
        if (!obj.leaderLine) return;

        const color = obj.color || '#000000';
        const lineWidth = obj.lineWidth || 2;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(obj.leaderLine.start.x, obj.leaderLine.start.y);
        ctx.lineTo(obj.leaderLine.end.x, obj.leaderLine.end.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        // トル系スタンプ・アキスタンプ・改行スタンプ・写植スタンプ・文字サイズスタンプの場合は先端に●を描画
        if (obj.type === 'toruStamp' || obj.type === 'torutsumeStamp' || obj.type === 'torumamaStamp'
            || obj.type === 'zenkakuakiStamp' || obj.type === 'nibunakiStamp' || obj.type === 'shibunakiStamp'
            || obj.type === 'kaigyouStamp' || obj.type === 'fontLabel' || obj.type === 'text') {
            const dotRadius = Math.max(lineWidth, 2); // 線幅に比例した小さめの●

            ctx.beginPath();
            ctx.arc(obj.leaderLine.start.x, obj.leaderLine.start.y, dotRadius, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * アノテーション（コメント・指示）を描画
     */
    /**
     * アノテーションの引出線のみを描画（消しゴム対象）
     */
    function renderAnnotationLeaderLine(ctx, obj) {
        if (!obj.annotation || !obj.annotation.leaderLine) return;

        const ann = obj.annotation;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ann.leaderLine.start.x, ann.leaderLine.start.y);
        ctx.lineTo(ann.leaderLine.end.x, ann.leaderLine.end.y);
        ctx.strokeStyle = ann.color || '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * アノテーションのテキストのみを描画（消しゴム対象外）
     */
    function renderAnnotationText(ctx, obj) {
        if (!obj.annotation || !obj.annotation.text) return;

        const ann = obj.annotation;
        ctx.save();
        ctx.fillStyle = ann.color || '#000000';
        const fontSize = ann.fontSize || 16;
        ctx.font = `${fontSize}px sans-serif`;

        const lines = ann.text.split('\n');

        // 白い縁取り付きでテキストを描画
        const drawWithOutline = (char, px, py) => {
            ctx.save();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.strokeText(char, px, py);
            ctx.restore();
            ctx.fillText(char, px, py);
        };

        if (ann.isVertical) {
            // 縦書き
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const lineHeight = fontSize * 1.1;

            // 句読点など右上に移動させる文字 - 中点「・」は中央配置のため含めない
            const punctuationChars = ['、', '。', '，', '．', '｡', '､'];

            lines.forEach((line, colIndex) => {
                const currentX = ann.x - (colIndex * lineHeight);
                let cursorY = 0;
                const charData = Array.from(line).map(char => {
                    let h = fontSize;
                    if (char === ' ') h = fontSize * 0.3;
                    const centerY = cursorY + (h / 2);
                    cursorY += h;
                    return { char, centerY };
                });

                charData.forEach((item) => {
                    const char = item.char;
                    const currentY = ann.y + item.centerY;
                    if (char === ' ') return;

                    const needsRotation = ['ー', '−', '―', '…', '(', ')', '（', '）', '[', ']', '「', '」', '～', '〜', '＝', '='].includes(char);
                    const isPunctuation = punctuationChars.includes(char);

                    if (needsRotation) {
                        ctx.save();
                        ctx.translate(currentX, currentY);
                        ctx.rotate(Math.PI / 2);
                        drawWithOutline(char, 0, 0);
                        ctx.restore();
                    } else if (isPunctuation) {
                        // 句読点は右上に移動（文字の右端に配置）
                        const offsetX = fontSize * 0.7;
                        const offsetY = -fontSize * 0.55;
                        drawWithOutline(char, currentX + offsetX, currentY + offsetY);
                    } else {
                        drawWithOutline(char, currentX, currentY);
                    }
                });
            });
        } else {
            // 横書き
            ctx.textAlign = ann.align || 'left';
            ctx.textBaseline = 'top';
            const lineHeight = fontSize * 1.2;

            lines.forEach((line, index) => {
                const currentY = ann.y + (index * lineHeight);
                drawWithOutline(line, ann.x, currentY);
            });
        }

        ctx.restore();
    }

    function renderAnnotation(ctx, obj) {
        if (!obj.annotation) return;

        const ann = obj.annotation;

        // 引出線を描画
        if (ann.leaderLine) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ann.leaderLine.start.x, ann.leaderLine.start.y);
            ctx.lineTo(ann.leaderLine.end.x, ann.leaderLine.end.y);
            ctx.strokeStyle = ann.color || '#000000';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }

        // テキストを描画
        if (ann.text) {
            ctx.save();
            ctx.fillStyle = ann.color || '#000000';
            const fontSize = ann.fontSize || 16;
            ctx.font = `${fontSize}px sans-serif`;

            const lines = ann.text.split('\n');

            // 白い縁取り付きでテキストを描画
            const drawWithOutline = (char, px, py) => {
                ctx.save();
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#ffffff';
                ctx.strokeText(char, px, py);
                ctx.restore();
                ctx.fillText(char, px, py);
            };

            if (ann.isVertical) {
                // 縦書き
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const lineHeight = fontSize * 1.1;

                // 句読点など右上に移動させる文字 - 中点「・」は中央配置のため含めない
                const punctuationChars = ['、', '。', '，', '．', '｡', '､'];

                lines.forEach((line, colIndex) => {
                    const currentX = ann.x - (colIndex * lineHeight);
                    let cursorY = 0;
                    const charData = Array.from(line).map(char => {
                        let h = fontSize;
                        if (char === ' ') h = fontSize * 0.3;
                        const centerY = cursorY + (h / 2);
                        cursorY += h;
                        return { char, centerY };
                    });

                    charData.forEach((item) => {
                        const char = item.char;
                        const currentY = ann.y + item.centerY;
                        if (char === ' ') return;

                        const needsRotation = ['ー', '−', '―', '…', '(', ')', '（', '）', '[', ']', '「', '」', '～', '〜', '＝', '='].includes(char);
                        const isPunctuation = punctuationChars.includes(char);

                        if (needsRotation) {
                            ctx.save();
                            ctx.translate(currentX, currentY);
                            ctx.rotate(Math.PI / 2);
                            drawWithOutline(char, 0, 0);
                            ctx.restore();
                        } else if (isPunctuation) {
                            // 句読点は右上に移動（文字の右端に配置）
                            const offsetX = fontSize * 0.7;
                            const offsetY = -fontSize * 0.55;
                            drawWithOutline(char, currentX + offsetX, currentY + offsetY);
                        } else {
                            drawWithOutline(char, currentX, currentY);
                        }
                    });
                });
            } else {
                // 横書き
                ctx.textAlign = ann.align || 'left';
                ctx.textBaseline = 'top';
                const lineHeight = fontSize * 1.2;

                lines.forEach((line, index) => {
                    const currentY = ann.y + (index * lineHeight);
                    drawWithOutline(line, ann.x, currentY);
                });
            }

            ctx.restore();
        }
    }

    /**
     * 選択ハンドルを描画
     */
    function renderSelectionHandles(ctx, obj) {
        const bounds = getBounds(obj);

        // 選択枠
        ctx.save();
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

        // ハンドル
        ctx.setLineDash([]);
        const handles = getHandlePositions(bounds);
        const hs = HANDLE_SIZE / 2;

        for (const hp of Object.values(handles)) {
            ctx.fillStyle = SELECTION_HANDLE_COLOR;
            ctx.fillRect(hp.x - hs, hp.y - hs, HANDLE_SIZE, HANDLE_SIZE);
            ctx.strokeStyle = SELECTION_COLOR;
            ctx.strokeRect(hp.x - hs, hp.y - hs, HANDLE_SIZE, HANDLE_SIZE);
        }

        // アノテーションの選択枠を描画（オレンジ色）
        if (obj.annotation && obj.annotation.text) {
            const ann = obj.annotation;
            const fontSize = ann.fontSize || 16;
            const lines = ann.text.split('\n');
            const padding = 2;  // パディングを小さく

            let minX, maxX, minY, maxY;

            if (ann.isVertical) {
                // 縦書きの場合
                const lineHeight = fontSize * 1.1;
                const charCounts = lines.map(line => Array.from(line).length);
                const maxCharsInLine = Math.max(...charCounts, 1);
                const textHeight = maxCharsInLine * fontSize;
                const totalWidth = Math.max(lines.length, 1) * lineHeight;

                // 縦書き: textAlign='center', textBaseline='middle' で描画
                // ann.x が最初の列の中心、ann.y が最初の文字の中心
                minX = ann.x - totalWidth + fontSize / 2;
                maxX = ann.x + fontSize / 2;
                minY = ann.y - fontSize / 2;
                maxY = ann.y + textHeight - fontSize / 2;
            } else {
                // 横書きの場合
                const lineHeight = fontSize * 1.2;
                const charWidths = lines.map(line => {
                    let width = 0;
                    for (const char of line) {
                        if (char.charCodeAt(0) < 128) {
                            width += fontSize * 0.6;
                        } else {
                            width += fontSize;
                        }
                    }
                    return width;
                });
                const maxLineWidth = Math.max(...charWidths, fontSize);
                const textHeight = lines.length * lineHeight;

                // 横書き: textBaseline='top' で描画されるので ann.y がテキスト上端
                if (ann.align === 'right') {
                    minX = ann.x - maxLineWidth;
                    maxX = ann.x;
                } else {
                    minX = ann.x;
                    maxX = ann.x + maxLineWidth;
                }
                minY = ann.y;  // テキスト上端から
                maxY = ann.y + textHeight - (lineHeight - fontSize);  // 最後の行の下端まで
            }

            // オレンジ色の枠を描画
            ctx.strokeStyle = '#FF9800';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            ctx.strokeRect(
                minX - padding,
                minY - padding,
                (maxX - minX) + padding * 2,
                (maxY - minY) + padding * 2
            );
        }

        // 指示スタンプなどの引出線ハンドルを描画（緑色の円形ハンドル）
        if (obj.leaderLine && obj.leaderLine.start && obj.leaderLine.end) {
            const handleRadius = HANDLE_SIZE / 2;

            // 起点ハンドル（●の位置）
            ctx.fillStyle = '#4CAF50';  // 緑色
            ctx.strokeStyle = '#2E7D32';  // 濃い緑
            ctx.lineWidth = 1;
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(obj.leaderLine.start.x, obj.leaderLine.start.y, handleRadius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();

            // 終端ハンドル（スタンプ側）
            ctx.beginPath();
            ctx.arc(obj.leaderLine.end.x, obj.leaderLine.end.y, handleRadius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        }

        // fontLabelのテキスト部分の選択枠を描画（オレンジ色）
        if (obj.type === 'fontLabel' && obj.textX !== undefined && obj.textY !== undefined) {
            const fontSize = obj.fontSize || 12;
            const fontName = obj.fontName || '';
            const textWidth = fontName.length * fontSize * 0.7;
            const padding = 4;

            let textMinX, textMaxX;
            if (obj.textAlign === 'left') {
                textMinX = obj.textX;
                textMaxX = obj.textX + textWidth;
            } else {
                textMinX = obj.textX - textWidth;
                textMaxX = obj.textX;
            }
            const textMinY = obj.textY - fontSize / 2;
            const textMaxY = obj.textY + fontSize / 2;

            // オレンジ色の枠を描画
            ctx.strokeStyle = '#FF9800';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(
                textMinX - padding,
                textMinY - padding,
                (textMaxX - textMinX) + padding * 2,
                (textMaxY - textMinY) + padding * 2
            );
        }

        // 削除ボタンを右下に描画
        renderDeleteButton(ctx, bounds);

        ctx.restore();
    }

    /**
     * 削除ボタンを描画（ゴミ箱アイコン）
     * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
     * @param {{x: number, y: number, width: number, height: number}} bounds - オブジェクトの境界
     */
    function renderDeleteButton(ctx, bounds) {
        const btnX = bounds.x + bounds.width + DELETE_BUTTON_OFFSET;
        const btnY = bounds.y + bounds.height + DELETE_BUTTON_OFFSET;
        const size = DELETE_BUTTON_SIZE;

        ctx.save();

        // ボタン背景（円形）
        ctx.beginPath();
        ctx.arc(btnX + size / 2, btnY + size / 2, size / 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#F44336';  // 赤色
        ctx.fill();
        ctx.strokeStyle = '#D32F2F';
        ctx.lineWidth = 1;
        ctx.stroke();

        // ゴミ箱アイコンを描画
        const iconScale = size / 24;  // 24pxベースのアイコンをスケール
        const cx = btnX + size / 2;
        const cy = btnY + size / 2;

        ctx.strokeStyle = '#FFFFFF';
        ctx.fillStyle = '#FFFFFF';
        ctx.lineWidth = 1.5 * iconScale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // ゴミ箱の蓋
        ctx.beginPath();
        ctx.moveTo(cx - 6 * iconScale, cy - 5 * iconScale);
        ctx.lineTo(cx + 6 * iconScale, cy - 5 * iconScale);
        ctx.stroke();

        // 蓋の取っ手
        ctx.beginPath();
        ctx.moveTo(cx - 2 * iconScale, cy - 5 * iconScale);
        ctx.lineTo(cx - 2 * iconScale, cy - 7 * iconScale);
        ctx.lineTo(cx + 2 * iconScale, cy - 7 * iconScale);
        ctx.lineTo(cx + 2 * iconScale, cy - 5 * iconScale);
        ctx.stroke();

        // ゴミ箱本体
        ctx.beginPath();
        ctx.moveTo(cx - 5 * iconScale, cy - 4 * iconScale);
        ctx.lineTo(cx - 4 * iconScale, cy + 6 * iconScale);
        ctx.lineTo(cx + 4 * iconScale, cy + 6 * iconScale);
        ctx.lineTo(cx + 5 * iconScale, cy - 4 * iconScale);
        ctx.closePath();
        ctx.stroke();

        // ゴミ箱の縦線
        ctx.beginPath();
        ctx.moveTo(cx - 2 * iconScale, cy - 2 * iconScale);
        ctx.lineTo(cx - 2 * iconScale, cy + 4 * iconScale);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, cy - 2 * iconScale);
        ctx.lineTo(cx, cy + 4 * iconScale);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + 2 * iconScale, cy - 2 * iconScale);
        ctx.lineTo(cx + 2 * iconScale, cy + 4 * iconScale);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * 削除ボタンの位置を取得
     * @param {{x: number, y: number, width: number, height: number}} bounds - オブジェクトの境界
     * @returns {{x: number, y: number, size: number}} 削除ボタンの位置とサイズ
     */
    function getDeleteButtonPosition(bounds) {
        return {
            x: bounds.x + bounds.width + DELETE_BUTTON_OFFSET,
            y: bounds.y + bounds.height + DELETE_BUTTON_OFFSET,
            size: DELETE_BUTTON_SIZE
        };
    }

    /**
     * 削除ボタンのヒットテスト
     * @param {{x: number, y: number}} pos - クリック位置
     * @param {Object} obj - オブジェクト
     * @returns {boolean} 削除ボタンがクリックされたかどうか
     */
    function hitTestDeleteButton(pos, obj) {
        const bounds = getBounds(obj);
        const btn = getDeleteButtonPosition(bounds);
        const cx = btn.x + btn.size / 2;
        const cy = btn.y + btn.size / 2;
        const radius = btn.size / 2 + 4;  // 少し大きめの判定領域

        const dx = pos.x - cx;
        const dy = pos.y - cy;
        return (dx * dx + dy * dy) <= (radius * radius);
    }

    /**
     * 複数選択時の削除ボタンのヒットテスト
     * @param {{x: number, y: number}} pos - クリック位置
     * @param {Array} objects - 全オブジェクト配列
     * @param {Array} selectedIndices - 選択されたオブジェクトのインデックス配列
     * @returns {boolean} 削除ボタンがクリックされたかどうか
     */
    function hitTestMultiSelectDeleteButton(pos, objects, selectedIndices) {
        const bounds = getMultiSelectBounds(objects, selectedIndices);
        if (!bounds) return false;

        const btn = getDeleteButtonPosition(bounds);
        const cx = btn.x + btn.size / 2;
        const cy = btn.y + btn.size / 2;
        const radius = btn.size / 2 + 4;  // 少し大きめの判定領域

        const dx = pos.x - cx;
        const dy = pos.y - cy;
        return (dx * dx + dy * dy) <= (radius * radius);
    }

    /**
     * 単一オブジェクトを描画
     */
    function renderObject(ctx, obj, isSelected) {
        // 各オブジェクト描画前にコンテキスト状態を保存（マーカーなどの設定が他に影響しないように）
        ctx.save();

        // デフォルト状態にリセット
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';

        switch (obj.type) {
            case 'line':
                renderLine(ctx, obj);
                break;
            case 'arrow':
                renderArrow(ctx, obj);
                break;
            case 'doubleArrow':
                renderDoubleArrow(ctx, obj);
                break;
            case 'doubleArrowAnnotated':
                renderDoubleArrowAnnotated(ctx, obj);
                break;
            case 'rect':
                renderRect(ctx, obj);
                break;
            case 'labeledRect':
                renderLabeledRect(ctx, obj);
                break;
            case 'ellipse':
                renderEllipse(ctx, obj);
                break;
            case 'semicircle':
                renderSemicircle(ctx, obj);
                break;
            case 'chevron':
                renderChevron(ctx, obj);
                break;
            case 'lshape':
                renderLshape(ctx, obj);
                break;
            case 'zshape':
                renderZshape(ctx, obj);
                break;
            case 'bracket':
                renderBracket(ctx, obj);
                break;
            case 'rectSymbolStamp':
                renderRectSymbolStamp(ctx, obj);
                break;
            case 'triangleSymbolStamp':
                renderTriangleSymbolStamp(ctx, obj);
                break;
            case 'pen':
                renderPen(ctx, obj);
                break;
            case 'marker':
                renderMarker(ctx, obj);
                break;
            case 'eraser':
                renderEraser(ctx, obj);
                break;
            case 'polyline':
                renderPolyline(ctx, obj);
                break;
            case 'fontLabel':
                renderFontLabel(ctx, obj);
                break;
            case 'text':
                renderText(ctx, obj);
                break;
            case 'image':
                renderImage(ctx, obj);
                break;
            case 'doneStamp':
                renderDoneStamp(ctx, obj);
                break;
            case 'komojiStamp':
                renderKomojiStamp(ctx, obj);
                break;
            case 'rubyStamp':
                renderRubyStamp(ctx, obj);
                break;
            case 'toruStamp':
                renderToruStamp(ctx, obj);
                break;
            case 'torutsumeStamp':
                renderTorutsumeStamp(ctx, obj);
                break;
            case 'torumamaStamp':
                renderTorumamaStamp(ctx, obj);
                break;
            case 'zenkakuakiStamp':
                renderZenkakuakiStamp(ctx, obj);
                break;
            case 'nibunakiStamp':
                renderNibunakiStamp(ctx, obj);
                break;
            case 'shibunakiStamp':
                renderShibunakiStamp(ctx, obj);
                break;
            case 'kaigyouStamp':
                renderKaigyouStamp(ctx, obj);
                break;
        }

        // 引出線（fontLabelは引出線を描画しない）
        if (obj.leaderLine && obj.type !== 'fontLabel') {
            renderLeaderLine(ctx, obj);
        }

        // アノテーション（コメント・指示）
        if (obj.annotation) {
            renderAnnotation(ctx, obj);
        }

        // 選択状態の場合はハンドルを描画（消しゴムは除く）
        if (isSelected && obj.type !== 'eraser') {
            renderSelectionHandles(ctx, obj);
        }

        // コンテキスト状態を復元
        ctx.restore();
    }

    /**
     * 全オブジェクトを描画（ビューポートカリング対応）
     * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
     * @param {number} pageNum - ページ番号
     * @param {number} xOffset - X方向オフセット（見開きモード用、省略時は0）
     */
    // エクスポートモードフラグ（マーカーのmultiply無効化用）
    let exportMode = false;

    /**
     * エクスポートモードを設定
     * @param {boolean} mode - true: エクスポートモード（マーカーのmultiply無効）
     */
    function setExportMode(mode) {
        exportMode = mode;
    }

    /**
     * エクスポートモードを取得
     * @returns {boolean}
     */
    function isExportMode() {
        return exportMode;
    }

    function renderAll(ctx, pageNum, xOffset = 0) {
        const startTime = performance.now();
        const DrawingObjects = window.MojiQDrawingObjects;
        if (!DrawingObjects) return;

        const objects = DrawingObjects.getPageObjects(pageNum);
        const selectedIndices = DrawingObjects.getSelectedIndices ? DrawingObjects.getSelectedIndices(pageNum) : [];
        const selectedIndex = DrawingObjects.getSelectedIndex(pageNum);

        // ビューポートを取得
        const viewport = cullingConfig.enabled ? getVisibleViewport() : null;

        // 統計情報をリセット
        cullingStats.totalObjects = objects.length;
        cullingStats.renderedObjects = 0;
        cullingStats.culledObjects = 0;

        // 消しゴムストロークをlinkedObjectIdsでグループ化
        const erasersByObjectId = {};
        objects.forEach((obj, index) => {
            if (obj.type === 'eraser' && obj.linkedObjectIds) {
                obj.linkedObjectIds.forEach(linkedId => {
                    if (!erasersByObjectId[linkedId]) {
                        erasersByObjectId[linkedId] = [];
                    }
                    erasersByObjectId[linkedId].push(obj);
                });
            }
        });

        // zIndexでソート（消しゴム以外のオブジェクトのみ）
        const sortedObjects = objects
            .map((obj, index) => ({ obj, index }))
            .filter(({ obj }) => obj.type !== 'eraser')
            .sort((a, b) => (a.obj.zIndex || 0) - (b.obj.zIndex || 0));

        // 見開きモード時はオフセットを適用
        if (xOffset !== 0) {
            ctx.save();
            ctx.translate(xOffset, 0);
        }

        // 描画（ビューポートカリング適用）
        sortedObjects.forEach(({ obj, index }) => {
            // PDF注釈テキストの表示/非表示チェック
            if (window.MojiQTextLayerManager && !MojiQTextLayerManager.shouldRenderObject(obj)) {
                cullingStats.culledObjects++;
                return;
            }

            // 複数選択対応：selectedIndicesに含まれているかチェック
            const isSelected = selectedIndices.includes(index) || index === selectedIndex;
            const visible = isObjectVisible(obj, viewport);

            // 選択中のオブジェクトは常に描画（ハンドル表示のため）
            if (isSelected || visible) {
                // このオブジェクトに関連する消しゴムストロークを取得
                const linkedErasers = obj.id ? (erasersByObjectId[obj.id] || []) : [];

                if (linkedErasers.length > 0) {
                    // 消しゴムストロークがある場合は、オフスクリーンキャンバスで合成
                    renderObjectWithErasers(ctx, obj, linkedErasers, isSelected, selectedIndices);
                } else {
                    // 消しゴムストロークがない場合は通常描画
                    const showHandles = selectedIndices.length <= 1 && isSelected;
                    renderObject(ctx, obj, showHandles);
                    // 複数選択時も選択枠を描画
                    if (isSelected && selectedIndices.length > 1) {
                        renderMultiSelectionOutline(ctx, obj);
                    }
                }
                cullingStats.renderedObjects++;
            } else {
                cullingStats.culledObjects++;

                // デバッグモード: カリングされたオブジェクトを赤枠で表示
                if (cullingConfig.debugMode) {
                    const bounds = getBounds(obj);
                    ctx.save();
                    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([2, 2]);
                    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
                    ctx.restore();
                }
            }
        });

        // 複数選択時は全体のバウンディングボックスの右下に削除ボタンを描画
        if (selectedIndices.length > 1) {
            const multiSelectBounds = getMultiSelectBounds(objects, selectedIndices);
            if (multiSelectBounds) {
                renderDeleteButton(ctx, multiSelectBounds);
            }
        }

        // 見開きモードのオフセットを復元
        if (xOffset !== 0) {
            ctx.restore();
        }

        cullingStats.lastRenderTime = performance.now() - startTime;

        // デバッグモード: 統計情報を表示
        if (cullingConfig.debugMode) {
            console.log(`[Culling] Total: ${cullingStats.totalObjects}, ` +
                        `Rendered: ${cullingStats.renderedObjects}, ` +
                        `Culled: ${cullingStats.culledObjects}, ` +
                        `Time: ${cullingStats.lastRenderTime.toFixed(2)}ms`);
        }
    }

    /**
     * 複数選択されたオブジェクトの全体バウンディングボックスを計算
     * @param {Array} objects - 全オブジェクト配列
     * @param {Array} selectedIndices - 選択されたオブジェクトのインデックス配列
     * @returns {{x: number, y: number, width: number, height: number}|null}
     */
    function getMultiSelectBounds(objects, selectedIndices) {
        if (!selectedIndices || selectedIndices.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const index of selectedIndices) {
            const obj = objects[index];
            if (!obj) continue;
            const bounds = getBounds(obj);
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        }

        if (minX === Infinity) return null;

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * オブジェクトと関連する消しゴムストロークをオフスクリーンキャンバスで合成して描画
     * @param {CanvasRenderingContext2D} ctx - 描画先コンテキスト
     * @param {Object} obj - 描画対象オブジェクト
     * @param {Array} erasers - 関連する消しゴムストローク配列
     * @param {boolean} isSelected - 選択中かどうか
     * @param {Array} selectedIndices - 選択中のインデックス配列
     */
    function renderObjectWithErasers(ctx, obj, erasers, isSelected, selectedIndices) {
        // オブジェクトの境界を計算
        const bounds = getBounds(obj);
        // パディングを追加（消しゴムの線幅分）
        const maxEraserWidth = Math.max(...erasers.map(e => e.lineWidth || 10));
        const padding = maxEraserWidth + 10;

        const offscreenWidth = Math.ceil(bounds.width + padding * 2);
        const offscreenHeight = Math.ceil(bounds.height + padding * 2);

        if (offscreenWidth <= 0 || offscreenHeight <= 0) {
            return;
        }

        // デバイスピクセル比を取得
        const dpr = window.devicePixelRatio || 1;

        // オフスクリーンキャンバスを作成（高解像度対応）
        const offscreen = document.createElement('canvas');
        offscreen.width = offscreenWidth * dpr;
        offscreen.height = offscreenHeight * dpr;
        const offCtx = offscreen.getContext('2d');

        // 高解像度対応のスケーリング
        offCtx.scale(dpr, dpr);

        // オフセットを計算（オブジェクトの左上を原点にする）
        const offsetX = bounds.x - padding;
        const offsetY = bounds.y - padding;

        // オフスクリーンキャンバスを原点移動
        offCtx.translate(-offsetX, -offsetY);

        // annotation付きの図形（rect, ellipse, line）の場合：
        // 図形部分のみを消しゴム対象にし、引出線・テキストは消しゴムの影響を受けない
        const hasAnnotation = obj.annotation && (obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'line');

        if (hasAnnotation) {
            // 図形本体のみを描画
            offCtx.save();
            offCtx.globalAlpha = 1.0;
            offCtx.globalCompositeOperation = 'source-over';
            switch (obj.type) {
                case 'rect':
                    renderRect(offCtx, obj);
                    break;
                case 'ellipse':
                    renderEllipse(offCtx, obj);
                    break;
                case 'line':
                    renderLine(offCtx, obj);
                    break;
            }
            offCtx.restore();

            // 消しゴムストロークを適用（図形部分のみに対して）
            erasers.forEach(eraser => {
                renderEraser(offCtx, eraser);
            });

            // メインキャンバスに合成（消しゴム適用後の図形）
            ctx.drawImage(offscreen, 0, 0, offscreen.width, offscreen.height,
                          offsetX, offsetY, offscreenWidth, offscreenHeight);

            // 引出線とテキストは消しゴムの影響を受けないようにメインキャンバスに直接描画
            renderAnnotationLeaderLine(ctx, obj);
            renderAnnotationText(ctx, obj);
        } else {
            // pen, markerなど：従来どおり全体を消しゴム対象
            renderObject(offCtx, obj, false);

            // 消しゴムストロークを適用
            erasers.forEach(eraser => {
                renderEraser(offCtx, eraser);
            });

            // メインキャンバスに合成（元のサイズで描画）
            ctx.drawImage(offscreen, 0, 0, offscreen.width, offscreen.height,
                          offsetX, offsetY, offscreenWidth, offscreenHeight);
        }

        // 選択ハンドルを描画（メインキャンバスに直接）
        if (isSelected) {
            const showHandles = selectedIndices.length <= 1;
            if (showHandles) {
                ctx.save();
                renderSelectionHandles(ctx, obj);
                ctx.restore();
            } else {
                renderMultiSelectionOutline(ctx, obj);
            }
        }
    }

    /**
     * 複数選択時の選択枠を描画（ハンドルなし）
     */
    function renderMultiSelectionOutline(ctx, obj) {
        const bounds = getBounds(obj);

        ctx.save();
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.setLineDash([]);
        ctx.restore();
    }

    /**
     * 全オブジェクトからヒットテスト
     */
    function hitTestAll(pos, pageNum, tolerance) {
        const DrawingObjects = window.MojiQDrawingObjects;
        if (!DrawingObjects) return -1;

        const objects = DrawingObjects.getPageObjects(pageNum);

        // 逆順でチェック（後から描画されたものが上にある）
        for (let i = objects.length - 1; i >= 0; i--) {
            // 消しゴムオブジェクトは選択不可
            if (objects[i].type === 'eraser') continue;
            if (hitTest(pos, objects[i], tolerance)) {
                return i;
            }
        }
        return -1;
    }

    /**
     * アノテーション（コメント・指示）のヒットテスト
     * @param {object} pos - クリック位置
     * @param {object} obj - オブジェクト
     * @param {number} tolerance - 許容範囲
     * @returns {boolean} アノテーション部分がヒットしたかどうか
     */
    function hitTestAnnotation(pos, obj, tolerance) {
        if (!obj.annotation) return false;

        tolerance = tolerance || 5;
        const ann = obj.annotation;

        // アノテーションテキストの領域をチェック
        if (ann.text && ann.x !== undefined && ann.y !== undefined) {
            const fontSize = ann.fontSize || 16;
            const lines = ann.text.split('\n');

            if (ann.isVertical) {
                // 縦書きの場合
                const lineHeight = fontSize * 1.1;
                const charCounts = lines.map(line => Array.from(line).length);
                const maxCharsInLine = Math.max(...charCounts, 1);
                const textHeight = maxCharsInLine * fontSize;
                const totalWidth = Math.max(lines.length, 1) * lineHeight;

                // 縦書き: textAlign='center', textBaseline='middle' で描画
                const minX = ann.x - totalWidth + fontSize / 2;
                const maxX = ann.x + fontSize / 2;
                const minY = ann.y - fontSize / 2;
                const maxY = ann.y + textHeight - fontSize / 2;

                if (pos.x >= minX - tolerance && pos.x <= maxX + tolerance &&
                    pos.y >= minY - tolerance && pos.y <= maxY + tolerance) {
                    return true;
                }
            } else {
                // 横書きの場合
                const lineHeight = fontSize * 1.2;
                const charWidths = lines.map(line => {
                    let width = 0;
                    for (const char of line) {
                        if (char.charCodeAt(0) < 128) {
                            width += fontSize * 0.6;
                        } else {
                            width += fontSize;
                        }
                    }
                    return width;
                });
                const maxLineWidth = Math.max(...charWidths, fontSize);
                const textHeight = lines.length * lineHeight;

                let minX, maxX;
                if (ann.align === 'right') {
                    minX = ann.x - maxLineWidth;
                    maxX = ann.x;
                } else {
                    minX = ann.x;
                    maxX = ann.x + maxLineWidth;
                }
                // 横書き: textBaseline='top' で描画されるので ann.y がテキスト上端
                const minY = ann.y;
                const maxY = ann.y + textHeight - (lineHeight - fontSize);

                if (pos.x >= minX - tolerance && pos.x <= maxX + tolerance &&
                    pos.y >= minY - tolerance && pos.y <= maxY + tolerance) {
                    return true;
                }
            }
        }

        // アノテーションの引出線のヒットテスト
        if (ann.leaderLine) {
            if (hitTestLine(pos, ann.leaderLine.start, ann.leaderLine.end, tolerance + 2)) {
                return true;
            }
        }

        return false;
    }

    // --- カリング設定関数 ---

    /**
     * カリング設定を変更
     * @param {Object} config - { enabled?, margin?, debugMode? }
     */
    function configureCulling(config) {
        if (config.enabled !== undefined) cullingConfig.enabled = config.enabled;
        if (config.margin !== undefined) cullingConfig.margin = config.margin;
        if (config.debugMode !== undefined) cullingConfig.debugMode = config.debugMode;
    }

    /**
     * カリング統計情報を取得
     * @returns {Object}
     */
    function getCullingStats() {
        return { ...cullingStats };
    }

    /**
     * 現在のビューポートを取得（外部公開用）
     * @returns {Object|null}
     */
    function getViewport() {
        return getVisibleViewport();
    }

    /**
     * アノテーションの引出線終端ハンドルのヒットテスト
     * @param {object} pos - クリック位置
     * @param {object} obj - オブジェクト
     * @returns {boolean} 引出線終端ハンドルがヒットしたかどうか
     */
    function hitTestLeaderEndHandle(pos, obj) {
        if (!obj.annotation || !obj.annotation.leaderLine || !obj.annotation.leaderLine.end) {
            return false;
        }

        const leaderEnd = obj.annotation.leaderLine.end;
        const handleRadius = HANDLE_SIZE / 2 + 3;  // 少し大きめの判定領域

        const dx = pos.x - leaderEnd.x;
        const dy = pos.y - leaderEnd.y;
        return (dx * dx + dy * dy) <= (handleRadius * handleRadius);
    }

    /**
     * 指示スタンプなどの引出線終端ハンドルのヒットテスト
     * @param {object} pos - クリック位置
     * @param {object} obj - オブジェクト
     * @returns {boolean} 引出線終端ハンドルがヒットしたかどうか
     */
    function hitTestStampLeaderEndHandle(pos, obj) {
        if (!obj.leaderLine || !obj.leaderLine.end) {
            return false;
        }

        const leaderEnd = obj.leaderLine.end;
        const handleRadius = HANDLE_SIZE / 2 + 3;  // 少し大きめの判定領域

        const dx = pos.x - leaderEnd.x;
        const dy = pos.y - leaderEnd.y;
        return (dx * dx + dy * dy) <= (handleRadius * handleRadius);
    }

    /**
     * 指示スタンプなどの引出線起点ハンドルのヒットテスト
     * @param {object} pos - クリック位置
     * @param {object} obj - オブジェクト
     * @returns {boolean} 引出線起点ハンドルがヒットしたかどうか
     */
    function hitTestStampLeaderStartHandle(pos, obj) {
        if (!obj.leaderLine || !obj.leaderLine.start) {
            return false;
        }

        const leaderStart = obj.leaderLine.start;
        const handleRadius = HANDLE_SIZE / 2 + 3;  // 少し大きめの判定領域

        const dx = pos.x - leaderStart.x;
        const dy = pos.y - leaderStart.y;
        return (dx * dx + dy * dy) <= (handleRadius * handleRadius);
    }

    /**
     * fontLabelのテキスト部分のみのヒットテスト
     * @param {object} pos - クリック位置
     * @param {object} obj - オブジェクト
     * @param {number} tolerance - 許容誤差
     * @returns {boolean} テキスト部分がヒットしたかどうか
     */
    function hitTestFontLabelText(pos, obj, tolerance) {
        if (obj.type !== 'fontLabel' || obj.textX === undefined || obj.textY === undefined) {
            return false;
        }

        tolerance = tolerance || 5;
        const fontSize = obj.fontSize || 12;
        const fontName = obj.fontName || '';
        const textWidth = fontName.length * fontSize * 0.7;
        let textMinX, textMaxX;
        if (obj.textAlign === 'left') {
            textMinX = obj.textX;
            textMaxX = obj.textX + textWidth;
        } else {
            textMinX = obj.textX - textWidth;
            textMaxX = obj.textX;
        }
        const textMinY = obj.textY - fontSize / 2;
        const textMaxY = obj.textY + fontSize / 2;
        return pos.x >= textMinX - tolerance && pos.x <= textMaxX + tolerance &&
               pos.y >= textMinY - tolerance && pos.y <= textMaxY + tolerance;
    }

    /**
     * マーキー選択の矩形をレンダリング
     * @param {CanvasRenderingContext2D} ctx - キャンバスコンテキスト
     * @param {object} rect - { x, y, width, height }
     */
    function renderMarqueeRect(ctx, rect) {
        if (!rect || rect.width === 0 || rect.height === 0) return;

        ctx.save();

        // 塗りつぶし（半透明の青）
        ctx.fillStyle = 'rgba(33, 150, 243, 0.1)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

        // 枠線（青の破線）
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.setLineDash([]);

        ctx.restore();
    }

    // --- 公開API ---
    return {
        renderAll: renderAll,
        renderObject: renderObject,
        renderSelectionHandles: renderSelectionHandles,
        renderMarqueeRect: renderMarqueeRect,
        getBounds: getBounds,
        getMultiSelectBounds: getMultiSelectBounds,
        hitTest: hitTest,
        hitTestAll: hitTestAll,
        hitTestHandle: hitTestHandle,
        hitTestAnnotation: hitTestAnnotation,
        hitTestLeaderEndHandle: hitTestLeaderEndHandle,
        hitTestStampLeaderEndHandle: hitTestStampLeaderEndHandle,
        hitTestStampLeaderStartHandle: hitTestStampLeaderStartHandle,
        hitTestFontLabelText: hitTestFontLabelText,
        hitTestDeleteButton: hitTestDeleteButton,
        hitTestMultiSelectDeleteButton: hitTestMultiSelectDeleteButton,
        getHandlePositions: getHandlePositions,
        getDeleteButtonPosition: getDeleteButtonPosition,
        HANDLE_SIZE: HANDLE_SIZE,
        DELETE_BUTTON_SIZE: DELETE_BUTTON_SIZE,

        // ビューポートカリング関連
        configureCulling: configureCulling,
        getCullingStats: getCullingStats,
        getViewport: getViewport,
        isObjectVisible: isObjectVisible,

        // エクスポートモード（PDF保存時にマーカーのmultiply無効化）
        setExportMode: setExportMode,
        isExportMode: isExportMode
    };
})();
