# LOAD OCR Hub

LOAD OCR Hub は、業務タブごとに書類フォルダをアップロードし、AI OCR で内容を読み取り、保存ファイル名と SharePoint 保存先を確認・修正してからアップロードするためのWebアプリケーションです。

> 本リポジトリは納品物（ソースコード一式）です。本READMEのみで環境構築・起動・デプロイまで再現できることを目的としています。APIキー等の秘密情報はソースコードには含まれていません。

## 主な機能

- ログイン認証
- 管理者 / 一般ユーザーの権限分離
- 業務タブ管理
- フォルダ単位の書類アップロード
- Gemini API を使ったOCR解析
- OCR結果の確認・手動修正
- 保存ファイル名の編集
- SharePoint保存先候補の検索
- SharePoint階層表示ドリルダウン
- 新規フォルダ作成、既存フォルダ保存、AI OCRフォルダー仮格納
- SharePointへのファイル保存

## 技術スタック

### フロントエンド

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- lucide-react
- ESLint

### バックエンド

- NestJS 10
- TypeScript
- Prisma
- PostgreSQL
- JWT認証
- bcryptjs
- class-validator / class-transformer

### 外部サービス

- Gemini API
  - OCR解析に使用します。
- Microsoft Graph API / SharePoint
  - 保存先フォルダ検索、階層表示、ファイルアップロードに使用します。
- Railway
  - 本番・ステージング環境のデプロイ先として利用します。

## ディレクトリ構成

```text
road/
  backend/                 # NestJS APIサーバー
    prisma/                # Prisma schema / migrations / seed
    src/
      auth/                # ログイン、JWT認証
      common/              # guard / decorator / filter
      naming-rules/        # 命名ルールAPI
      ocr/                 # Gemini OCR連携
      sharepoint/          # Microsoft Graph / SharePoint連携
      tabs/                # 業務タブAPI
      uploads/             # アップロード、OCR、保存先解決
  frontend/                # Next.js フロントエンド
    app/
    components/
      auth/
      ocr/
      tabs/
    lib/
  package.json             # npm workspaces
```

## 起動方法

### 1. 事前準備

以下をインストールしてください。

- Node.js 22系
- npm
- PostgreSQL
- Railway CLI（Railwayにデプロイする場合）

依存パッケージをインストールします。

```bash
npm install
```

### 2. データベースを用意

ローカルPostgreSQLにデータベースを作成します。

例:

```bash
createdb road_dev
```

PostgreSQLをDockerで起動する場合の例:

```bash
docker run --name road-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=road_dev \
  -p 5432:5432 \
  -d postgres:16
```

### 3. 環境変数を作成

バックエンド:

```bash
cp backend/.env.example backend/.env
```

フロントエンド:

```bash
cp frontend/.env.example frontend/.env.local
```

ローカルでは、フロントエンドが `/api/*` へのリクエストを `BACKEND_URL` にプロキシします。  
このREADMEではバックエンドのローカルポートを `3003` として説明します。

### 4. Prisma migrationを実行

```bash
npm run prisma:migrate
```

必要に応じて seed を実行します。

```bash
cd backend
npx prisma db seed
cd ..
```

### 5. ローカルユーザーを作成

管理者ユーザー:

```bash
npm -w backend run create-user -- test@example.com password "Admin User" ADMIN
```

開発者・管理者ユーザー:

```bash
npm -w backend run create-user -- dev@example.com dev-password "Dev User" ADMIN
```

一般ユーザー:

```bash
npm -w backend run create-user -- user@example.com user-password "General User" USER
```

### 6. 開発サーバーを起動

フロントエンドとバックエンドを同時起動:

```bash
npm run dev
```

個別に起動する場合:

```bash
npm run dev:backend
npm run dev:frontend
```

起動後、ブラウザで以下にアクセスします。

```text
http://localhost:3000
```

## ローカルログイン情報

ローカルDBに上記のユーザーを作成している場合、以下でログインできます。

| 種別 | メールアドレス | パスワード | 権限 |
| --- | --- | --- | --- |
| 管理者 | `test@example.com` | `password` | ADMIN |
| 開発者・管理者 | `dev@example.com` | `dev-password` | ADMIN |
| 一般ユーザー | `user@example.com` | `user-password` | USER |

管理者は、設定変更や業務タブ作成・編集・削除ができます。  
一般ユーザーは、OCR実行や確認作業を行う想定です。

## 必要な環境変数

### backend/.env

| 変数名 | 必須 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` | 必須 | PostgreSQL接続URL |
| `PORT` | 推奨 | バックエンドの起動ポート。ローカルでは `3003` 推奨 |
| `FRONTEND_URL` | 本番必須 | CORSで許可するフロントエンドURL |
| `NODE_ENV` | 推奨 | `development` / `production` / `staging` |
| `APP_ENV` | 任意 | `staging` の場合、CORSをステージング向けに緩和 |
| `CORS_ALLOW_ALL_ORIGINS` | 任意 | `true` の場合、Originを広く許可。ステージング用途のみ推奨 |
| `AUTH_JWT_SECRET` | 必須 | JWT署名用secret |
| `AUTH_JWT_EXPIRES_IN` | 任意 | JWT有効期限。例: `24h` |
| `AUTH_ALLOW_DEV_USER` | 任意 | `true` の場合、Bearer tokenなしで開発用ユーザーを使う。ローカル検証専用 |
| `GEMINI_API_KEY` | OCR利用時必須 | Gemini APIキー |
| `GEMINI_MODEL` | 任意 | OCRで使うGeminiモデル。例: `gemini-2.5-flash` |
| `GEMINI_FALLBACK_MODELS` | 任意 | フォールバックモデル。例: `gemini-2.5-flash-lite` |
| `GEMINI_RETRY_ATTEMPTS` | 任意 | Gemini APIリトライ回数 |
| `OCR_MOCK_MODE` | 任意 | `true` の場合、Geminiを呼ばずモックOCR結果を返す |
| `AZURE_TENANT_ID` | SharePoint利用時必須 | Microsoft Entra ID tenant ID |
| `AZURE_CLIENT_ID` | SharePoint利用時必須 | Microsoft Graph API用アプリのclient ID |
| `AZURE_CLIENT_SECRET` | SharePoint利用時必須 | Microsoft Graph API用アプリのclient secret |

ローカル用の例:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/road_dev"
PORT=3003
FRONTEND_URL="http://localhost:3000"
NODE_ENV=development
AUTH_JWT_SECRET="replace-with-local-secret"
AUTH_JWT_EXPIRES_IN="24h"

GEMINI_API_KEY="replace-with-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"
GEMINI_FALLBACK_MODELS="gemini-2.5-flash-lite"
GEMINI_RETRY_ATTEMPTS="3"

AZURE_TENANT_ID="replace-with-tenant-id"
AZURE_CLIENT_ID="replace-with-client-id"
AZURE_CLIENT_SECRET="replace-with-client-secret"
```

### frontend/.env.local

| 変数名 | 必須 | 説明 |
| --- | --- | --- |
| `BACKEND_URL` | 推奨 | Next.js middlewareが `/api/*` を転送するバックエンドURL |
| `NEXT_PUBLIC_API_URL` | 任意 | ブラウザから直接API URLへアクセスさせる場合に使用 |

ローカル用の例:

```env
BACKEND_URL=http://localhost:3003
```

本番・ステージングでは、通常 `BACKEND_URL` にデプロイ済みバックエンドURLを設定します。

## OCR / SharePoint / Railway の関係

### 全体の処理フロー

```text
1. ユーザーがログイン
2. 業務タブを選択
3. 書類フォルダをアップロード
4. backendがアップロード情報をPostgreSQLに保存
5. backendがファイルを runtime-uploads に保存
6. OCR実行
7. backendがGemini APIへファイル内容を送信
8. Geminiの結果をOCR構造化データとして保存
9. ユーザーがファイル名・保存先を確認、必要に応じて修正
10. SharePoint保存先候補を解決
11. Microsoft Graph APIでSharePointへアップロード
12. 保存結果URLを画面に表示
```

### Gemini API

Gemini APIは、アップロードされたPDFや画像から以下の情報を読み取るために使います。

- 顧客名
- 顧客名の読み方
- 契約ID
- 申込番号
- 書類種別
- 書類日付
- 保存ファイル名候補

Gemini APIで上限超過や高負荷エラーが発生した場合、設定されたフォールバックモデルとリトライ設定に従って再試行します。

### SharePoint / Microsoft Graph API

SharePoint連携では、Microsoft Graph APIを使用します。

主な用途:

- 顧客フォルダ検索
- 業務フォルダ検索
- 階層表示ドリルダウン
- 新規フォルダ作成
- ファイルアップロード
- SharePoint URLの取得

Graph APIを使用するため、Azure / Microsoft Entra ID 側でアプリ登録を行い、適切な権限を付与する必要があります。

### ファイルの保存場所

通常のアップロードでは、ファイルはバックエンドの `runtime-uploads` に保存されます。

注意: Railwayのファイルシステムは永続ストレージではありません。再デプロイ等でファイルが失われる可能性があるため、アップロード〜SharePoint保存は同一セッション内で完結させる運用を推奨します。長期間ファイルを保持する必要がある場合は、永続ボリュームや外部ストレージの利用を検討してください。

### Railway

Railwayでは、フロントエンドとバックエンドを別サービスとしてデプロイする構成です。

```text
Railway Project
  backend service
    - NestJS API
    - Prisma migration
    - PostgreSQL接続
    - Gemini / SharePoint連携

  frontend service
    - Next.js
    - /api/* を BACKEND_URL にプロキシ

  PostgreSQL
    - Railway PostgreSQL または外部PostgreSQL
```

## デプロイ方法

### 1. Railwayにログイン

```bash
railway login --browserless
```

### 2. Railwayプロジェクトにリンク

```bash
railway link
```

### 3. backend serviceの環境変数を設定

Railway dashboard、またはRailway CLIで以下を設定します。

- `DATABASE_URL`
- `PORT`
- `NODE_ENV=production`
- `FRONTEND_URL`
- `AUTH_JWT_SECRET`
- `AUTH_JWT_EXPIRES_IN`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_FALLBACK_MODELS`
- `GEMINI_RETRY_ATTEMPTS`
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

backendは `backend/Dockerfile` を使います。  
コンテナ起動時に以下が実行されます。

```bash
npx prisma migrate deploy && node dist/main
```

そのため、デプロイ時にPrisma migrationも反映されます。

### 4. frontend serviceの環境変数を設定

frontend serviceには以下を設定します。

```env
BACKEND_URL=https://<backend-service-domain>
```

frontendは `frontend/Dockerfile` を使い、Next.js standalone形式で起動します。

### 5. デプロイ

Railway dashboardからデプロイするか、CLIで対象サービスを選択してデプロイします。

例:

```bash
railway up --service backend
railway up --service frontend
```

サービス名はRailway上の実際の名前に合わせてください。

## 権限

ユーザーには以下のロールがあります。

| ロール | 説明 |
| --- | --- |
| `ADMIN` | 設定変更、業務タブ作成・編集・削除が可能 |
| `USER` | OCR実行、アップロード確認、保存処理を行う一般ユーザー |

ユーザー作成コマンド:

```bash
npm -w backend run create-user -- <email> <password> <displayName> <USER|ADMIN>
```

例:

```bash
npm -w backend run create-user -- user@example.com user-password "General User" USER
```

## 業務タブ

標準の業務タブは以下です。

1. コラボ
2. リース・現金
3. モバイル
4. 電力
5. 経理

`コラボ` では、保存フォルダ名の基本ルールとして `日付_契約ID` を使います。  
その他のタブでは、保存フォルダ名を自由入力でき、共通情報の顧客名を反映できます。

## よく使うコマンド

### 開発起動

```bash
npm run dev
```

### フロントエンドのみ起動

```bash
npm run dev:frontend
```

### バックエンドのみ起動

```bash
npm run dev:backend
```

### ビルド

```bash
npm run build
```

### フロントエンドビルド

```bash
npm run build:frontend
```

### バックエンドビルド

```bash
npm run build:backend
```

### Prisma Client生成

```bash
npm run prisma:generate
```

### Prisma migration

```bash
npm run prisma:migrate
```

### Prisma Studio

```bash
npm run prisma:studio
```

## トラブルシューティング

### ログインできない

- ユーザーがDBに作成されているか確認してください。
- パスワードが正しいか確認してください。
- `AUTH_JWT_SECRET` が設定されているか確認してください。

### API error 500 が出る

バックエンドログを確認してください。  
主な原因は以下です。

- DBに接続できない
- Gemini APIエラー
- SharePoint / Graph API認証エラー
- CORS設定不備
- アップロード済みファイルが見つからない

### CORSエラーが出る

ローカルでは以下を確認してください。

```env
FRONTEND_URL=http://localhost:3000
```

ステージングで一時的に広く許可する場合:

```env
CORS_ALLOW_ALL_ORIGINS=true
```

本番では推奨しません。

### OCRが失敗する

- `GEMINI_API_KEY` が設定されているか
- `GEMINI_MODEL` が利用可能か
- APIキーの利用上限に達していないか
- 対象ファイルの形式が対応範囲か

### SharePoint保存に失敗する

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- 業務タブの SharePoint Site ID / Drive ID / Folder Path
- Microsoft Graph APIの権限

上記を確認してください。
