/**
 * Simulator DOM Elements
 * DOM要素参照モジュール - 全モジュールで使用するDOM要素の参照を管理
 */
window.SimulatorDOM = (function() {
    'use strict';

    let elements = null;

    function init() {
        elements = {
            // メインキャンバス
            canvas: document.getElementById('sim-whiteboard'),
            ctx: null,
            canvasArea: document.getElementById('sharedCanvasArea'),
            canvasWrapper: document.getElementById('canvas-wrapper'),

            // 校正・指示用キャンバス（消しゴム連携用）
            mojiqCanvas: document.getElementById('whiteboard'),
            mojiqCtx: null,

            // UI要素
            fontSizeInput: document.getElementById('sim-fontSizeInput'),
            simUndoBtn: document.getElementById('sim-undoBtn'),

            // ズーム制御
            simZoomInBtn: document.getElementById('sim-zoomInBtn'),
            simZoomOutBtn: document.getElementById('sim-zoomOutBtn'),
            simZoomLabel: document.getElementById('sim-zoomLabel'),
            simZoomFitBtn: document.getElementById('sim-zoomFitBtn'),

            // ツールボタン
            calibrateBtn: document.getElementById('calibrateBtn'),
            gridBtn: document.getElementById('gridBtn'),
            deleteGridBtn: document.getElementById('deleteGridBtn'),
            calibrationGuide: document.getElementById('calibrationGuide'),
            scaleDisplay: document.getElementById('scaleDisplay'),

            // ダッシュボードUI
            adjustMessage: document.getElementById('adjustMessage'),
            guideText: document.getElementById('guideText'),
            sizeTooltip: document.getElementById('sizeTooltip'),

            // バッジ・入力系
            badgeLines: document.getElementById('badgeLines'),
            badgeChars: document.getElementById('badgeChars'),
            badgePt: document.getElementById('badgePt'),
            badgeDensity: document.getElementById('badgeDensity'),

            monLines: document.getElementById('monLines'),
            monChars: document.getElementById('monChars'),
            monPt: document.getElementById('monPt'),
            monDensity: document.getElementById('monDensity'),
            lblChars: document.getElementById('lblChars'),

            // グリッド設定入力
            gridTextInput: document.getElementById('gridTextInput'),
            gridLinesInput: document.getElementById('gridLinesInput'),
            gridCharsInput: document.getElementById('gridCharsInput'),
            densitySelect: document.getElementById('densitySelect'),
            dashDensityToggle: document.getElementById('dashDensityToggle'),
            dashDensitySelector: document.getElementById('dashDensitySelector'),

            // 縦書き/横書きボタン
            btnWritingMode: document.getElementById('btnWritingMode'),
            iconWritingMode: document.getElementById('iconWritingMode'),
            btnHorizontalMode: document.getElementById('btnHorizontalMode'),
            btnClearText: document.getElementById('btnClearText'),

            // Modal関連
            textModal: document.getElementById('sim-textModal'),
            modalTextInput: document.getElementById('sim-modalTextInput'),
            modalCancelBtn: document.getElementById('sim-modalCancelBtn'),
            modalOkBtn: document.getElementById('sim-modalOkBtn'),

            // その他
            simClearBtn: document.getElementById('sim-clearBtn'),
            simSavePdfBtn: document.getElementById('sim-savePdfBtn')
        };

        // コンテキスト初期化
        if (elements.canvas) {
            elements.ctx = elements.canvas.getContext('2d');
        }
        if (elements.mojiqCanvas) {
            elements.mojiqCtx = elements.mojiqCanvas.getContext('2d');
        }

        return elements.canvas !== null;
    }

    return {
        init: init,

        get: function(key) {
            if (!elements) {
                throw new Error('SimulatorDOM not initialized. Call init() first.');
            }
            return elements[key];
        },

        getAll: function() {
            if (!elements) {
                throw new Error('SimulatorDOM not initialized. Call init() first.');
            }
            return elements;
        },

        // キャンバス関連のショートカット
        getCanvas: function() {
            return elements ? elements.canvas : null;
        },

        getCtx: function() {
            return elements ? elements.ctx : null;
        },

        getMojiqCanvas: function() {
            return elements ? elements.mojiqCanvas : null;
        },

        getMojiqCtx: function() {
            return elements ? elements.mojiqCtx : null;
        }
    };
})();
