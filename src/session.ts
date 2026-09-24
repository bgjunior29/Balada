import { createContext, useContext } from "react";
import { apiUrl, readJson } from "./api";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  avatar_url?: string | null;
  hasPassword?: boolean;
  google?: boolean;
};
export type Session = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};
export const SessionContext = createContext<Session>({
  user: null,
  loading: true,
  refresh: async () => undefined,
  signOut: async () => undefined,
});
export const useSession = () => useContext(SessionContext);
export const canManageEvents = (user: SessionUser | null) =>
  user?.role === "ADMIN" || user?.role === "ORGANIZER";

export async function fetchSessionUser() {
  try {
    const response = await fetch(apiUrl("/api/auth/me"), {
      credentials: "include",
    });
    const data = response.ok
      ? await readJson<{ user?: SessionUser }>(response)
      : null;
    return data?.user ?? null;
  } catch {
    return null;
  }
}
