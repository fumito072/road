"use client";

import { AuthGate } from "@/components/auth/auth-gate";
import { OcrUploadWorkbench } from "@/components/ocr/ocr-upload-workbench";

export default function HomePage() {
  return (
    <AuthGate>
      <OcrUploadWorkbench />
    </AuthGate>
  );
}
