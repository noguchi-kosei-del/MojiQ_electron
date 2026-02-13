/**
 * MojiQ PDF Spread State - 見開きモードの状態管理
 * pdf-manager.jsから分離された見開き関連の状態と基本ロジック
 */
window._MojiQPdfSpreadState = (function() {
    'use strict';

    // ========================================
    // 見開きモード状態変数
    // ========================================

    let spreadViewMode = false;           // 見開きモードフラグ
    let spreadMapping = [];               // 見開きマッピング配列
    let currentSpreadIndex = 0;           // 現在の見開きインデックス
    let isSpreadRendering = false;        // 見開きレンダリング中フラグ
    let pendingSpreadIndex = null;        // 見開きレンダリング中に要求されたインデックス
    let spreadRenderOperationId = 0;      // 見開きレンダリング操作ID
    let spreadBindingDirection = 'right'; // 綴じ方向: 'right'=右綴じ, 'left'=左綴じ
    let spreadBlankPagesAdded = { front: 0, back: 0 }; // 追加した白紙ページ数

    // 見開きキャッシュ状態
    let spreadPageCache = {};             // { pageNum: ImageData } 形式でキャッシュ
    let spreadCacheReady = false;         // キャッシュ準備完了フラグ
    let spreadBaseScale = 1;              // 見開き用基準スケール
    let spreadDisplaying = false;         // 見開き表示処理中フラグ

    // ========================================
    // ゲッター・セッター
    // ========================================

    function isSpreadViewModeActive() {
        return spreadViewMode;
    }

    function setSpreadViewMode(value) {
        spreadViewMode = !!value;
    }

    function getSpreadMapping() {
        return spreadMapping;
    }

    function setSpreadMapping(mapping) {
        spreadMapping = mapping || [];
    }

    function getCurrentSpreadIndex() {
        return currentSpreadIndex;
    }

    function setCurrentSpreadIndex(index) {
        currentSpreadIndex = index;
    }

    function isSpreadRenderingActive() {
        return isSpreadRendering;
    }

    function setSpreadRendering(value) {
        isSpreadRendering = !!value;
    }

    function getPendingSpreadIndex() {
        return pendingSpreadIndex;
    }

    function setPendingSpreadIndex(index) {
        pendingSpreadIndex = index;
    }

    function getSpreadRenderOperationId() {
        return spreadRenderOperationId;
    }

    function incrementSpreadRenderOperationId() {
        return ++spreadRenderOperationId;
    }

    function getSpreadBindingDirection() {
        return spreadBindingDirection;
    }

    function setSpreadBindingDirection(direction) {
        if (direction === 'left' || direction === 'right') {
            spreadBindingDirection = direction;
        }
    }

    function getSpreadBlankPagesAdded() {
        return { ...spreadBlankPagesAdded };
    }

    function setSpreadBlankPagesAdded(pages) {
        spreadBlankPagesAdded = { ...pages };
    }

    // キャッシュ関連

    function getSpreadPageCache() {
        return spreadPageCache;
    }

    function setSpreadPageCacheEntry(pageNum, imageData) {
        spreadPageCache[pageNum] = imageData;
    }

    function clearSpreadPageCache() {
        spreadPageCache = {};
    }

    function isSpreadCacheReady() {
        return spreadCacheReady;
    }

    function setSpreadCacheReady(value) {
        spreadCacheReady = !!value;
    }

    function getSpreadBaseScale() {
        return spreadBaseScale;
    }

    function setSpreadBaseScale(scale) {
        spreadBaseScale = scale;
    }

    function isSpreadDisplayingActive() {
        return spreadDisplaying;
    }

    function setSpreadDisplaying(value) {
        spreadDisplaying = !!value;
    }

    // ========================================
    // 現在の見開き情報取得
    // ========================================

    function getCurrentSpread() {
        if (!spreadViewMode || spreadMapping.length === 0) {
            return null;
        }
        return spreadMapping[currentSpreadIndex] || null;
    }

    function getSpreadMetadata() {
        return {
            viewMode: spreadViewMode,
            currentIndex: currentSpreadIndex,
            totalSpreads: spreadMapping.length,
            bindingDirection: spreadBindingDirection,
            cacheReady: spreadCacheReady
        };
    }

    // ========================================
    // ページ番号から見開きインデックスを取得
    // ========================================

    function getSpreadIndexFromPage(pageNum) {
        for (let i = 0; i < spreadMapping.length; i++) {
            const spread = spreadMapping[i];
            if (spread.leftPage === pageNum || spread.rightPage === pageNum) {
                return i;
            }
        }
        return 0;
    }

    // ========================================
    // 見開き内のページ位置情報を取得
    // ========================================

    function getSpreadPageInfo(x, canvasWidth, currentSpread) {
        if (!currentSpread) return null;

        const halfWidth = canvasWidth / 2;
        const isLeftSide = x < halfWidth;

        let pageNum = null;
        let isBlank = false;
        let offsetX = 0;

        if (spreadBindingDirection === 'right') {
            // 右綴じ: 左側が後のページ、右側が先のページ
            if (isLeftSide) {
                pageNum = currentSpread.leftPage;
                isBlank = currentSpread.leftBlank;
                offsetX = 0;
            } else {
                pageNum = currentSpread.rightPage;
                isBlank = currentSpread.rightBlank;
                offsetX = halfWidth;
            }
        } else {
            // 左綴じ: 左側が先のページ、右側が後のページ
            if (isLeftSide) {
                pageNum = currentSpread.leftPage;
                isBlank = currentSpread.leftBlank;
                offsetX = 0;
            } else {
                pageNum = currentSpread.rightPage;
                isBlank = currentSpread.rightBlank;
                offsetX = halfWidth;
            }
        }

        return {
            pageNum,
            isBlank,
            isLeftSide,
            offsetX,
            localX: x - offsetX
        };
    }

    // ========================================
    // 状態リセット
    // ========================================

    function reset() {
        spreadViewMode = false;
        spreadMapping = [];
        currentSpreadIndex = 0;
        isSpreadRendering = false;
        pendingSpreadIndex = null;
        spreadRenderOperationId = 0;
        spreadBindingDirection = 'right';
        spreadBlankPagesAdded = { front: 0, back: 0 };
        spreadPageCache = {};
        spreadCacheReady = false;
        spreadBaseScale = 1;
        spreadDisplaying = false;
    }

    // ========================================
    // 公開API
    // ========================================

    return {
        // 見開きモード
        isSpreadViewMode: isSpreadViewModeActive,
        setSpreadViewMode,

        // マッピング
        getSpreadMapping,
        setSpreadMapping,

        // インデックス
        getCurrentSpreadIndex,
        setCurrentSpreadIndex,

        // レンダリング状態
        isSpreadRendering: isSpreadRenderingActive,
        setSpreadRendering,
        getPendingSpreadIndex,
        setPendingSpreadIndex,
        getSpreadRenderOperationId,
        incrementSpreadRenderOperationId,

        // 綴じ方向
        getSpreadBindingDirection,
        setSpreadBindingDirection,

        // 白紙ページ
        getSpreadBlankPagesAdded,
        setSpreadBlankPagesAdded,

        // キャッシュ
        getSpreadPageCache,
        setSpreadPageCacheEntry,
        clearSpreadPageCache,
        isSpreadCacheReady,
        setSpreadCacheReady,
        getSpreadBaseScale,
        setSpreadBaseScale,
        isSpreadDisplaying: isSpreadDisplayingActive,
        setSpreadDisplaying,

        // 情報取得
        getCurrentSpread,
        getSpreadMetadata,
        getSpreadIndexFromPage,
        getSpreadPageInfo,

        // リセット
        reset
    };
})();
