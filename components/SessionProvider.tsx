"use client";

import { createContext, useContext } from "react";

/**
 * Read-only session context for client components.
 *
 * This carries display state only — whether to show "Sign in" or "My account",
 * and which nickname to render. It is NEVER an authorization signal: every
 * protected route is gated server-side in `lib/auth/session.ts`, and every
 * state write is authorized inside its RPC from `auth.uid()`. A client context
 * is trivially forgeable, so nothing may depend on it for access control.
 */
export interface SessionContextValue {
  isAuthenticated: boolean;
  nickname: string | null;
  isAdmin: boolean;
}

const SessionContext = createContext<SessionContextValue>({
  isAuthenticated: false,
  nickname: null,
  isAdmin: false,
});

export function SessionProvider({
  value,
  children,
}: {
  value: SessionContextValue;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
