"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./auth-provider";

export function SignInScreen() {
  const { signIn, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await signIn(email, password);
    } catch {
      // error surfaced via context
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6fbff] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white border border-[#d8e6ef] rounded-2xl shadow-sm p-8 space-y-5"
      >
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-[#1e3247]">ROAD OCR Hub</h1>
          <p className="text-sm text-[#4c6478]">サインインして利用してください</p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-[#4c6478]">メールアドレス</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[#d8e6ef] bg-white px-3 py-2 text-sm text-[#1e3247] placeholder-[#9eb0c0] outline-none [color-scheme:light] focus:border-[#7aa6c5] focus:ring-1 focus:ring-[#7aa6c5]"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-[#4c6478]">パスワード</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-[#d8e6ef] bg-white px-3 py-2 text-sm text-[#1e3247] placeholder-[#9eb0c0] outline-none [color-scheme:light] focus:border-[#7aa6c5] focus:ring-1 focus:ring-[#7aa6c5]"
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting || !email || !password}
          className="w-full inline-flex items-center justify-center rounded-lg bg-[#2f2f31] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1e3247] disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {isSubmitting ? "サインイン中..." : "サインイン"}
        </button>

        {error && (
          <p className="text-xs text-[#b43a6a] text-center">{error}</p>
        )}
      </form>
    </div>
  );
}
