import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "./api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      // Always returns 200 regardless of whether the email is registered — prevents account enumeration
      await forgotPassword(email.trim().toLowerCase(), window.location.origin);
      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="success-icon">✉</div>
          <h1>Check your email</h1>
          <p className="auth-subtitle">
            If an account with that address exists, you'll receive a password
            reset link shortly. Please check your inbox and spam folder.
          </p>
          <Link
            to="/auth/sign-in"
            className="btn-primary"
            style={{
              display: "block",
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Reset password</h1>
        <p className="auth-subtitle">
          Enter your email address and we'll send you a reset link.
        </p>

        <form
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="ada@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {error && (
            <div
              className="error-banner"
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={!email.trim() || loading}
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p className="auth-footer">
          <Link to="/auth/sign-in">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
