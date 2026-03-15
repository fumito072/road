"use client";

import type { ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleEllipsis,
  FileScan,
  Play,
  Trash2,
  Upload,
} from "lucide-react";

import { acceptedFormats, initialMockFiles, mockExtractedFields } from "@/data/ocr";

type QueueStatus = "ready" | "processing" | "completed";

type QueueFile = {
  id: string;
  name: string;
  sizeLabel: string;
  status: QueueStatus;
};

const statusLabel: Record<QueueStatus, string> = {
  ready: "待機中",
  processing: "実行中",
  completed: "完了",
};

const statusClassName: Record<QueueStatus, string> = {
  ready: "bg-[#f6fbff] text-[#4c6478] border-[#d8e6ef]",
  processing: "bg-[#fff3f8] text-[#b43a6a] border-[#f2bfd2]",
  completed: "bg-[#eefdfa] text-[#1e8f88] border-[#bfece6]",
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function OcrUploadWorkbench() {
  const [queue, setQueue] = useState<QueueFile[]>([...initialMockFiles]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRunLabel, setLastRunLabel] = useState("未実行");
  const inputRef = useRef<HTMLInputElement>(null);

  const completedCount = useMemo(
    () => queue.filter((file) => file.status === "completed").length,
    [queue],
  );

  const handleOpenPicker = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    const nextFiles = files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      name: file.name,
      sizeLabel: formatBytes(file.size),
      status: "ready" as const,
    }));

    setQueue((current) => [...current, ...nextFiles]);
    event.target.value = "";
  };

  const handleRemove = (id: string) => {
    setQueue((current) => current.filter((file) => file.id !== id));
  };

  const handleRun = async () => {
    if (queue.length === 0 || isRunning) {
      return;
    }

    setIsRunning(true);
    setQueue((current) =>
      current.map((file) => ({
        ...file,
        status: file.status === "completed" ? "completed" : "processing",
      })),
    );

    await new Promise((resolve) => {
      window.setTimeout(resolve, 1400);
    });

    setQueue((current) =>
      current.map((file) => ({
        ...file,
        status: "completed",
      })),
    );
    setLastRunLabel(new Date().toLocaleString("ja-JP", { hour12: false }));
    setIsRunning(false);
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#222b38]">
      <header className="border-b border-black/10 bg-[#2f2f31] text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 lg:flex-row lg:items-start lg:justify-between lg:px-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">OCR業務ダッシュボード</h1>
            <p className="mt-2 text-sm text-white/70">
              ファイルをアップロードして OCR を実行する、最小構成のフロントエンドです。
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-md bg-white/10 px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">受付</p>
              <p className="mt-1 font-semibold">{queue.length} 件</p>
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
          <button
            type="button"
            className="rounded-sm border border-[#d4d9df] bg-[#f3f4f6] px-6 py-3 text-sm font-semibold text-[#9aa3ad]"
          >
            マネージメント向け
          </button>
          <button
            type="button"
            className="rounded-sm border border-[#2f2f31] bg-[#2f2f31] px-6 py-3 text-sm font-semibold text-white"
          >
            OCR実行画面
          </button>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">ファイルアップロード</h2>
              <p className="mt-2 text-sm text-[#6a7684]">
                PDF や画像を追加して、OCR 対象ファイルをまとめて投入します。
              </p>
            </div>

            <div className="p-6">
              <div>
                <div>
                  <button
                    type="button"
                    onClick={handleOpenPicker}
                    className="group flex min-h-[280px] w-full flex-col items-center justify-center rounded-sm border-2 border-dashed border-[#7ddde0] bg-[linear-gradient(180deg,#fafdff_0%,#eefbff_100%)] px-6 py-10 text-center transition hover:border-[#56d4d8] hover:bg-[#f4fdff]"
                  >
                    <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#69dce2]/20 text-[#44cfd8]">
                      <Upload className="h-9 w-9" />
                    </span>
                    <p className="mt-5 text-xl font-bold text-[#1f2b37]">
                      ここにファイルを追加
                    </p>
                    <p className="mt-2 max-w-md text-sm leading-6 text-[#6c7782]">
                      クリックして選択。将来はドラッグ&ドロップや複数API接続にも広げやすい構成です。
                    </p>
                    <div className="mt-6 rounded-full bg-[#40d4db] px-5 py-2 text-sm font-semibold text-white shadow-sm transition group-hover:bg-[#35c7ce]">
                      ファイルを選択
                    </div>
                    <p className="mt-4 text-xs uppercase tracking-[0.22em] text-[#8b98a6]">
                      {acceptedFormats.join(" / ")}
                    </p>
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                <div className="mt-4 rounded-sm border border-[#e8edf3] bg-[#fbfcfe] p-4">
                  <p className="text-sm font-semibold text-[#445063]">対応フォーマット</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {acceptedFormats.map((format) => (
                      <span
                        key={format}
                        className="rounded-full border border-[#d5dee8] bg-white px-3 py-1 text-xs font-semibold text-[#607083]"
                      >
                        {format}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">OCR実行</h2>
              <p className="mt-2 text-sm text-[#6a7684]">
                解析モードを選択して、そのまま実行します。API 接続前のモック動作です。
              </p>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-sm border border-[#e4ebf2] bg-[#f8fbfd] p-4">
                  <p className="text-sm text-[#6b7682]">処理対象</p>
                  <p className="mt-2 text-3xl font-bold text-[#1f2b37]">{queue.length}</p>
                </div>
                <div className="rounded-sm border border-[#f3d5df] bg-[#fff6f8] p-4">
                  <p className="text-sm text-[#8f546b]">処理状態</p>
                  <p className="mt-2 text-lg font-bold text-[#b63b69]">
                    {isRunning ? "実行中..." : queue.length > 0 ? "実行待ち" : "ファイルなし"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRun}
                disabled={queue.length === 0 || isRunning}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[#ea4f82] px-6 py-4 text-base font-bold text-white transition hover:bg-[#da3d72] disabled:cursor-not-allowed disabled:bg-[#f0b6ca]"
              >
                {isRunning ? <CircleEllipsis className="h-5 w-5 animate-pulse" /> : <Play className="h-5 w-5" />}
                {isRunning ? "OCRを実行中" : "OCRを実行する"}
              </button>

              <div className="rounded-sm border border-[#dfe7ee] bg-[#fafcff] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-[#334154]">実行メモ</p>
                  <span className="rounded-full bg-[#eaf9fa] px-3 py-1 text-xs font-semibold text-[#2ca9af]">
                    front-end mock
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#6b7785]">
                  いまはフロントのみのため、実行ボタン押下で疑似的に完了状態へ遷移します。後で API に差し替え可能です。
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">アップロード一覧</h2>
              <p className="mt-2 text-sm text-[#6a7684]">追加済みファイルの状態を確認し、不要なら削除できます。</p>
            </div>
            <div className="p-6">
              <div className="overflow-hidden rounded-sm border border-[#e7edf3]">
                <table className="min-w-full divide-y divide-[#edf1f5] text-left">
                  <thead className="bg-[#f7f9fb] text-xs uppercase tracking-[0.18em] text-[#7c8795]">
                    <tr>
                      <th className="px-4 py-4 font-semibold">ファイル</th>
                      <th className="px-4 py-4 font-semibold">サイズ</th>
                      <th className="px-4 py-4 font-semibold">状態</th>
                      <th className="px-4 py-4 font-semibold text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1f5] bg-white">
                    {queue.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-sm text-[#8a94a1]">
                          まだファイルがありません。
                        </td>
                      </tr>
                    ) : (
                      queue.map((file) => (
                        <tr key={file.id}>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#eaf8fb] text-[#47cfd8]">
                                <FileScan className="h-5 w-5" />
                              </span>
                              <span className="font-medium text-[#24303d]">{file.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-[#6d7885]">{file.sizeLabel}</td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClassName[file.status]}`}
                            >
                              {statusLabel[file.status]}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemove(file.id)}
                              className="inline-flex items-center gap-2 rounded-full border border-[#e1e6ed] px-3 py-2 text-sm text-[#667282] transition hover:border-[#d25d84] hover:text-[#c64974]"
                            >
                              <Trash2 className="h-4 w-4" />
                              削除
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">OCR結果プレビュー</h2>
              <p className="mt-2 text-sm text-[#6a7684]">実行後に主要な抽出項目をここへ表示する想定です。</p>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-sm border border-[#d6efef] bg-[linear-gradient(180deg,#f7ffff_0%,#eefbfd_100%)] p-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[#31b7b8]" />
                  <div>
                    <p className="font-semibold text-[#234152]">最新結果</p>
                    <p className="text-sm text-[#6c7987]">
                      {completedCount > 0 ? "OCR完了。主要項目を確認できます。" : "実行すると結果が表示されます。"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                {mockExtractedFields.map((field) => (
                  <div key={field.label} className="flex items-center justify-between rounded-sm border border-[#e5ebf1] bg-[#fbfcfe] px-4 py-4">
                    <span className="text-sm font-semibold text-[#5d6a79]">{field.label}</span>
                    <span className="text-sm font-bold text-[#1f2b37]">{field.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
