"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import { apiFetch, setTokenGetter } from "@/lib/api";

type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "road.auth.token";

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

function writeStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    window.sessionStorage.removeItem(TOKEN_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTokenGetter(async () => token);
    return () => setTokenGetter(null);
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!token) {
        setStatus("unauthenticated");
        return;
      }
      try {
        const res = await apiFetch<{ user: SessionUser }>("/auth/me");
        if (cancelled) return;
        setUser(res.user);
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        writeStoredToken(null);
        setToken(null);
        setUser(null);
        setStatus("unauthenticated");
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const res = await apiFetch<{ token: string; user: SessionUser }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
      );
      writeStoredToken(res.token);
      setToken(res.token);
      setUser(res.user);
      setStatus("authenticated");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "サインインに失敗しました";
      setError(message);
      throw err;
    }
  }, []);

  const signOut = useCallback(() => {
    writeStoredToken(null);
    setToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, signOut, error }),
    [status, user, signIn, signOut, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
