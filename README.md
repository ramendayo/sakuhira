# Reentry

Your development workspace, one click away.

開発プロジェクトの環境と作業状況を管理し、前回の作業を再開するためのデスクトップアプリです。
macOS向けMVPを段階的に開発しています。

## 現在の実装範囲

ローカルフォルダの選択、表示名の入力、プロジェクト登録、JSON保存、保存済み一覧の表示に対応しています。
再起動時に保存データを読み込みます。Git管理されていないフォルダも登録できます。
一覧からプロジェクト詳細を開き、名前・フォルダの編集と登録解除ができます。
設定は準備中のため無効表示です。Git情報、エディタ起動、作業メモは今後追加します。

## 技術構成

- Tauri 2 / Rust: デスクトップアプリの起動と、今後追加するOS操作
- React / TypeScript: UI（strictモード）
- Vite: 開発サーバーとフロントエンドビルド
- Tailwind CSS 4 / `@tailwindcss/vite`: スタイルとViteとの統合
- `@types/node`: Vite設定内のNode.js APIを型チェックするために使用

追加した依存関係:

- `@tauri-apps/api`: UIから登録専用のRustコマンドを呼び出すため
- `tauri-plugin-dialog`: OS標準のフォルダ選択をRust側で実行するため
- `serde` / `serde_json`: 型付きデータのJSON変換のため
- `uuid`: 名前やパスに依存しないプロジェクトIDを生成するため
- `tempfile`: 同じ保存先内で一時ファイルを作り、完成したJSONに置き換えるため（テストでも使用）
- Vitest / Testing Library / jsdom: フォーム操作と非同期の成功・失敗を検証するため

UIには汎用のファイル操作やシェル実行の権限を渡していません。

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
ブラウザでUIを起動する場合は`npm run dev`を実行し、`http://localhost:1420`を開きます。
ブラウザ単体ではRust機能を使えないため、一覧の代わりにデスクトップ版の起動案内を表示します。
終了は起動したターミナルでCtrl+Cです。

## 検証・ビルド

```sh
npm run typecheck
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build -- --debug --no-bundle
```

最後のコマンドでインストーラーを作成せずデスクトップ実行ファイルをビルドできます。
配布用のビルドは`npm run tauri build`です。署名・公証・配布の設定は今後対応します。

## ディレクトリ構成

- `src/`: React UIとスタイル
- `src/components/`: アプリ共通のレイアウト
- `src/pages/`: 画面ごとのUI
- `src/hooks/`: 一覧の読み込み状態と再試行
- `src/services/`: 型付きのRustコマンド呼び出し
- `src/types/`: UIで使用するプロジェクト型
- `src-tauri/src/lib.rs`: Rustのアプリ起動とコマンド登録
- `src-tauri/src/commands.rs`: UIと保存処理を接続するコマンドとフォルダ選択
- `src-tauri/src/projects.rs`: 入力検証とJSONの読み書き
- `src-tauri/src/projects/tests.rs`: 保存処理のテスト
- `src-tauri/tauri.conf.json`: アプリ、ウィンドウ、CSP、ビルド設定
- `src-tauri/capabilities/`: ウィンドウに許可するTauriの権限
- `src-tauri/icons/`: テンプレートのアイコン（ブランド用アイコンは未作成）

OS操作と保存処理をRust側に分離しています。SQLiteへ移行する場合は、主に`ProjectStore`の読み書き部分を変更します。

## プロジェクトの登録と保存

1. デスクトップ版で「プロジェクトを追加」を押します。
2. 「フォルダを選択」で選ぶか、フォルダの絶対パスを入力します。
3. 表示名（1〜100文字）を入力し、「登録する」を押します。

名前の前後の空白は除去します。フォルダの実在をRustで確認し、シンボリックリンクなどを解決したパスを保存します。
同じパスは重複登録できません。登録先のフォルダ内は変更しません。

保存先はTauriの`app_data_dir()`で取得します。macOSでは通常、次の場所です。

```text
~/Library/Application Support/dev.reentry.desktop/projects.json
```

保存形式は`{ "version": 1, "projects": [{ "id": "UUID", "name": "表示名", "path": "絶対パス" }] }`です。
隣接する`projects.lock`で読み取り・更新を直列化し、同時登録によるデータの取りこぼしを防ぎます。
ロックAPIにはRust 1.89以上を使用します（依存関係のビルドには最新stableを推奨）。

ファイルが存在しない初回だけ空一覧として扱います。JSONが壊れている・未対応の形式・アクセス不可の場合は、
エラーを表示して変更を止め、既存データを上書きしません。原因を解消して「再読み込み」を押してください。
登録後にフォルダを移動・削除した場合も保存済み一覧は読み込めます。

## プロジェクトの詳細・編集・登録解除

- 一覧の「詳細を開く」で名前とフォルダを確認できます。サイドバーまたは「プロジェクト一覧に戻る」で一覧に戻ります。
- 「編集する」で名前・フォルダを変更し、「変更を保存」でJSONに反映します。IDと一覧の順序は保持します。
- フォルダが見つからなくなっても、パスを変えなければ名前を変更できます。新しいパスには実在するフォルダが必要です。
- 「登録を解除」は確認画面を表示し、「登録解除を確定」でReentryの保存情報だけを削除します。元のフォルダとファイルは削除しません。
- 保存・登録解除に失敗した場合は画面にエラーを表示し、入力や登録情報を残します。
- 編集開始時の情報と保存済み情報を比較し、別の操作で更新・解除されたプロジェクトの上書き・削除を防ぎます。
  競合が表示されたら一覧に戻って「再読み込み」を押し、最新情報を確認してください。

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
