import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  getCurrentUser,
  login as requestLogin,
  logout as requestLogout,
} from "./authApi";
import { getStoredAuthToken, setStoredAuthToken } from "../shared/apiClient";


const AuthContext = createContext(null);


export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getStoredAuthToken()));

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      if (!getStoredAuthToken()) {
        setLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser();
        if (mounted) {
          setUser(currentUser);
        }
      } catch {
        setStoredAuthToken("");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  async function login(username, password) {
    const authenticatedUser = await requestLogin(username, password);
    setUser(authenticatedUser);
    return authenticatedUser;
  }

  async function logout() {
    await requestLogout();
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      role: user?.profile?.role || "",
      loading,
      login,
      logout,
      isAuthenticated: Boolean(user),
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}


export function getDefaultRouteForRole(role) {
  if (role === "admin") {
    return "/module-selection";
  }

  if (role === "sanitation") {
    return "/sanitation";
  }

  return "/";
}
