export const acceptedFormats = ["PDF", "PNG", "JPG", "JPEG", "TIFF"] as const;

export const initialMockFiles = [
  {
    id: "seed-1",
    name: "法人回線申込書_サンプル.pdf",
    sizeLabel: "2.4 MB",
    status: "ready",
  },
] as const;

export const mockExtractedFields = [
  { label: "契約種別", value: "法人向け光回線" },
  { label: "顧客名", value: "株式会社サンプルネット" },
  { label: "申込番号", value: "HIKARI-2026-0315" },
  { label: "工事希望日", value: "2026/03/28" },
] as const;
