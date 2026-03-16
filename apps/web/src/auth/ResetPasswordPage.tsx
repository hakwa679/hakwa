import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { resetPassword } from "./api";

function passwordStrengthError(password: string): string | null {
  if (password.length === 0) return null;
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pwError = passwordStrengthError(newPassword);
  const confirmError =
    confirm.length > 0 && confirm !== newPassword
      ? "Passwords do not match"
      : null;
  const canSubmit =
    newPassword.length >= 8 && newPassword === confirm && !!token;

  // No token in URL means the link is invalid
  if (!token) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="error-icon">✕</div>
          <h1>Link no longer valid</h1>
          <p className="auth-subtitle">
            This password reset link has expired or has already been used.
          </p>
          <Link
            to="/auth/forgot-password"
            className="btn-primary"
            style={{
              display: "block",
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            Request a new link
          </Link>
        </div>
      </main>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await resetPassword({ token, newPassword });
      if (result.ok) {
        navigate("/auth/sign-in", {
          state: { message: "Password updated — please sign in." },
        });
      } else if (result.status === 400) {
        setError(
          "This reset link has expired or has already been used. Please request a new one.",
        );
      } else {
        setError("Password reset failed. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Set new password</h1>
        <p className="auth-subtitle">
          Choose a strong password for your account.
        </p>

        <form
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="form-group">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={pwError ? "input-error" : ""}
              required
            />
            {pwError && <span className="field-error">{pwError}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={confirmError ? "input-error" : ""}
              required
            />
            {confirmError && (
              <span className="field-error">{confirmError}</span>
            )}
          </div>

          {error && (
            <div
              className="error-banner"
              role="alert"
            >
              {error}{" "}
              {error.includes("expired") && (
                <Link to="/auth/forgot-password">Request a new link</Link>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={!canSubmit || loading}
          >
            {loading ? "Updating password…" : "Set new password"}
          </button>
        </form>
      </div>
    </main>
  );
}
