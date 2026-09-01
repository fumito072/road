# LOAD OCR Hub アプリ棚卸し

対象リポジトリ: `fumito072/road`
対象コミット: `d80ecbe`（main、2026-09-01 時点）
作成日: 2026-09-01

---

## 1. サマリ

LOAD OCR Hub は、書類を Gemini API で OCR し、保存ファイル名と SharePoint 保存先を人が確認・修正してから保存する社内 Web アプリ。
現在は **4 つの業務モジュール** が画面上部のタブで切り替わる構成になっている。

| # | モジュール | 画面ラベル | 概要 | 保存先 |
| --- | --- | --- | --- | --- |
| 1 | AI OCR ファイル命名 | `AI OCR` | 書類フォルダを投入 → OCR → ファイル名確認 → SharePoint 保存 | SharePoint |
| 2 | 名簿照合 | `名簿照合 (Salesforce)` | 名簿画像/PDF から人物一覧を抽出し Salesforce と突合 | PDF / Excel 出力 |
| 3 | 経理OCR | `経理OCR` | 領収書・請求書から `購入日_会社名_金額` を生成 | SharePoint |
| 4 | 請求明細OCR | `請求明細OCR` | 通信キャリア等の請求明細から命名 | SharePoint |

規模: バックエンド 約 5,400 行 / フロントエンド 約 7,700 行（TypeScript、node_modules 除く）、追跡ファイル 131 件。

---

## 2. 技術スタックと構成

```text
road/                      npm workspaces（frontend + backend）
  backend/                 NestJS 10 + Prisma 5 + PostgreSQL
  frontend/                Next.js 14 (App Router) + React 18 + Tailwind
```

| レイヤ | 採用技術 |
| --- | --- |
| フロント | Next.js 14 / React 18 / TypeScript 5 / Tailwind 3 / lucide-react / pdfjs-dist 3 / exceljs / jspdf |
| バックエンド | NestJS 10 / Prisma 5 / PostgreSQL / @nestjs/jwt / bcryptjs / class-validator |
| 外部サービス | Gemini API（OCR）/ Microsoft Graph（SharePoint）/ Salesforce REST API |
| 実行基盤 | Railway（frontend / backend を別サービスでデプロイ、いずれも Dockerfile） |

- フロントは `middleware.ts` で `/api/*` を `BACKEND_URL` にリライトするプロキシ構成。
- 認証は JWT。トークンはブラウザの `sessionStorage`（キー `road.auth.token`）に保持。
- バックエンドは全ルートに `api` プレフィックス、`ValidationPipe`（whitelist + transform）をグローバル適用。

---

## 3. バックエンド モジュール一覧

| モジュール | 役割 | 主要ファイル | 行数 |
| --- | --- | --- | --- |
| `auth` | ログイン / JWT 発行 / パスワード変更 | auth.service.ts | 91 |
| `users` | ユーザー CRUD、パスワードリセット（ADMIN 限定） | users.service.ts | 99 |
| `tabs` | 業務タブ CRUD、SharePoint 保存先設定 | tabs.service.ts | 167 |
| `uploads` | アップロード、OCR 実行、保存先解決、SharePoint 送信、プレビュー | uploads.service.ts | **1,173** |
| `ocr` | Gemini 呼び出し（4 種の抽出関数）、フォールバック / リトライ | ocr.service.ts | **1,001** |
| `sharepoint` | Microsoft Graph 認証、フォルダ検索・作成、アップロード | sharepoint.service.ts | 397 |
| `salesforce` | OAuth Client Credentials、SOQL 検索 | salesforce.service.ts | 321 |
| `member-check` | 名簿照合ジョブ（非同期 submit→poll） | member-check.service.ts | 301 |
| `naming-memory` | 修正内容の学習辞書（VendorAlias）適用・記録 | naming-memory.service.ts | 218 |
| `keiri-ocr` | 経理書類スキャン | keiri-ocr.service.ts | 99 |
| `billing-ocr` | 請求明細スキャン | billing-ocr.service.ts | 122 |
| `naming-rules` | タブ別命名ルール CRUD | naming-rules.service.ts | — |

`ocr.service.ts` の抽出関数: `extract()`（汎用書類）/ `extractPeopleList()`（名簿）/ `extractAccountingDocuments()`（経理）/ `extractBillingStatements()`（請求明細）。
モデルは `GEMINI_MODEL`（既定 `gemini-2.5-flash`）+ `GEMINI_FALLBACK_MODELS`（既定 `gemini-2.5-flash-lite`）でフォールバック。名簿抽出は同一人物の繰り返し（リピートループ）と応答途中切れを検出して最大 3 回リトライする。

---

## 4. API エンドポイント一覧

すべて `/api` プレフィックス。「利用」欄はフロントエンドの現行画面から呼ばれているか。

| メソッド / パス | 認証 | 用途 | 利用 |
| --- | --- | --- | --- |
| POST `/auth/login` | 不要 | ログイン | ✅ |
| GET `/auth/me` | 要 | セッション確認 | ✅ |
| POST `/auth/change-password` | 要 | パスワード変更 | ✅ |
| GET `/users` | ADMIN | ユーザー一覧 | ✅ |
| POST `/users` | ADMIN | ユーザー作成 | ✅ |
| POST `/users/:id/password` | ADMIN | パスワードリセット | ✅ |
| DELETE `/users/:id` | ADMIN | ユーザー削除 | ✅ |
| GET `/tabs` | 要 | タブ一覧 | ⚠️ 未使用UIのみ |
| GET `/tabs/default` | 要 | 既定タブ取得 | ✅ |
| GET `/tabs/:id` | 要 | タブ取得 | ❌ |
| POST / PUT / DELETE `/tabs(/:id)` | ADMIN | タブ管理 | ⚠️ 未使用UIのみ |
| GET / POST / PUT / DELETE `/naming-rules(/:id)` | 要 | 命名ルール管理 | ⚠️ 未使用UIのみ |
| POST `/uploads/intake` | 要 | ファイル投入（最大 50 件） | ✅ |
| POST `/uploads` | 要 | アップロード作成（メタのみ） | ❌ |
| GET `/uploads` | 要 | 一覧 | ❌ |
| GET `/uploads/:id` | 要 | 詳細 | ✅ |
| GET `/uploads/:id/folders` | 要 | SharePoint 階層ドリルダウン | ✅ |
| POST `/uploads/:id/ocr` | 要 | OCR 実行 | ✅ |
| POST `/uploads/:id/resolve` | 要 | 保存先自動解決 | ❌ |
| POST `/uploads/:id/confirm` | 要 | 内容確定 | ✅ |
| POST `/uploads/:id/file-names` | 要 | ファイル名保存 | ✅ |
| POST `/uploads/:id/sharepoint` | 要 | SharePoint 送信 | ✅ |
| GET `/uploads/:id/files/:fileId/preview` | 要 | プレビュー取得 | ✅ |
| POST `/member-check/scan` | 要 | 名簿照合ジョブ投入 | ✅ |
| GET `/member-check/jobs/:id` | 要 | ジョブ状態ポーリング | ✅ |
| POST `/keiri-ocr/scan` | 要 | 経理OCR | ✅ |
| POST `/billing-ocr/scan` | 要 | 請求明細OCR | ✅ |
| POST `/naming-memory/record` | 要 | 修正内容の学習 | ✅ |
| GET `/naming-memory` | 要 | 学習辞書一覧 | ❌ |
| DELETE `/naming-memory/:id` | ADMIN | 学習辞書削除 | ❌ |

---

## 5. データモデル（PostgreSQL / Prisma）

| テーブル | 用途 | 備考 |
| --- | --- | --- |
| `users` | ユーザー（email / passwordHash / role） | role は `USER` / `ADMIN` |
| `tabs` | 業務タブ。OCR プロンプト、SharePoint Site/Drive/Folder を保持 | seed で 5 件（コラボ / リース・現金 / モバイル / 電力 / 経理） |
| `naming_rules` | タブ別・書類種別ごとの命名パターン | 優先度付き |
| `vendor_aliases` | 修正学習辞書。`(tabId, field, matchKey)` で一意 | field は `company` / `documentType` / `carrier` |
| `uploads` | アップロード単位。ステータス 7 種、OCR 生結果と構造化結果を JSON 保持 | |
| `upload_files` | 個別ファイル（保存パス、MIME、サイズ） | |

マイグレーション 8 本（`20260406` 初期 〜 `20260828` VendorAlias field 追加）。

学習辞書の仕組み: OCR の生読み取り値を正規化（NFKC・空白除去・小文字化、`company`/`carrier` は会社種別も除去）してキー化し、ユーザーが確定した表記を次回から自動適用する。タブ単位で全ユーザー共有。

---

## 6. 外部連携と環境変数

| 連携 | 認証方式 | 環境変数 | `.env.example` 記載 |
| --- | --- | --- | --- |
| Gemini API | API キー | `GEMINI_API_KEY` `GEMINI_MODEL` `GEMINI_FALLBACK_MODELS` `GEMINI_RETRY_ATTEMPTS` `OCR_MOCK_MODE` | ✅ |
| Microsoft Graph / SharePoint | Client Credentials | `AZURE_TENANT_ID` `AZURE_CLIENT_ID` `AZURE_CLIENT_SECRET` | ✅ |
| Salesforce | OAuth 2.0 Client Credentials（Run As ユーザー） | `SALESFORCE_CONSUMER_KEY` `SALESFORCE_CONSUMER_SECRET` `SALESFORCE_LOGIN_URL` | ❌ **未記載** |
| DB / 認証 / CORS | — | `DATABASE_URL` `PORT` `NODE_ENV` `APP_ENV` `FRONTEND_URL` `CORS_ALLOW_ALL_ORIGINS` `AUTH_JWT_SECRET` `AUTH_JWT_EXPIRES_IN` `AUTH_ALLOW_DEV_USER` | ✅ |
| フロント | — | `BACKEND_URL` `NEXT_PUBLIC_API_URL` | ✅ |

Salesforce は `CustomObject_torihisaki_tantou__c` を含むオブジェクトを SOQL で検索し、アクセストークンを 25 分キャッシュする。

---

## 7. 棚卸しで見つかった論点

### 7.1 到達不能になっている UI（約 1,663 行）

`app/page.tsx` から辿れないコンポーネントが残っている。

| 対象 | 内容 |
| --- | --- |
| `components/dashboard/*`（8 ファイル） | 旧ダッシュボードのカード・チャート類 |
| `components/layout/*`（4 ファイル） | `app-shell` / `dashboard-shell` / `header-bar` / `sidebar-navigation` |
| `components/tabs/tab-bar.tsx` | 業務タブ切り替えバー |
| `components/tabs/tab-settings-modal.tsx`（538 行） | **業務タブ管理・命名ルール管理の管理者 UI** |
| `data/dashboard.ts` | ダッシュボード用ダミーデータ |

**影響が大きいのは `tab-settings-modal`。** README に記載のある「業務タブ管理」「命名ルール編集」は、API は生きているが画面からは操作できない状態。現行 4 モジュールはいずれも `/tabs/default` で既定タブを 1 件取るだけになっている。運用上タブ管理が必要なら再接続、不要なら該当 API ごと整理するかの判断が要る。

### 7.2 ドキュメントと実装の乖離

- README に **経理OCR / 請求明細OCR / 名簿照合 / 学習辞書（VendorAlias）** の記載がない。README は「業務タブ 5 種を切り替える構成」のままで、現行の 4 モジュール構成と一致していない。
- `SALESFORCE_*` 環境変数が README にも `backend/.env.example` にも無い。名簿照合を新環境で立ち上げる際に設定漏れになる。
- `salesforce-jwt-flow.md` は JWT Bearer フロー（`key.pem` / `server.crt` 前提）を説明しているが、実装は **Client Credentials フロー**。手順書として使うと嵌まる。

### 7.3 運用上のリスク

| 項目 | 内容 |
| --- | --- |
| 名簿照合ジョブがインメモリ | `Map` + TTL 30 分。再デプロイやインスタンス複数化でジョブが消える／ポーリングが 404 になる |
| `runtime-uploads` が非永続 | Railway のファイルシステムは揮発。投入〜SharePoint 保存は同一セッション内で完結させる運用が前提（README に記載済み） |
| テスト・CI が皆無 | `*.spec.ts` / `*.test.ts` は 0 件、`.github/workflows` も無し。1,000 行超の `uploads.service.ts` / `ocr.service.ts` が無保護 |
| 危険フラグ | `CORS_ALLOW_ALL_ORIGINS=true` と `AUTH_ALLOW_DEV_USER=true` は認証・CORS を実質無効化する。本番の Railway 変数に混入していないか確認したい |
| 顧客提供 PDF がコミット済み | ルート直下の `0706_AI OCR修正.pdf` `20260817_経理AI OCR修正依頼.pdf` が追跡下。`.gitignore` は同種の `AIOCR修正*.pdf` `OCR修正案.pdf` を除外しているので、この 2 件だけ意図せず残っている可能性が高い |
| seed のハードコード | `seed.ts` に SharePoint の Site ID / Drive ID が直書き。環境を分ける場合は要パラメータ化 |

### 7.4 依存関係

Next.js 14 / NestJS 10 / Prisma 5 / pdfjs-dist 3 系。いずれも動作に問題はないが現行メジャーから 1〜2 世代前。`@nestjs/cli`・`prisma`・`typescript` が backend の `dependencies`（本来 devDependencies）に入っており、本番イメージが不要に大きい。

---

## 8. 推奨アクション（優先度順）

1. **本番の環境変数を確認** — `CORS_ALLOW_ALL_ORIGINS` / `AUTH_ALLOW_DEV_USER` が有効になっていないか。
2. **コミット済み顧客 PDF 2 件の扱いを判断** — 機密なら履歴からの除去と `.gitignore` 追記。
3. **README の更新** — 4 モジュール構成、学習辞書、`SALESFORCE_*` 環境変数を追記。`salesforce-jwt-flow.md` は実装（Client Credentials）に合わせて改訂か削除。
4. **タブ管理 UI の方針決定** — `tab-settings-modal` を再接続するか、`/tabs` `/naming-rules` の CRUD ごと削除するか。
5. **未使用コードの整理** — 上記を決めたうえで、ダッシュボード／レイアウト系 1,663 行と未使用エンドポイント（`POST /uploads`、`GET /uploads`、`POST /uploads/:id/resolve`）を削除。
6. **名簿照合ジョブの永続化** — 複数インスタンス運用・再デプロイ耐性が必要になった時点で DB か Redis へ移す。
7. **最低限のテストと CI** — 命名生成・学習辞書の正規化・SharePoint パス組み立てなど、純粋ロジック部分から着手するのが費用対効果が高い。
8. **学習辞書の管理画面** — `GET /naming-memory` / `DELETE /naming-memory/:id` は実装済みなので、誤学習を消せる管理 UI を薄く足せる。
