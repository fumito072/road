"use client";

import { useState } from "react";
import { LogOut, ChevronUp, Users, KeyRound } from "lucide-react";
import { useAuth } from "./auth-provider";
import { UserManagementModal } from "./user-management-modal";
import { ChangePasswordModal } from "./change-password-modal";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!user) return null;

  const label = user.displayName || user.email;
  const isAdmin = user.role === "ADMIN";

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        {/* ドロップダウンメニュー（上方向に開く） */}
        {open && (
          <div className="absolute bottom-full right-0 mb-2 w-52 overflow-hidden rounded-lg border border-[#d8e6ef] bg-white shadow-lg">
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setShowUsers(true);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-[#33485c] hover:bg-[#f6fbff]"
              >
                <Users className="h-3.5 w-3.5" />
                ユーザー管理
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowPassword(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-[#33485c] hover:bg-[#f6fbff]"
            >
              <KeyRound className="h-3.5 w-3.5" />
              パスワード変更
            </button>
            <div className="border-t border-[#eef3f7]" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-[#c0492f] hover:bg-[#fff5f3]"
            >
              <LogOut className="h-3.5 w-3.5" />
              サインアウト
            </button>
          </div>
        )}

        {/* ユーザーピル（クリックでメニュー開閉） */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-[#d8e6ef] bg-white/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur transition-colors hover:bg-white"
        >
          <span className="text-[#1e3247]">{label}</span>
          <span className="rounded-full bg-[#eef5f9] px-2 py-0.5 text-[10px] font-semibold text-[#607083]">
            {isAdmin ? "管理者" : "ユーザー"}
          </span>
          <ChevronUp
            className={`h-3 w-3 text-[#4c6478] transition-transform ${open ? "" : "rotate-180"}`}
          />
        </button>
      </div>

      {showUsers && <UserManagementModal onClose={() => setShowUsers(false)} />}
      {showPassword && (
        <ChangePasswordModal onClose={() => setShowPassword(false)} />
      )}
    </>
  );
}
