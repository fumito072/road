"use client";

import { LogOut } from "lucide-react";
import { useAuth } from "./auth-provider";

export function UserMenu() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  const label = user.displayName || user.email;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-[#d8e6ef] bg-white/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
      <span className="text-[#1e3247]">{label}</span>
      <button
        type="button"
        onClick={signOut}
        className="inline-flex items-center gap-1 rounded-md border border-[#d8e6ef] px-2 py-1 text-[#4c6478] hover:bg-[#f6fbff]"
        title="サインアウト"
      >
        <LogOut className="h-3 w-3" />
        サインアウト
      </button>
    </div>
  );
}
