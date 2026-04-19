"use client";

import type { ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { SignInScreen } from "./sign-in-screen";
import { UserMenu } from "./user-menu";

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6fbff]">
        <p className="text-sm text-[#4c6478]">読み込み中...</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <SignInScreen />;
  }

  return (
    <>
      {children}
      {status === "authenticated" && <UserMenu />}
    </>
  );
}
