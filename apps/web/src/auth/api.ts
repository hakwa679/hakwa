/**
 * Thin wrapper around the Better Auth REST API for the web portal.
 * Uses fetch — no extra dependencies needed beyond better-auth/client.
 */

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "passenger" | "driver" | "merchant";
  emailVerified: boolean;
}

export interface Session {
  token: string;
  id: string;
  expiresAt: string;
}

export interface AuthResult {
  user: SessionUser;
  session: Session | null;
  token?: string;
}

export interface ApiError {
  code?: string;
  message?: string;
}

/** Sign up with email and password. Returns the created user (no session until verified). */
export async function signUp(params: {
  email: string;
  password: string;
  name: string;
  role: "passenger" | "driver" | "merchant";
}): Promise<
  | { ok: true; data: AuthResult }
  | { ok: false; status: number; error: ApiError }
> {
  const res = await fetch(`${API_BASE}/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as unknown;
  if (res.ok) return { ok: true, data: data as AuthResult };
  return { ok: false, status: res.status, error: data as ApiError };
}

/** Sign in with email and password. Returns a session with token on success. */
export async function signIn(params: {
  email: string;
  password: string;
}): Promise<
  | { ok: true; data: AuthResult }
  | { ok: false; status: number; error: ApiError }
> {
  const res = await fetch(`${API_BASE}/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as unknown;
  if (res.ok) return { ok: true, data: data as AuthResult };
  return { ok: false, status: res.status, error: data as ApiError };
}

/** Sign out — invalidates the current session. */
export async function signOut(): Promise<void> {
  await fetch(`${API_BASE}/auth/sign-out`, {
    method: "POST",
    credentials: "include",
  });
}

/** Request a password reset email. */
export async function forgotPassword(
  email: string,
  webUrl: string,
): Promise<void> {
  await fetch(`${API_BASE}/auth/forget-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      redirectTo: `${webUrl}/auth/reset-password`,
    }),
  });
}

/** Reset password with a token from the reset email. */
export async function resetPassword(params: {
  token: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: ApiError }> {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json()) as unknown;
  return { ok: false, status: res.status, error: data as ApiError };
}

/** Verify email with the token from the verification email. */
export async function verifyEmail(
  token: string,
): Promise<{ ok: true } | { ok: false; status: number }> {
  const res = await fetch(`${API_BASE}/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, status: res.status };
}

/** Resend verification email (60-second cooldown enforced server-side). */
export async function resendVerification(email: string): Promise<void> {
  await fetch(`${API_BASE}/api/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}
