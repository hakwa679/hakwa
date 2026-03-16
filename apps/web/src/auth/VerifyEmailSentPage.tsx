import { Link } from "react-router-dom";

export default function VerifyEmailSentPage() {
  return (
    <main className="auth-page">
      <div
        className="auth-card"
        style={{ textAlign: "center" }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✉️</div>
        <h1>Check your email</h1>
        <p className="auth-subtitle">
          We sent a verification link to your email address. Please check your
          inbox and spam folder, then click the link to activate your account.
        </p>
        <p
          style={{ fontSize: "0.875rem", color: "#687076", marginTop: "1rem" }}
        >
          Once verified, you can sign in with your credentials.
        </p>
        <Link
          to="/auth/sign-in"
          className="btn-primary"
          style={{
            display: "block",
            textAlign: "center",
            textDecoration: "none",
            marginTop: "1.5rem",
          }}
        >
          Go to sign in
        </Link>
      </div>
    </main>
  );
}
