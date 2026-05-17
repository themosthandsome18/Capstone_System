import { apiRequest, setStoredAuthToken } from "../shared/apiClient";


export async function login(username, password) {
  const payload = await apiRequest("/auth/login/", {
    auth: false,
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

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
  } finally {
    setStoredAuthToken("");
  }
}
