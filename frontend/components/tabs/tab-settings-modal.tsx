"use client";

import { useState, useEffect, useCallback } from "react";
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

export function TabSettingsModal({
  tab,
  isNew,
  onClose,
  onSaved,
}: TabSettingsModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [ocrPrompt, setOcrPrompt] = useState("");
  const [workflowPrompt, setWorkflowPrompt] = useState("");
  const [spSiteId, setSpSiteId] = useState("");
  const [spDriveId, setSpDriveId] = useState("");
  const [spFolderPath, setSpFolderPath] = useState("");
  const [saving, setSaving] = useState(false);

  const [namingRules, setNamingRules] = useState<EditableNamingRule[]>([]);
  const [activeSection, setActiveSection] = useState<"basic" | "sharepoint" | "naming">("basic");

  useEffect(() => {
    if (tab && !isNew) {
      setName(tab.name);
      setIcon(tab.icon ?? "folder");
      setOcrPrompt(tab.ocrPromptTemplate ?? "");
      setWorkflowPrompt(tab.workflowPromptTemplate ?? "");
      setSpSiteId(tab.sharepointSiteId ?? "");
      setSpDriveId(tab.sharepointDriveId ?? "");
      setSpFolderPath(tab.sharepointFolderPath ?? "");
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        name,
        icon,
        ocrPromptTemplate: ocrPrompt || null,
        workflowPromptTemplate: workflowPrompt || null,
        sharepointSiteId: spSiteId || null,
        sharepointDriveId: spDriveId || null,
        sharepointFolderPath: spFolderPath || null,
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
    } finally {
      setSaving(false);
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
          {sectionButton("sharepoint", "SharePoint")}
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

              {/* Workflow Prompt */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  ワークフロープロンプトテンプレート
                </label>
                <textarea
                  value={workflowPrompt}
                  onChange={(e) => setWorkflowPrompt(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                  placeholder="アップロード後の処理指示テンプレート"
                />
              </div>
            </div>
          )}

          {activeSection === "sharepoint" && (
            <div className="space-y-5">
              <p className="text-sm text-slate-400">
                このタブから保存するファイルの SharePoint 出力先を指定します。
              </p>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  サイト ID
                </label>
                <input
                  type="text"
                  value={spSiteId}
                  onChange={(e) => setSpSiteId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                  placeholder="例: load1993.sharepoint.com,3a7ec12f,..."
                />
                <p className="mt-1 text-xs text-slate-500">Graph API の Site ID</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  ドライブ ID
                </label>
                <input
                  type="text"
                  value={spDriveId}
                  onChange={(e) => setSpDriveId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                  placeholder="例: b!L8F-OnwhAkmJ82Lc0eIxN..."
                />
                <p className="mt-1 text-xs text-slate-500">空欄の場合はサイトのデフォルトドライブを使用</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  ベースフォルダパス
                </label>
                <input
                  type="text"
                  value={spFolderPath}
                  onChange={(e) => setSpFolderPath(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                  placeholder="例: ROAD-OCR/モバイル"
                />
                <p className="mt-1 text-xs text-slate-500">
                  この配下に「顧客名/契約ID」フォルダが自動生成されます
                </p>
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
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-400">
                              ファイル名パターン
                            </label>
                            <input
                              type="text"
                              value={rule.pattern}
                              onChange={(e) =>
                                handleRuleChange(index, "pattern", e.target.value)
                              }
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                              placeholder="例: {customerName}_{contractNumber}_申込書.pdf"
                            />
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
                <p className="font-semibold text-slate-400 mb-1">使用可能なプレースホルダー:</p>
                <code className="text-cyan-400">
                  {"{customerName}"} {"{contractNumber}"} {"{applicationNumber}"} {"{documentType}"} {"{index}"} {"{date}"}
                </code>
                <p className="mt-1">例: <code className="text-slate-300">{"{customerName}_{contractNumber}_申込書.pdf"}</code></p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
