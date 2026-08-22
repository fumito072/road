"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  CircleEllipsis,
  ExternalLink,
  FilePenLine,
  FolderCheck,
  FolderOpen,
  HardDriveDownload,
  Home,
  Play,
  Save,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import { apiFetch } from "@/lib/api";
import { UploadDropzone } from "@/components/common/upload-dropzone";
import { FloatingPreview } from "@/components/common/floating-preview";
import { formatBytes, type DroppedFile } from "@/lib/file-drop";
import type {
  SharepointFolderBrowserResult,
  SharepointFolderOption,
  Tab,
  UploadFileResult,
  UploadRecord,
  UploadStructuredResult,
} from "@/lib/types";

// File System Access API（Chrome/Edge）。フォルダを選んで直接書き込むために使う。
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

type KeiriScanFile = {
  originalFileName: string;
  company: string;
  amount: string;
  date: string;
  documentType: string;
  suggestedName: string;
  ocrCompany: string;
  appliedFromMemory: boolean;
};

type KeiriScanResult = {
  files: KeiriScanFile[];
  confidence: number;
};

type KeiriRow = {
  id: string;
  file: File;
  // uploads に保存された正規のファイル名（＝File.name）。SharePoint リネームのキーにも使う。
  originalFileName: string;
  // uploads 上のファイルID（プレビュー取得に使う）。
  fileId: string | null;
  date: string;
  company: string;
  amount: string;
  documentType: string;
  // AI が読んだ生の会社名。編集しても書き換えない（学習のキーになるため）。
  ocrCompany: string;
  // 過去の修正内容が自動適用された行かどうか。
  appliedFromMemory: boolean;
};

type DestinationKind = "local" | "sharepoint";

function fileExtension(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i) : ".pdf";
}

function sanitizeSegment(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

// 命名規則: 購入日_会社名_金額（拡張子は元ファイル維持）
function buildKeiriName(row: Pick<KeiriRow, "date" | "company" | "amount" | "originalFileName">) {
  const base = [row.date, row.company, row.amount]
    .map(sanitizeSegment)
    .filter(Boolean)
    .join("_");
  return base ? `${base}${fileExtension(row.originalFileName)}` : row.originalFileName;
}

function buildFolderName(prefix: string) {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  return `${prefix}-${timestamp}`;
}

function normalizeFolderPath(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function folderDisplayName(path: string) {
  const segments = normalizeFolderPath(path).split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function KeiriOcrWorkbench() {
  const [defaultTab, setDefaultTab] = useState<Tab | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const [queue, setQueue] = useState<{ id: string; file: File }[]>([]);
  const [rows, setRows] = useState<KeiriRow[]>([]);
  const [currentUpload, setCurrentUpload] = useState<UploadRecord | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [isSavingSharepoint, setIsSavingSharepoint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // ④ 保存先
  const [destinationKind, setDestinationKind] = useState<DestinationKind>("local");

  // ④-A ローカル（File System Access API）
  const [localDirHandle, setLocalDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [localDirName, setLocalDirName] = useState("");

  // ④-B SharePoint フォルダ選択
  const [sharepointFolderPath, setSharepointFolderPath] = useState("");
  const [folderBrowserPath, setFolderBrowserPath] = useState("");
  const [folderBrowserParentPath, setFolderBrowserParentPath] = useState<string | null>(null);
  const [folderBrowserFolders, setFolderBrowserFolders] = useState<SharepointFolderOption[]>([]);
  const [folderBrowserRootPath, setFolderBrowserRootPath] = useState("");
  const [isBrowsingFolders, setIsBrowsingFolders] = useState(false);
  const [folderBrowserError, setFolderBrowserError] = useState<string | null>(null);

  // プレビュー（非モーダル・移動可能）
  const [previewFile, setPreviewFile] = useState<{ fileId: string; name: string; mimeType: string } | null>(null);

  const supportsFsAccess =
    typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

  useEffect(() => {
    void (async () => {
      try {
        const tab = await apiFetch<Tab>("/tabs/default");
        setDefaultTab(tab);
      } catch {
        setBootError("初期設定の取得に失敗しました。ログインし直すか、ページを再読み込みしてください。");
      }
    })();
  }, []);

  const addFiles = useCallback((incoming: DroppedFile[]) => {
    setQueue((current) => [
      ...current,
      ...incoming.map((item, index) => ({
        id: `${item.file.name}-${item.file.lastModified}-${current.length + index}`,
        file: item.file,
      })),
    ]);
  }, []);

  const removeQueued = (id: string) => setQueue((c) => c.filter((x) => x.id !== id));

  const handleReset = () => {
    setQueue([]);
    setRows([]);
    setCurrentUpload(null);
    setError(null);
    setInfo(null);
  };

  const handleScan = async () => {
    if (!defaultTab || queue.length === 0 || isRunning) return;
    setIsRunning(true);
    setError(null);
    setInfo(null);
    try {
      // ① uploads にファイルを保存（SharePoint 保存・プレビューに必要）＋ ② 経理OCRで抽出。
      const intakeForm = new FormData();
      intakeForm.append("tabId", defaultTab.id);
      intakeForm.append("folderName", buildFolderName("経理OCR"));
      queue.forEach((item) => intakeForm.append("files", item.file));

      const scanForm = new FormData();
      // tabId は学習辞書（過去に直した取引先名）を引くために渡す。
      scanForm.append("tabId", defaultTab.id);
      queue.forEach((item) => scanForm.append("files", item.file));

      const [createdUpload, scan] = await Promise.all([
        apiFetch<UploadRecord>("/uploads/intake", { method: "POST", body: intakeForm }),
        apiFetch<KeiriScanResult>("/keiri-ocr/scan", { method: "POST", body: scanForm }),
      ]);

      // scan は入力と同じ順序で返る。uploads の保存名は文字化け修正済みで File.name と一致する。
      const nextRows: KeiriRow[] = queue.map((item, index) => {
        const uploadFile =
          createdUpload.files.find((f) => f.originalFileName === item.file.name) ??
          createdUpload.files[index];
        const s = scan.files[index];
        return {
          id: uploadFile?.id ?? item.id,
          file: item.file,
          originalFileName: uploadFile?.originalFileName ?? item.file.name,
          fileId: uploadFile?.id ?? null,
          date: s?.date ?? "",
          company: s?.company ?? "",
          amount: s?.amount ?? "",
          documentType: s?.documentType ?? "",
          ocrCompany: s?.ocrCompany ?? s?.company ?? "",
          appliedFromMemory: s?.appliedFromMemory ?? false,
        };
      });

      const appliedCount = nextRows.filter((row) => row.appliedFromMemory).length;

      setCurrentUpload(createdUpload);
      setRows(nextRows);
      setQueue([]);
      setInfo(
        appliedCount > 0
          ? `読み取りが完了しました。${appliedCount} 件は前回までに修正いただいた会社名を自動で反映しています。`
          : "読み取りが完了しました。日付・会社名・金額を確認し、保存先を選んでください。",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "読み取りに失敗しました。少し時間を置いて再実行してください。",
      );
    } finally {
      setIsRunning(false);
    }
  };

  const updateRow = (id: string, patch: Partial<KeiriRow>) => {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        // 会社名を手で直したら「自動反映」バッジは外す（以降はユーザー自身の値）。
        // ocrCompany は学習のキーなので、ここでは絶対に上書きしない。
        const clearBadge = patch.company !== undefined && patch.company !== row.company;
        return { ...row, ...patch, ...(clearBadge ? { appliedFromMemory: false } : {}) };
      }),
    );
  };

  /**
   * 読み取り済みの書類を保存対象から外す。
   * 重複した領収証などを、保存前に一覧から取り除くために使う。
   * rows がローカル保存・SharePoint 保存の両方の対象なので、ここから消せば保存されない。
   */
  const removeRow = (id: string) => {
    setRows((current) => {
      const target = current.find((row) => row.id === id);
      // 削除した行のプレビューが開いていたら閉じる。
      if (target?.fileId && previewFile?.fileId === target.fileId) {
        setPreviewFile(null);
      }
      return current.filter((row) => row.id !== id);
    });
    setInfo(null);
  };

  /**
   * 学習の記録。保存が成功した瞬間だけ呼ぶ。
   * 入力途中の値や打ち間違いを覚えないよう、onChange では記録しない。
   * ocrValue には必ず「AI が読んだ生の値」を渡すこと（自動適用後の値ではない）。
   */
  const recordNamingMemory = useCallback(
    async (savedRows: KeiriRow[]): Promise<number> => {
      if (!defaultTab) return 0;

      const entries = savedRows
        // 自動反映されたまま手を加えていない行は、既に辞書にある内容なので送らない。
        // （updateRow が会社名の編集時に appliedFromMemory を落とすため、true = 無修正）
        .filter((row) => !row.appliedFromMemory)
        .map((row) => ({ ocrValue: row.ocrCompany.trim(), confirmedValue: row.company.trim() }))
        .filter((entry) => entry.ocrValue && entry.confirmedValue && entry.ocrValue !== entry.confirmedValue);

      if (entries.length === 0) return 0;

      try {
        const result = await apiFetch<{ learned: number }>("/naming-memory/record", {
          method: "POST",
          body: JSON.stringify({ tabId: defaultTab.id, entries }),
        });
        return result.learned ?? 0;
      } catch {
        // 学習は補助機能。失敗してもファイルの保存自体は完了しているため、エラーは出さない。
        return 0;
      }
    },
    [defaultTab],
  );

  const learnedMessage = (learned: number) =>
    learned > 0
      ? `会社名の修正 ${learned} 件を記憶しました。次回から自動で反映されます。`
      : "";

  // ④-A ローカルフォルダを選ぶ
  const handleChooseLocalDir = async () => {
    if (!supportsFsAccess || !window.showDirectoryPicker) {
      setError("このブラウザはフォルダへの直接保存に未対応です。Chrome または Edge をご利用ください。");
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      setLocalDirHandle(handle);
      setLocalDirName(handle.name);
      setError(null);
    } catch {
      // ユーザーがキャンセルした場合は何もしない
    }
  };

  const handleSaveToLocal = async () => {
    if (rows.length === 0) return;
    if (!localDirHandle) {
      setError("先に保存先フォルダを選択してください。");
      return;
    }
    setIsSavingLocal(true);
    setError(null);
    setInfo(null);
    try {
      let saved = 0;
      for (const row of rows) {
        const name = buildKeiriName(row);
        const handle = await localDirHandle.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(row.file);
        await writable.close();
        saved += 1;
      }
      // 保存が全件通ってから学習する。
      const learned = await recordNamingMemory(rows);
      setInfo(
        `ローカルフォルダ「${localDirName}」へ ${saved} 件を直接保存しました。${learnedMessage(learned)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "ローカル保存に失敗しました。フォルダの権限を確認してください。");
    } finally {
      setIsSavingLocal(false);
    }
  };

  // ④-B SharePoint フォルダ閲覧
  const loadFolderBrowser = useCallback(
    async (path?: string) => {
      if (!currentUpload) return;
      setIsBrowsingFolders(true);
      setFolderBrowserError(null);
      try {
        const normalizedPath = normalizeFolderPath(path ?? "");
        const query = normalizedPath ? `?path=${encodeURIComponent(normalizedPath)}` : "";
        const data = await apiFetch<SharepointFolderBrowserResult>(
          `/uploads/${currentUpload.id}/folders${query}`,
        );
        setFolderBrowserRootPath(data.rootPath);
        setFolderBrowserPath(data.currentPath);
        setFolderBrowserParentPath(data.parentPath);
        setFolderBrowserFolders(data.folders);
      } catch (err) {
        setFolderBrowserError(
          err instanceof Error ? err.message : "SharePoint フォルダ階層の取得に失敗しました。",
        );
      } finally {
        setIsBrowsingFolders(false);
      }
    },
    [currentUpload],
  );

  const handleSaveToSharePoint = async () => {
    if (!currentUpload) return;
    if (!sharepointFolderPath.trim()) {
      setError("SharePoint の保存先フォルダを選択してください。");
      return;
    }
    setIsSavingSharepoint(true);
    setError(null);
    setInfo(null);
    try {
      // 命名規則（購入日_会社名_金額）を outputFileName として渡すと、
      // バックエンドがこの名前でリネームして SharePoint にアップロードする。
      const fileResults: UploadFileResult[] = rows.map((row) => ({
        originalFileName: row.originalFileName,
        outputFileName: buildKeiriName(row),
        documentType: row.documentType,
        documentDate: row.date,
      }));

      const structured: UploadStructuredResult = {
        ...(currentUpload.ocrStructuredResult ?? {}),
        sharepointFolderPath: sharepointFolderPath.trim(),
        fileResults,
      };

      await apiFetch<UploadRecord>(`/uploads/${currentUpload.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          sharepointFolderPath: sharepointFolderPath.trim(),
          ocrStructuredResult: structured,
        }),
      });

      const saved = await apiFetch<UploadRecord>(`/uploads/${currentUpload.id}/sharepoint`, {
        method: "POST",
      });

      const learned = await recordNamingMemory(rows);

      setCurrentUpload(saved);
      setInfo(`SharePoint への保存が完了しました。${learnedMessage(learned)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "SharePoint 保存に失敗しました。");
    } finally {
      setIsSavingSharepoint(false);
    }
  };

  const activeStatus = currentUpload
    ? isRunning
      ? "読み取り中"
      : rows.length > 0
        ? "読み取り完了"
        : "受付済み"
    : "未実行";

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#222b38]">
      <header className="border-b border-black/10 bg-[#2f2f31] text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">経理OCR</h1>
            <p className="mt-2 text-sm text-white/70">
              アップロード → 読み取り → ファイル名編集 → 任意の保存先へ直接保存。命名規則「購入日_会社名_金額」。
            </p>
          </div>
          <div className="rounded-md bg-white/10 px-3 py-2 text-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">命名規則</p>
            <p className="mt-1 font-semibold">購入日_会社名_金額</p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
        <div className="grid gap-3">
          {bootError && (
            <div className="flex items-start gap-3 rounded-sm border border-[#f2bfd2] bg-[#fff3f8] px-4 py-3 text-sm text-[#b43a6a]">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{bootError}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-3 rounded-sm border border-[#f2bfd2] bg-[#fff3f8] px-4 py-3 text-sm text-[#b43a6a]">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div className="flex items-start gap-3 rounded-sm border border-[#bfece6] bg-[#eefdfa] px-4 py-3 text-sm text-[#1e8f88]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{info}</span>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-6 xl:grid-cols-2">
          {/* ① ファイルアップロード */}
          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">① ファイルアップロード</h2>
              <p className="mt-2 text-sm text-[#6a7684]">
                領収書・請求書のフォルダ／ファイルを選ぶか、ここへドラッグ&ドロップしてください。
              </p>
            </div>
            <div className="p-6">
              <UploadDropzone onFiles={addFiles} onNotice={setError} />
            </div>
          </section>

          {/* ② 読み取り実行 */}
          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">② 読み取り実行</h2>
              <p className="mt-2 text-sm text-[#6a7684]">投入したファイルを読み取り、ファイル名の候補を作ります。</p>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-sm border border-[#e4ebf2] bg-[#f8fbfd] p-4">
                  <p className="text-sm text-[#6b7682]">選択ファイル数</p>
                  <p className="mt-2 text-3xl font-bold text-[#1f2b37]">{queue.length}</p>
                </div>
                <div className="rounded-sm border border-[#f3d5df] bg-[#fff6f8] p-4">
                  <p className="text-sm text-[#8f546b]">現在の状態</p>
                  <p className="mt-2 text-lg font-bold text-[#b63b69]">{activeStatus}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleScan}
                disabled={queue.length === 0 || isRunning || !defaultTab}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[#ea4f82] px-6 py-4 text-base font-bold text-white transition hover:bg-[#da3d72] disabled:cursor-not-allowed disabled:bg-[#f0b6ca]"
              >
                {isRunning ? <CircleEllipsis className="h-5 w-5 animate-pulse" /> : <Play className="h-5 w-5" />}
                {isRunning ? "読み取り中…（数十秒かかる場合があります）" : "読み取って命名する"}
              </button>

              {queue.length > 0 && (
                <div className="rounded-sm border border-[#e7edf3] bg-[#fbfcfe] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-semibold text-[#334154]">今回投入するファイル</p>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-xs font-semibold text-[#8b98a6] hover:text-[#b43a6a]"
                    >
                      すべてクリア
                    </button>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {queue.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-sm border border-[#e7edf3] bg-white px-4 py-2.5"
                      >
                        <p className="min-w-0 truncate text-sm font-medium text-[#24303d]">{item.file.name}</p>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-[#7c8795]">{formatBytes(item.file.size)}</span>
                          <button
                            type="button"
                            onClick={() => removeQueued(item.id)}
                            className="text-[#b9c2cc] hover:text-[#b43a6a]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-sm border border-[#e7edf3] bg-[#fbfcfe] p-4 text-sm text-[#607083]">
                読み取り完了後、下の「③ ファイル名編集」「④ 保存先を選択」が表示されます。
              </div>
            </div>
          </section>
        </div>

        {/* ③ + ④ */}
        <section className="mt-6 overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
          <div className="border-b border-[#ecf0f4] px-6 py-5">
            <h2 className="text-2xl font-bold text-[#1f2b37]">③ ファイル名編集 ／ ④ 保存先を選択</h2>
            <p className="mt-2 text-sm text-[#6a7684]">読み取り結果を確認・修正し、任意の保存先へ直接保存します。</p>
          </div>

          <div className="space-y-5 p-6">
            {rows.length === 0 || !currentUpload ? (
              <div className="rounded-sm border border-dashed border-[#d5dee8] bg-[#fbfcfe] px-5 py-10 text-center text-sm text-[#7c8795]">
                読み取りを実行すると、ここでファイル名と保存先を編集できます。
              </div>
            ) : (
              <>
                {/* ③ ファイル名編集 */}
                <div className="space-y-4 rounded-sm border border-[#e5ebf1] bg-[#fbfcfe] p-4">
                  <div className="flex items-center gap-2">
                    <FilePenLine className="h-4 w-4 text-[#12919b]" />
                    <p className="text-sm font-semibold text-[#334154]">③ 読み取り結果の編集</p>
                  </div>
                  <p className="text-xs text-[#7c8795]">
                    命名規則: 購入日_会社名_金額（拡張子は元ファイルのまま）。日付・会社名・金額を直すとファイル名に反映されます。元ファイル名を押すとプレビューを表示します。
                  </p>

                  {rows.map((row) => (
                    <div key={row.id} className="rounded-sm border border-[#e5ebf1] bg-white p-4">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!row.fileId) return;
                            setPreviewFile({
                              fileId: row.fileId,
                              name: row.originalFileName,
                              mimeType: row.file.type || "application/octet-stream",
                            });
                          }}
                          disabled={!row.fileId}
                          className="min-w-0 truncate text-left text-xs text-[#127780] underline decoration-dotted underline-offset-4 hover:text-[#0e5a63] disabled:cursor-not-allowed disabled:text-[#7c8795] disabled:no-underline"
                          title={row.originalFileName}
                        >
                          元ファイル: {row.originalFileName}
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          {row.documentType && (
                            <span className="rounded-full border border-[#d8e6ef] bg-[#f6fbff] px-2 py-0.5 text-[11px] font-semibold text-[#4c6478]">
                              {row.documentType}
                            </span>
                          )}
                          {/* 重複などで保存対象から外したい領収証を、保存前に一覧から取り除く。 */}
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            title="この書類を保存対象から削除"
                            className="inline-flex items-center gap-1 rounded-sm border border-[#f0cdd9] bg-white px-2 py-1 text-[11px] font-semibold text-[#b43a6a] transition hover:bg-[#fff3f8]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            削除
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7c8795]">
                            購入日 (YYYYMMDD)
                          </span>
                          <div className="flex items-center gap-1.5">
                            <CalendarDays className="h-4 w-4 shrink-0 text-[#9aa7b4]" />
                            <input
                              value={row.date}
                              onChange={(e) => updateRow(row.id, { date: e.target.value })}
                              placeholder="20260401"
                              className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]"
                            />
                          </div>
                        </label>
                        <label className="block">
                          <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#7c8795]">
                            会社名
                            {row.appliedFromMemory && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full border border-[#a7e3e8] bg-[#effcfd] px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-[#0e7078]"
                                title={`AI の読み取り「${row.ocrCompany}」を、前回までに確定した表記へ自動で置き換えました。`}
                              >
                                <Sparkles className="h-3 w-3" />
                                前回の修正を自動反映
                              </span>
                            )}
                          </span>
                          <input
                            value={row.company}
                            onChange={(e) => updateRow(row.id, { company: e.target.value })}
                            placeholder="株式会社○○"
                            className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7c8795]">
                            金額
                          </span>
                          <input
                            value={row.amount}
                            onChange={(e) => updateRow(row.id, { amount: e.target.value })}
                            placeholder="3300"
                            className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]"
                          />
                        </label>
                      </div>

                      <div className="mt-3">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7c8795]">
                          保存ファイル名
                        </span>
                        <code className="block truncate rounded-sm bg-[#eef4f8] px-3 py-2 text-sm font-semibold text-[#1f2b37]">
                          {buildKeiriName(row)}
                        </code>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ④ 保存先を選択 */}
                <div className="space-y-4 rounded-sm border border-[#e5ebf1] bg-white p-4">
                  <div className="flex items-center gap-2">
                    <FolderCheck className="h-4 w-4 text-[#12919b]" />
                    <p className="text-sm font-semibold text-[#334154]">④ 保存先を選択（ダウンロードせず直接保存）</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-sm border border-[#dbe4ec] bg-[#f7f9fb] p-1">
                    <button type="button" onClick={() => setDestinationKind("local")} className={`inline-flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-semibold transition ${destinationKind === "local" ? "bg-white text-[#20303d] shadow-sm" : "text-[#667282] hover:bg-white/70"}`}>
                      <HardDriveDownload className="h-4 w-4" />
                      ローカルフォルダ
                    </button>
                    <button type="button" onClick={() => setDestinationKind("sharepoint")} className={`inline-flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-semibold transition ${destinationKind === "sharepoint" ? "bg-white text-[#20303d] shadow-sm" : "text-[#667282] hover:bg-white/70"}`}>
                      <FolderOpen className="h-4 w-4" />
                      SharePoint
                    </button>
                  </div>

                  {destinationKind === "local" ? (
                    <div className="space-y-3">
                      {!supportsFsAccess && (
                        <div className="rounded-sm border border-[#ecd7ac] bg-[#fff9e9] px-3 py-2 text-sm text-[#8a6732]">
                          このブラウザはフォルダへの直接保存に未対応です。Chrome または Edge をご利用ください。
                        </div>
                      )}
                      <p className="text-sm text-[#607083]">保存先フォルダを一度選ぶと、その中へリネーム済みファイルが直接書き込まれます（ダウンロードのポップアップは出ません）。</p>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button type="button" onClick={handleChooseLocalDir} disabled={!supportsFsAccess} className="inline-flex items-center justify-center gap-2 rounded-sm border border-[#44cfd8] bg-white px-4 py-2 text-sm font-bold text-[#12919b] transition hover:bg-[#f3feff] disabled:cursor-not-allowed disabled:border-[#d0d5db] disabled:text-[#98a2ad]">
                          <FolderOpen className="h-4 w-4" />
                          保存先フォルダを選択
                        </button>
                        <span className="text-sm text-[#607083]">
                          {localDirName ? <>選択中: <span className="font-semibold text-[#1f2b37]">{localDirName}</span></> : "未選択"}
                        </span>
                      </div>
                      <button type="button" onClick={handleSaveToLocal} disabled={!localDirHandle || isSavingLocal} className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[#2f2f31] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1f1f21] disabled:cursor-not-allowed disabled:bg-[#9da4ac]">
                        <Save className="h-4 w-4" />
                        {isSavingLocal ? "保存中" : "このフォルダへ直接保存する"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-[#607083]">SharePoint 上の任意のフォルダを選んで、その場に直接アップロードします。</p>
                      <div className="rounded-sm border border-[#d6efef] bg-[#f7ffff] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5f7d86]">選択中の保存先</p>
                        <p className="mt-2 break-all text-sm font-semibold text-[#234152]">{sharepointFolderPath || "未選択"}</p>
                      </div>
                      <button type="button" onClick={() => void loadFolderBrowser()} disabled={isBrowsingFolders} className="inline-flex items-center justify-center gap-2 rounded-sm border border-[#44cfd8] bg-white px-4 py-2 text-sm font-bold text-[#12919b] transition hover:bg-[#f3feff] disabled:cursor-not-allowed disabled:border-[#d0d5db] disabled:text-[#98a2ad]">
                        <FolderOpen className="h-4 w-4" />
                        {isBrowsingFolders && !folderBrowserPath ? "階層を取得中" : "SharePoint フォルダを開く"}
                      </button>

                      {folderBrowserPath && (
                        <div className="rounded-sm border border-[#dbe4ec] bg-[#fbfcfe] p-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7c8795]">現在の階層</p>
                              <p className="mt-1 break-all text-sm font-semibold text-[#20303d]">{folderBrowserPath}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => void loadFolderBrowser()} disabled={isBrowsingFolders || folderBrowserPath === folderBrowserRootPath} className="inline-flex items-center gap-1 rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-xs font-semibold text-[#5e6c7b] transition hover:border-[#44cfd8] disabled:cursor-not-allowed disabled:bg-[#f3f6f8] disabled:text-[#98a2ad]">
                                <Home className="h-3.5 w-3.5" />
                                ルート
                              </button>
                              <button type="button" onClick={() => folderBrowserParentPath ? void loadFolderBrowser(folderBrowserParentPath) : undefined} disabled={isBrowsingFolders || !folderBrowserParentPath} className="inline-flex items-center gap-1 rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-xs font-semibold text-[#5e6c7b] transition hover:border-[#44cfd8] disabled:cursor-not-allowed disabled:bg-[#f3f6f8] disabled:text-[#98a2ad]">
                                <ChevronLeft className="h-3.5 w-3.5" />
                                上へ
                              </button>
                              <button type="button" onClick={() => setSharepointFolderPath(folderBrowserPath)} className="inline-flex items-center gap-1 rounded-sm border border-[#44cfd8] bg-white px-3 py-2 text-xs font-bold text-[#12919b] transition hover:bg-[#f3feff]">
                                <FolderCheck className="h-3.5 w-3.5" />
                                ここを保存先にする
                              </button>
                            </div>
                          </div>

                          {folderBrowserError && (
                            <div className="mt-3 rounded-sm border border-[#f2bfd2] bg-[#fff3f8] px-3 py-2 text-sm text-[#b43a6a]">
                              {folderBrowserError}
                            </div>
                          )}

                          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto overscroll-contain pr-1">
                            {isBrowsingFolders ? (
                              <div className="rounded-sm border border-[#e7edf3] bg-white px-3 py-4 text-sm text-[#7c8795]">フォルダを取得しています。</div>
                            ) : folderBrowserFolders.length === 0 ? (
                              <div className="rounded-sm border border-[#e7edf3] bg-white px-3 py-4 text-sm text-[#7c8795]">この階層に表示できるフォルダはありません。</div>
                            ) : (
                              folderBrowserFolders.map((folder) => (
                                <div key={folder.id} className="grid gap-2 rounded-sm border border-[#e7edf3] bg-white p-3 lg:grid-cols-[1fr_auto] lg:items-center">
                                  <button type="button" onClick={() => void loadFolderBrowser(folder.path)} className="min-w-0 text-left transition hover:text-[#12919b]">
                                    <span className="flex items-center gap-2 text-sm font-semibold text-[#20303d]">
                                      <FolderOpen className="h-4 w-4 shrink-0 text-[#12919b]" />
                                      <span className="truncate">{folder.name || folderDisplayName(folder.path)}</span>
                                    </span>
                                    <span className="mt-1 block break-all text-xs text-[#7c8795]">{folder.path}</span>
                                  </button>
                                  <button type="button" onClick={() => setSharepointFolderPath(folder.path)} className="rounded-sm border border-[#44cfd8] bg-white px-3 py-2 text-xs font-bold text-[#12919b] transition hover:bg-[#f3feff]">
                                    保存先にする
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      <button type="button" onClick={handleSaveToSharePoint} disabled={!sharepointFolderPath.trim() || isSavingSharepoint} className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[#2f2f31] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1f1f21] disabled:cursor-not-allowed disabled:bg-[#9da4ac]">
                        <Send className="h-4 w-4" />
                        {isSavingSharepoint ? "アップロード中" : "この SharePoint フォルダへ保存する"}
                      </button>

                      {currentUpload.sharepointWebUrl && (
                        <div className="flex justify-end">
                          <a href={currentUpload.sharepointWebUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[#0078d4] hover:underline">
                            保存先を開く
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {previewFile && currentUpload && (
        <FloatingPreview
          previewPath={`/uploads/${currentUpload.id}/files/${previewFile.fileId}/preview`}
          name={previewFile.name}
          mimeType={previewFile.mimeType}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
