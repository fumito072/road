"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  RefreshCw,
  Search,
  Upload,
  Users,
} from "lucide-react";

import { apiFetch } from "@/lib/api";

type MemberCheckMatch = {
  source: "contact" | "torihikisaki_tantou";
  sourceLabel: string;
  id: string;
  name: string;
  kana: string | null;
  company: string | null;
  url: string;
};

type MemberCheckSalesforce = {
  configured: boolean;
  query: string;
  lastName: string;
  firstName: string;
  exists: boolean;
  matchCount: number;
  matches: MemberCheckMatch[];
};

type MemberCheckPersonResult = {
  group: string;
  lastName: string;
  firstName: string;
  fullName: string;
  kana: string;
  handicap: string;
  note: string;
  salesforce: MemberCheckSalesforce;
};

type MemberCheckResult = {
  totalPeople: number;
  matchedCount: number;
  confidence: number;
  salesforceConfigured: boolean;
  people: MemberCheckPersonResult[];
};

type ScanJobAck = {
  jobId: string;
  status: "processing" | "completed" | "error";
};

type MemberCheckJobView = {
  id: string;
  status: "processing" | "completed" | "error";
  result: MemberCheckResult | null;
  error: string | null;
};

// ポーリング設定: 2.5秒間隔 × 最大120回 ≒ 5分まで待つ。
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 120;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PersonStatus = "matched" | "multiple" | "none";

function personStatus(person: MemberCheckPersonResult): PersonStatus {
  if (!person.salesforce.exists) return "none";
  return person.salesforce.matchCount > 1 ? "multiple" : "matched";
}

const statusBadge: Record<PersonStatus, { label: string; className: string }> = {
  matched: { label: "該当あり", className: "border-[#bfece6] bg-[#eefdfa] text-[#1e8f88]" },
  multiple: { label: "複数候補", className: "border-[#ecd7ac] bg-[#fff9e9] text-[#8a6732]" },
  none: { label: "未登録", className: "border-[#d8e1ea] bg-[#f4f7fa] text-[#6b7a8a]" },
};

function isImageOrPdf(file: File) {
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

export function MemberCheckWorkbench() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MemberCheckResult | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptFile = useCallback((next: File | null) => {
    setError(null);
    setResult(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (!isImageOrPdf(next)) {
      setError("画像（JPG/PNG）または PDF を選んでください。");
      return;
    }
    setFile(next);
  }, []);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  };

  const handleScan = useCallback(async () => {
    if (!file) return;
    setIsScanning(true);
    setError(null);
    setResult(null);
    try {
      // 1) スキャンを受付（即ジョブIDが返る）。長い処理でもここでは待たないのでタイムアウトしない。
      const form = new FormData();
      form.append("file", file);
      const ack = await apiFetch<ScanJobAck>("/member-check/scan", {
        method: "POST",
        body: form,
      });

      // 2) 完了するまで数秒ごとに結果を確認（各リクエストは短いので切られない）。
      let finalResult: MemberCheckResult | null = null;
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
        await wait(POLL_INTERVAL_MS);
        const job = await apiFetch<MemberCheckJobView>(`/member-check/jobs/${ack.jobId}`);
        if (job.status === "completed" && job.result) {
          finalResult = job.result;
          break;
        }
        if (job.status === "error") {
          throw new Error(job.error || "照合処理でエラーが発生しました。");
        }
      }

      if (!finalResult) {
        throw new Error(
          "照合に時間がかかっています。名簿を分割して人数を減らすか、少し時間を置いて再実行してください。",
        );
      }
      setResult(finalResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "照合に失敗しました。少し時間を置いて再実行してください。",
      );
    } finally {
      setIsScanning(false);
    }
  }, [file]);

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#222b38]">
      <header className="border-b border-black/10 bg-[#2f2f31] text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">名簿照合 (Salesforce)</h1>
            <p className="mt-2 text-sm text-white/70">
              紙の名簿を読み取り、各人がSalesforceの顧客（顧客担当者・取引先担当者）に登録済みか照合します。
            </p>
          </div>
          <div className="rounded-md bg-white/10 px-3 py-2 text-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">照合結果</p>
            <p className="mt-1 font-semibold">
              {result ? `${result.totalPeople}名中 ${result.matchedCount}名 該当` : "未実行"}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-sm border border-[#f2bfd2] bg-[#fff3f8] px-4 py-3 text-sm text-[#b43a6a]">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* 左: アップロード */}
          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">① 名簿をアップロード</h2>
              <p className="mt-2 text-sm text-[#6a7684]">
                参加者名簿などの画像（JPG/PNG）またはPDFを1枚選んでください。
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
                className={`flex min-h-[220px] w-full flex-col items-center justify-center rounded-sm border-2 border-dashed px-6 py-8 text-center transition ${
                  isDragging
                    ? "border-[#40d4db] bg-[#e3fbff]"
                    : "border-[#7ddde0] bg-[linear-gradient(180deg,#fafdff_0%,#eefbff_100%)]"
                }`}
              >
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="名簿プレビュー"
                    className="max-h-[260px] max-w-full rounded-sm border border-[#dce6ee] object-contain shadow-sm"
                  />
                ) : (
                  <>
                    <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#69dce2]/20 text-[#44cfd8]">
                      <Upload className="h-8 w-8" />
                    </span>
                    <p className="mt-4 text-lg font-bold text-[#1f2b37]">
                      {isDragging ? "ここにドロップ" : "ドラッグ&ドロップ"}
                    </p>
                    <p className="mt-1 text-sm text-[#6c7782]">またはボタンから選択</p>
                  </>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full bg-[#40d4db] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#35c7ce]"
                  >
                    {file ? "別の画像を選択" : "画像を選択"}
                  </button>
                  {file && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="rounded-full border border-[#d5dee8] bg-white px-5 py-2 text-sm font-semibold text-[#5e6c7b] transition hover:border-[#44cfd8]"
                    >
                      クリア
                    </button>
                  )}
                </div>
                {file && (
                  <p className="mt-3 truncate text-xs text-[#8b98a6]" title={file.name}>
                    {file.name}
                  </p>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleInputChange}
              />

              <button
                type="button"
                onClick={handleScan}
                disabled={!file || isScanning}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[#ea4f82] px-6 py-4 text-base font-bold text-white transition hover:bg-[#da3d72] disabled:cursor-not-allowed disabled:bg-[#f0b6ca]"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    照合中…（数十秒かかる場合があります）
                  </>
                ) : (
                  <>
                    <Search className="h-5 w-5" />
                    名簿を読み取って照合する
                  </>
                )}
              </button>
            </div>
          </section>

          {/* 右: 結果 */}
          <section className="overflow-hidden rounded-sm border border-[#e3e8ef] bg-white shadow-sm">
            <div className="border-b border-[#ecf0f4] px-6 py-5">
              <h2 className="text-2xl font-bold text-[#1f2b37]">② 照合結果</h2>
              <p className="mt-2 text-sm text-[#6a7684]">
                各人物のSalesforce登録状況です。「複数候補」は同姓同名の可能性があるため、リンク先でご確認ください。
              </p>
            </div>

            <div className="p-6">
              {!result && !isScanning && (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-sm border border-dashed border-[#d5dee8] bg-[#fbfcfe] text-center text-sm text-[#7c8795]">
                  <Users className="mb-3 h-8 w-8 text-[#bcc7d2]" />
                  名簿をアップロードして「照合する」を押すと、ここに結果が表示されます。
                </div>
              )}

              {isScanning && (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-sm border border-dashed border-[#cfeaf0] bg-[#f7feff] text-center text-sm text-[#3a8f99]">
                  <RefreshCw className="mb-3 h-8 w-8 animate-spin text-[#44cfd8]" />
                  OCRで名簿を読み取り、Salesforceと照合しています…
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-sm border border-[#e4ebf2] bg-[#f8fbfd] px-3 py-3 text-center">
                      <p className="text-[11px] text-[#7c8795]">抽出人数</p>
                      <p className="mt-1 text-2xl font-bold text-[#1f2b37]">{result.totalPeople}</p>
                    </div>
                    <div className="rounded-sm border border-[#bfece6] bg-[#eefdfa] px-3 py-3 text-center">
                      <p className="text-[11px] text-[#1e8f88]">該当（登録済み）</p>
                      <p className="mt-1 text-2xl font-bold text-[#1e8f88]">{result.matchedCount}</p>
                    </div>
                    <div className="rounded-sm border border-[#e4ebf2] bg-[#f8fbfd] px-3 py-3 text-center">
                      <p className="text-[11px] text-[#7c8795]">未登録</p>
                      <p className="mt-1 text-2xl font-bold text-[#6b7a8a]">
                        {result.totalPeople - result.matchedCount}
                      </p>
                    </div>
                  </div>

                  {!result.salesforceConfigured && (
                    <div className="flex items-start gap-2 rounded-sm border border-[#ecd7ac] bg-[#fff9e9] px-4 py-3 text-sm text-[#8a6732]">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      Salesforceが未設定のため照合できませんでした（抽出のみ）。.envの設定をご確認ください。
                    </div>
                  )}

                  <ul className="divide-y divide-[#eef2f6] overflow-hidden rounded-sm border border-[#e7edf3]">
                    {result.people.map((person, index) => {
                      const status = personStatus(person);
                      const badge = statusBadge[status];
                      return (
                        <li key={index} className="bg-white px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-[#1f2b37]">
                                  {person.fullName || `${person.lastName}${person.firstName}`}
                                </span>
                                {person.kana && (
                                  <span className="text-xs text-[#8b98a6]">{person.kana}</span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-[#7c8795]">
                                {[
                                  person.group ? `組 ${person.group}` : "",
                                  person.handicap ? `HDCP ${person.handicap}` : "",
                                  person.note,
                                ]
                                  .filter(Boolean)
                                  .join(" ・ ")}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${badge.className}`}
                            >
                              {status === "matched" && (
                                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                              )}
                              {badge.label}
                            </span>
                          </div>

                          {person.salesforce.matches.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {person.salesforce.matches.map((match) => (
                                <li
                                  key={match.id}
                                  className="flex items-center justify-between gap-2 rounded-sm bg-[#f8fbfd] px-3 py-1.5 text-sm"
                                >
                                  <span className="min-w-0 truncate text-[#34404d]">
                                    <span className="mr-1 rounded-sm bg-[#e7edf3] px-1.5 py-0.5 text-[11px] text-[#5e6c7b]">
                                      {match.sourceLabel}
                                    </span>
                                    {match.name}
                                    {match.company && (
                                      <span className="text-[#7c8795]">（{match.company}）</span>
                                    )}
                                  </span>
                                  <a
                                    href={match.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#12919b] hover:underline"
                                  >
                                    開く
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
