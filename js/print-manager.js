/**
 * MojiQ Print Manager - PDF印刷機能モジュール
 * PDFと描画オブジェクトを合成して印刷する
 * システム印刷ダイアログ使用版
 */
window.MojiQPrintManager = (function() {
    'use strict';

    /**
     * PDFを印刷（メインエントリポイント）
     * システム印刷ダイアログを直接開く
     */
    async function printPdf() {
        const PdfManager = window.MojiQPdfManager;

        if (!PdfManager) {
            MojiQModal.showAlert('PDFモジュールが読み込まれていません', 'エラー');
            return;
        }

        // 処理中フラグを立てる（ファイルオープン防止）
        if (PdfManager.setProcessing) PdfManager.setProcessing(true);

        // ローディング表示
        showLoadingOverlay(true, '印刷用PDFを準備中...');

        try {
            // 印刷用PDFを生成
            const result = await PdfManager.generatePdfForPrint({
                onProgress: (current, total) => {
                    updateLoadingProgress(current, total);
                }
            });

            if (!result.success) {
                showLoadingOverlay(false);
                MojiQModal.showAlert('印刷用PDFの生成に失敗しました: ' + (result.error || ''), 'エラー');
                return;
            }

            // Uint8Array → Base64変換
            const base64 = uint8ArrayToBase64(result.data);

            // Electron環境でシステム印刷ダイアログを使用
            if (window.electronAPI && window.electronAPI.printPdfWithDialog) {
                showLoadingOverlay(true, '印刷ダイアログを開いています...', 'spinner');
                const printResult = await window.electronAPI.printPdfWithDialog(base64);
                showLoadingOverlay(false);

                if (!printResult.success) {
                    MojiQModal.showAlert('印刷に失敗しました: ' + (printResult.error || ''), 'エラー');
                }
            } else if (window.electronAPI && window.electronAPI.printPdf) {
                // 従来の外部ビューア方式にフォールバック
                showLoadingOverlay(false);
                const printResult = await window.electronAPI.printPdf(base64);
                if (!printResult.success) {
                    MojiQModal.showAlert('印刷に失敗しました: ' + (printResult.error || ''), 'エラー');
                }
            } else {
                // ブラウザ環境: Blobを作成してダウンロード（印刷はユーザーに委任）
                showLoadingOverlay(false);
                const blob = new Blob([result.data], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);

                // 新しいウィンドウで開いて印刷
                const printWindow = window.open(url, '_blank');
                if (printWindow) {
                    printWindow.onload = () => {
                        printWindow.print();
                    };
                } else {
                    // ポップアップブロックの場合はダウンロード
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'print.pdf';
                    link.click();
                }
                // BUG-012修正: Blob URLの無効化を遅延実行（印刷ウィンドウが使用する時間を確保）
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                }, 10000);  // 10秒後に無効化
            }
        } catch (error) {
            showLoadingOverlay(false);
            console.error('印刷エラー:', error);
            MojiQModal.showAlert('印刷エラー: ' + error.message, 'エラー');
        } finally {
            // 処理中フラグを解除
            if (PdfManager.setProcessing) PdfManager.setProcessing(false);
        }
    }

    /**
     * Uint8ArrayをBase64に変換
     * @param {Uint8Array} uint8Array - 変換元データ
     * @returns {string} - Base64文字列
     */
    function uint8ArrayToBase64(uint8Array) {
        const chunkSize = 0x8000; // 32KB単位で処理
        const chunks = [];
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
            chunks.push(String.fromCharCode.apply(null, chunk));
        }
        return btoa(chunks.join(''));
    }

    /**
     * ローディングオーバーレイを表示/非表示
     * @param {boolean} show - 表示するかどうか
     * @param {string} message - 表示メッセージ
     * @param {string} mode - 'progress'（プログレスバー表示）または 'spinner'（スピナー表示）
     */
    function showLoadingOverlay(show, message, mode = 'progress') {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';

            // loading-titleを更新
            const titleEl = document.getElementById('loadingTitle');
            if (titleEl && message) {
                titleEl.textContent = message;
            }

            // プログレスコンテナの表示/非表示
            const progressContainer = overlay.querySelector('.loading-progress-container');
            if (progressContainer) {
                if (mode === 'spinner') {
                    // スピナーモード: プログレスバーを非表示、大きなスピナーを表示
                    progressContainer.style.display = 'none';
                    overlay.classList.add('spinner-mode');
                } else {
                    // プログレスモード: プログレスバーを表示
                    progressContainer.style.display = 'flex';
                    overlay.classList.remove('spinner-mode');
                }
            }

            // 非表示時にプログレスをリセット
            if (!show) {
                const fillEl = document.getElementById('loadingProgressFill');
                const textEl = document.getElementById('loadingProgressText');
                if (fillEl) fillEl.style.width = '0%';
                if (textEl) textEl.textContent = '0 / 0 ページ';
                overlay.classList.remove('spinner-mode');
            }
        }
    }

    /**
     * ローディング進捗を更新
     * @param {number} current - 現在のページ
     * @param {number} total - 総ページ数
     */
    function updateLoadingProgress(current, total) {
        const titleEl = document.getElementById('loadingTitle');
        if (titleEl) {
            titleEl.textContent = `印刷用PDFを準備中... (${current}/${total})`;
        }

        // プログレスバーを更新
        const fillEl = document.getElementById('loadingProgressFill');
        if (fillEl && total > 0) {
            const percent = (current / total) * 100;
            fillEl.style.width = percent + '%';
        }

        // テキストを更新
        const textEl = document.getElementById('loadingProgressText');
        if (textEl) {
            textEl.textContent = `${current} / ${total} ページ`;
        }
    }

    return {
        printPdf
    };
})();
