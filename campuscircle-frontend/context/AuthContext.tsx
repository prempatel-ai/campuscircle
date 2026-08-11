"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest } from "../lib/api";

interface DecodedToken {
  sub: string;
  user_id: string;
  university_id: string | null;
  username?: string;
  role: string;
  exp: number;
}

interface AuthUser {
  user_id: string;
  university_id: string | null;
  username: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function decodeJwt(token: string): DecodedToken | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if tokens exist in localStorage on mount
    const storedToken = localStorage.getItem("access_token");
    if (storedToken) {
      const decoded = decodeJwt(storedToken);
      if (decoded && decoded.exp * 1000 > Date.now()) {
        setAccessToken(storedToken);
        setUser({
          user_id: decoded.user_id,
          university_id: decoded.university_id === "None" ? null : (decoded.university_id || null),
          username: decoded.username || decoded.sub || "user",
          role: decoded.role,
        });
      } else {
        // Token has expired
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
      }
    }
    setIsLoading(false);
  }, []);

  const login = (newAccessToken: string, newRefreshToken: string) => {
    localStorage.setItem("access_token", newAccessToken);
    localStorage.setItem("refresh_token", newRefreshToken); // Known simplification for MVP
    
    const decoded = decodeJwt(newAccessToken);
    if (decoded) {
      setAccessToken(newAccessToken);
      setUser({
        user_id: decoded.user_id,
        university_id: decoded.university_id === "None" ? null : (decoded.university_id || null),
        username: decoded.username || decoded.sub || "user",
        role: decoded.role,
      });
    }
  };

  const logout = async () => {
    const storedRefreshToken = localStorage.getItem("refresh_token");
    
    // Attempt to notify backend to revoke the refresh token (best-effort)
    if (storedRefreshToken) {
      try {
        await apiRequest("/api/v1/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: storedRefreshToken }),
        });
      } catch (err) {
        console.error("Backend token revocation failed:", err);
      }
    }

    // Clean up local auth state
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setAccessToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
