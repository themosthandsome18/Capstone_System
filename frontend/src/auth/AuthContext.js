import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getCurrentUser,
  login as requestLogin,
  logout as requestLogout,
} from "./authApi";
import { getStoredAuthToken, setStoredAuthToken } from "../shared/apiClient";
import { MOBILE_ONLY_MESSAGE, canReachAnyPage } from "./roleAccess";


const AuthContext = createContext(null);

export const SESSION_CHECK_FAILED_MESSAGE =
  "We couldn't confirm your session because the server could not be reached " +
  "or returned an error. Please try again in a moment.";


// Only these mean the stored token itself is bad (expired, revoked, or the
// user was deactivated). Anything else is a server or network problem and
// must not log the user out.
function isRejectedToken(error) {
  return error?.status === 401 || error?.status === 403;
}


export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getStoredAuthToken()));
  const [sessionError, setSessionError] = useState("");
  const [notice, setNotice] = useState("");
  const mountedRef = useRef(true);

  const restoreSession = useCallback(async () => {
    if (!getStoredAuthToken()) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setSessionError("");

    try {
      const currentUser = await getCurrentUser();
      if (!canReachAnyPage(currentUser?.profile?.role)) {
        // A token kept from before, of an account that reaches nothing here: forget it (on this browser only) and say why at the login page.
        setStoredAuthToken("");
        if (mountedRef.current) {
          setNotice(MOBILE_ONLY_MESSAGE);
        }
      } else if (mountedRef.current) {
        setUser(currentUser);
      }
    } catch (error) {
      if (isRejectedToken(error)) {
        setStoredAuthToken("");
      } else if (mountedRef.current) {
        setSessionError(SESSION_CHECK_FAILED_MESSAGE);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    restoreSession();

    return () => {
      mountedRef.current = false;
    };
  }, [restoreSession]);

  async function login(username, password) {
    const authenticatedUser = await requestLogin(username, password);
    setSessionError("");
    setNotice("");
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
      notice,
      sessionError,
      retrySession: restoreSession,
    }),
    [user, loading, notice, sessionError, restoreSession]
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
