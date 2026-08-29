"use client";

import { useState } from "react";

import { AuthGate } from "@/components/auth/auth-gate";
import { OcrUploadWorkbench } from "@/components/ocr/ocr-upload-workbench";
import { MemberCheckWorkbench } from "@/components/member-check/member-check-workbench";
import { KeiriOcrWorkbench } from "@/components/keiri/keiri-ocr-workbench";
import { BillingOcrWorkbench } from "@/components/billing/billing-ocr-workbench";

type View = "naming" | "roster" | "keiri" | "billing";

export default function HomePage() {
  // 既定は「AI OCR ファイル命名」をトップ表示。上部ナビで名簿照合(Salesforce)に切り替え可能。
  const [view, setView] = useState<View>("naming");

  return (
    <AuthGate>
      <nav className="sticky top-0 z-30 border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2 lg:px-6">
          <span className="mr-3 text-sm font-extrabold tracking-tight text-[#1f2b37]">LOAD</span>
          <NavTab active={view === "naming"} onClick={() => setView("naming")}>
            AI OCR
          </NavTab>
          <NavTab active={view === "roster"} onClick={() => setView("roster")}>
            名簿照合 (Salesforce)
          </NavTab>
          <NavTab active={view === "keiri"} onClick={() => setView("keiri")}>
            経理OCR
          </NavTab>
          <NavTab active={view === "billing"} onClick={() => setView("billing")}>
            請求明細OCR
          </NavTab>
        </div>
      </nav>

      {view === "naming" ? (
        <OcrUploadWorkbench />
      ) : view === "keiri" ? (
        <KeiriOcrWorkbench />
      ) : view === "billing" ? (
        <BillingOcrWorkbench />
      ) : (
        <MemberCheckWorkbench />
      )}
    </AuthGate>
  );
}

function NavTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-[#40d4db] text-white shadow-sm"
          : "text-[#5e6c7b] hover:bg-[#eef5f7]"
      }`}
    >
      {children}
    </button>
  );
}
