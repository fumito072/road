# Plan: ROAD OCR Hub — NestJS + PostgreSQL + Prisma 構成

## TL;DR

Next.js フロントエンドと NestJS バックエンドを分離したモノレポ構成。業務データ（タブ設定、アップロード履歴、OCR 結果）は PostgreSQL + Prisma で管理。認証は Firebase Authentication（フロントエンド直接）、ファイル保存は Firebase Storage、OCR は Gemini API、最終出力先は SharePoint（Graph API）。

## 確定済みの設計方針

- 認証: Firebase Authentication をフロントエンドから直接利用し、NestJS は ID トークンを Admin SDK で検証するのみ
- 業務データ: PostgreSQL に保存、Prisma ORM で型安全にアクセス
- ファイル保存: Firebase Storage（フロントエンドから直接アップロード）
- API / 業務ロジック: NestJS（バックエンド）
- OCR: Gemini API（NestJS から呼び出し）
- 最終出力先: Microsoft SharePoint（Graph API 経由、NestJS から実行）
- ホスティング: Railway（NestJS + PostgreSQL）

## ディレクトリ構成

```
road/
├── package.json              # モノレポルート（npm workspaces）
├── docs/
│   ├── 要件定義.md
│   └── plan.md
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── app/
│   ├── components/
│   ├── data/
│   └── lib/
└── backend/
    ├── package.json
    ├── tsconfig.json
    ├── nest-cli.json
    ├── prisma/
    │   └── schema.prisma
    └── src/
        ├── main.ts
        ├── app.module.ts
        ├── prisma/             # Prisma クライアントラッパー
        ├── auth/               # Firebase トークン検証
        ├── tabs/               # タブ CRUD
        ├── uploads/            # アップロード管理 + OCR + SharePoint フロー
        ├── ocr/                # Gemini API 連携
        ├── sharepoint/         # Graph API 連携
        └── common/
            ├── guards/         # FirebaseAuthGuard
            ├── decorators/     # CurrentUser
            └── filters/        # AllExceptionsFilter
```

## Steps

### Phase 1: 基盤構築 ✅

1. ✅ モノレポ構成を用意する（frontend / backend 分離、npm workspaces）
2. ✅ NestJS バックエンドをスキャフォールドする
3. ✅ PostgreSQL + Prisma を導入する（schema.prisma: User, Tab, Upload, UploadFile）
4. ✅ Firebase Admin SDK による認証（FirebaseAuthGuard）を実装する
5. ✅ 各モジュールを作成する（Auth, Tabs, Uploads, OCR, SharePoint）
6. ✅ Controller / Service / DTO / Module のパターンを統一する

### Phase 2: タブシステム構築 ✅

7. ✅ タブ API をテストする（GET / POST / PUT / DELETE /api/tabs）
8. ✅ フロントエンドにタブ一覧 UI を実装する
9. ✅ タブ設定モーダルを実装する（OCR プロンプト、SharePoint 出力先）
10. ✅ デフォルト 5 タブのシードスクリプトを作成する（prisma seed）

### Phase 3: フォルダアップロードフロー

11. フォルダ選択 UI を実装する（webkitdirectory）
12. Firebase Storage へのフロントエンド直接アップロードを実装する
13. NestJS Upload API と連携する（POST /api/uploads）
14. OCR 実行フロー（POST /api/uploads/:id/ocr）を Gemini API で実装する
15. OCR 結果確認画面を実装する（手動修正可能）
16. 確認 API（POST /api/uploads/:id/confirm）を実装する

### Phase 4: SharePoint 出力

17. Graph API クライアント認証を実装する
18. SharePoint アップロード処理（POST /api/uploads/:id/sharepoint）を実装する
19. 完了後の保存先リンク表示を実装する

### Phase 5: 統合と仕上げ

20. OCR Upload Workbench を新フローへ統合する
21. ダッシュボードデータを実 API に接続する
22. エラーハンドリングとローディング UI を整備する
23. Railway へのデプロイ設定を行う

## API エンドポイント

| Method | Path | 説明 |
|--------|------|------|
| GET | /api/tabs | タブ一覧取得 |
| POST | /api/tabs | タブ作成 |
| GET | /api/tabs/:id | タブ詳細取得 |
| PUT | /api/tabs/:id | タブ更新 |
| DELETE | /api/tabs/:id | タブ削除 |
| GET | /api/uploads?tabId= | アップロード一覧取得 |
| POST | /api/uploads | アップロード作成 |
| GET | /api/uploads/:id | アップロード詳細取得 |
| POST | /api/uploads/:id/ocr | OCR 実行 |
| POST | /api/uploads/:id/confirm | OCR 結果確認 |
| POST | /api/uploads/:id/sharepoint | SharePoint 出力 |

## 技術スタック

| 領域 | 技術 |
|------|------|
| フロントエンド | Next.js 14 + React 18 + TypeScript + Tailwind CSS |
| API / 業務ロジック | NestJS 10 |
| データベース | PostgreSQL |
| ORM | Prisma 5 |
| 認証 | Firebase Authentication + Admin SDK |
| ファイル保存 | Firebase Storage |
| OCR | Gemini API |
| 最終出力 | Microsoft SharePoint（Graph API） |
| ホスティング | Railway |

## データモデル（Prisma）

- **User**: firebaseUid, email, displayName
- **Tab**: name, order, isDefault, isActive, icon, ocrPromptTemplate, workflowPromptTemplate, sharepointSiteId/DriveId/FolderPath
- **Upload**: tabId, userId, folderName, contractNumber, customerName, applicationNumber, status (enum), ocrRawResponse (JSON), ocrStructuredResult (JSON), ocrConfidence, needsReview, sharepointDestinationPath/ItemId/WebUrl
- **UploadFile**: uploadId, originalFileName, mimeType, sizeBytes, storagePath

## 検証項目

1. NestJS 起動テスト: `npm -w backend run dev` で API が正常起動する
2. Prisma マイグレーション: `npx prisma migrate dev` で PostgreSQL にテーブルが作成される
3. タブ CRUD: 各 API エンドポイントが正常に動作する
4. 認証: Firebase ID トークンで /api/tabs にアクセスできる
5. OCR: Gemini API で画像から構造化データを取得できる
6. SharePoint: Graph API で指定フォルダへファイル出力できる
7. E2E: フォルダ選択 → OCR → 確認 → SharePoint 出力の一連のフローが完了する