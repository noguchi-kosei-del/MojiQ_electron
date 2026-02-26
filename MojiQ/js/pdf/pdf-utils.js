/* js/pdf/pdf-utils.js - PDFユーティリティ関数 */

/**
 * PDF処理に使用するユーティリティ関数群
 */
window._MojiQPdfUtils = (function() {
    'use strict';

    /**
     * Uint8ArrayをBase64文字列に変換（大きなファイル対応）
     * @param {Uint8Array} uint8Array - バイナリデータ
     * @returns {string} - Base64文字列
     */
    function uint8ArrayToBase64(uint8Array) {
        var chunkSize = 0x8000; // 32KB chunks
        var chunks = [];
        for (var i = 0; i < uint8Array.length; i += chunkSize) {
            var chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
            chunks.push(String.fromCharCode.apply(null, chunk));
        }
        return btoa(chunks.join(''));
    }

    /**
     * 次のフレームまで待機（UIをブロックしないため）
     * requestAnimationFrameを2回呼ぶことで、確実にブラウザの描画サイクルを待つ
     * @returns {Promise<void>}
     */
    function nextFrame() {
        return new Promise(function(resolve) {
            requestAnimationFrame(function() {
                requestAnimationFrame(resolve);
            });
        });
    }

    /**
     * 進捗オーバーレイのテキストを更新（タイトルを変更）
     * @param {string} message - 表示するメッセージ
     */
    function updateProgressOverlayText(message) {
        var titleElement = document.getElementById('loadingTitle');
        if (titleElement) {
            titleElement.textContent = message;
        }
    }

    return {
        uint8ArrayToBase64: uint8ArrayToBase64,
        nextFrame: nextFrame,
        updateProgressOverlayText: updateProgressOverlayText
    };
})();
