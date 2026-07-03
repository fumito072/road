"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  Download,
  ExternalLink,
  FolderCheck,
  FolderOpen,
  HardDriveDownload,
  Home,
  Play,
  Receipt,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Upload,
} from "lucide-react";

import { apiFetch } from "@/lib/api";
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
  date: string;
  company: string;
  amount: string;
  documentType: string;
};

type DestinationKind = "local" | "sharepoint";

const ACCEPTED = ["pdf", "png", "jpg", "jpeg", "tif", "tiff"];

function isAccepted(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED.includes(ext);
}

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

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
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
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [defaultTab, setDefaultTab] = useState<Tab | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const [queue, setQueue] = useState<{ id: string; file: File }[]>([]);
  const [rows, setRows] = useState<KeiriRow[]>([]);
  const [currentUpload, setCurrentUpload] = useState<UploadRecord | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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

  const addFiles = useCallback((files: File[]) => {
    const accepted = files.filter((f) => isAccepted(f.name));
    const rejected = files.length - accepted.length;
    if (accepted.length === 0) {
      if (rejected > 0) setError("対応形式は PDF / PNG / JPG / JPEG / TIFF です。");
      return;
    }
    setError(rejected > 0 ? `${rejected} 件は対応形式外のため除外しました。` : null);
    setQueue((current) => [
      ...current,
      ...accepted.map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${current.length + index}`,
        file,
      })),
    ]);
  }, []);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const handleScan = async () => {
    if (!defaultTab || queue.length === 0 || isRunning) return;
    setIsRunning(true);
    setError(null);
    setInfo(null);
    try {
      // ① uploads にファイルを保存（SharePoint 保存に必要）＋ ② 経理OCRで抽出。
      const intakeForm = new FormData();
      intakeForm.append("tabId", defaultTab.id);
      intakeForm.append("folderName", buildFolderName("経理OCR"));
      queue.forEach((item) => intakeForm.append("files", item.file));

      const scanForm = new FormData();
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
          date: s?.date ?? "",
          company: s?.company ?? "",
          amount: s?.amount ?? "",
          documentType: s?.documentType ?? "",
        };
      });

      setCurrentUpload(createdUpload);
      setRows(nextRows);
      setQueue([]);
      setInfo("読み取りが完了しました。日付・会社名・金額を確認し、保存先を選んでください。");
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
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeQueued = (id: string) => setQueue((c) => c.filter((x) => x.id !== id));

  const handleReset = () => {
    setQueue([]);
    setRows([]);
    setCurrentUpload(null);
    setError(null);
    setInfo(null);
  };

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
      setInfo(`ローカルフォルダ「${localDirName}」へ ${saved} 件を直接保存しました。`);
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

      setCurrentUpload(saved);
      setInfo("SharePoint への保存が完了しました。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "SharePoint 保存に失敗しました。");
    } finally {
      setIsSavingSharepoint(false);
    }
  };

  const handleDownloadRow = (row: KeiriRow) => {
    const url = URL.createObjectURL(row.file);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildKeiriName(row);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#222b38]">
      <header className="border-b border-black/10 bg-[#2f2f31] text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">経理OCR</h1>
            <p className="mt-2 text-sm text-white/70">
              領収書・請求書を読み取り、「購入日_会社名_金額」で命名して保存先（ローカル / SharePoint）へ直接保存します。
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
          {/* ① アップロード */}
          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">① 領収書・請求書を追加</h2>
              <p className="mt-2 text-sm text-[#6a7684]">
                フォルダ／ファイルを選ぶか、ここへドラッグ&ドロップしてください。
              </p>
            </div>
            <div className="p-6">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex min-h-[200px] w-full flex-col items-center justify-center rounded-sm border-2 border-dashed px-6 py-8 text-center transition ${
                  isDragging
                    ? "border-[#40d4db] bg-[#e3fbff]"
                    : "border-[#7ddde0] bg-[linear-gradient(180deg,#fafdff_0%,#eefbff_100%)]"
                }`}
              >
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#69dce2]/20 text-[#44cfd8]">
                  <Upload className="h-8 w-8" />
                </span>
                <p className="mt-4 text-lg font-bold text-[#1f2b37]">
                  {isDragging ? "ここにドロップ" : "ドラッグ&ドロップ"}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="rounded-full bg-[#40d4db] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#35c7ce]"
                  >
                    フォルダを選択
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full border border-[#40d4db] bg-white px-5 py-2 text-sm font-semibold text-[#12919b] shadow-sm transition hover:bg-[#f3feff]"
                  >
                    ファイルを選択
                  </button>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.22em] text-[#8b98a6]">
                  PDF / PNG / JPG / JPEG / TIFF
                </p>
              </div>

              <input
                ref={folderInputRef}
                type="file"
                multiple
                // @ts-expect-error webkitdirectory は標準型に未定義
                webkitdirectory=""
                directory=""
                className="hidden"
                onChange={handleInputChange}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.tif,.tiff"
                className="hidden"
                onChange={handleInputChange}
              />

              {queue.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#3a4756]">追加済み {queue.length} 件</p>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-xs font-semibold text-[#8b98a6] hover:text-[#b43a6a]"
                    >
                      すべてクリア
                    </button>
                  </div>
                  <ul className="max-h-44 space-y-1 overflow-auto rounded-sm border border-[#e7edf3] bg-[#fbfcfe] p-2">
                    {queue.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                        <span className="min-w-0 truncate text-[#34404d]">{item.file.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-[#8b98a6]">{formatBytes(item.file.size)}</span>
                          <button type="button" onClick={() => removeQueued(item.id)} className="text-[#b9c2cc] hover:text-[#b43a6a]">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={handleScan}
                disabled={queue.length === 0 || isRunning || !defaultTab}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[#ea4f82] px-6 py-4 text-base font-bold text-white transition hover:bg-[#da3d72] disabled:cursor-not-allowed disabled:bg-[#f0b6ca]"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    読み取り中…（数十秒かかる場合があります）
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5" />
                    読み取って命名する
                  </>
                )}
              </button>

              <div className="mt-4 rounded-sm border border-[#e7edf3] bg-[#fbfcfe] p-4 text-sm text-[#607083]">
                読み取り後、右側で日付・会社名・金額を確認し、下の「④ 保存先を選択」でローカルまたは SharePoint に保存できます。
              </div>
            </div>
          </section>

          {/* ② 結果（確認・編集） */}
          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">② 読み取り結果を確認</h2>
              <p className="mt-2 text-sm text-[#6a7684]">日付・会社名・金額を直すとファイル名に反映されます。</p>
            </div>

            <div className="p-6">
              {rows.length === 0 ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center rounded-sm border border-dashed border-[#d5dee8] bg-[#fbfcfe] text-center text-sm text-[#7c8795]">
                  <Receipt className="mb-3 h-8 w-8 text-[#bcc7d2]" />
                  読み取ると、ここに結果（ファイル名候補）が表示されます。
                </div>
              ) : (
                <ul className="space-y-3">
                  {rows.map((row) => (
                    <li key={row.id} className="rounded-sm border border-[#e7edf3] bg-[#fbfcfe] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs text-[#8b98a6]" title={row.originalFileName}>
                          元: {row.originalFileName}
                        </span>
                        {row.documentType && (
                          <span className="shrink-0 rounded-full border border-[#d8e6ef] bg-[#f6fbff] px-2 py-0.5 text-[11px] font-semibold text-[#4c6478]">
                            {row.documentType}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <label className="block">
                          <span className="text-[11px] text-[#7c8795]">購入日 (YYYYMMDD)</span>
                          <input
                            value={row.date}
                            onChange={(e) => updateRow(row.id, { date: e.target.value })}
                            placeholder="20260401"
                            className="mt-0.5 w-full rounded-sm border border-[#dbe4ec] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#44cfd8]"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-[#7c8795]">会社名</span>
                          <input
                            value={row.company}
                            onChange={(e) => updateRow(row.id, { company: e.target.value })}
                            placeholder="株式会社○○"
                            className="mt-0.5 w-full rounded-sm border border-[#dbe4ec] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#44cfd8]"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-[#7c8795]">金額</span>
                          <input
                            value={row.amount}
                            onChange={(e) => updateRow(row.id, { amount: e.target.value })}
                            placeholder="3300"
                            className="mt-0.5 w-full rounded-sm border border-[#dbe4ec] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#44cfd8]"
                          />
                        </label>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <code className="min-w-0 truncate rounded-sm bg-[#eef4f8] px-2 py-1 text-sm font-semibold text-[#1f2b37]">
                          {buildKeiriName(row)}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleDownloadRow(row)}
                          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#12919b] hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          DL
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* ④ 保存先を選択 */}
        <section className="mt-6 overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
          <div className="border-b border-[#ecf0f4] px-6 py-5">
            <h2 className="text-2xl font-bold text-[#1f2b37]">④ 保存先を選択</h2>
            <p className="mt-2 text-sm text-[#6a7684]">命名済みファイルを、ローカルフォルダまたは SharePoint へ直接保存します。</p>
          </div>

          <div className="space-y-5 p-6">
            {rows.length === 0 || !currentUpload ? (
              <div className="rounded-sm border border-dashed border-[#d5dee8] bg-[#fbfcfe] px-5 py-10 text-center text-sm text-[#7c8795]">
                読み取りを実行すると、ここで保存先を選べます。
              </div>
            ) : (
              <div className="space-y-4 rounded-sm border border-[#e5ebf1] bg-white p-4">
                <div className="flex items-center gap-2">
                  <FolderCheck className="h-4 w-4 text-[#12919b]" />
                  <p className="text-sm font-semibold text-[#334154]">保存先を選択（ダウンロードせず直接保存）</p>
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
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
