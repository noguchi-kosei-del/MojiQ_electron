/* js/lock.js */

const AppLock = {
    /**
     * 圧縮処理中かどうかのフラグ
     */
    _isCompressing: false,

    /**
     * 初期化：アプリ全体をロック状態にする
     */
    init: function() {
        // bodyにロック用のクラスを付与
        document.body.classList.add('app-locked');
        // 初回起動時はサイドバー・ツールバーを完全非表示
        document.body.classList.add('app-pre-load');
    },

    /**
     * 圧縮処理中のメニューロック
     * ハンバーガーメニューと読み込みボタンを無効化する
     * （ウィンドウコントロールとドラッグ領域は有効のまま）
     */
    lockMenuForCompression: function() {
        this._isCompressing = true;

        // ハンバーガーボタンを無効化
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        if (hamburgerBtn) {
            hamburgerBtn.disabled = true;
            hamburgerBtn.style.opacity = '0.5';
            hamburgerBtn.style.pointerEvents = 'none';
        }

        // スライドメニューが開いている場合は閉じる
        const slideMenu = document.getElementById('slideMenu');
        const slideMenuOverlay = document.getElementById('slideMenuOverlay');
        if (slideMenu) {
            slideMenu.classList.remove('open');
        }
        if (slideMenuOverlay) {
            slideMenuOverlay.classList.remove('show');
        }

        // PDF読み込みボタン（ラベル）を無効化
        const pdfUploadLabel = document.querySelector('label[for="pdfUpload"]');
        if (pdfUploadLabel) {
            pdfUploadLabel.style.opacity = '0.5';
            pdfUploadLabel.style.pointerEvents = 'none';
        }

        // PDF読み込みinputを無効化
        const pdfUploadInput = document.getElementById('pdfUpload');
        if (pdfUploadInput) {
            pdfUploadInput.disabled = true;
        }

        // カスタムメニューバーを無効化
        const customMenuBar = document.getElementById('customMenuBar');
        if (customMenuBar) {
            customMenuBar.style.opacity = '0.5';
            customMenuBar.style.pointerEvents = 'none';
        }
    },

    /**
     * 圧縮処理後のメニューロック解除
     */
    unlockMenuAfterCompression: function() {
        this._isCompressing = false;

        // ハンバーガーボタンを有効化
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        if (hamburgerBtn) {
            hamburgerBtn.disabled = false;
            hamburgerBtn.style.opacity = '';
            hamburgerBtn.style.pointerEvents = '';
        }

        // PDF読み込みボタン（ラベル）を有効化
        const pdfUploadLabel = document.querySelector('label[for="pdfUpload"]');
        if (pdfUploadLabel) {
            pdfUploadLabel.style.opacity = '';
            pdfUploadLabel.style.pointerEvents = '';
        }

        // PDF読み込みinputを有効化
        const pdfUploadInput = document.getElementById('pdfUpload');
        if (pdfUploadInput) {
            pdfUploadInput.disabled = false;
        }

        // カスタムメニューバーを有効化
        const customMenuBar = document.getElementById('customMenuBar');
        if (customMenuBar) {
            customMenuBar.style.opacity = '';
            customMenuBar.style.pointerEvents = '';
        }
    },

    /**
     * 圧縮処理中かどうかを返す
     */
    isCompressing: function() {
        return this._isCompressing;
    },

    /**
     * ロック解除：PDF読み込み完了後に呼び出す
     */
    unlock: function() {
        // bodyのロック用クラスを除去
        document.body.classList.remove('app-locked');

        // サイドバーとツールバーのスタイルを直接リセット（CSSトランジションのフォールバック）
        const leftSidebar = document.querySelector('.sidebar.left');
        const rightSidebar = document.querySelector('.sidebar.right');
        const toolBar = document.querySelector('.tool-bar-vertical');

        [leftSidebar, rightSidebar, toolBar].forEach(el => {
            if (el) {
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto';
                el.style.filter = 'none';
            }
        });

        // 既存のタブロック解除関数があれば実行
        if (typeof window.unlockTabs === 'function') {
            window.unlockTabs();
        }
    },

    /**
     * サイドバー・ツールバーを表示（PDF/JPEG読み込み完了時に呼び出し）
     */
    showSidebars: function() {
        document.body.classList.remove('app-pre-load');
    },

    /**
     * 初回起動画面に戻る（サイドバーをフェードアウトしてからリセット）
     */
    resetToInitial: function() {
        // サイドバーが既に非表示の場合はそのままリロード
        if (document.body.classList.contains('app-pre-load')) {
            location.reload();
            return;
        }

        // フェードアウトアニメーション開始
        document.body.classList.add('app-resetting');

        // アニメーション完了後にリロード
        setTimeout(() => {
            location.reload();
        }, 300);
    }
};

// DOM読み込み完了時にロックを実行
document.addEventListener('DOMContentLoaded', AppLock.init);

// グローバルスコープに解除関数を公開（script.jsから呼べるようにする）
window.unlockApp = AppLock.unlock;
window.showAppSidebars = AppLock.showSidebars;
window.resetToInitial = AppLock.resetToInitial;
window.lockMenuForCompression = AppLock.lockMenuForCompression.bind(AppLock);
window.unlockMenuAfterCompression = AppLock.unlockMenuAfterCompression.bind(AppLock);
window.isAppCompressing = AppLock.isCompressing.bind(AppLock);