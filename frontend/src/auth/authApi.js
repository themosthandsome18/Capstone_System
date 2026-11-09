import { apiRequest, setStoredAuthToken } from "../shared/apiClient";
import { AccountRefusedError, canReachAnyPage } from "./roleAccess";


export async function login(username, password) {
  const payload = await apiRequest("/auth/login/", {
    auth: false,
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  // An account whose role reaches no page of the admin is refused BEFORE anything is kept: no token, no user. (The token the server made is left alone:
  // it is the same one the person's phone uses, and signing out here would put them out of the app.)
  if (!canReachAnyPage(payload?.user?.profile?.role)) {
    throw new AccountRefusedError();
  }

  setStoredAuthToken(payload.token);
  return payload.user;
}


export async function getCurrentUser() {
  const payload = await apiRequest("/auth/me/");
  return payload.user;
}


export async function logout() {
  try {
    await apiRequest("/auth/logout/", {
      method: "POST",
    });
  } catch (error) {
    console.warn("API logout request failed, clearing local token anyway:", error);
  } finally {
    setStoredAuthToken("");
  }
}
