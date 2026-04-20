"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleEllipsis,
  ExternalLink,
  FileScan,
  Play,
  Save,
  Send,
  Trash2,
  Upload,
} from "lucide-react";

import { acceptedFormats } from "@/data/ocr";
import { TabBar } from "@/components/tabs/tab-bar";
import { TabSettingsModal } from "@/components/tabs/tab-settings-modal";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import type {
  DestinationCandidate,
  Tab,
  UploadFileResult,
  UploadRecord,
  UploadStructuredResult,
} from "@/lib/types";

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
  outputFileName: string;
  confidence: number;
  reason: string;
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

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function buildFolderName(tabName: string) {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  return `${tabName}-${timestamp}`;
}

function extractSelectedFolderName(files: File[]) {
  const firstFile = files[0] as File & { webkitRelativePath?: string };
  const relativePath = firstFile.webkitRelativePath?.trim();

  if (relativePath && relativePath.includes("/")) {
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
      outputFileName: current?.outputFileName ?? file.originalFileName,
      confidence: current?.confidence ?? upload.ocrConfidence ?? 0,
      reason: current?.reason ?? "",
    };
  });
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function OcrUploadWorkbench() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueFile[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSavingToSharePoint, setIsSavingToSharePoint] = useState(false);
  const [lastRunLabel, setLastRunLabel] = useState("未実行");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab | null>(null);
  const [settingsTab, setSettingsTab] = useState<Tab | null>(null);
  const [isNewTab, setIsNewTab] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentUpload, setCurrentUpload] = useState<UploadRecord | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerKana, setCustomerKana] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [applicationNumber, setApplicationNumber] = useState("");
  const [sharepointFolderPath, setSharepointFolderPath] = useState("");
  const [editableFileResults, setEditableFileResults] = useState<EditableFileResult[]>([]);
  const [customerNameCandidates, setCustomerNameCandidates] = useState<string[]>([]);
  const [customerKanaCandidates, setCustomerKanaCandidates] = useState<string[]>([]);
  const [destinationCandidates, setDestinationCandidates] = useState<DestinationCandidate[]>([]);
  const [newFolderPlan, setNewFolderPlan] = useState<string[]>([]);
  const [resolveWarnings, setResolveWarnings] = useState<string[]>([]);
  const [isResolvingDestination, setIsResolvingDestination] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ uploadId: string; fileId: string; name: string; mimeType: string } | null>(null);

  const completedCount = useMemo(
    () => uploads.filter((upload) => upload.status === "COMPLETED").length,
    [uploads],
  );

  const handleSelectTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
  }, []);

  const handleSettingsClick = useCallback((tab: Tab) => {
    setSettingsTab(tab);
    setIsNewTab(false);
  }, []);

  const handleAddClick = useCallback(() => {
    setSettingsTab({} as Tab);
    setIsNewTab(true);
  }, []);

  const handleSaved = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  const hydrateEditableState = useCallback((upload: UploadRecord) => {
    const structured = upload.ocrStructuredResult ?? {};
    setCustomerName(structured.customerName ?? upload.customerName ?? "");
    setCustomerKana(structured.customerKana ?? "");
    setContractNumber(structured.contractNumber ?? upload.contractNumber ?? "");
    setApplicationNumber(structured.applicationNumber ?? upload.applicationNumber ?? "");
    setSharepointFolderPath(structured.sharepointFolderPath ?? "");
    setEditableFileResults(buildEditableFileResults(upload));
    setCustomerNameCandidates(
      uniqueStrings([...(structured.customerNameCandidates ?? []), structured.customerName, upload.customerName ?? undefined]),
    );
    setCustomerKanaCandidates(
      uniqueStrings([...(structured.customerKanaCandidates ?? []), structured.customerKana]),
    );
    setDestinationCandidates(structured.destinationResolution?.destinationCandidates ?? []);
    setNewFolderPlan(structured.destinationResolution?.newFolderPlan ?? []);
    setResolveWarnings(structured.destinationResolution?.warnings ?? []);
  }, []);

  const fetchUploads = useCallback(
    async (tabId: string) => {
      const data = await apiFetch<UploadRecord[]>(`/uploads?tabId=${tabId}`);
      setUploads(data);
      setCurrentUpload((current) => {
        const next = current ? data.find((item) => item.id === current.id) : data[0] ?? null;
        if (next) {
          hydrateEditableState(next);
        }
        return next ?? null;
      });
    },
    [hydrateEditableState],
  );

  useEffect(() => {
    if (!activeTab) {
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    void fetchUploads(activeTab.id);
  }, [activeTab, fetchUploads]);

  const handleOpenPicker = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    const folderName = extractSelectedFolderName(files);
    setSelectedFolderName(folderName);

    const nextFiles = files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      file,
      name: file.name,
      sizeLabel: formatBytes(file.size),
      relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name,
      status: "ready" as const,
    }));

    setQueue((current) => [...current, ...nextFiles]);
    event.target.value = "";
  };

  const handleRemove = (id: string) => {
    setQueue((current) => current.filter((file) => file.id !== id));
  };

  const handleSelectUpload = (upload: UploadRecord) => {
    setCurrentUpload(upload);
    hydrateEditableState(upload);
    setInfoMessage(null);
    setErrorMessage(null);
  };

  const handleRun = async () => {
    if (!activeTab || queue.length === 0 || isRunning) {
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);
    setInfoMessage(null);
    setQueue((current) => current.map((file) => ({ ...file, status: "processing" })));

    try {
      const formData = new FormData();
      formData.append("tabId", activeTab.id);
      formData.append("folderName", selectedFolderName || buildFolderName(activeTab.name));
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
      await fetchUploads(activeTab.id);
      setQueue([]);
      setLastRunLabel(new Date().toLocaleString("ja-JP", { hour12: false }));
      setInfoMessage("OCR の実行が完了しました。内容を確認して確定してください。");
    } catch (error) {
      setQueue((current) => current.map((file) => ({ ...file, status: "ready" })));
      setErrorMessage(error instanceof Error ? error.message : "OCR 実行に失敗しました。");
    } finally {
      setIsRunning(false);
    }
  };

  const handleConfirm = async () => {
    if (!currentUpload) {
      return;
    }

    if (!customerKana.trim()) {
      setErrorMessage("顧客名の読み方を確定してください。");
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage("顧客名を確定してください。");
      return;
    }

    if (!sharepointFolderPath.trim()) {
      setErrorMessage("保存先パスを解決してから確定してください。");
      return;
    }

    setIsConfirming(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const structured: UploadStructuredResult = {
        ...(currentUpload.ocrStructuredResult ?? {}),
        customerName,
        customerKana,
        contractNumber,
        applicationNumber,
        sharepointFolderPath,
        fileResults: editableFileResults as UploadFileResult[],
      };

      const confirmed = await apiFetch<UploadRecord>(`/uploads/${currentUpload.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerKana,
          contractNumber,
          applicationNumber,
          sharepointFolderPath,
          ocrStructuredResult: structured,
        }),
      });

      setCurrentUpload(confirmed);
      hydrateEditableState(confirmed);
      if (activeTab) {
        await fetchUploads(activeTab.id);
      }
      setInfoMessage("OCR 結果を確定しました。SharePoint 保存へ進めます。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "確認保存に失敗しました。");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleResolveDestination = async () => {
    if (!currentUpload) {
      return;
    }

    if (!customerKana.trim()) {
      setErrorMessage("先に顧客名の読み方を選択してください。");
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage("先に顧客名を確定してください。");
      return;
    }

    setIsResolvingDestination(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const resolved = await apiFetch<UploadRecord>(`/uploads/${currentUpload.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerKana,
        }),
      });

      setCurrentUpload(resolved);
      hydrateEditableState(resolved);

      const nextPath = resolved.ocrStructuredResult?.sharepointFolderPath ?? resolved.ocrStructuredResult?.destinationResolution?.destinationCandidates?.[0]?.absolutePath ?? "";
      if (nextPath) {
        setSharepointFolderPath(nextPath);
      }

      setInfoMessage("保存先候補を解決しました。配置先パスを確認して確定してください。");
      if (activeTab) {
        await fetchUploads(activeTab.id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存先候補の解決に失敗しました。");
    } finally {
      setIsResolvingDestination(false);
    }
  };

  const handleSaveToSharePoint = async () => {
    if (!currentUpload) {
      return;
    }

    setIsSavingToSharePoint(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const saved = await apiFetch<UploadRecord>(`/uploads/${currentUpload.id}/sharepoint`, {
        method: "POST",
      });

      setCurrentUpload(saved);
      hydrateEditableState(saved);
      if (activeTab) {
        await fetchUploads(activeTab.id);
      }
      setInfoMessage("SharePoint への保存が完了しました。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "SharePoint 保存に失敗しました。");
    } finally {
      setIsSavingToSharePoint(false);
    }
  };

  const activeUploadStatus = currentUpload ? uploadStatusLabel[currentUpload.status] : "未選択";

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#222b38]">
      <header className="border-b border-black/10 bg-[#2f2f31] text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 lg:flex-row lg:items-start lg:justify-between lg:px-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">OCR業務ダッシュボード</h1>
            <p className="mt-2 text-sm text-white/70">アップロード、OCR、確認、SharePoint 保存までを一画面で実行します。</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-md bg-white/10 px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">受付</p>
              <p className="mt-1 font-semibold">{uploads.length} 件</p>
            </div>
            <div className="rounded-md bg-white/10 px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">完了</p>
              <p className="mt-1 font-semibold">{completedCount} 件</p>
            </div>
            <div className="rounded-md bg-white/10 px-3 py-2 text-sm sm:col-span-2 lg:col-span-1">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">最終実行</p>
              <p className="mt-1 font-semibold">{lastRunLabel}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
        <div className="flex flex-wrap gap-2 border-b border-[#d6dde7] pb-4">
          <TabBar
            key={refreshKey}
            activeTabId={activeTab?.id ?? null}
            onSelectTab={handleSelectTab}
            onSettingsClick={handleSettingsClick}
            onAddClick={handleAddClick}
            showAddButton={false}
          />
        </div>

        <p className="mt-3 text-sm text-[#6a7684]">
          先に業務タブを選んで、どの SharePoint フォルダ向けの書類かを明確にしてからアップロードします。
        </p>

        <div className="mt-4 grid gap-3">
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

        {!activeTab ? (
          <div className="mt-10 rounded-sm border border-[#e3e8ef] bg-white p-10 text-center text-[#6a7684] shadow-sm">
            OCR フローを開始するには、先に業務タブを選択してください。
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
              <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
                <div className="border-b border-[#ecf0f4] px-6 py-5">
                  <h2 className="text-2xl font-bold text-[#1f2b37]">ファイルアップロード</h2>
                  <p className="mt-2 text-sm text-[#6a7684]">現在の業務タブ: <span className="font-semibold text-[#1f2b37]">{activeTab.name}</span></p>
                </div>

                <div className="p-6">
                  <button
                    type="button"
                    onClick={handleOpenPicker}
                    className="group flex min-h-[280px] w-full flex-col items-center justify-center rounded-sm border-2 border-dashed border-[#7ddde0] bg-[linear-gradient(180deg,#fafdff_0%,#eefbff_100%)] px-6 py-10 text-center transition hover:border-[#56d4d8] hover:bg-[#f4fdff]"
                  >
                    <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#69dce2]/20 text-[#44cfd8]">
                      <Upload className="h-9 w-9" />
                    </span>
                    <p className="mt-5 text-xl font-bold text-[#1f2b37]">ここにフォルダを追加</p>
                    <p className="mt-2 max-w-md text-sm leading-6 text-[#6c7782]">一社分の書類フォルダをそのまま選択してください。フォルダ配下のファイルをまとめて OCR します。</p>
                    <div className="mt-6 rounded-full bg-[#40d4db] px-5 py-2 text-sm font-semibold text-white shadow-sm transition group-hover:bg-[#35c7ce]">フォルダを選択</div>
                    <p className="mt-4 text-xs uppercase tracking-[0.22em] text-[#8b98a6]">{acceptedFormats.join(" / ")}</p>
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                    className="hidden"
                    onChange={handleFileChange}
                    {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
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

              <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
                <div className="border-b border-[#ecf0f4] px-6 py-5">
                  <h2 className="text-2xl font-bold text-[#1f2b37]">OCR実行</h2>
                  <p className="mt-2 text-sm text-[#6a7684]">アップロードした書類から OCR を実行し、確認後に SharePoint へ保存します。</p>
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

                  <button type="button" onClick={handleRun} disabled={queue.length === 0 || isRunning} className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[#ea4f82] px-6 py-4 text-base font-bold text-white transition hover:bg-[#da3d72] disabled:cursor-not-allowed disabled:bg-[#f0b6ca]">
                    {isRunning ? <CircleEllipsis className="h-5 w-5 animate-pulse" /> : <Play className="h-5 w-5" />}
                    {isRunning ? "OCRを実行中" : "OCRを実行する"}
                  </button>

                  <button type="button" onClick={handleResolveDestination} disabled={!currentUpload || isResolvingDestination || isRunning} className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-[#44cfd8] bg-white px-6 py-4 text-base font-bold text-[#12919b] transition hover:bg-[#f3feff] disabled:cursor-not-allowed disabled:border-[#d0d5db] disabled:text-[#98a2ad]">
                    <FileScan className="h-5 w-5" />
                    {isResolvingDestination ? "保存先候補を解決中" : "保存先候補を解決する"}
                  </button>

                  <button type="button" onClick={handleConfirm} disabled={!currentUpload || isConfirming || isRunning || !sharepointFolderPath.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-[#2f2f31] bg-white px-6 py-4 text-base font-bold text-[#2f2f31] transition hover:bg-[#f4f6f8] disabled:cursor-not-allowed disabled:border-[#d0d5db] disabled:text-[#98a2ad]">
                    <Save className="h-5 w-5" />
                    {isConfirming ? "アップロード内容を確定中" : "アップロード内容を確定する"}
                  </button>

                  <button type="button" onClick={handleSaveToSharePoint} disabled={!currentUpload || currentUpload.status !== "CONFIRMED" || isSavingToSharePoint || isRunning} className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[#2f2f31] px-6 py-4 text-base font-bold text-white transition hover:bg-[#1f1f21] disabled:cursor-not-allowed disabled:bg-[#9da4ac]">
                    <Send className="h-5 w-5" />
                    {isSavingToSharePoint ? "アップロード中" : "アップロードする"}
                  </button>
                </div>
              </section>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
                <div className="border-b border-[#ecf0f4] px-6 py-5">
                  <h2 className="text-2xl font-bold text-[#1f2b37]">アップロード一覧</h2>
                  <p className="mt-2 text-sm text-[#6a7684]">OCR 実行済みの案件を選ぶと、右側で確認・保存できます。</p>
                </div>
                <div className="p-6">
                  <div className="overflow-hidden rounded-sm border border-[#e7edf3]">
                    <table className="min-w-full divide-y divide-[#edf1f5] text-left">
                      <thead className="bg-[#f7f9fb] text-xs uppercase tracking-[0.18em] text-[#7c8795]">
                        <tr>
                          <th className="px-4 py-4 font-semibold">案件</th>
                          <th className="px-4 py-4 font-semibold">状態</th>
                          <th className="px-4 py-4 font-semibold">件数</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf1f5] bg-white">
                        {uploads.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-10 text-center text-sm text-[#8a94a1]">まだアップロード履歴がありません。</td>
                          </tr>
                        ) : (
                          uploads.map((upload) => {
                            const isSelected = currentUpload?.id === upload.id;
                            return (
                              <tr key={upload.id} onClick={() => handleSelectUpload(upload)} className={isSelected ? "bg-[#f8fcff]" : "cursor-pointer hover:bg-[#fafcff]"}>
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#eaf8fb] text-[#47cfd8]">
                                      <FileScan className="h-5 w-5" />
                                    </span>
                                    <div>
                                      <p className="font-medium text-[#24303d]">{upload.folderName}</p>
                                      <p className="text-xs text-[#7c8795]">{new Date(upload.createdAt).toLocaleString("ja-JP")}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-sm text-[#6d7885]">{uploadStatusLabel[upload.status]}</td>
                                <td className="px-4 py-4 text-sm text-[#6d7885]">{upload.files.length} 件</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {queue.length > 0 && (
                    <div className="mt-5 rounded-sm border border-[#e7edf3] bg-[#fbfcfe] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="font-semibold text-[#334154]">今回投入するフォルダ内容</p>
                        <span className="text-xs text-[#7c8795]">{queue.length} 件</span>
                      </div>
                      <div className="space-y-3">
                        {queue.map((file) => (
                          <div key={file.id} className="flex items-center justify-between gap-3 rounded-sm border border-[#e7edf3] bg-white px-4 py-3">
                            <div>
                              <p className="font-medium text-[#24303d]">{file.name}</p>
                              <p className="text-xs text-[#7c8795]">{file.relativePath} ・ {file.sizeLabel}</p>
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
                </div>
              </section>

              <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
                <div className="border-b border-[#ecf0f4] px-6 py-5">
                  <h2 className="text-2xl font-bold text-[#1f2b37]">確認・保存</h2>
                  <p className="mt-2 text-sm text-[#6a7684]">OCR 結果を確認し、必要に応じて修正してから SharePoint へ保存します。</p>
                </div>
                <div className="space-y-5 p-6">
                  {!currentUpload ? (
                    <div className="rounded-sm border border-dashed border-[#d5dee8] bg-[#fbfcfe] px-5 py-10 text-center text-sm text-[#7c8795]">アップロードを選択すると OCR 結果と保存先を確認できます。</div>
                  ) : (
                    <>
                      <div className="rounded-sm border border-[#d6efef] bg-[linear-gradient(180deg,#f7ffff_0%,#eefbfd_100%)] p-4">
                        <p className="text-sm text-[#6b7682]">SharePoint 保存先</p>
                        <p className="mt-2 break-all text-sm font-semibold text-[#234152]">{sharepointFolderPath || "未設定"}</p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-[#445063]">顧客名の読み方</label>
                          <input type="text" value={customerKana} onChange={(event) => setCustomerKana(event.target.value)} className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-[#445063]">顧客名</label>
                          <input type="text" value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-[#445063]">契約ID</label>
                          <input type="text" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-[#445063]">申込番号</label>
                          <input type="text" value={applicationNumber} onChange={(event) => setApplicationNumber(event.target.value)} className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-sm font-medium text-[#445063]">SharePoint 格納先パス</label>
                          <input type="text" value={sharepointFolderPath} onChange={(event) => setSharepointFolderPath(event.target.value)} className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]" />
                        </div>
                      </div>

                      <div className="space-y-4 rounded-sm border border-[#e5ebf1] bg-[#fbfcfe] p-4">
                        <div>
                          <p className="text-sm font-semibold text-[#334154]">1. 顧客名の読み方候補</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {customerKanaCandidates.length === 0 ? (
                              <span className="text-sm text-[#7c8795]">OCR から候補が得られていないため手入力してください。</span>
                            ) : (
                              customerKanaCandidates.map((candidate) => (
                                <button
                                  key={candidate}
                                  type="button"
                                  onClick={() => setCustomerKana(candidate)}
                                  className={`rounded-full border px-3 py-2 text-sm font-medium transition ${customerKana === candidate ? "border-[#44cfd8] bg-[#ebfdff] text-[#127780]" : "border-[#d5dee8] bg-white text-[#5e6c7b] hover:border-[#44cfd8]"}`}
                                >
                                  {candidate}
                                </button>
                              ))
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-[#334154]">2. 顧客名候補</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {customerNameCandidates.length === 0 ? (
                              <span className="text-sm text-[#7c8795]">OCR から候補が得られていないため手入力してください。</span>
                            ) : (
                              customerNameCandidates.map((candidate) => (
                                <button
                                  key={candidate}
                                  type="button"
                                  onClick={() => setCustomerName(candidate)}
                                  className={`rounded-full border px-3 py-2 text-sm font-medium transition ${customerName === candidate ? "border-[#44cfd8] bg-[#ebfdff] text-[#127780]" : "border-[#d5dee8] bg-white text-[#5e6c7b] hover:border-[#44cfd8]"}`}
                                >
                                  {candidate}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 rounded-sm border border-[#e5ebf1] bg-[#fbfcfe] p-4">
                        <div>
                          <p className="text-sm font-semibold text-[#334154]">3. アップロードファイル名の編集</p>
                          <p className="mt-1 text-xs text-[#7c8795]">SharePoint に保存する際のファイル名を変更できます。確定前に必要に応じて修正してください。</p>
                        </div>
                        {editableFileResults.map((file, index) => {
                          const sourceFile = currentUpload?.files.find((item) => item.originalFileName === file.originalFileName);
                          return (
                            <div key={file.originalFileName} className="rounded-sm border border-[#e5ebf1] bg-white p-4">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!sourceFile || !currentUpload) return;
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
                                  <input type="text" value={file.documentType} onChange={(event) => setEditableFileResults((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, documentType: event.target.value } : item))} className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7c8795]">保存ファイル名</label>
                                  <input type="text" value={file.outputFileName} onChange={(event) => setEditableFileResults((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, outputFileName: event.target.value } : item))} className="w-full rounded-sm border border-[#d5dee8] bg-white px-3 py-2 text-sm text-[#1f2b37] outline-none transition focus:border-[#44cfd8]" />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="space-y-4 rounded-sm border border-[#e5ebf1] bg-[#fbfcfe] p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-[#334154]">4. 保存先候補</p>
                          <span className="text-xs text-[#7c8795]">顧客名確定後に解決</span>
                        </div>

                        {destinationCandidates.length === 0 ? (
                          <p className="text-sm text-[#7c8795]">保存先候補はまだ解決されていません。</p>
                        ) : (
                          <div className="space-y-2">
                            {destinationCandidates.map((candidate) => {
                              const isSelected = sharepointFolderPath === candidate.absolutePath;
                              return (
                                <button
                                  key={candidate.absolutePath}
                                  type="button"
                                  onClick={() => setSharepointFolderPath(candidate.absolutePath)}
                                  className={`flex w-full flex-col items-start rounded-sm border px-4 py-3 text-left transition ${isSelected ? "border-[#44cfd8] bg-[#ebfdff]" : "border-[#dbe4ec] bg-white hover:border-[#44cfd8]"}`}
                                >
                                  <span className="text-sm font-semibold text-[#20303d]">{candidate.absolutePath}</span>
                                  <span className="mt-1 text-xs text-[#6f7d8a]">{candidate.reason}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {newFolderPlan.length > 0 && (
                          <div className="rounded-sm border border-[#f3d5df] bg-[#fff7f9] p-4">
                            <p className="text-sm font-semibold text-[#8f546b]">新規作成予定階層</p>
                            <div className="mt-2 space-y-1 text-sm text-[#8f546b]">
                              {newFolderPlan.map((path) => (
                                <p key={path}>{path}</p>
                              ))}
                            </div>
                          </div>
                        )}

                        {resolveWarnings.length > 0 && (
                          <div className="rounded-sm border border-[#ecd7ac] bg-[#fff9e9] p-4 text-sm text-[#8a6732]">
                            {resolveWarnings.map((warning) => (
                              <p key={warning}>{warning}</p>
                            ))}
                          </div>
                        )}
                      </div>

                      {currentUpload.sharepointWebUrl && (
                        <div className="flex justify-end">
                          <a href={currentUpload.sharepointWebUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[#0078d4] hover:underline">
                            保存先を開く
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>

      {settingsTab && (
        <TabSettingsModal
          tab={isNewTab ? null : settingsTab}
          isNew={isNewTab}
          onClose={() => setSettingsTab(null)}
          onSaved={handleSaved}
        />
      )}

      {previewFile && (
        <FilePreviewModal
          uploadId={previewFile.uploadId}
          fileId={previewFile.fileId}
          name={previewFile.name}
          mimeType={previewFile.mimeType}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

function FilePreviewModal({
  uploadId,
  fileId,
  name,
  mimeType,
  onClose,
}: {
  uploadId: string;
  fileId: string;
  name: string;
  mimeType: string;
  onClose: () => void;
}) {
  const isImage = mimeType.startsWith("image/");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      try {
        const blob = await apiFetchBlob(`/uploads/${uploadId}/files/${fileId}/preview`);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "プレビューの取得に失敗しました");
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [uploadId, fileId]);

  const handleDownload = async () => {
    try {
      const blob = await apiFetchBlob(`/uploads/${uploadId}/files/${fileId}/preview`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ダウンロードに失敗しました");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-sm bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e5ebf1] bg-[#f6f8fb] px-5 py-3">
          <p className="truncate text-sm font-semibold text-[#1f2b37]">{name}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownload}
              className="text-xs font-medium text-[#127780] hover:underline"
            >
              ダウンロード
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-[#d5dee8] bg-white px-3 py-1 text-xs font-medium text-[#445063] hover:border-[#44cfd8]"
            >
              閉じる
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-[#eef2f7]">
          {error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[#b43a6a]">
              {error}
            </div>
          ) : !blobUrl ? (
            <div className="flex h-full items-center justify-center text-sm text-[#4c6478]">
              読み込み中...
            </div>
          ) : isImage ? (
            <img src={blobUrl} alt={name} className="mx-auto max-h-full max-w-full object-contain" />
          ) : (
            <iframe src={blobUrl} title={name} className="h-full w-full" />
          )}
        </div>
      </div>
    </div>
  );
}
