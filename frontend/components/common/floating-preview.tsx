"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Download, GripVertical, X } from "lucide-react";

import { apiFetchBlob } from "@/lib/api";

interface FloatingPreviewProps {
  // プレビュー取得用のAPIパス（例: /uploads/{id}/files/{fileId}/preview）
  previewPath: string;
  name: string;
  mimeType: string;
  onClose: () => void;
}

// 画面に重ならず（非モーダル）、ヘッダーをつかんで好きな位置に動かせるプレビュー窓。
// プレビューを見ながらファイル名を編集できるようにするための共通コンポーネント。
export function FloatingPreview({ previewPath, name, mimeType, onClose }: FloatingPreviewProps) {
  const isImage = mimeType.startsWith("image/");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === "undefined") return { x: 80, y: 96 };
    return { x: Math.max(24, window.innerWidth - 560), y: 96 };
  });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      try {
        const blob = await apiFetchBlob(previewPath);
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
  }, [previewPath]);

  const clamp = (x: number, y: number) => {
    if (typeof window === "undefined") return { x, y };
    return {
      x: Math.min(Math.max(x, 0), window.innerWidth - 120),
      y: Math.min(Math.max(y, 0), window.innerHeight - 48),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // 閉じる・ダウンロード等のボタン上ではドラッグを開始しない（クリックを奪わないため）。
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { dx: event.clientX - pos.x, dy: event.clientY - pos.y };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPos(clamp(event.clientX - dragRef.current.dx, event.clientY - dragRef.current.dy));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    // 掴んでいた時だけ解放（ボタンクリック時は掴んでいないので何もしない）。
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // capture していない場合は無視
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await apiFetchBlob(previewPath);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ダウンロードに失敗しました");
    }
  };

  return (
    <div
      className="fixed z-50 flex max-h-[82vh] w-[min(92vw,520px)] flex-col overflow-hidden rounded-md border border-[#cfd8e2] bg-white shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="flex cursor-move touch-none select-none items-center justify-between gap-2 border-b border-[#e5ebf1] bg-[#f6f8fb] px-3 py-2"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <GripVertical className="h-4 w-4 shrink-0 text-[#9aa7b4]" />
          <span className="truncate text-sm font-semibold text-[#1f2b37]">{name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleDownload}
            title="ダウンロード"
            className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium text-[#127780] transition hover:bg-[#e8f6f7]"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="閉じる"
            className="inline-flex items-center rounded-sm p-1 text-[#5e6c7b] transition hover:bg-[#eceff3] hover:text-[#20303d]"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>
      <div className="min-h-[240px] flex-1 resize-y overflow-auto bg-[#eef2f7]">
        {error ? (
          <div className="flex h-full items-center justify-center px-6 py-10 text-center text-sm text-[#b43a6a]">
            {error}
          </div>
        ) : !blobUrl ? (
          <div className="flex h-full items-center justify-center py-10 text-sm text-[#4c6478]">
            読み込み中...
          </div>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={blobUrl} alt={name} className="mx-auto max-h-full max-w-full object-contain" />
        ) : (
          <iframe src={blobUrl} title={name} className="h-[60vh] w-full" />
        )}
      </div>
    </div>
  );
}
