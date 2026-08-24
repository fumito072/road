"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import { acceptedFormats } from "@/data/ocr";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { FloatingPreview } from "@/components/common/floating-preview";
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

type QueueStatus = "ready" | "processing" | "completed";

type QueueFile = {
  id: string;
  file: File;
  name: string;
  sizeLabel: string;
  relativePath: string;
  status: QueueStatus;
};

type EditableFileResult = {
  originalFileName: string;
  documentType: string;
  documentDate: string;
  outputFileName: string;
  confidence: number;
  reason: string;
};

type DestinationKind = "local" | "sharepoint";

type LocalSaveNotice = {
  status: "success" | "error";
  message: string;
};

const statusLabel: Record<QueueStatus, string> = {
  ready: "待機中",
  processing: "実行中",
  completed: "完了",
};

const queueStatusClassName: Record<QueueStatus, string> = {
  ready: "bg-[#f6fbff] text-[#4c6478] border-[#d8e6ef]",
  processing: "bg-[#fff3f8] text-[#b43a6a] border-[#f2bfd2]",
  completed: "bg-[#eefdfa] text-[#1e8f88] border-[#bfece6]",
};

const uploadStatusLabel: Record<UploadRecord["status"], string> = {
  PENDING: "受付済み",
  OCR_PROCESSING: "OCR実行中",
  OCR_DONE: "OCR完了",
  CONFIRMED: "確認済み",
  UPLOADING_SHAREPOINT: "SharePoint保存中",
  COMPLETED: "保存完了",
  ERROR: "エラー",
};

const ACCEPTED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "tif", "tiff"];

function isAcceptedFile(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function buildFolderName(prefix: string) {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  return `${prefix}-${timestamp}`;
}

function topFolderName(relativePath: string) {
  if (relativePath.includes("/")) {
    return relativePath.split("/")[0];
  }
  return "";
}

function buildEditableFileResults(upload: UploadRecord): EditableFileResult[] {
  const fileResults = upload.ocrStructuredResult?.fileResults ?? [];
  const byOriginalName = new Map(fileResults.map((item) => [item.originalFileName, item]));

  return upload.files.map((file) => {
    const current = byOriginalName.get(file.originalFileName);

    return {
      originalFileName: file.originalFileName,
      documentType: current?.documentType ?? "",
      documentDate: current?.documentDate ?? "",
      outputFileName: current?.outputFileName ?? file.originalFileName,
      confidence: current?.confidence ?? upload.ocrConfidence ?? 0,
      reason: current?.reason ?? "",
    };
  });
}

// 社名内に _ を入れない方針のため、使用不可文字はスペースに置き換える（区切りの _ は join 側で付与）
function sanitizeFileSegment(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, " ");
}

function normalizeYyyymmdd(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length === 8 ? digits : value.trim();
}

function appendPdfExtension(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
}

function stripPdfExtension(value: string) {
  return value.replace(/\.pdf$/i, "");
}

function buildOutputFileName(date: string, customer: string, documentType: string) {
  // 命名規則: 日付_社名_書類種別.pdf（区切りは _、社名内のスペースはそのまま保持）
  const safe = [normalizeYyyymmdd(date), customer, documentType || "書類"]
    .map(sanitizeFileSegment)
    .filter(Boolean)
    .join("_");

  return safe ? `${safe}.pdf` : "";
}

function normalizeFolderPath(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function folderDisplayName(path: string) {
  const segments = normalizeFolderPath(path).split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

const OCR_POLL_INTERVAL_MS = 3000;
const OCR_POLL_MAX_ATTEMPTS = 80;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFriendlyOcrRunError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("Gemini API") ||
    message.includes("利用上限") ||
    message.includes("混雑") ||
    message.includes("OCR処理が完了できません") ||
    message.includes("OCR処理に時間がかかっています")
  ) {
    return message;
  }

  return "OCR処理を開始または確認できませんでした。少し時間を置いて、もう一度お試しください。";
}

// ドラッグ&ドロップ: フォルダの中身まで再帰的にたどってファイルを集める。
type DroppedFile = { file: File; relativePath: string };

function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

async function readEntry(entry: FileSystemEntry, basePath: string): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
    return [{ file, relativePath: `${basePath}${entry.name}` }];
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const entries = await readAllDirectoryEntries(dirEntry.createReader());
    const nested = await Promise.all(
      entries.map((child) => readEntry(child, `${basePath}${entry.name}/`)),
    );
    return nested.flat();
  }

  return [];
}

async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const items = Array.from(dataTransfer.items ?? []).filter((item) => item.kind === "file");
  const entries = items
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (entries.length > 0) {
    const results = await Promise.all(entries.map((entry) => readEntry(entry, "")));
    return results.flat();
  }

  // フォルダ非対応の場合はファイルのみフォールバック
  return Array.from(dataTransfer.files ?? []).map((file) => ({
    file,
    relativePath: file.name,
  }));
}

export function OcrUploadWorkbench() {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [defaultTab, setDefaultTab] = useState<Tab | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const [queue, setQueue] = useState<QueueFile[]>([]);
  const [selectedFolderName, setSelectedFolderName] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const [currentUpload, setCurrentUpload] = useState<UploadRecord | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isApplyingFileNames, setIsApplyingFileNames] = useState(false);
  const [isSavingSharepoint, setIsSavingSharepoint] = useState(false);
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [lastRunLabel, setLastRunLabel] = useState("未実行");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // ③ ファイル名編集
  const [fileCustomerName, setFileCustomerName] = useState("");
  const [fileDate, setFileDate] = useState("");
  const [editableFileResults, setEditableFileResults] = useState<EditableFileResult[]>([]);

  // ④ 保存先
  const [destinationKind, setDestinationKind] = useState<DestinationKind>("local");

  // ④-A ローカル（File System Access API）
  const [localDirHandle, setLocalDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [localDirName, setLocalDirName] = useState("");
  const [localSaveNotice, setLocalSaveNotice] = useState<LocalSaveNotice | null>(null);

  // ④-B SharePoint フォルダ選択
  const [sharepointFolderPath, setSharepointFolderPath] = useState("");
  const [folderBrowserPath, setFolderBrowserPath] = useState("");
  const [folderBrowserParentPath, setFolderBrowserParentPath] = useState<string | null>(null);
  const [folderBrowserFolders, setFolderBrowserFolders] = useState<SharepointFolderOption[]>([]);
  const [folderBrowserRootPath, setFolderBrowserRootPath] = useState("");
  const [isBrowsingFolders, setIsBrowsingFolders] = useState(false);
  const [folderBrowserError, setFolderBrowserError] = useState<string | null>(null);

  const [previewFile, setPreviewFile] = useState<{ uploadId: string; fileId: string; name: string; mimeType: string } | null>(null);

  // 学習用。ocrCustomerName は AI が読んだ生の社名で、社名欄を編集しても書き換えない。
  const [ocrCustomerName, setOcrCustomerName] = useState("");
  const [customerNameFromMemory, setCustomerNameFromMemory] = useState(false);

  const supportsFsAccess = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

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

  const hydrateEditableState = useCallback((upload: UploadRecord) => {
    const structured = upload.ocrStructuredResult ?? {};
    const fileResults = buildEditableFileResults(upload);
    const firstDocumentDate = fileResults.find((file) => file.documentDate)?.documentDate ?? "";
    setFileDate(structured.fileDate ?? firstDocumentDate);
    setFileCustomerName(structured.fileCustomerName ?? structured.customerName ?? upload.customerName ?? "");
    // customerName は OCR の生の読み取り値（保存先解決にも使う値）。学習のキーになるので別に持つ。
    setOcrCustomerName(structured.customerName ?? upload.customerName ?? "");
    setCustomerNameFromMemory(structured.customerNameAppliedFromMemory === true);
    setEditableFileResults(fileResults);
  }, []);

  const waitForOcrCompletion = useCallback(
    async (uploadId: string) => {
      for (let attempt = 0; attempt < OCR_POLL_MAX_ATTEMPTS; attempt += 1) {
        await wait(OCR_POLL_INTERVAL_MS);

        const latest = await apiFetch<UploadRecord>(`/uploads/${uploadId}`);
        setCurrentUpload(latest);
        hydrateEditableState(latest);

        if (
          latest.status === "OCR_DONE" ||
          latest.status === "CONFIRMED" ||
          latest.status === "UPLOADING_SHAREPOINT" ||
          latest.status === "COMPLETED"
        ) {
          return latest;
        }

        if (latest.status === "ERROR") {
          throw new Error("OCR処理が完了できませんでした。ファイルを確認して再実行してください。");
        }
      }

      throw new Error("OCR処理に時間がかかっています。少し時間を置いてもう一度お試しください。");
    },
    [hydrateEditableState],
  );

  const addFilesToQueue = useCallback((incoming: DroppedFile[]) => {
    const accepted = incoming.filter((item) => isAcceptedFile(item.file.name));
    const rejectedCount = incoming.length - accepted.length;

    if (accepted.length === 0) {
      if (rejectedCount > 0) {
        setErrorMessage("対応していない形式のファイルです（PDF / PNG / JPG / JPEG / TIFF のみ）。");
      }
      return;
    }

    setQueue((current) => {
      const folderName = accepted.map((item) => topFolderName(item.relativePath)).find(Boolean) ?? "";
      if (current.length === 0 || folderName) {
        setSelectedFolderName(folderName);
      }

      const nextFiles = accepted.map((item, index) => ({
        id: `${item.file.name}-${item.file.lastModified}-${current.length + index}`,
        file: item.file,
        name: item.file.name,
        sizeLabel: formatBytes(item.file.size),
        relativePath: item.relativePath,
        status: "ready" as const,
      }));

      return [...current, ...nextFiles];
    });

    setErrorMessage(rejectedCount > 0 ? `${rejectedCount} 件は対応形式外のため除外しました。` : null);
  }, []);

  const handleOpenFolderPicker = () => folderInputRef.current?.click();
  const handleOpenFilePicker = () => fileInputRef.current?.click();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    addFilesToQueue(
      files.map((file) => ({
        file,
        relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      })),
    );
    event.target.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    try {
      const dropped = await extractFilesFromDataTransfer(event.dataTransfer);
      if (dropped.length === 0) {
        return;
      }
      addFilesToQueue(dropped);
    } catch {
      setErrorMessage("ドラッグ&ドロップしたファイルの読み込みに失敗しました。ボタンから選択してください。");
    }
  };

  const handleRemove = (id: string) => {
    setQueue((current) => current.filter((file) => file.id !== id));
  };

  const handleRun = async () => {
    if (!defaultTab || queue.length === 0 || isRunning) {
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);
    setInfoMessage(null);
    setLocalSaveNotice(null);
    setQueue((current) => current.map((file) => ({ ...file, status: "processing" })));

    try {
      const formData = new FormData();
      formData.append("tabId", defaultTab.id);
      formData.append("folderName", selectedFolderName || buildFolderName("AI OCR"));
      queue.forEach((file) => formData.append("files", file.file));

      const createdUpload = await apiFetch<UploadRecord>("/uploads/intake", {
        method: "POST",
        body: formData,
      });

      const ocrUpload = await apiFetch<UploadRecord>(`/uploads/${createdUpload.id}/ocr`, {
        method: "POST",
      });

      setCurrentUpload(ocrUpload);
      hydrateEditableState(ocrUpload);
      setInfoMessage("OCR処理を開始しました。完了まで状態を更新します。");

      const completedUpload = await waitForOcrCompletion(ocrUpload.id);

      setCurrentUpload(completedUpload);
      hydrateEditableState(completedUpload);
      setQueue((current) => current.map((file) => ({ ...file, status: "completed" })));
      await wait(400);
      setQueue([]);
      setSelectedFolderName("");
      setLastRunLabel(new Date().toLocaleString("ja-JP", { hour12: false }));
      setInfoMessage("OCRが完了しました。ファイル名を整えてから保存先を選んでください。");
    } catch (error) {
      setQueue((current) => current.map((file) => ({ ...file, status: "ready" })));
      setErrorMessage(toFriendlyOcrRunError(error));
    } finally {
      setIsRunning(false);
    }
  };

  /**
   * 「ファイル名へ反映」が押された時に会社名の修正を記録する。
   * ocrValue には必ず「AI が読んだ生の社名」を渡すこと（自動反映後の値ではない）。
   * 適用後の値をキーにすると別エントリが増えるだけで、元の誤読が直らない。
   */
  const recordNamingMemory = useCallback(async (): Promise<number> => {
    if (!defaultTab) return 0;

    // 自動反映されたまま手を加えていない場合は、既に辞書にある内容なので送らない。
    if (customerNameFromMemory) return 0;

    const ocrValue = ocrCustomerName.trim();
    const confirmedValue = fileCustomerName.trim();
    if (!ocrValue || !confirmedValue || ocrValue === confirmedValue) return 0;

    const result = await apiFetch<{ learned: number }>("/naming-memory/record", {
      method: "POST",
      body: JSON.stringify({ tabId: defaultTab.id, entries: [{ ocrValue, confirmedValue }] }),
    });
    return result.learned ?? 0;
  }, [defaultTab, customerNameFromMemory, ocrCustomerName, fileCustomerName]);

  const handleApplyFileNameTemplate = async () => {
    if (!currentUpload || isApplyingFileNames) return;

    const appliedFileResults = editableFileResults.map((file) => ({
      ...file,
      documentDate: fileDate,
      outputFileName: buildOutputFileName(fileDate, fileCustomerName, file.documentType),
    }));
    setEditableFileResults(appliedFileResults);
    setIsApplyingFileNames(true);
    setErrorMessage(null);
    setInfoMessage(null);

    let fileNamesSaved = false;
    try {
      const savedUpload = await apiFetch<UploadRecord>(`/uploads/${currentUpload.id}/file-names`, {
        method: "POST",
        body: JSON.stringify({
          fileCustomerName,
          fileDate,
          fileResults: appliedFileResults,
        }),
      });
      fileNamesSaved = true;
      setCurrentUpload(savedUpload);

      const learned = await recordNamingMemory();
      setInfoMessage(
        learned > 0
          ? "ファイル名と社名の修正を保存しました。次回から社名を自動で反映します。"
          : "社名と日付を全ファイルのファイル名へ反映し、保存しました。個別に直すこともできます。",
      );
    } catch {
      setErrorMessage(
        fileNamesSaved
          ? "ファイル名は保存しましたが、社名の修正履歴を保存できませんでした。もう一度お試しください。"
          : "ファイル名を画面へ反映しましたが、保存できませんでした。もう一度お試しください。",
      );
    } finally {
      setIsApplyingFileNames(false);
    }
  };

  const handleUseOcrDate = () => {
    const nextDate = editableFileResults.find((file) => file.documentDate)?.documentDate ?? "";
    if (nextDate) {
      setFileDate(nextDate);
    }
  };

  // ④-B SharePoint フォルダ閲覧
  const loadFolderBrowser = useCallback(
    async (path?: string) => {
      if (!currentUpload) {
        return;
      }

      setIsBrowsingFolders(true);
      setFolderBrowserError(null);

      try {
        const normalizedPath = normalizeFolderPath(path ?? "");
        const query = normalizedPath ? `?path=${encodeURIComponent(normalizedPath)}` : "";
        const data = await apiFetch<SharepointFolderBrowserResult>(`/uploads/${currentUpload.id}/folders${query}`);
        setFolderBrowserRootPath(data.rootPath);
        setFolderBrowserPath(data.currentPath);
        setFolderBrowserParentPath(data.parentPath);
        setFolderBrowserFolders(data.folders);
      } catch (error) {
        setFolderBrowserError(error instanceof Error ? error.message : "SharePoint フォルダ階層の取得に失敗しました。");
      } finally {
        setIsBrowsingFolders(false);
      }
    },
    [currentUpload],
  );

  const handleSaveToSharePoint = async () => {
    if (!currentUpload) {
      return;
    }

    if (!sharepointFolderPath.trim()) {
      setErrorMessage("SharePoint の保存先フォルダを選択してください。");
      return;
    }

    setIsSavingSharepoint(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const structured: UploadStructuredResult = {
        ...(currentUpload.ocrStructuredResult ?? {}),
        fileCustomerName,
        fileDate,
        sharepointFolderPath: sharepointFolderPath.trim(),
        fileResults: editableFileResults as UploadFileResult[],
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
      hydrateEditableState(saved);
      setInfoMessage("SharePoint への保存が完了しました。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "SharePoint 保存に失敗しました。");
    } finally {
      setIsSavingSharepoint(false);
    }
  };

  // ④-A ローカルフォルダへ直接保存
  const handleChooseLocalDir = async () => {
    if (!supportsFsAccess || !window.showDirectoryPicker) {
      setErrorMessage("このブラウザはフォルダへの直接保存に未対応です。Chrome または Edge をご利用ください。");
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      setLocalDirHandle(handle);
      setLocalDirName(handle.name);
      setErrorMessage(null);
      setLocalSaveNotice(null);
    } catch {
      // ユーザーがキャンセルした場合は何もしない
    }
  };

  const handleSaveToLocal = async () => {
    if (!currentUpload) {
      return;
    }

    if (!localDirHandle) {
      setErrorMessage("先に保存先フォルダを選択してください。");
      return;
    }

    setIsSavingLocal(true);
    setErrorMessage(null);
    setInfoMessage(null);
    setLocalSaveNotice(null);

    try {
      let saved = 0;
      for (const result of editableFileResults) {
        const sourceFile = currentUpload.files.find((item) => item.originalFileName === result.originalFileName);
        if (!sourceFile) {
          continue;
        }

        const blob = await apiFetchBlob(`/uploads/${currentUpload.id}/files/${sourceFile.id}/preview`);
        const saveName = result.outputFileName.trim() || sourceFile.originalFileName;
        const fileHandle = await localDirHandle.getFileHandle(saveName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        saved += 1;
      }

      const message = `ローカルフォルダ「${localDirName}」へ ${saved} 件を直接保存しました。`;
      setInfoMessage(message);
      setLocalSaveNotice({ status: "success", message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ローカル保存に失敗しました。フォルダの権限を確認してください。";
      setErrorMessage(message);
      setLocalSaveNotice({ status: "error", message });
    } finally {
      setIsSavingLocal(false);
    }
  };

  const activeUploadStatus = currentUpload ? uploadStatusLabel[currentUpload.status] : "未選択";

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#222b38]">
      <header className="border-b border-black/10 bg-[#2f2f31] text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AI OCR ファイル命名ツール</h1>
            <p className="mt-2 text-sm text-white/70">アップロード → OCR → ファイル名編集 → 任意の保存先へ直接保存。</p>
          </div>
          <div className="rounded-md bg-white/10 px-3 py-2 text-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">最終実行</p>
            <p className="mt-1 font-semibold">{lastRunLabel}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
        <div className="grid gap-3">
          {bootError && (
            <div className="flex items-start gap-3 rounded-sm border border-[#f2bfd2] bg-[#fff3f8] px-4 py-3 text-sm text-[#b43a6a]">
              <CircleAlert className="mt-0.5 h-4 w-4" />
              <span>{bootError}</span>
            </div>
          )}
          {errorMessage && (
            <div className="flex items-start gap-3 rounded-sm border border-[#f2bfd2] bg-[#fff3f8] px-4 py-3 text-sm text-[#b43a6a]">
              <CircleAlert className="mt-0.5 h-4 w-4" />
              <span>{errorMessage}</span>
            </div>
          )}
          {infoMessage && (
            <div className="flex items-start gap-3 rounded-sm border border-[#bfece6] bg-[#eefdfa] px-4 py-3 text-sm text-[#1e8f88]">
              <CheckCircle2 className="mt-0.5 h-4 w-4" />
              <span>{infoMessage}</span>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-6 xl:grid-cols-2">
          {/* ① ファイルアップロード */}
          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">① ファイルアップロード</h2>
              <p className="mt-2 text-sm text-[#6a7684]">フォルダ／ファイルを選ぶか、ここへドラッグ&ドロップしてください。</p>
            </div>

            <div className="p-6">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex min-h-[280px] w-full flex-col items-center justify-center rounded-sm border-2 border-dashed px-6 py-10 text-center transition ${
                  isDragging
                    ? "border-[#40d4db] bg-[#e3fbff]"
                    : "border-[#7ddde0] bg-[linear-gradient(180deg,#fafdff_0%,#eefbff_100%)]"
                }`}
              >
                <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#69dce2]/20 text-[#44cfd8]">
                  <Upload className="h-9 w-9" />
                </span>
                <p className="mt-5 text-xl font-bold text-[#1f2b37]">
                  {isDragging ? "ここにドロップして読み込み" : "フォルダまたはファイルをドラッグ&ドロップ"}
                </p>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#6c7782]">
                  デスクトップからフォルダごと、または PDF などのファイルを直接ドロップできます。ボタンからの選択も可能です。
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button type="button" onClick={handleOpenFolderPicker} className="rounded-full bg-[#40d4db] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#35c7ce]">フォルダを選択</button>
                  <button type="button" onClick={handleOpenFilePicker} className="rounded-full border border-[#40d4db] bg-white px-5 py-2 text-sm font-semibold text-[#12919b] shadow-sm transition hover:bg-[#f3feff]">ファイルを選択</button>
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.22em] text-[#8b98a6]">{acceptedFormats.join(" / ")}</p>
              </div>
              <input
                ref={folderInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                className="hidden"
                onChange={handleFileChange}
                {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="mt-4 rounded-sm border border-[#e8edf3] bg-[#fbfcfe] p-4">
                <p className="text-sm font-semibold text-[#445063]">対応フォーマット</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {acceptedFormats.map((format) => (
                    <span key={format} className="rounded-full border border-[#d5dee8] bg-white px-3 py-1 text-xs font-semibold text-[#607083]">{format}</span>
                  ))}
                </div>
                {selectedFolderName ? (
                  <p className="mt-3 text-sm text-[#607083]">選択フォルダ: <span className="font-semibold text-[#1f2b37]">{selectedFolderName}</span></p>
                ) : null}
              </div>
            </div>
          </section>

          {/* ② OCR実行 */}
          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">② OCR実行</h2>
              <p className="mt-2 text-sm text-[#6a7684]">投入したファイルから OCR を実行し、ファイル名の候補を作ります。</p>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-sm border border-[#e4ebf2] bg-[#f8fbfd] p-4">
                  <p className="text-sm text-[#6b7682]">選択ファイル数</p>
                  <p className="mt-2 text-3xl font-bold text-[#1f2b37]">{queue.length}</p>
                </div>
                <div className="rounded-sm border border-[#f3d5df] bg-[#fff6f8] p-4">
                  <p className="text-sm text-[#8f546b]">現在の状態</p>
                  <p className="mt-2 text-lg font-bold text-[#b63b69]">{activeUploadStatus}</p>
                </div>
              </div>

              <button type="button" onClick={handleRun} disabled={queue.length === 0 || isRunning || !defaultTab} className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[#ea4f82] px-6 py-4 text-base font-bold text-white transition hover:bg-[#da3d72] disabled:cursor-not-allowed disabled:bg-[#f0b6ca]">
                {isRunning ? <CircleEllipsis className="h-5 w-5 animate-pulse" /> : <Play className="h-5 w-5" />}
                {isRunning ? "OCRを実行中" : "OCRを実行する"}
              </button>

              {queue.length > 0 && (
                <div className="rounded-sm border border-[#e7edf3] bg-[#fbfcfe] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-semibold text-[#334154]">今回投入するファイル</p>
                    <span className="text-xs text-[#7c8795]">{queue.length} 件</span>
                  </div>
                  <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                    {queue.map((file) => (
                      <div key={file.id} className="flex items-center justify-between gap-3 rounded-sm border border-[#e7edf3] bg-white px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#24303d]">{file.name}</p>
                          <p className="truncate text-xs text-[#7c8795]">{file.relativePath} ・ {file.sizeLabel}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${queueStatusClassName[file.status]}`}>{statusLabel[file.status]}</span>
                          <button type="button" onClick={() => handleRemove(file.id)} className="inline-flex items-center gap-1 rounded-full border border-[#e1e6ed] px-3 py-2 text-sm text-[#667282] transition hover:border-[#d25d84] hover:text-[#c64974]">
                            <Trash2 className="h-4 w-4" />
                            削除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-sm border border-[#e7edf3] bg-[#fbfcfe] p-4 text-sm text-[#607083]">
                OCR完了後、下の「③ ファイル名編集」「④ 保存先を選択」が表示されます。
              </div>
            </div>
          </section>
        </div>

        {/* ③ + ④ */}
        <section className="mt-6 overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
          <div className="border-b border-[#ecf0f4] px-6 py-5">
            <h2 className="text-2xl font-bold text-[#1f2b37]">③ ファイル名編集 ／ ④ 保存先を選択</h2>
            <p className="mt-2 text-sm text-[#6a7684]">OCR 結果を確認・修正し、任意の保存先へ直接保存します。</p>
          </div>

          <div className="space-y-5 p-6">
            {!currentUpload ? (
              <div className="rounded-sm border border-dashed border-[#d5dee8] bg-[#fbfcfe] px-5 py-10 text-center text-sm text-[#7c8795]">
                OCR を実行すると、ここでファイル名と保存先を編集できます。
              </div>
            ) : (
              <>
                {/* ③ ファイル名編集 */}
                <div className="space-y-4 rounded-sm border border-[#e5ebf1] bg-[#fbfcfe] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <FilePenLine className="h-4 w-4 text-[#12919b]" />
                        <p className="text-sm font-semibold text-[#334154]">③ アップロードファイル名の編集</p>
                      </div>
                      <p className="mt-1 text-xs text-[#7c8795]">命名規則: 日付_社名_書類種別.pdf（社名内のスペースは保持）。入力後に「ファイル名へ反映」を押すと、社名の修正も保存されます。</p>
                    </div>
                    <button type="button" onClick={() => void handleApplyFileNameTemplate()} disabled={isApplyingFileNames} className="inline-flex items-center justify-center gap-2 rounded-sm border border-[#44cfd8] bg-white px-4 py-2 text-sm font-bold text-[#12919b] transition hover:bg-[#f3feff] disabled:cursor-not-allowed disabled:border-[#d0d5db] disabled:text-[#98a2ad]">
                      <RefreshCw className="h-4 w-4" />
                      {isApplyingFileNames ? "反映・保存中" : "ファイル名へ反映"}
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_0.75fr_auto]">
                    <div>
                      <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-[#445063]">
                        ファイル名に使う社名
                        {customerNameFromMemory && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-[#a7e3e8] bg-[#effcfd] px-2 py-0.5 text-[10px] font-bold text-[#0e7078]"
                            title={`AI の読み取り「${ocrCustomerName}」を、前回までに確定した表記へ自動で置き換えました。`}
                          >
                            <Sparkles className="h-3 w-3" />
                            前回の修正を自動反映
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={fileCustomerName}
                        onChange={(event) => {
                          setFileCustomerName(event.target.value);
                          // 手で直したら以降はユーザー自身の値。バッジを外し、保存時に学習させる。
                          setCustomerNameFromMemory(false);
                        }}
                        className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[#445063]">日付</label>
                      <input type="text" value={fileDate} onChange={(event) => setFileDate(event.target.value)} placeholder="YYYYMMDD" className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]" />
                    </div>
                    <button type="button" onClick={handleUseOcrDate} className="inline-flex items-center justify-center gap-2 self-end rounded-sm border border-[#d5dee8] bg-white px-4 py-2 text-sm font-semibold text-[#5e6c7b] transition hover:border-[#44cfd8]">
                      <CalendarDays className="h-4 w-4" />
                      OCR日付
                    </button>
                  </div>
                  {editableFileResults.map((file, index) => {
                    const sourceFile = currentUpload.files.find((item) => item.originalFileName === file.originalFileName);
                    return (
                      <div key={file.originalFileName} className="rounded-sm border border-[#e5ebf1] bg-white p-4">
                        <button
                          type="button"
                          onClick={() => {
                            if (!sourceFile) return;
                            setPreviewFile({
                              uploadId: currentUpload.id,
                              fileId: sourceFile.id,
                              name: sourceFile.originalFileName,
                              mimeType: sourceFile.mimeType,
                            });
                          }}
                          disabled={!sourceFile}
                          className="text-xs text-[#127780] underline decoration-dotted underline-offset-4 hover:text-[#0e5a63] disabled:cursor-not-allowed disabled:text-[#7c8795] disabled:no-underline"
                        >
                          元ファイル: {file.originalFileName}
                        </button>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7c8795]">書類種別</label>
                            <input
                              type="text"
                              value={file.documentType}
                              onChange={(event) => {
                                const documentType = event.target.value;
                                setEditableFileResults((current) => current.map((item, currentIndex) => currentIndex === index ? {
                                  ...item,
                                  documentType,
                                  outputFileName: buildOutputFileName(fileDate, fileCustomerName, documentType),
                                } : item));
                              }}
                              className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7c8795]">保存ファイル名（拡張子なし）</label>
                            <div className="flex rounded-sm border border-[#d5dee8] bg-white focus-within:border-[#44cfd8]">
                              <input
                                type="text"
                                value={stripPdfExtension(file.outputFileName)}
                                onChange={(event) => setEditableFileResults((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, outputFileName: appendPdfExtension(event.target.value) } : item))}
                                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[#1f2b37] outline-none"
                              />
                              <span className="border-l border-[#d5dee8] px-3 py-2 text-sm font-semibold text-[#7c8795]">.pdf</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                      {localSaveNotice && (
                        <div
                          role="status"
                          className={`flex items-start gap-3 rounded-sm border px-4 py-3 ${
                            localSaveNotice.status === "success"
                              ? "border-[#9fddd6] bg-[#eafaf7] text-[#147a73]"
                              : "border-[#f2bfd2] bg-[#fff3f8] text-[#b43a6a]"
                          }`}
                        >
                          {localSaveNotice.status === "success" ? (
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                          ) : (
                            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                          )}
                          <div>
                            <p className="text-sm font-bold">
                              {localSaveNotice.status === "success" ? "保存完了" : "保存できませんでした"}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed">{localSaveNotice.message}</p>
                          </div>
                        </div>
                      )}
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

      {previewFile && (
        <FloatingPreview
          previewPath={`/uploads/${previewFile.uploadId}/files/${previewFile.fileId}/preview`}
          name={previewFile.name}
          mimeType={previewFile.mimeType}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

// プレビューは共通コンポーネント FloatingPreview（非モーダル・移動可能）に置き換えました。
