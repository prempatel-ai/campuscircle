const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  detail: string | any;

  constructor(status: number, detail: any) {
    const message = typeof detail === "string" ? detail : (detail?.message || JSON.stringify(detail));
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export async function apiRequest<T>(
  path: string, 
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // Auto-attach JWT Bearer token if present in localStorage
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  let response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  // If 401 Unauthorized, attempt transparent token refresh once
  if (
    response.status === 401 && 
    typeof window !== "undefined" && 
    !path.includes("/auth/login") && 
    !path.includes("/auth/refresh")
  ) {
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshRes.ok) {
          const data = await refreshRes.json();
          localStorage.setItem("access_token", data.access_token);
          if (data.refresh_token) {
            localStorage.setItem("refresh_token", data.refresh_token);
          }

          // Retry original request with new access token
          headers.set("Authorization", `Bearer ${data.access_token}`);
          response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers,
          });
        } else {
          // Refresh token expired or revoked — clear tokens and redirect to login
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
      } catch (_) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
      }
    } else {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
  }

  if (!response.ok) {
    let detail = "An unexpected error occurred.";
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch (_) {
      // Failed to parse JSON error
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return null as unknown as T;
  }

  return response.json();
}
