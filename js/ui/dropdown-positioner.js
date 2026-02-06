/* js/ui/dropdown-positioner.js - ドロップダウン位置計算ユーティリティ */

/**
 * ボタン下部にドロップダウンを表示する共通ユーティリティ
 * 三角形の位置をボタン中央に合わせ、画面端にはみ出さないように調整する
 */
window.MojiQDropdownPositioner = (function() {
    'use strict';

    /**
     * ドロップダウンをトリガーボタンの下に配置して表示する
     * @param {HTMLElement} triggerBtn - トリガーボタン要素
     * @param {HTMLElement} dropdown - ドロップダウン要素
     * @param {HTMLElement|null} overlay - オーバーレイ要素（オプション）
     * @param {Object} options - 追加オプション
     * @param {Function} options.onBeforeOpen - 表示前に呼ばれるコールバック
     * @param {number} options.offset - ボタンからの距離（デフォルト: 8）
     */
    function open(triggerBtn, dropdown, overlay, options) {
        var opts = options || {};
        var offset = opts.offset || 8;

        if (opts.onBeforeOpen) opts.onBeforeOpen();

        // ボタンの位置を取得
        var btnRect = triggerBtn.getBoundingClientRect();
        var btnCenterX = btnRect.left + btnRect.width / 2;

        // 一旦表示して実際の幅を取得
        dropdown.style.visibility = 'hidden';
        dropdown.style.display = 'block';
        var dropdownWidth = dropdown.offsetWidth;
        dropdown.style.display = '';
        dropdown.style.visibility = '';

        // ボタンの中央に吹き出しの三角形が来るように配置
        var leftPos = btnCenterX - dropdownWidth / 2;

        // 画面端にはみ出さないように調整
        var adjustedLeft = Math.max(8, Math.min(leftPos, window.innerWidth - dropdownWidth - 8));

        dropdown.style.top = (btnRect.bottom + offset) + 'px';
        dropdown.style.left = adjustedLeft + 'px';
        dropdown.style.right = 'auto';

        // 三角形の位置をボタン中央に合わせる
        var triangleOffset = btnCenterX - adjustedLeft;
        dropdown.style.setProperty('--triangle-left', triangleOffset + 'px');

        dropdown.classList.add('open');
        if (overlay) overlay.classList.add('visible');
        triggerBtn.classList.add('active');
    }

    /**
     * ドロップダウンを閉じる
     * @param {HTMLElement} dropdown - ドロップダウン要素
     * @param {HTMLElement|null} overlay - オーバーレイ要素
     * @param {HTMLElement|null} triggerBtn - トリガーボタン要素
     */
    function close(dropdown, overlay, triggerBtn) {
        dropdown.classList.remove('open');
        if (overlay) overlay.classList.remove('visible');
        if (triggerBtn) triggerBtn.classList.remove('active');
    }

    /**
     * ドロップダウンのトグル
     * @param {HTMLElement} triggerBtn - トリガーボタン要素
     * @param {HTMLElement} dropdown - ドロップダウン要素
     * @param {HTMLElement|null} overlay - オーバーレイ要素
     * @param {Object} options - open()に渡すオプション
     */
    function toggle(triggerBtn, dropdown, overlay, options) {
        if (dropdown.classList.contains('open')) {
            close(dropdown, overlay, triggerBtn);
        } else {
            open(triggerBtn, dropdown, overlay, options);
        }
    }

    return { open: open, close: close, toggle: toggle };
})();
