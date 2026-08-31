export type MemberCheckMatch = {
  source: "contact" | "torihikisaki_tantou";
  sourceLabel: string;
  id: string;
  name: string;
  kana: string | null;
  company: string | null;
  url: string;
};

export type MemberCheckSalesforce = {
  configured: boolean;
  query: string;
  lastName: string;
  firstName: string;
  exists: boolean;
  matchCount: number;
  matches: MemberCheckMatch[];
};

export type MemberCheckPersonResult = {
  group: string;
  lastName: string;
  firstName: string;
  fullName: string;
  kana: string;
  handicap: string;
  note: string;
  salesforce: MemberCheckSalesforce;
};

export type MemberCheckResult = {
  totalPeople: number;
  matchedCount: number;
  confidence: number;
  salesforceConfigured: boolean;
  people: MemberCheckPersonResult[];
};

type ExportOptions = {
  sourceFileNames?: string[];
  generatedAt?: Date;
  /** 画面の絞り込み状態（例: 「該当のみ」）。出力が名簿全体でない場合に明記する。 */
  filterLabel?: string;
};

type ExportStatus = "該当あり" | "複数候補" | "未登録";

const COLOR = {
  ink: "#1f2b37",
  muted: "#6a7684",
  line: "#dce4eb",
  panel: "#f7f9fb",
  teal: "#12919b",
  tealSoft: "#eafaf7",
  amber: "#8a6732",
  amberSoft: "#fff7e5",
  graySoft: "#f1f4f7",
  white: "#ffffff",
};

function statusOf(person: MemberCheckPersonResult): ExportStatus {
  if (!person.salesforce.exists) return "未登録";
  return person.salesforce.matchCount > 1 ? "複数候補" : "該当あり";
}

function displayName(person: MemberCheckPersonResult) {
  return person.fullName || [person.lastName, person.firstName].filter(Boolean).join(" ");
}

function candidateSummary(person: MemberCheckPersonResult) {
  return person.salesforce.matches
    .map((match) =>
      [match.sourceLabel, match.name, match.company ? `(${match.company})` : ""]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}

function formatTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function exportFileName(extension: "pdf" | "xlsx", generatedAt: Date) {
  return `名簿照合結果_${formatTimestamp(generatedAt)}.${extension}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportMemberCheckExcel(
  result: MemberCheckResult,
  options: ExportOptions = {},
) {
  const ExcelJS = await import("exceljs");
  const generatedAt = options.generatedAt ?? new Date();
  const fileName = exportFileName("xlsx", generatedAt);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Road 名簿照合";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;

  const sheet = workbook.addWorksheet("照合結果", {
    views: [{ state: "frozen", ySplit: 6 }],
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  sheet.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];

  sheet.mergeCells("A1:K1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "名簿照合結果";
  titleCell.font = { name: "Yu Gothic", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F2F31" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 34;

  sheet.getCell("A2").value = "出力日時";
  sheet.getCell("B2").value = generatedAt;
  sheet.getCell("B2").numFmt = "yyyy-mm-dd hh:mm:ss";
  sheet.getCell("D2").value = "対象ファイル";
  sheet.mergeCells("E2:K2");
  sheet.getCell("E2").value = options.sourceFileNames?.join(" / ") || "-";
  sheet.getCell("E2").alignment = { wrapText: true, vertical: "middle" };

  // 絞り込んで出力した場合、何を出したのかが後から分かるようにしておく。
  sheet.getCell("A3").value = "表示条件";
  sheet.mergeCells("B3:K3");
  sheet.getCell("B3").value = options.filterLabel || "すべて";
  sheet.getCell("B3").alignment = { vertical: "middle" };

  const firstDataRow = 7;
  const lastDataRow = Math.max(firstDataRow, firstDataRow + result.people.length - 1);
  const summary = [
    { label: "抽出人数", column: "A", valueColumn: "B", formula: `COUNTA(E${firstDataRow}:E${lastDataRow})`, result: result.totalPeople },
    {
      label: "該当（登録済み）",
      column: "D",
      valueColumn: "E",
      formula: `COUNTIF(I${firstDataRow}:I${lastDataRow},"該当あり")+COUNTIF(I${firstDataRow}:I${lastDataRow},"複数候補")`,
      result: result.matchedCount,
    },
    {
      label: "未登録",
      column: "G",
      valueColumn: "H",
      formula: `COUNTIF(I${firstDataRow}:I${lastDataRow},"未登録")`,
      result: result.totalPeople - result.matchedCount,
    },
  ];
  for (const item of summary) {
    const label = sheet.getCell(`${item.column}4`);
    const value = sheet.getCell(`${item.valueColumn}4`);
    label.value = item.label;
    value.value = { formula: item.formula, result: item.result };
    label.font = { name: "Yu Gothic", bold: true, color: { argb: "FF566575" } };
    value.font = { name: "Yu Gothic", size: 16, bold: true, color: { argb: "FF12919B" } };
    label.fill = value.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F8FA" } };
    label.alignment = value.alignment = { vertical: "middle", horizontal: "center" };
  }
  sheet.getRow(4).height = 30;

  const headers = ["No.", "組", "姓", "名", "氏名", "フリガナ", "HDCP", "メモ", "照合結果", "候補数", "Salesforce候補"];
  const headerRow = sheet.getRow(6);
  headerRow.values = headers;
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Yu Gothic", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12919B" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  result.people.forEach((person, index) => {
    const row = sheet.getRow(firstDataRow + index);
    row.values = [
      index + 1,
      person.group,
      person.lastName,
      person.firstName,
      displayName(person),
      person.kana,
      person.handicap,
      person.note,
      statusOf(person),
      person.salesforce.matchCount,
      candidateSummary(person),
    ];
    row.height = Math.max(24, 18 * Math.min(5, Math.max(1, person.salesforce.matches.length)));
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: "Yu Gothic", size: 10, color: { argb: "FF263544" } };
      cell.alignment = {
        vertical: "top",
        horizontal: [1, 2, 7, 9, 10].includes(columnNumber) ? "center" : "left",
        wrapText: true,
      };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EB" } } };
    });

    const statusCell = row.getCell(9);
    const status = statusOf(person);
    const statusStyle =
      status === "該当あり"
        ? { fill: "FFEAF9F6", font: "FF147A73" }
        : status === "複数候補"
          ? { fill: "FFFFF7E5", font: "FF8A6732" }
          : { fill: "FFF1F4F7", font: "FF667788" };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.fill } };
    statusCell.font = { name: "Yu Gothic", size: 10, bold: true, color: { argb: statusStyle.font } };
  });

  sheet.autoFilter = { from: "A6", to: `K${lastDataRow}` };
  const widths = [7, 8, 12, 12, 19, 19, 9, 24, 14, 9, 48];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.getColumn(1).numFmt = "0";
  sheet.getColumn(10).numFmt = "0";
  sheet.headerFooter.oddFooter = "名簿照合結果 - &P / &N";

  const details = workbook.addWorksheet("Salesforce候補詳細", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  details.views = [{ state: "frozen", ySplit: 3, showGridLines: false }];
  details.mergeCells("A1:H1");
  details.getCell("A1").value = "Salesforce候補詳細";
  details.getCell("A1").font = { name: "Yu Gothic", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  details.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F2F31" } };
  details.getCell("A1").alignment = { vertical: "middle" };
  details.getRow(1).height = 32;

  const detailHeaders = ["名簿No.", "名簿氏名", "照合結果", "種別", "候補氏名", "フリガナ", "会社名", "Salesforce"];
  const detailHeaderRow = details.getRow(3);
  detailHeaderRow.values = detailHeaders;
  detailHeaderRow.height = 28;
  detailHeaderRow.eachCell((cell) => {
    cell.font = { name: "Yu Gothic", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12919B" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  let detailRowNumber = 4;
  result.people.forEach((person, personIndex) => {
    person.salesforce.matches.forEach((match) => {
      const row = details.getRow(detailRowNumber);
      row.values = [
        personIndex + 1,
        displayName(person),
        statusOf(person),
        match.sourceLabel,
        match.name,
        match.kana ?? "",
        match.company ?? "",
        { text: "開く", hyperlink: match.url },
      ];
      row.eachCell((cell, columnNumber) => {
        cell.font = { name: "Yu Gothic", size: 10, color: { argb: columnNumber === 8 ? "FF0078D4" : "FF263544" }, underline: columnNumber === 8 };
        cell.alignment = { vertical: "top", wrapText: true };
        cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EB" } } };
      });
      detailRowNumber += 1;
    });
  });
  if (detailRowNumber === 4) {
    details.mergeCells("A4:H4");
    details.getCell("A4").value = "Salesforce候補はありません。";
    details.getCell("A4").font = { name: "Yu Gothic", color: { argb: "FF6A7684" } };
    details.getCell("A4").alignment = { vertical: "middle", horizontal: "center" };
    details.getRow(4).height = 28;
  } else {
    details.autoFilter = { from: "A3", to: `H${detailRowNumber - 1}` };
  }
  [10, 20, 14, 18, 22, 20, 28, 14].forEach((width, index) => {
    details.getColumn(index + 1).width = width;
  });
  details.headerFooter.oddFooter = "Salesforce候補詳細 - &P / &N";

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([new Uint8Array(buffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName,
  );
  return fileName;
}

function createPdfCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1684;
  canvas.height = 1190;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PDF描画用の画面を初期化できませんでした。");
  context.textBaseline = "middle";
  return { canvas, context };
}

function setCanvasFont(
  context: CanvasRenderingContext2D,
  size: number,
  weight: 400 | 500 | 600 | 700 = 400,
) {
  context.font = `${weight} ${size}px "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif`;
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const paragraphs = String(value || "-").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const char of paragraph) {
      const candidate = `${line}${char}`;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : ["-"];
}

function drawTextLines(
  context: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
) {
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
}

export async function exportMemberCheckPdf(
  result: MemberCheckResult,
  options: ExportOptions = {},
) {
  const { jsPDF } = await import("jspdf");
  const generatedAt = options.generatedAt ?? new Date();
  const fileName = exportFileName("pdf", generatedAt);
  const pageWidth = 1684;
  const pageHeight = 1190;
  const margin = 56;
  const contentWidth = pageWidth - margin * 2;
  const columns = [
    { label: "No.", width: 55 },
    { label: "組", width: 65 },
    { label: "氏名", width: 190 },
    { label: "フリガナ", width: 180 },
    { label: "HDCP", width: 80 },
    { label: "メモ", width: 230 },
    { label: "照合結果", width: 120 },
    { label: "Salesforce候補", width: 652 },
  ];
  const pages: Array<{ canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }> = [];

  const addPage = (firstPage: boolean) => {
    const page = createPdfCanvas();
    pages.push(page);
    const { context } = page;
    context.fillStyle = COLOR.white;
    context.fillRect(0, 0, pageWidth, pageHeight);

    context.fillStyle = "#2f2f31";
    context.fillRect(0, 0, pageWidth, firstPage ? 118 : 86);
    context.fillStyle = COLOR.white;
    setCanvasFont(context, firstPage ? 38 : 28, 700);
    context.fillText("名簿照合結果", margin, firstPage ? 58 : 43);
    setCanvasFont(context, 19, 400);
    context.textAlign = "right";
    context.fillText(`出力日時 ${formatDateTime(generatedAt)}`, pageWidth - margin, firstPage ? 58 : 43);
    context.textAlign = "left";

    let tableTop = 118;
    if (firstPage) {
      const sourceFiles = options.sourceFileNames?.join(" / ") || "-";
      context.fillStyle = COLOR.muted;
      setCanvasFont(context, 19, 400);
      const sourceLines = wrapText(context, `対象ファイル: ${sourceFiles}`, contentWidth);
      drawTextLines(context, sourceLines, margin, 145, 26);

      // 絞り込んで出力した場合、何を出したのかが後から分かるようにしておく。
      const filterTop = 145 + sourceLines.length * 26;
      drawTextLines(
        context,
        wrapText(context, `表示条件: ${options.filterLabel || "すべて"}`, contentWidth),
        margin,
        filterTop,
        26,
      );

      const cardsTop = 196 + Math.max(0, sourceLines.length - 1) * 26;
      const gap = 20;
      const cardWidth = (contentWidth - gap * 2) / 3;
      const cards = [
        { label: "抽出人数", value: result.totalPeople, bg: COLOR.panel, fg: COLOR.ink },
        { label: "該当（登録済み）", value: result.matchedCount, bg: COLOR.tealSoft, fg: COLOR.teal },
        { label: "未登録", value: result.totalPeople - result.matchedCount, bg: COLOR.graySoft, fg: COLOR.muted },
      ];
      cards.forEach((card, index) => {
        const x = margin + index * (cardWidth + gap);
        context.fillStyle = card.bg;
        context.fillRect(x, cardsTop, cardWidth, 92);
        context.fillStyle = COLOR.muted;
        setCanvasFont(context, 18, 600);
        context.fillText(card.label, x + 22, cardsTop + 28);
        context.fillStyle = card.fg;
        setCanvasFont(context, 34, 700);
        context.fillText(`${card.value}名`, x + 22, cardsTop + 66);
      });
      tableTop = cardsTop + 118;
    }

    context.fillStyle = COLOR.teal;
    context.fillRect(margin, tableTop, contentWidth, 50);
    context.fillStyle = COLOR.white;
    setCanvasFont(context, 18, 700);
    context.textAlign = "center";
    let x = margin;
    columns.forEach((column) => {
      context.fillText(column.label, x + column.width / 2, tableTop + 25);
      x += column.width;
    });
    context.textAlign = "left";
    return { ...page, nextY: tableTop + 50 };
  };

  let active = addPage(true);
  const bottomLimit = pageHeight - 66;
  result.people.forEach((person, index) => {
    const values = [
      String(index + 1),
      person.group || "-",
      displayName(person),
      person.kana || "-",
      person.handicap || "-",
      person.note || "-",
      statusOf(person),
      candidateSummary(person) || "-",
    ];
    const fontSizes = [18, 18, 20, 18, 18, 18, 18, 17];
    const alignments: Array<"left" | "center"> = ["center", "center", "left", "left", "center", "left", "center", "left"];
    const lineHeight = 25;

    const prepareLines = (context: CanvasRenderingContext2D) =>
      values.map((value, columnIndex) => {
        setCanvasFont(context, fontSizes[columnIndex], columnIndex === 2 ? 600 : 400);
        return wrapText(context, value, columns[columnIndex].width - 24);
      });

    let lines = prepareLines(active.context);
    let rowHeight = Math.max(54, Math.max(...lines.map((item) => item.length)) * lineHeight + 20);
    if (active.nextY + rowHeight > bottomLimit) {
      active = addPage(false);
      lines = prepareLines(active.context);
      rowHeight = Math.max(54, Math.max(...lines.map((item) => item.length)) * lineHeight + 20);
    }

    const { context } = active;
    context.fillStyle = index % 2 === 0 ? COLOR.white : "#fafbfd";
    context.fillRect(margin, active.nextY, contentWidth, rowHeight);
    context.strokeStyle = COLOR.line;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(margin, active.nextY + rowHeight);
    context.lineTo(pageWidth - margin, active.nextY + rowHeight);
    context.stroke();

    let x = margin;
    columns.forEach((column, columnIndex) => {
      const status = columnIndex === 6 ? statusOf(person) : null;
      if (status) {
        context.fillStyle =
          status === "該当あり" ? COLOR.tealSoft : status === "複数候補" ? COLOR.amberSoft : COLOR.graySoft;
        context.fillRect(x + 8, active.nextY + 10, column.width - 16, Math.min(36, rowHeight - 20));
      }
      context.fillStyle =
        status === "該当あり" ? COLOR.teal : status === "複数候補" ? COLOR.amber : COLOR.ink;
      setCanvasFont(context, fontSizes[columnIndex], columnIndex === 2 || status ? 600 : 400);
      const textY = active.nextY + 20 + lineHeight / 2;
      if (alignments[columnIndex] === "center") {
        context.textAlign = "center";
        lines[columnIndex].forEach((line, lineIndex) => {
          context.fillText(line, x + column.width / 2, textY + lineIndex * lineHeight);
        });
      } else {
        context.textAlign = "left";
        drawTextLines(context, lines[columnIndex], x + 12, textY, lineHeight);
      }
      x += column.width;
    });
    context.textAlign = "left";
    active.nextY += rowHeight;
  });

  pages.forEach((page, index) => {
    page.context.fillStyle = COLOR.muted;
    setCanvasFont(page.context, 16, 400);
    page.context.textAlign = "center";
    page.context.fillText(`${index + 1} / ${pages.length}`, pageWidth / 2, pageHeight - 30);
    page.context.textAlign = "left";
  });

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage("a4", "landscape");
    pdf.addImage(page.canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 297, 210, undefined, "FAST");
  });
  pdf.setProperties({ title: "名簿照合結果", creator: "Road 名簿照合" });
  pdf.save(fileName);
  return fileName;
}
