export const navigationSections = [
  {
    label: "Core",
    items: [
      { key: "dashboard", label: "ダッシュボード", active: true },
      { key: "ocr", label: "OCR" },
      { key: "history", label: "処理履歴" },
      { key: "feedback", label: "フィードバック" },
      { key: "analytics", label: "分析" },
      { key: "settings", label: "設定" },
    ],
  },
  {
    label: "Expansion",
    items: [
      { key: "ai", label: "AI機能", future: true },
      { key: "integration", label: "連携", future: true },
      { key: "admin", label: "管理", future: true },
    ],
  },
] as const;

export const summaryStats = [
  {
    title: "本日のOCR処理件数",
    value: "1,284",
    caption: "昨日比 +12.4% / 回線混雑時間帯も安定",
    delta: "+12.4%",
    deltaDirection: "up",
    tone: "cyan",
    icon: "file-scan",
  },
  {
    title: "処理待ち件数",
    value: "96",
    caption: "キュー滞留は基準値以下",
    delta: "-8件",
    deltaDirection: "down",
    tone: "violet",
    icon: "clock",
  },
  {
    title: "処理成功率",
    value: "98.6%",
    caption: "品質監視しきい値 97.5% を維持",
    delta: "+0.8pt",
    deltaDirection: "up",
    tone: "blue",
    icon: "shield",
  },
  {
    title: "要確認アラート",
    value: "14",
    caption: "形式不一致 / 再確認待ちを表示",
    delta: "+3件",
    deltaDirection: "up",
    tone: "amber",
    icon: "alert",
  },
  {
    title: "平均処理時間",
    value: "38秒",
    caption: "ピーク帯でも SLA 内で推移",
    delta: "-4秒",
    deltaDirection: "down",
    tone: "cyan",
    icon: "timer",
  },
  {
    title: "フィードバック回収数",
    value: "27",
    caption: "改善要望 16 / 不具合 5 / 新機能案 6",
    delta: "+9件",
    deltaDirection: "up",
    tone: "rose",
    icon: "message",
  },
] as const;

export const processingStates = [
  {
    label: "処理中",
    count: 42,
    ratio: 0.22,
    status: "processing",
    note: "GPU OCR エンジンで解析中",
  },
  {
    label: "完了",
    count: 1148,
    ratio: 0.73,
    status: "success",
    note: "精度しきい値を満たして完了",
  },
  {
    label: "待機中",
    count: 96,
    ratio: 0.11,
    status: "warning",
    note: "優先度順にキュー制御",
  },
  {
    label: "エラー",
    count: 14,
    ratio: 0.04,
    status: "error",
    note: "形式不一致 / 低解像度",
  },
] as const;

export const trendData = [
  { label: "3/09", total: 1020, completed: 987, errors: 4 },
  { label: "3/10", total: 1118, completed: 1087, errors: 6 },
  { label: "3/11", total: 1180, completed: 1141, errors: 5 },
  { label: "3/12", total: 1092, completed: 1054, errors: 7 },
  { label: "3/13", total: 1226, completed: 1190, errors: 5 },
  { label: "3/14", total: 1268, completed: 1231, errors: 6 },
  { label: "3/15", total: 1284, completed: 1248, errors: 4 },
] as const;

export const latestJobs = [
  {
    id: "ocr-20260315-001",
    fileName: "申込書_法人回線_0315.pdf",
    receivedAt: "2026/03/15 09:12",
    status: "success",
    summary: "契約番号・顧客名・工事希望日を抽出済み",
    assignee: "営業サポートA",
  },
  {
    id: "ocr-20260315-002",
    fileName: "本人確認書類_更新依頼.png",
    receivedAt: "2026/03/15 09:18",
    status: "processing",
    summary: "本人確認書類の項目マッピング中",
    assignee: "審査チーム",
  },
  {
    id: "ocr-20260315-003",
    fileName: "工事完了報告書_西東京.xlsx",
    receivedAt: "2026/03/15 09:24",
    status: "warning",
    summary: "書式差異あり / 手動確認待ち",
    assignee: "開通管理",
  },
  {
    id: "ocr-20260315-004",
    fileName: "請求先変更届_企業B.pdf",
    receivedAt: "2026/03/15 09:31",
    status: "error",
    summary: "画像解像度不足で再アップロード依頼",
    assignee: "CSチーム",
  },
  {
    id: "ocr-20260315-005",
    fileName: "保守受付票_データセンターC.pdf",
    receivedAt: "2026/03/15 09:36",
    status: "success",
    summary: "障害受付番号と設備情報を連携済み",
    assignee: "NOC",
  },
] as const;

export const alertItems = [
  {
    id: "alert-1",
    title: "OCR失敗: 本人確認書類の反射",
    description: "照明反射により氏名欄が欠損。再撮影依頼テンプレートを送信候補に表示。",
    status: "error",
    timestamp: "5分前",
  },
  {
    id: "alert-2",
    title: "要再確認: 工事完了報告書の書式差異",
    description: "新フォーマットの可能性。学習候補に登録して改善サイクルへ接続。",
    status: "warning",
    timestamp: "14分前",
  },
  {
    id: "alert-3",
    title: "通信安定: OCR API レイテンシ正常",
    description: "平均 212ms。ネットワーク区間の遅延上振れなし。",
    status: "success",
    timestamp: "18分前",
  },
] as const;

export const futureModules = [
  {
    title: "AI要約・回答支援",
    description: "OCR結果を起点に、問い合わせ要約や回答草案生成まで接続する予定のAIモジュール。",
    eta: "5月予定",
    tags: ["生成AI", "応対支援", "CRM接続"],
  },
  {
    title: "外部システム連携",
    description: "販売管理・工事管理・請求基盤へ抽出データを配信し、二重入力を削減する連携レイヤー。",
    eta: "6月予定",
    tags: ["API", "RPA", "Backoffice"],
  },
  {
    title: "分析メニュー",
    description: "OCR処理量だけでなく、業務負荷・品質改善・回線種別ごとの傾向分析に発展できる枠。",
    eta: "順次追加",
    tags: ["BI", "品質分析", "拡張基盤"],
  },
] as const;
