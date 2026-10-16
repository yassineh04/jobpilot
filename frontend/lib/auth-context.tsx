"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken } from "./api";
import type { User } from "./types";

interface AuthContextType {
  /** null while the stored token has not been checked yet */
  isAuthenticated: boolean | null;
  user: User | null;
  login: (email: string, password: string, next?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    try {
      setUser(await api.me());
    } catch {
      // api.request already clears an invalid token
    }
  }, []);

  useEffect(() => {
    const hasToken = !!getToken();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
    setIsAuthenticated(hasToken);
    if (hasToken) refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string, next = "/dashboard") => {
    const response = await api.login(email, password);
    setToken(response.access_token);
    setIsAuthenticated(true);
    await refreshUser();
    // Only same-site paths: "//evil.com" would be an open redirect
    router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  };

  const logout = () => {
    setToken(null);
    // Full reload: drops every cached piece of the previous session's data
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
