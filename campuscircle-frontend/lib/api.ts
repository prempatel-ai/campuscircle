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

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let detail = "An unexpected error occurred.";
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch (_) {
      // Failed to parse JSON error (e.g. timeout or HTML error page)
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return null as unknown as T;
  }

  return response.json();
}
