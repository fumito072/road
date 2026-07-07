"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import {
  DEFAULT_ACCEPTED_EXTENSIONS,
  extractFilesFromDataTransfer,
  isAcceptedFile,
  type DroppedFile,
} from "@/lib/file-drop";

interface UploadDropzoneProps {
  // 受理したファイル群を渡す（フォルダの場合は中身を再帰展開済み）。
  onFiles: (files: DroppedFile[]) => void;
  // 対応形式外があった場合の通知（任意）。
  onNotice?: (message: string | null) => void;
  acceptedExtensions?: string[];
  formats?: string[];
  title?: string;
  description?: string;
  allowFolder?: boolean;
  multiple?: boolean;
  minHeight?: string;
}

// AI OCR / 経理OCR / 名簿照合 で共通利用するアップロード用ドロップゾーン。
export function UploadDropzone({
  onFiles,
  onNotice,
  acceptedExtensions = DEFAULT_ACCEPTED_EXTENSIONS,
  formats = ["PDF", "PNG", "JPG", "JPEG", "TIFF"],
  title = "フォルダまたはファイルをドラッグ&ドロップ",
  description = "デスクトップからフォルダごと、または PDF などのファイルを直接ドロップできます。ボタンからの選択も可能です。",
  allowFolder = true,
  multiple = true,
  minHeight = "min-h-[280px]",
}: UploadDropzoneProps) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptAttr = acceptedExtensions.map((ext) => `.${ext}`).join(",");

  const emitFiles = (incoming: DroppedFile[]) => {
    const accepted = incoming.filter((item) => isAcceptedFile(item.file.name, acceptedExtensions));
    const rejectedCount = incoming.length - accepted.length;

    if (accepted.length === 0) {
      if (rejectedCount > 0) {
        onNotice?.(`対応していない形式のファイルです（${formats.join(" / ")} のみ）。`);
      }
      return;
    }

    onNotice?.(rejectedCount > 0 ? `${rejectedCount} 件は対応形式外のため除外しました。` : null);
    onFiles(accepted);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    emitFiles(
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
      if (dropped.length === 0) return;
      emitFiles(dropped);
    } catch {
      onNotice?.("ドラッグ&ドロップしたファイルの読み込みに失敗しました。ボタンから選択してください。");
    }
  };

  return (
    <>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex ${minHeight} w-full flex-col items-center justify-center rounded-sm border-2 border-dashed px-6 py-10 text-center transition ${
          isDragging
            ? "border-[#40d4db] bg-[#e3fbff]"
            : "border-[#7ddde0] bg-[linear-gradient(180deg,#fafdff_0%,#eefbff_100%)]"
        }`}
      >
        <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#69dce2]/20 text-[#44cfd8]">
          <Upload className="h-9 w-9" />
        </span>
        <p className="mt-5 text-xl font-bold text-[#1f2b37]">
          {isDragging ? "ここにドロップして読み込み" : title}
        </p>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#6c7782]">{description}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {allowFolder && (
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="rounded-full bg-[#40d4db] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#35c7ce]"
            >
              フォルダを選択
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full border border-[#40d4db] bg-white px-5 py-2 text-sm font-semibold text-[#12919b] shadow-sm transition hover:bg-[#f3feff]"
          >
            ファイルを選択
          </button>
        </div>
        <p className="mt-4 text-xs uppercase tracking-[0.22em] text-[#8b98a6]">{formats.join(" / ")}</p>
      </div>

      {allowFolder && (
        <input
          ref={folderInputRef}
          type="file"
          accept={acceptAttr}
          className="hidden"
          onChange={handleFileChange}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptAttr}
        multiple={multiple}
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}
