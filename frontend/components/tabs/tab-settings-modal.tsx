"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Tab, NamingRule } from "@/lib/types";

interface TabSettingsModalProps {
  tab: Tab | null;
  isNew?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type EditableNamingRule = {
  id?: string;
  documentType: string;
  pattern: string;
  description: string;
  priority: number;
  _deleted?: boolean;
  _new?: boolean;
};

// ファイル名パターンに「ボタンで」差し込める項目（日本語ラベル付き）
const NAMING_PLACEHOLDERS = [
  { token: "{customerName}", label: "顧客名" },
  { token: "{contractNumber}", label: "契約番号" },
  { token: "{applicationNumber}", label: "申込番号" },
  { token: "{documentType}", label: "書類種別" },
  { token: "{index}", label: "連番" },
  { token: "{date}", label: "日付" },
];

// プレビュー表示用のサンプル値（実際の値ではなく見本）
const NAMING_SAMPLE: Record<string, string> = {
  "{customerName}": "山田太郎",
  "{contractNumber}": "0001234",
  "{applicationNumber}": "A5678",
  "{documentType}": "申込書",
  "{index}": "1",
  "{date}": "20260101",
};

function buildFileNamePreview(pattern: string): string {
  let result = pattern;
  for (const [token, value] of Object.entries(NAMING_SAMPLE)) {
    result = result.split(token).join(value);
  }
  return result;
}

export function TabSettingsModal({
  tab,
  isNew,
  onClose,
  onSaved,
}: TabSettingsModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [ocrPrompt, setOcrPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [namingRules, setNamingRules] = useState<EditableNamingRule[]>([]);
  const [activeSection, setActiveSection] = useState<"basic" | "naming">("basic");

  useEffect(() => {
    if (tab && !isNew) {
      setName(tab.name);
      setIcon(tab.icon ?? "folder");
      setOcrPrompt(tab.ocrPromptTemplate ?? "");
    }
  }, [tab, isNew]);

  useEffect(() => {
    if (tab?.id && !isNew) {
      void loadNamingRules(tab.id);
    }
  }, [tab?.id, isNew]);

  const loadNamingRules = async (tabId: string) => {
    const rules = await apiFetch<NamingRule[]>(`/naming-rules?tabId=${tabId}`);
    setNamingRules(
      rules.map((r) => ({
        id: r.id,
        documentType: r.documentType,
        pattern: r.pattern,
        description: r.description ?? "",
        priority: r.priority,
      })),
    );
  };

  const handleAddRule = useCallback(() => {
    setNamingRules((prev) => [
      ...prev,
      {
        documentType: "",
        pattern: "{customerName}_{contractNumber}_{documentType}.pdf",
        description: "",
        priority: prev.length,
        _new: true,
      },
    ]);
  }, []);

  const handleRemoveRule = useCallback((index: number) => {
    setNamingRules((prev) =>
      prev.map((rule, i) =>
        i === index
          ? rule.id
            ? { ...rule, _deleted: true }
            : { ...rule, _deleted: true }
          : rule,
      ),
    );
  }, []);

  const handleRuleChange = useCallback(
    (index: number, field: keyof EditableNamingRule, value: string | number) => {
      setNamingRules((prev) =>
        prev.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule)),
      );
    },
    [],
  );

  // ファイル名パターン入力欄ごとの現在のカーソル位置を覚えておく
  const patternCursor = useRef<Record<number, number>>({});

  const trackCursor = useCallback((index: number, el: HTMLInputElement) => {
    patternCursor.current[index] = el.selectionStart ?? el.value.length;
  }, []);

  // ボタンで選んだ項目を、カーソル位置に差し込む
  const insertPlaceholder = useCallback((index: number, token: string) => {
    setNamingRules((prev) =>
      prev.map((rule, i) => {
        if (i !== index) return rule;
        const pos = patternCursor.current[index] ?? rule.pattern.length;
        const nextPattern =
          rule.pattern.slice(0, pos) + token + rule.pattern.slice(pos);
        // 連続で押したときに正しい順序で挿入されるようカーソルを進める
        patternCursor.current[index] = pos + token.length;
        return { ...rule, pattern: nextPattern };
      }),
    );
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // SharePoint 設定とワークフロープロンプトは UI から編集しない。
      // body に含めないことで、既存タブの保存済みの値はそのまま保持される。
      const body = {
        name,
        icon,
        ocrPromptTemplate: ocrPrompt || null,
      };

      let savedTab: Tab;

      if (isNew) {
        savedTab = await apiFetch<Tab>("/tabs", {
          method: "POST",
          body: JSON.stringify(body),
        });
      } else if (tab) {
        savedTab = await apiFetch<Tab>(`/tabs/${tab.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        return;
      }

      // Save naming rules
      const activeRules = namingRules.filter((r) => !r._deleted);
      const deletedRules = namingRules.filter((r) => r._deleted && r.id);

      for (const rule of deletedRules) {
        await apiFetch(`/naming-rules/${rule.id}`, { method: "DELETE" });
      }

      for (const rule of activeRules) {
        const ruleBody = {
          tabId: savedTab.id,
          documentType: rule.documentType,
          pattern: rule.pattern,
          description: rule.description || null,
          priority: rule.priority,
        };

        if (rule._new || !rule.id) {
          await apiFetch("/naming-rules", {
            method: "POST",
            body: JSON.stringify(ruleBody),
          });
        } else {
          await apiFetch(`/naming-rules/${rule.id}`, {
            method: "PUT",
            body: JSON.stringify(ruleBody),
          });
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to save tab:", err);
      setError(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tab || isNew) return;
    const confirmed = window.confirm(
      `タブ「${tab.name}」を削除します。元に戻せません。よろしいですか？`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/tabs/${tab.id}`, { method: "DELETE" });
      onSaved();
      onClose();
    } catch (err) {
      // 処理済み書類があるタブはバックエンドがブロックし、その理由が err.message に入る
      console.error("Failed to delete tab:", err);
      setError(err instanceof Error ? err.message : "削除に失敗しました。");
    } finally {
      setDeleting(false);
    }
  };

  const iconOptions = [
    { value: "smartphone", label: "📱 スマートフォン" },
    { value: "zap", label: "⚡ 電力" },
    { value: "banknote", label: "💴 お金" },
    { value: "users", label: "👥 コラボ" },
    { value: "receipt", label: "🧾 領収書" },
    { value: "shield", label: "🛡️ シールド" },
    { value: "folder", label: "📁 フォルダ" },
    { value: "file-text", label: "📄 ファイル" },
  ];

  const sectionButton = (section: typeof activeSection, label: string) => (
    <button
      type="button"
      onClick={() => setActiveSection(section)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        activeSection === section
          ? "bg-cyan-600 text-white"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );

  const visibleRules = namingRules.filter((r) => !r._deleted);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-slate-900 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-100">
            {isNew ? "タブを追加" : "タブ設定"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-1 border-b border-white/10 px-6 py-2">
          {sectionButton("basic", "基本設定")}
          {sectionButton("naming", "命名規則")}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {activeSection === "basic" && (
            <div className="space-y-5">
              {/* Basic */}
              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    タブ名
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                    placeholder="例: モバイル"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    アイコン
                  </label>
                  <select
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                  >
                    {iconOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* OCR Prompt */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  OCR プロンプトテンプレート
                </label>
                <textarea
                  value={ocrPrompt}
                  onChange={(e) => setOcrPrompt(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                  placeholder="Gemini API に送る OCR 補足指示（空欄の場合はデフォルトプロンプト）"
                />
              </div>
            </div>
          )}

          {activeSection === "naming" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">ファイル命名規則</p>
                  <p className="mt-1 text-xs text-slate-400">
                    書類種別ごとにファイル名のパターンを定義します。OCR 処理時に AI がこのルールに基づいて各ファイルを分類し命名します。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddRule}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
                >
                  <Plus className="h-4 w-4" />
                  追加
                </button>
              </div>

              {visibleRules.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 px-5 py-8 text-center text-sm text-slate-500">
                  命名規則が未設定です。「追加」ボタンから新しいルールを作成してください。
                  <br />
                  <span className="text-xs">未設定の場合、AI がデフォルトの命名規則を使用します。</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {namingRules.map((rule, index) =>
                    rule._deleted ? null : (
                      <div
                        key={rule.id ?? `new-${index}`}
                        className="rounded-lg border border-white/10 bg-white/5 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            ルール {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRule(index)}
                            className="inline-flex items-center gap-1 rounded-lg p-1 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">
                              書類種別
                            </label>
                            <input
                              type="text"
                              value={rule.documentType}
                              onChange={(e) =>
                                handleRuleChange(index, "documentType", e.target.value)
                              }
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                              placeholder="例: 申込書"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-medium text-slate-400">
                              ファイル名
                            </label>
                            <input
                              type="text"
                              value={rule.pattern}
                              onChange={(e) => {
                                trackCursor(index, e.currentTarget);
                                handleRuleChange(index, "pattern", e.target.value);
                              }}
                              onSelect={(e) => trackCursor(index, e.currentTarget)}
                              onClick={(e) => trackCursor(index, e.currentTarget)}
                              onKeyUp={(e) => trackCursor(index, e.currentTarget)}
                              onFocus={(e) => trackCursor(index, e.currentTarget)}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                              placeholder="下のボタンを押して項目を追加してください"
                            />
                            {/* ボタンで項目を差し込む */}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-slate-500">挿入:</span>
                              {NAMING_PLACEHOLDERS.map((ph) => (
                                <button
                                  type="button"
                                  key={ph.token}
                                  onClick={() => insertPlaceholder(index, ph.token)}
                                  className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
                                >
                                  {ph.label}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => insertPlaceholder(index, "_")}
                                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-white/10"
                              >
                                _ （区切り）
                              </button>
                              <button
                                type="button"
                                onClick={() => insertPlaceholder(index, ".pdf")}
                                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-white/10"
                              >
                                .pdf
                              </button>
                            </div>
                            {/* 実際のファイル名プレビュー */}
                            <p className="mt-2 text-xs text-slate-400">
                              プレビュー:{" "}
                              <span className="font-mono text-slate-200">
                                {rule.pattern
                                  ? buildFileNamePreview(rule.pattern)
                                  : "（未設定）"}
                              </span>
                            </p>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-medium text-slate-400">
                              AIヒント（この種別を特定するための特徴）
                            </label>
                            <input
                              type="text"
                              value={rule.description}
                              onChange={(e) =>
                                handleRuleChange(index, "description", e.target.value)
                              }
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                              placeholder="例: ヘッダーに「申込書」の文字がある書類"
                            />
                          </div>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}

              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 text-xs text-slate-500">
                <p className="font-semibold text-slate-400 mb-2">挿入できる項目の意味:</p>
                <ul className="space-y-1">
                  <li>・<span className="text-slate-300">顧客名</span> … 書類から読み取ったお客様の名前</li>
                  <li>・<span className="text-slate-300">契約番号</span> … 書類の契約番号</li>
                  <li>・<span className="text-slate-300">申込番号</span> … 書類の申込番号</li>
                  <li>・<span className="text-slate-300">書類種別</span> … 上で設定した「書類種別」（例: 申込書）</li>
                  <li>・<span className="text-slate-300">連番</span> … 同じ種類が複数あるときの番号（1, 2, 3…）</li>
                  <li>・<span className="text-slate-300">日付</span> … 書類の日付</li>
                </ul>
                <p className="mt-2">
                  「挿入」のボタンを押すと、ファイル名に項目が追加されます。実際にどんな名前になるかは「プレビュー」で確認できます。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mx-6 mb-1 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
          {/* 自分で追加したタブ（既定でない）だけ削除可。既定タブは復活するため出さない */}
          <div>
            {!isNew && tab && !tab.isDefault && (
              <button
                onClick={handleDelete}
                disabled={deleting || saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "削除中..." : "このタブを削除"}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving || deleting}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
