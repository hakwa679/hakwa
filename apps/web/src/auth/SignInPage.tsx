import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signIn, resendVerification } from "./api";

export default function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendVisible, setResendVisible] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    setResendVisible(false);
    try {
      const result = await signIn({
        email: email.trim().toLowerCase(),
        password,
      });
      if (result.ok) {
        navigate("/");
      } else if (result.status === 403) {
        setError("Please verify your email before signing in.");
        setResendVisible(true);
      } else if (result.status === 429) {
        const retryAfter = (result.error as Record<string, unknown>)[
          "retryAfter"
        ];
        const seconds = typeof retryAfter === "number" ? retryAfter : 60;
        setError(
          `Account temporarily locked. Try again in ${seconds} seconds.`,
        );
      } else {
        setError("Incorrect email or password. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || resendLoading) return;
    setResendLoading(true);
    try {
      await resendVerification(email.trim().toLowerCase());
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((c) => {
          if (c <= 1) {
            clearInterval(interval);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p className="auth-subtitle">Sign in to your account</p>

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

          <div className="form-group">
            <div className="label-row">
              <label htmlFor="password">Password</label>
              <Link
                to="/auth/forgot-password"
                className="label-link"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

          {resendVisible && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResend}
              disabled={resendCooldown > 0 || resendLoading}
            >
              {resendLoading
                ? "Sending…"
                : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend verification email"}
            </button>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={!canSubmit || loading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account? <Link to="/auth/register">Create one</Link>
        </p>
      </div>
    </main>
  );
}
