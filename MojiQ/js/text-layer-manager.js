/**
 * MojiQ PDF注釈テキスト表示/非表示管理モジュール
 * PDFの注釈から読み込んだテキストオブジェクトの表示/非表示を切り替える
 */
window.MojiQTextLayerManager = (function() {
    'use strict';

    // === 状態管理 ===
    let isHidden = false; // PDF注釈テキストを非表示にしているかどうか
    let initialized = false;

    /**
     * 初期化
     */
    function init() {
        if (initialized) return;
        initialized = true;
    }

    /**
     * PDF注釈テキストの表示/非表示を切り替え
     */
    function toggle() {
        if (isHidden) {
            show();
        } else {
            hide();
        }
        return isHidden;
    }

    /**
     * PDF注釈テキストを表示する
     */
    function show() {
        if (!initialized) init();

        isHidden = false;
        updateButtonState();
        redrawCurrentPage();
    }

    /**
     * PDF注釈テキストを非表示にする
     */
    function hide() {
        if (!initialized) init();

        isHidden = true;
        updateButtonState();
        redrawCurrentPage();
    }

    /**
     * 現在のページを再描画
     */
    function redrawCurrentPage() {
        if (window.MojiQPdfManager && window.MojiQDrawingObjects) {
            const pageNum = MojiQDrawingObjects.getCurrentPage();
            MojiQPdfManager.renderPage(pageNum);
        }
    }

    /**
     * ボタンの状態を更新
     */
    function updateButtonState() {
        const btn = document.getElementById('textLayerBtn');
        const slash = document.getElementById('textLayerSlash');
        if (btn) {
            if (isHidden) {
                btn.title = 'コメントテキスト表示 (Ctrl+T) - 非表示中';
                btn.classList.add('hidden-state');
                if (slash) slash.style.display = '';
            } else {
                btn.title = 'コメントテキスト非表示 (Ctrl+T)';
                btn.classList.remove('hidden-state');
                if (slash) slash.style.display = 'none';
            }
        }
    }

    /**
     * 非表示状態を取得
     */
    function getIsHidden() {
        return isHidden;
    }

    /**
     * 非表示状態を設定（PDF読み込み時の状態復元用）
     * @param {boolean} hidden - 非表示にするかどうか
     */
    function setIsHidden(hidden) {
        if (!initialized) init();
        isHidden = !!hidden;
        updateButtonState();
    }

    /**
     * オブジェクトがPDF注釈由来かどうかをチェック
     * @param {Object} obj - 描画オブジェクト
     * @returns {boolean} PDF注釈由来の場合true
     */
    function isPdfAnnotationObject(obj) {
        return obj && obj._pdfAnnotationSource;
    }

    /**
     * オブジェクトを描画すべきかどうかをチェック
     * @param {Object} obj - 描画オブジェクト
     * @returns {boolean} 描画すべき場合true
     */
    function shouldRenderObject(obj) {
        // PDF注釈テキストが非表示モードで、かつ対象がPDF注釈由来の場合はfalse
        if (isHidden && isPdfAnnotationObject(obj)) {
            return false;
        }
        return true;
    }

    /**
     * クリーンアップ
     */
    function cleanup() {
        isHidden = false;
        initialized = false;
        updateButtonState();
    }

    // === 公開API ===
    return {
        init: init,
        toggle: toggle,
        show: show,
        hide: hide,
        isHidden: getIsHidden,
        setIsHidden: setIsHidden,  // PDF読み込み時の状態復元用
        isVisible: function() { return !isHidden; }, // 後方互換性
        isPdfAnnotationObject: isPdfAnnotationObject,
        shouldRenderObject: shouldRenderObject,
        cleanup: cleanup,
        // 不要になったメソッド（互換性のため空実装）
        setTextContent: function() {},
        renderTextLayer: function() {},
        clearTextLayer: function() {},
        hasTextContent: function() { return false; }
    };
})();
