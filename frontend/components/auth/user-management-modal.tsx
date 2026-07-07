"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Trash2, ShieldCheck, User as UserIcon, KeyRound } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { useAuth } from "./auth-provider";

interface UserManagementModalProps {
  onClose: () => void;
}

export function UserManagementModal({ onClose }: UserManagementModalProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // パスワード再設定（管理者操作）
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // 新規追加フォーム
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<User[]>("/users");
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ユーザーの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          displayName: displayName || null,
          role,
          password,
        }),
      });
      // フォームをリセットして一覧を更新
      setEmail("");
      setDisplayName("");
      setRole("USER");
      setPassword("");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ユーザーの作成に失敗しました。");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (target: User) => {
    const confirmed = window.confirm(
      `ユーザー「${target.displayName || target.email}」を削除します。よろしいですか？`,
    );
    if (!confirmed) return;

    setError(null);
    try {
      await apiFetch(`/users/${target.id}`, { method: "DELETE" });
      await loadUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "削除に失敗しました。";
      setError(message);
      // 一覧の下の方を操作した場合、上部のエラー表示が見えないことがあるため明示する
      window.alert(message);
    }
  };

  const handleResetPassword = async (target: User) => {
    if (newPassword.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      return;
    }
    setError(null);
    setInfo(null);
    setResetLoading(true);
    try {
      await apiFetch(`/users/${target.id}/password`, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      });
      setInfo(
        `「${target.displayName || target.email}」のパスワードを再設定しました。本人に次のパスワードをお伝えください：${newPassword}`,
      );
      setResetTargetId(null);
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "パスワードの再設定に失敗しました。");
    } finally {
      setResetLoading(false);
    }
  };

  const canSubmit = email.trim() && password.length >= 8;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-100">ユーザー管理</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">
              {info}
            </div>
          )}

          {/* 新規追加フォーム */}
          <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-200">ユーザーを追加</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  メールアドレス
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                  placeholder="例: tanaka@example.co.jp"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  表示名（任意）
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                  placeholder="例: 田中太郎"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  権限
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                >
                  <option value="USER">一般ユーザー</option>
                  <option value="ADMIN">管理者</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  初期パスワード（8文字以上）
                </label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                  placeholder="本人に伝える仮パスワード"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              設定したパスワードを本人に伝えてください。本人はログイン後に「パスワード変更」から変更できます。
            </p>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canSubmit || creating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {creating ? "追加中..." : "追加する"}
              </button>
            </div>
          </div>

          {/* ユーザー一覧 */}
          <p className="mb-2 text-sm font-semibold text-slate-200">登録済みユーザー</p>
          {loading ? (
            <p className="text-sm text-slate-500">読み込み中...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-slate-500">ユーザーがいません。</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="rounded-lg border border-white/10 bg-white/5"
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.role === "ADMIN" ? (
                        <ShieldCheck className="h-4 w-4 text-cyan-400" />
                      ) : (
                        <UserIcon className="h-4 w-4 text-slate-400" />
                      )}
                      <div>
                        <p className="text-sm text-slate-100">
                          {u.displayName || u.email}
                          {u.id === currentUser?.id && (
                            <span className="ml-2 text-xs text-slate-500">(あなた)</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {u.email} ・ {u.role === "ADMIN" ? "管理者" : "一般ユーザー"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setResetTargetId(resetTargetId === u.id ? null : u.id);
                          setNewPassword("");
                          setError(null);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300"
                        title="パスワード再設定"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => handleDelete(u)}
                          className="inline-flex items-center gap-1 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          title="削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {resetTargetId === u.id && (
                    <div className="border-t border-white/10 px-4 py-3">
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        新しいパスワード（8文字以上）
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
                          placeholder="本人に伝える新しいパスワード"
                        />
                        <button
                          type="button"
                          onClick={() => handleResetPassword(u)}
                          disabled={newPassword.length < 8 || resetLoading}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
                        >
                          {resetLoading ? "設定中..." : "再設定する"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetTargetId(null);
                            setNewPassword("");
                          }}
                          className="rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
                        >
                          キャンセル
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        再設定後、このパスワードを本人にお伝えください。（既存のパスワードは確認できません）
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-white/10 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
