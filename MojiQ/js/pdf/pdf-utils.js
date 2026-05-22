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
     * Uint8ArrayをBase64文字列に変換（非同期版。定期的にUIへ制御を返しフリーズを防ぐ）
     * 大きな Uint8Array で保存時の UI フリーズを防ぐ用途で使う。
     * @param {Uint8Array} uint8Array - バイナリデータ
     * @returns {Promise<string>} - Base64文字列
     */
    async function uint8ArrayToBase64Async(uint8Array) {
        var chunkSize = 0x8000; // 32KB chunks
        var yieldEvery = 32; // 約1MBごとにUIへ制御を返す
        var chunks = [];
        var counter = 0;
        for (var i = 0; i < uint8Array.length; i += chunkSize) {
            var chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
            chunks.push(String.fromCharCode.apply(null, chunk));
            counter++;
            if (counter % yieldEvery === 0) {
                await new Promise(function(resolve) { setTimeout(resolve, 0); });
            }
        }
        // btoa 前にもう一度yield（文字列結合も重い可能性）
        await new Promise(function(resolve) { setTimeout(resolve, 0); });
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
        uint8ArrayToBase64Async: uint8ArrayToBase64Async,
        nextFrame: nextFrame,
        updateProgressOverlayText: updateProgressOverlayText
    };
})();
