/**
 * 名簿画像・PDFを、AIが読める大きさのタイルへ自動分割する。
 *
 * Gemini は画像を一定のトークン量まで圧縮してから読むため、1枚に詰め込むほど
 * 1文字あたりの解像度が落ちる。A4横に296名の帳票を1枚で渡すと文字が潰れ、
 * 同じ人物を生成し続ける繰り返しループに陥って読み取りが破綻する（実測）。
 * 事前に分割して渡すと同じ帳票が正しく読める（実測 295/296名・重複ほぼ無し）。
 *
 * 分割はブラウザ側で行う。名簿照合APIは複数ファイルを1つの結果へ統合するため、
 * タイルを個別ファイルとして送るだけでよく、サーバ側の変更が要らない。
 */

/** 1タイルの目標画素数。実測で正しく読めた 1240x2981 ≒ 3.7M を基準にする。 */
const TARGET_TILE_AREA = 4_000_000;
/** これ以下なら分割しない。 */
const MIN_SPLIT_AREA = 6_000_000;
/** 切断位置を探す窓（長辺に対する割合）。 */
const SNAP_RATIO = 0.06;
/** 分割しすぎるとAPI呼び出しが増えるso上限を設ける。 */
const MAX_TILES_PER_PAGE = 8;
/** PDFの描画解像度。文字が潰れない範囲でできるだけ高く。 */
const PDF_RENDER_SCALE = 300 / 72;

export type SplitResult = {
  files: File[];
  /** 分割が発生したか（UIの案内に使う）。 */
  didSplit: boolean;
  /** 元ファイル1件あたりの分割枚数。 */
  tileCount: number;
};

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** PDFの各ページをキャンバスへ描画する。 */
async function renderPdfPages(file: File): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");
  // ワーカーは public/ に配置したものを使う。
  // v3 系は JBIG2 を JS でデコードするため、スキャンPDFでも wasm の配布が要らない。
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const canvases: HTMLCanvasElement[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    canvases.push(canvas);
  }

  return canvases;
}

/** 画像ファイルをキャンバスへ載せる。 */
async function renderImage(file: File): Promise<HTMLCanvasElement[]> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return [canvas];
}

/**
 * 切断位置を決める。
 *
 * 等間隔で切ると氏名の途中を割ってしまうため、目標位置の近くで
 * 「十分に余白がある位置」を探してそこへスナップする。
 * 単に最も白い位置を選ぶとタイル幅が偏るので、白い候補の中から
 * 目標位置に最も近いものを採用する。
 */
function findCuts(ink: number[], length: number, tiles: number): number[] {
  const cuts: number[] = [];
  const window = Math.max(1, Math.floor(length * SNAP_RATIO));

  for (let i = 1; i < tiles; i += 1) {
    const target = Math.round((length * i) / tiles);
    const lo = Math.max(1, target - window);
    const hi = Math.min(length - 1, target + window);

    let floor = Number.POSITIVE_INFINITY;
    for (let x = lo; x < hi; x += 1) floor = Math.min(floor, ink[x]);

    const tolerance = Math.max(floor + 2, Math.floor(floor * 1.5));
    let best = target;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let x = lo; x < hi; x += 1) {
      if (ink[x] > tolerance) continue;
      const distance = Math.abs(x - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = x;
      }
    }
    cuts.push(best);
  }

  return cuts;
}

/** 長辺方向のインク量（暗い画素の数）を数える。 */
function inkProfile(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  horizontal: boolean,
): number[] {
  const length = horizontal ? width : height;
  const other = horizontal ? height : width;
  const profile = new Array<number>(length).fill(0);
  // 4画素おきで十分（速度優先）。
  for (let i = 0; i < length; i += 1) {
    let count = 0;
    for (let j = 0; j < other; j += 4) {
      const x = horizontal ? i : j;
      const y = horizontal ? j : i;
      if (data[(y * width + x) * 4] < 160) count += 1;
    }
    profile[i] = count;
  }
  return profile;
}

function canvasToFile(
  source: HTMLCanvasElement,
  rect: { x: number; y: number; w: number; h: number },
  name: string,
): Promise<File> {
  const tile = document.createElement("canvas");
  tile.width = rect.w;
  tile.height = rect.h;
  tile
    .getContext("2d")
    ?.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

  return new Promise((resolve) => {
    tile.toBlob((blob) => {
      resolve(new File([blob as Blob], name, { type: "image/png" }));
    }, "image/png");
  });
}

/** 1ページ分のキャンバスをタイルへ切る。 */
async function splitCanvas(
  canvas: HTMLCanvasElement,
  baseName: string,
  pageLabel: string,
): Promise<File[]> {
  const { width, height } = canvas;
  const area = width * height;

  if (area <= MIN_SPLIT_AREA) {
    return [await canvasToFile(canvas, { x: 0, y: 0, w: width, h: height }, `${baseName}${pageLabel}.png`)];
  }

  const tiles = Math.min(MAX_TILES_PER_PAGE, Math.max(2, Math.round(area / TARGET_TILE_AREA)));
  const horizontal = width >= height; // 長辺方向に切る
  const context = canvas.getContext("2d");
  if (!context) {
    return [await canvasToFile(canvas, { x: 0, y: 0, w: width, h: height }, `${baseName}${pageLabel}.png`)];
  }

  const { data } = context.getImageData(0, 0, width, height);
  const profile = inkProfile(data, width, height, horizontal);
  const cuts = findCuts(profile, horizontal ? width : height, tiles);
  const bounds = [0, ...cuts, horizontal ? width : height];

  const files: File[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const from = bounds[i];
    const to = bounds[i + 1];
    if (to - from < 10) continue;
    const rect = horizontal
      ? { x: from, y: 0, w: to - from, h: height }
      : { x: 0, y: from, w: width, h: to - from };
    files.push(await canvasToFile(canvas, rect, `${baseName}${pageLabel}-${i + 1}.png`));
  }

  return files;
}

/**
 * 名簿ファイルを読み取りやすい大きさへ分割する。
 * 分割できない場合（未対応形式・描画失敗など）は元のファイルをそのまま返す。
 */
export async function splitRosterFile(file: File): Promise<SplitResult> {
  try {
    const canvases = isPdf(file) ? await renderPdfPages(file) : await renderImage(file);
    if (canvases.length === 0) {
      return { files: [file], didSplit: false, tileCount: 1 };
    }

    const baseName = file.name.replace(/\.[^.]+$/, "");
    const files: File[] = [];
    for (let i = 0; i < canvases.length; i += 1) {
      const pageLabel = canvases.length > 1 ? `-p${i + 1}` : "";
      files.push(...(await splitCanvas(canvases[i], baseName, pageLabel)));
    }

    if (files.length === 0) {
      return { files: [file], didSplit: false, tileCount: 1 };
    }

    return { files, didSplit: files.length > 1, tileCount: files.length };
  } catch {
    // 分割は精度向上のための前処理。失敗しても元ファイルで読み取りは続行できる。
    return { files: [file], didSplit: false, tileCount: 1 };
  }
}
