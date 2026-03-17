import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { verifyEmail } from "./api";

type Status = "loading" | "success" | "error";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    verifyEmail(token)
      .then((result) => setStatus(result.ok ? "success" : "error"))
      .catch(() => setStatus("error"));
  }, [token]);

  if (status === "loading") {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p className="auth-subtitle">Verifying your email address…</p>
        </div>
      </main>
    );
  }

  if (status === "success") {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="success-icon">✓</div>
          <h1>Email verified</h1>
          <p className="auth-subtitle">
            Your email address has been confirmed. You can now sign in.
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
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="error-icon">✕</div>
        <h1>Link no longer valid</h1>
        <p className="auth-subtitle">
          This verification link has expired or has already been used.
        </p>
        <Link
          to="/auth/sign-in"
          className="btn-primary"
          style={{
            display: "block",
            textAlign: "center",
            textDecoration: "none",
            marginBottom: "12px",
          }}
        >
          Sign in
        </Link>
        <p className="auth-footer">
          Need a new link? <Link to="/auth/register">Sign up again</Link>
          {" or sign in to request a new verification email."}
        </p>
      </div>
    </main>
  );
}
