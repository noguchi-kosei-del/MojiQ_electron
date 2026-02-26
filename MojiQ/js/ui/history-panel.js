/**
 * MojiQ History Panel - ヒストリー機能
 * Photoshopのようなヒストリーパネルを提供
 * 作業履歴の可視化と任意の状態への復帰を可能にする
 */
window.MojiQHistoryPanel = (function() {
    'use strict';

    // --- 状態 ---
    let pageHistories = {};  // pageHistories[pageNum] = { entries: [], currentIndex: -1 }
    const MAX_ENTRIES = 30;
    let isNavigating = false;  // goToState実行中のフラグ（イベント通知を無視するため）

    // --- DOM要素 ---
    let historyToggleBtn, historyDropdown, historyList, historyClearBtn, historyEntryCount;
    let initialized = false;

    // --- アクションラベルマッピング ---
    const ACTION_LABELS = {
        // 描画ツール
        'pen': 'ペン描画',
        'marker': 'マーカー描画',
        'eraser': '消しゴム',
        'rect': '枠線',
        'ellipse': '楕円',
        'line': '直線',
        'arrow': '矢印',
        'doubleArrow': '両矢印',
        'polyline': '折れ線',
        'text': 'テキスト',
        'image': '画像挿入',
        // 校正記号
        'chevron': 'アキ記号',
        'lshape': '行移動記号',
        'zshape': '改行記号',
        'bracket': '全体移動記号',
        'semicircle': '半円記号',
        'labeledRect': '小文字指定',
        // スタンプ
        'toruStamp': 'トルスタンプ',
        'torutsumeStamp': 'トルツメスタンプ',
        'torumamaStamp': 'トルママスタンプ',
        'zenkakuakiStamp': '全角アキスタンプ',
        'nibunakiStamp': '半角アキスタンプ',
        'kaigyouStamp': '改行スタンプ',
        'doneStamp': '済スタンプ',
        'rubyStamp': 'ルビスタンプ',
        'rectSymbol': '□記号',
        'triangleSymbol': '△記号',
        'fontLabel': '文字サイズ指定',
        // 操作
        'add': 'オブジェクト追加',
        'remove': 'オブジェクト削除',
        'update': 'オブジェクト編集',
        'clear': '全消去',
        'move': 'オブジェクト移動',
        // シミュレーター
        'grid': 'グリッド操作'
    };


    /**
     * 初期化
     */
    function init() {
        if (initialized) return;

        // DOM要素を取得
        historyToggleBtn = document.getElementById('historyToggleBtn');
        historyDropdown = document.getElementById('historyDropdown');
        historyList = document.getElementById('historyList');
        historyClearBtn = document.getElementById('historyClearBtn');
        historyEntryCount = document.getElementById('historyEntryCount');

        if (!historyToggleBtn || !historyDropdown) {
            console.warn('HistoryPanel: Required DOM elements not found');
            return;
        }

        // イベントリスナー設定
        setupEventListeners();

        // 初期描画
        render();

        initialized = true;
        console.log('MojiQHistoryPanel initialized');
    }

    /**
     * イベントリスナー設定
     */
    function setupEventListeners() {
        // トグルボタン
        historyToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggle();
        });

        // クリアボタン
        if (historyClearBtn) {
            historyClearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.MojiQModal && window.MojiQModal.showConfirm) {
                    MojiQModal.showConfirm('作業履歴をクリアしますか？', '確認').then(ok => {
                        if (ok) clearHistory();
                    });
                } else if (confirm('作業履歴をクリアしますか？')) {
                    clearHistory();
                }
            });
        }

        // 外側クリックで閉じる
        document.addEventListener('click', (e) => {
            const historyArea = document.getElementById('history-area');
            if (historyArea && !historyArea.contains(e.target)) {
                hide();
            }
        });

        // ページ変更イベント
        window.addEventListener('mojiq:page-change', () => {
            render();
        });

        // 履歴追加イベント（drawing-objects.jsから発火）
        window.addEventListener('mojiq:history-add', (e) => {
            if (e.detail) {
                addEntry(e.detail);
            }
        });

        // Undo/Redo実行イベント（goToState実行中は無視）
        window.addEventListener('mojiq:history-undo', () => {
            if (!isNavigating) {
                undoEntry();
            }
        });
        window.addEventListener('mojiq:history-redo', () => {
            if (!isNavigating) {
                redoEntry();
            }
        });

        // 全履歴クリアイベント（PDF新規読み込み時）
        window.addEventListener('mojiq:history-clear-all', () => {
            clearAllHistory();
        });
    }

    /**
     * 履歴エントリを追加
     */
    function addEntry(data) {
        const pageNum = data.pageNum || getCurrentPageNum();

        // ページの履歴を初期化
        if (!pageHistories[pageNum]) {
            pageHistories[pageNum] = { entries: [], currentIndex: -1 };
        }

        const history = pageHistories[pageNum];

        // 現在位置より後の履歴を削除（新しい操作で分岐）
        if (history.currentIndex < history.entries.length - 1) {
            history.entries = history.entries.slice(0, history.currentIndex + 1);
        }

        // ラベルを生成
        const objectType = data.objectType || data.type || data.actionType || 'unknown';
        const label = ACTION_LABELS[objectType] || ACTION_LABELS[data.actionType] || objectType;

        // エントリを追加
        const entry = {
            id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            timestamp: Date.now(),
            label: label,
            actionType: data.actionType,
            objectType: objectType,
            source: data.source || 'drawing'
        };

        history.entries.push(entry);
        history.currentIndex = history.entries.length - 1;

        // 最大数を超えたら古いものを削除
        if (history.entries.length > MAX_ENTRIES) {
            history.entries.shift();
            history.currentIndex--;
        }

        render();
    }

    /**
     * 指定の履歴状態に移動
     */
    function goToState(targetIndex) {
        const pageNum = getCurrentPageNum();
        const history = pageHistories[pageNum];

        if (!history) return;

        const currentIndex = history.currentIndex;

        // 同じ位置なら何もしない
        if (targetIndex === currentIndex) {
            return;
        }

        // ナビゲーション中フラグを設定（Undo/Redoイベントを無視するため）
        isNavigating = true;

        try {
            // 初期状態への移動（targetIndex === -1）
            if (targetIndex === -1) {
                // 全てUndoする
                const undoCount = currentIndex + 1;
                for (let i = 0; i < undoCount; i++) {
                    if (window.MojiQDrawingObjects && MojiQDrawingObjects.undo) {
                        MojiQDrawingObjects.undo(pageNum);
                    }
                }
                history.currentIndex = -1;
            } else if (targetIndex < -1 || targetIndex >= history.entries.length) {
                // 無効なインデックス
                return;
            } else if (targetIndex < currentIndex) {
                // Undoを複数回実行
                const undoCount = currentIndex - targetIndex;
                for (let i = 0; i < undoCount; i++) {
                    if (window.MojiQDrawingObjects && MojiQDrawingObjects.undo) {
                        MojiQDrawingObjects.undo(pageNum);
                    }
                }
                history.currentIndex = targetIndex;
            } else {
                // Redoを複数回実行
                const redoCount = targetIndex - currentIndex;
                for (let i = 0; i < redoCount; i++) {
                    if (window.MojiQDrawingObjects && MojiQDrawingObjects.redo) {
                        MojiQDrawingObjects.redo(pageNum);
                    }
                }
                history.currentIndex = targetIndex;
            }

            // 再描画
            triggerRedraw();
        } finally {
            // フラグをリセット
            isNavigating = false;
        }

        render();
    }

    /**
     * 再描画をトリガー
     */
    function triggerRedraw() {
        // MojiQDrawingの再描画を呼び出す
        if (window.MojiQDrawing && MojiQDrawing.redrawCanvas) {
            MojiQDrawing.redrawCanvas(false);
        } else if (window.MojiQEvents) {
            // イベント経由でリクエスト
            MojiQEvents.emit('mojiq:request-redraw', { saveHistory: false });
        }
    }

    /**
     * Undo時のインデックス更新
     */
    function undoEntry() {
        const pageNum = getCurrentPageNum();
        const history = pageHistories[pageNum];

        if (history && history.currentIndex >= 0) {
            history.currentIndex--;
            render();
        }
    }

    /**
     * Redo時のインデックス更新
     */
    function redoEntry() {
        const pageNum = getCurrentPageNum();
        const history = pageHistories[pageNum];

        if (history && history.currentIndex < history.entries.length - 1) {
            history.currentIndex++;
            render();
        }
    }

    /**
     * 現在ページの履歴をクリア
     */
    function clearHistory() {
        const pageNum = getCurrentPageNum();
        pageHistories[pageNum] = { entries: [], currentIndex: -1 };
        render();
    }

    /**
     * 全ページの履歴をクリア
     */
    function clearAllHistory() {
        pageHistories = {};
        render();
    }

    /**
     * 現在のページ番号を取得
     */
    function getCurrentPageNum() {
        if (window.MojiQDrawingObjects) {
            return MojiQDrawingObjects.getCurrentPage();
        }
        return 1;
    }

    /**
     * UIを描画
     */
    function render() {
        if (!historyList) return;

        const pageNum = getCurrentPageNum();
        const history = pageHistories[pageNum] || { entries: [], currentIndex: -1 };

        // エントリ数を更新
        if (historyEntryCount) {
            historyEntryCount.textContent = history.entries.length;
        }

        // リストをクリア
        historyList.innerHTML = '';

        if (history.entries.length === 0) {
            historyList.innerHTML = '<div class="history-empty">履歴がありません</div>';
            return;
        }

        // 初期状態
        const initialItem = document.createElement('div');
        initialItem.className = 'history-item' + (history.currentIndex === -1 ? ' current' : '');
        initialItem.innerHTML = '<span class="history-item-label">初期状態</span>';
        initialItem.addEventListener('click', () => goToState(-1));
        historyList.appendChild(initialItem);

        // 各エントリを描画
        history.entries.forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = 'history-item';

            if (index === history.currentIndex) {
                item.classList.add('current');
            } else if (index > history.currentIndex) {
                item.classList.add('future');
            }

            item.innerHTML = `<span class="history-item-label">${entry.label}</span>`;

            item.addEventListener('click', () => goToState(index));
            historyList.appendChild(item);
        });

        // 現在の位置までスクロール
        const currentItem = historyList.querySelector('.history-item.current');
        if (currentItem) {
            currentItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    /**
     * パネルを開く
     */
    function show() {
        if (historyDropdown) {
            historyDropdown.classList.add('open');
        }
        if (historyToggleBtn) {
            historyToggleBtn.classList.add('open');
        }
    }

    /**
     * パネルを閉じる
     */
    function hide() {
        if (historyDropdown) {
            historyDropdown.classList.remove('open');
        }
        if (historyToggleBtn) {
            historyToggleBtn.classList.remove('open');
        }
    }

    /**
     * パネルの開閉をトグル
     */
    function toggle() {
        if (historyDropdown && historyDropdown.classList.contains('open')) {
            hide();
        } else {
            show();
        }
    }

    /**
     * エントリを取得
     */
    function getEntries(pageNum) {
        pageNum = pageNum || getCurrentPageNum();
        return pageHistories[pageNum]?.entries || [];
    }

    /**
     * 現在のインデックスを取得
     */
    function getCurrentIndex(pageNum) {
        pageNum = pageNum || getCurrentPageNum();
        return pageHistories[pageNum]?.currentIndex ?? -1;
    }

    // 公開API
    return {
        init,
        addEntry,
        goToState,
        clearHistory,
        clearAllHistory,
        getEntries,
        getCurrentIndex,
        show,
        hide,
        toggle,
        render
    };
})();

// DOM読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', () => {
    // 少し遅延させて他のモジュール初期化後に実行
    setTimeout(() => {
        if (window.MojiQHistoryPanel) {
            MojiQHistoryPanel.init();
        }
    }, 100);
});
