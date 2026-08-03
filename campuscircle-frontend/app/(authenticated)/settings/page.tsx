"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, ApiError } from "@/lib/api";
import { AnonAvatar } from "@/components/AnonAvatar";

interface UserProfile {
  id: string;
  university_id: string;
  email: string;
  username: string;
  role: string;
  notifications_enabled: boolean;
  is_deleted: boolean;
  last_username_change_at: string | null;
  created_at: string;
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Username change state
  const [newUsername, setNewUsername] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Notifications state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifStatus, setNotifStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Delete account modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteDeleting, setDeleteDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await apiRequest<UserProfile>("/api/v1/users/me");
      setProfile(data);
      setNewUsername(data.username);
      setNotificationsEnabled(data.notifications_enabled);
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(err.message);
      } else {
        setFetchError("Failed to load user profile.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    setUsernameSaving(true);
    setUsernameStatus(null);
    try {
      const updated = await apiRequest<UserProfile>("/api/v1/users/me/username", {
        method: "PATCH",
        body: JSON.stringify({ new_username: newUsername.trim() }),
      });
      setProfile(updated);
      setUsernameStatus({ type: "success", msg: "Username updated successfully!" });
    } catch (err) {
      if (err instanceof ApiError) {
        setUsernameStatus({ type: "error", msg: err.message });
      } else {
        setUsernameStatus({ type: "error", msg: "Failed to update username." });
      }
    } finally {
      setUsernameSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (!currentPassword || !newPassword) {
      setPasswordStatus({ type: "error", msg: "Please fill in all password fields." });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordStatus({ type: "error", msg: "New password must be at least 8 characters long." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", msg: "New passwords do not match." });
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await apiRequest<{ message: string }>("/api/v1/users/me/password", {
        method: "PATCH",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setPasswordStatus({ type: "success", msg: res.message || "Password updated successfully!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordStatus({ type: "error", msg: err.message });
      } else {
        setPasswordStatus({ type: "error", msg: "Failed to update password." });
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleToggleNotifications = async (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    setNotifSaving(true);
    setNotifStatus(null);
    try {
      await apiRequest<{ notifications_enabled: boolean; message: string }>("/api/v1/users/me/notifications", {
        method: "PATCH",
        body: JSON.stringify({ notifications_enabled: enabled }),
      });
      setNotifStatus({ type: "success", msg: `Notifications ${enabled ? "enabled" : "disabled"}.` });
    } catch (err) {
      setNotificationsEnabled(!enabled); // revert
      if (err instanceof ApiError) {
        setNotifStatus({ type: "error", msg: err.message });
      } else {
        setNotifStatus({ type: "error", msg: "Failed to update notification preferences." });
      }
    } finally {
      setNotifSaving(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletePassword) return;

    setDeleteDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest<{ message: string }>("/api/v1/users/me", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword }),
      });
      logout();
      router.push("/login");
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Failed to delete account. Please verify password.");
      }
      setDeleteDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="border-4 border-primary border-t-transparent animate-spin w-10 h-10 rounded-full" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto py-6 space-y-8">
      {/* Header Banner */}
      <div className="space-y-1 border-b border-border-muted pb-6">
        <h1 className="font-display text-3xl font-bold text-primary">Account & Profile Settings</h1>
        <p className="font-sans text-sm text-ink/75">
          Manage your username handle, security credentials, notification alerts, and account preferences.
        </p>
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-sans">
          {fetchError}
        </div>
      )}

      {/* 1. Account Info & Username Section */}
      <section className="bg-surface border border-border-muted rounded-2xl p-6 space-y-6 shadow-2xs">
        <div className="flex items-center gap-4 border-b border-border-muted/50 pb-5">
          <AnonAvatar username={profile?.username || user?.username || "user"} size={56} shape="circle" />
          <div className="flex flex-col">
            <h2 className="font-display text-xl font-bold text-ink">@{profile?.username || user?.username}</h2>
            <p className="font-sans text-xs text-ink/60">{profile?.email}</p>
            <span className="mt-1 inline-block text-[10px] font-mono font-bold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-full w-max">
              {profile?.role === "admin" ? "Administrator" : "Verified Student"}
            </span>
          </div>
        </div>

        <form onSubmit={handleUpdateUsername} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <label className="block text-xs font-mono font-bold uppercase text-ink/70">Username Handle</label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 font-mono text-sm text-ink/40">@</span>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full pl-8 pr-4 py-2 bg-background border border-border-muted rounded-xl text-sm font-sans focus:outline-none focus:border-primary transition-all"
                placeholder="new_username"
                required
              />
            </div>
            <p className="text-[11px] font-sans text-ink/50">
              Usernames can be changed once every 30 days.
            </p>
          </div>

          {usernameStatus && (
            <div
              className={`p-3 rounded-xl text-xs font-sans font-semibold ${
                usernameStatus.type === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {usernameStatus.msg}
            </div>
          )}

          <button
            type="submit"
            disabled={usernameSaving || newUsername === profile?.username}
            className="px-5 py-2.5 bg-primary text-surface font-sans font-bold text-xs rounded-xl shadow-2xs hover:bg-[#1F3E23] transition-all disabled:opacity-50 cursor-pointer"
          >
            {usernameSaving ? "Saving..." : "Update Username"}
          </button>
        </form>
      </section>

      {/* 2. Change Password Section */}
      <section className="bg-surface border border-border-muted rounded-2xl p-6 space-y-6 shadow-2xs">
        <div className="border-b border-border-muted/50 pb-4">
          <h2 className="font-display text-lg font-bold text-primary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Password & Security</span>
          </h2>
          <p className="font-sans text-xs text-ink/60 mt-1">
            Updating your password will revoke all other active sessions across devices for account safety.
          </p>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <label className="block text-xs font-mono font-bold uppercase text-ink/70">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2 bg-background border border-border-muted rounded-xl text-sm font-sans focus:outline-none focus:border-primary transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-mono font-bold uppercase text-ink/70">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 bg-background border border-border-muted rounded-xl text-sm font-sans focus:outline-none focus:border-primary transition-all"
              placeholder="Min 8 characters"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-mono font-bold uppercase text-ink/70">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 bg-background border border-border-muted rounded-xl text-sm font-sans focus:outline-none focus:border-primary transition-all"
              placeholder="Repeat new password"
              required
            />
          </div>

          {passwordStatus && (
            <div
              className={`p-3 rounded-xl text-xs font-sans font-semibold ${
                passwordStatus.type === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {passwordStatus.msg}
            </div>
          )}

          <button
            type="submit"
            disabled={passwordSaving}
            className="px-5 py-2.5 bg-primary text-surface font-sans font-bold text-xs rounded-xl shadow-2xs hover:bg-[#1F3E23] transition-all disabled:opacity-50 cursor-pointer"
          >
            {passwordSaving ? "Updating Password..." : "Update Password"}
          </button>
        </form>
      </section>

      {/* 3. Notification Preferences */}
      <section className="bg-surface border border-border-muted rounded-2xl p-6 space-y-6 shadow-2xs">
        <div className="border-b border-border-muted/50 pb-4">
          <h2 className="font-display text-lg font-bold text-primary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span>Notification Preferences</span>
          </h2>
          <p className="font-sans text-xs text-ink/60 mt-1">
            Choose whether to receive activity alerts when peers reply to your posts or comments.
          </p>
        </div>

        <div className="flex items-center justify-between p-4 bg-background border border-border-muted/60 rounded-xl">
          <div className="flex flex-col">
            <span className="font-sans font-bold text-sm text-ink">Discussion Notifications</span>
            <span className="font-sans text-xs text-ink/60">
              Receive notifications when someone replies or tags @reva on your posts.
            </span>
          </div>

          <button
            onClick={() => handleToggleNotifications(!notificationsEnabled)}
            disabled={notifSaving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
              notificationsEnabled ? "bg-primary" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                notificationsEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {notifStatus && (
          <div
            className={`p-3 rounded-xl text-xs font-sans font-semibold ${
              notifStatus.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {notifStatus.msg}
          </div>
        )}
      </section>

      {/* 4. Danger Zone (Delete Account) */}
      <section className="bg-surface border border-red-200 rounded-2xl p-6 space-y-4 shadow-2xs">
        <div className="border-b border-red-100 pb-3">
          <h2 className="font-display text-lg font-bold text-red-700 flex items-center gap-2">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Danger Zone</span>
          </h2>
          <p className="font-sans text-xs text-ink/70 mt-1">
            Soft-deleting your account will invalidate your credentials, scrub your email, and change your displayed username to [deleted] on past posts.
          </p>
        </div>

        <button
          onClick={() => setShowDeleteModal(true)}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-sans font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer"
        >
          Delete Account
        </button>
      </section>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border-muted rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="space-y-2">
              <h3 className="font-display text-xl font-bold text-red-700">Confirm Account Deletion</h3>
              <p className="font-sans text-xs text-ink/75 leading-relaxed">
                This action will log you out immediately and scrub your personal credentials. Please enter your password to confirm.
              </p>
            </div>

            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-ink/70">Confirm Password</label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-border-muted rounded-xl text-sm font-sans focus:outline-none focus:border-red-500 transition-all"
                  placeholder="Enter your current password"
                  required
                />
              </div>

              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-sans font-semibold">
                  {deleteError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 text-xs font-sans font-bold text-ink/70 hover:bg-background rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleteDeleting || !deletePassword}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-sans font-bold text-xs rounded-xl shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {deleteDeleting ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
