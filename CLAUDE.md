# MojiQ プロジェクト

PDF/画像への校正指示・チェック機能を備えたElectronアプリケーション

## ビルドコマンド

```bash
cd MojiQ
npm run build:win    # Windows向けビルド
npm run build:mac    # Mac向けビルド
npm run start        # 開発用起動
```

## 主要ファイル構成

- `MojiQ/js/script.js` - メインスクリプト、モード切替処理
- `MojiQ/js/navigation.js` - ページバー制御、表示/非表示管理
- `MojiQ/js/ui/proofreading-panel.js` - 校正パネルUI
- `MojiQ/css/navigation.css` - ページバーのスタイル
- `MojiQ/css/proofreading-mode.css` - 校正モード専用スタイル

## モード

- **指示入れモード**: PDF/画像に校正指示を書き込む
- **校正チェックモード**: 校正チェックリストを表示・管理

## 最近の変更 (2026-03-02)

### ページバーの表示/非表示統一
- 両モードで`user-hidden`クラスを使用して状態管理を統一
- `localStorage`で状態を共有（モード切替時も維持）
- `MojiQNavigation.userHideNavBar()`/`userShowNavBar()`を両モードで共通使用

### アニメーション統一
- 両モードで同じ0.3秒のフェードアニメーション
- `opacity`と`pointer-events`のみを使用（`visibility`は削除）
- CSSトランジション: `transition: opacity 0.3s ease;`

### 校正モードの自動フェード無効化
- `resetNavBarTimer()`: 校正モードでは自動フェードタイマーをスキップ
- `hideNavBar()`: 校正モードでは描画中の自動非表示を無効化
