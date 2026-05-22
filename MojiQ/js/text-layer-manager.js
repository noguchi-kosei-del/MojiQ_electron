/**
 * MojiQ PDF注釈テキスト表示/非表示管理モジュール
 * PDFの注釈から読み込んだテキストオブジェクトの表示/非表示を切り替える
 */
window.MojiQTextLayerManager = (function() {
    'use strict';

    // === 状態管理 ===
    let isHidden = false; // PDF注釈テキストを非表示にしているかどうか
    let initialized = false;
    let hasAnnotationTextCache = false; // PDF注釈由来テキストが存在するか

    /**
     * 初期化
     */
    function init() {
        if (initialized) return;
        initialized = true;

        // オブジェクト変更時にボタン状態を更新
        window.addEventListener('mojiq:objects-changed', function(e) {
            // 削除やクリアの場合のみ更新（追加は pdf-annotation-loader で処理）
            const action = e.detail && e.detail.action;
            if (action === 'delete' || action === 'clear' || action === 'import') {
                updateButtonAvailability();
            }
        });
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
        // サイドバーのボタン
        const btn = document.getElementById('textLayerBtn');
        const slash = document.getElementById('textLayerSlash');
        if (btn) {
            if (isHidden) {
                btn.title = 'コメントテキスト表示 (Ctrl+T)';
                btn.classList.add('hidden-state');
                if (slash) slash.style.display = '';
            } else {
                btn.title = 'コメントテキスト非表示 (Ctrl+T)';
                btn.classList.remove('hidden-state');
                if (slash) slash.style.display = 'none';
            }
        }

        // 校正パネルのボタン
        const proofBtn = document.getElementById('proofToggleTextLayerBtn');
        if (proofBtn) {
            proofBtn.classList.toggle('active', isHidden);
            proofBtn.title = isHidden ? 'コメントテキスト表示 (Ctrl+T)' : 'コメントテキスト非表示 (Ctrl+T)';
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
     * 非表示状態を設定（UI更新なし、保存処理用）
     * @param {boolean} hidden - 非表示にするかどうか
     */
    function setIsHiddenInternal(hidden) {
        isHidden = !!hidden;
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
     * PDF注釈由来のテキストオブジェクトが存在するかチェック
     * @returns {boolean} 存在する場合true
     */
    function checkHasAnnotationText() {
        if (!window.MojiQDrawingObjects) return false;

        const allData = window.MojiQDrawingObjects.getAllPagesData();
        if (!allData) return false;

        for (const pageNum in allData) {
            const objects = allData[pageNum];
            if (!objects) continue;
            for (const obj of objects) {
                if (isPdfAnnotationObject(obj)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * ボタンの有効/無効状態を更新（テキストオブジェクトの有無に応じて）
     */
    function updateButtonAvailability() {
        hasAnnotationTextCache = checkHasAnnotationText();

        const textLayerBtn = document.getElementById('textLayerBtn');
        const proofToggleBtn = document.getElementById('proofToggleTextLayerBtn');

        if (textLayerBtn) {
            if (hasAnnotationTextCache) {
                textLayerBtn.disabled = false;
                textLayerBtn.classList.remove('no-annotation-text');
            } else {
                textLayerBtn.disabled = true;
                textLayerBtn.classList.add('no-annotation-text');
            }
        }

        if (proofToggleBtn) {
            if (hasAnnotationTextCache) {
                proofToggleBtn.disabled = false;
                proofToggleBtn.classList.remove('no-annotation-text');
            } else {
                proofToggleBtn.disabled = true;
                proofToggleBtn.classList.add('no-annotation-text');
            }
        }
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
        hasAnnotationTextCache = false;
        updateButtonState();
        updateButtonAvailability();
    }

    // === 公開API ===
    return {
        init: init,
        toggle: toggle,
        show: show,
        hide: hide,
        isHidden: getIsHidden,
        setIsHidden: setIsHidden,  // PDF読み込み時の状態復元用
        setIsHiddenInternal: setIsHiddenInternal,  // 保存処理用（UI更新なし）
        isVisible: function() { return !isHidden; }, // 後方互換性
        isPdfAnnotationObject: isPdfAnnotationObject,
        shouldRenderObject: shouldRenderObject,
        cleanup: cleanup,
        updateButtonAvailability: updateButtonAvailability,  // テキスト有無に応じたボタン状態更新
        hasAnnotationText: function() { return hasAnnotationTextCache; },
        // 不要になったメソッド（互換性のため空実装）
        setTextContent: function() {},
        renderTextLayer: function() {},
        clearTextLayer: function() {},
        hasTextContent: function() { return false; }
    };
})();
