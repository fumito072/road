// ドラッグ&ドロップ／選択したファイルを、フォルダの中身まで再帰的にたどって集める共通処理。
// AI OCR / 経理OCR / 名簿照合 の各アップロードで共通利用する。

export type DroppedFile = { file: File; relativePath: string };

export const DEFAULT_ACCEPTED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "tif", "tiff"];

export function isAcceptedFile(name: string, accepted: string[] = DEFAULT_ACCEPTED_EXTENSIONS) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return accepted.includes(ext);
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function topFolderName(relativePath: string) {
  if (relativePath.includes("/")) {
    return relativePath.split("/")[0];
  }
  return "";
}

function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

async function readEntry(entry: FileSystemEntry, basePath: string): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
    return [{ file, relativePath: `${basePath}${entry.name}` }];
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const entries = await readAllDirectoryEntries(dirEntry.createReader());
    const nested = await Promise.all(
      entries.map((child) => readEntry(child, `${basePath}${entry.name}/`)),
    );
    return nested.flat();
  }

  return [];
}

export async function extractFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<DroppedFile[]> {
  const items = Array.from(dataTransfer.items ?? []).filter((item) => item.kind === "file");
  const entries = items
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (entries.length > 0) {
    const results = await Promise.all(entries.map((entry) => readEntry(entry, "")));
    return results.flat();
  }

  // フォルダ非対応の場合はファイルのみフォールバック
  return Array.from(dataTransfer.files ?? []).map((file) => ({
    file,
    relativePath: file.name,
  }));
}
