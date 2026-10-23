# Reentry

Your development workspace, one click away.

開発プロジェクトの環境と作業状況を管理し、前回の作業を再開するためのデスクトップアプリです。
macOS向けMVPを段階的に開発しています。

## 現在の実装範囲

初期構築と基本レイアウトが完了しています。サイドバーとホーム画面に、プロジェクト一覧の空状態を表示します。
プロジェクト追加・設定は準備中のため無効表示です。
プロジェクト管理、保存、Git情報取得、エディタ起動などは今後追加します。

## 技術構成

- Tauri 2 / Rust: デスクトップアプリの起動と、今後追加するOS操作
- React / TypeScript: UI（strictモード）
- Vite: 開発サーバーとフロントエンドビルド
- Tailwind CSS 4 / `@tailwindcss/vite`: スタイルとViteとの統合
- `@types/node`: Vite設定内のNode.js APIを型チェックするために使用

現時点ではOS操作プラグインを追加していません。必要な操作を実装する段階で、Rust側に処理を追加します。

## 開発環境（macOS）

- Node.js 22.12以上の22系 / npm（`.nvmrc`を参照）
- Rust stable / Cargo
- Xcode Command Line Tools（`xcode-select --install`）

```sh
npm ci
npm run tauri dev
```

`npm run tauri dev`はViteを起動してからデスクトップウィンドウを開きます。
初回はRustの依存関係取得・コンパイルに時間がかかります。
ブラウザでUIだけ確認する場合は`npm run dev`を実行し、`http://localhost:1420`を開きます。
終了は起動したターミナルでCtrl+Cです。

## 検証・ビルド

```sh
npm run typecheck
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug --no-bundle
```

最後のコマンドでインストーラーを作成せずデスクトップ実行ファイルをビルドできます。
配布用のビルドは`npm run tauri build`です。署名・公証・配布の設定は今後対応します。

## ディレクトリ構成

- `src/`: React UIとスタイル
- `src/components/`: アプリ共通のレイアウト
- `src/pages/`: 画面ごとのUI
- `src-tauri/src/`: Rustのアプリ起動処理
- `src-tauri/tauri.conf.json`: アプリ、ウィンドウ、CSP、ビルド設定
- `src-tauri/capabilities/`: ウィンドウに許可するTauriの権限
- `src-tauri/icons/`: テンプレートのアイコン（ブランド用アイコンは未作成）

今後、OS操作はRust、JSON保存処理は独立したRustモジュールに配置します。
UIから保存形式やOS操作の詳細を分離し、SQLiteやWindowsへの対応を進めやすくします。

## 実装予定（各単位で検証・停止）

1. 初期構築
2. 基本レイアウトとプロジェクト一覧の空状態
3. プロジェクト登録とJSON永続化
4. プロジェクト詳細と編集・削除
5. 読み取り専用のGit状態表示
6. VS Code・URLの起動と結果表示
7. 作業メモの保存
8. アプリ設定
9. エラー処理・操作性の最終確認

## 参考

- [Tauriの初期構築](https://v2.tauri.app/start/create-project/)
- [Tauriの開発環境](https://v2.tauri.app/start/prerequisites/)
- [Tailwind CSSのVite連携](https://tailwindcss.com/docs/installation/using-vite)
