import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUp } from "./api";

function passwordStrengthError(password: string): string | null {
  if (password.length === 0) return null;
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pwError = passwordStrengthError(password);
  const canSubmit =
    name.trim().length > 0 && email.trim().length > 0 && password.length >= 8;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signUp({
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
        role: "passenger",
      });
      if (result.ok) {
        navigate("/auth/verify-email-sent");
      } else if (result.status === 409) {
        setError(
          "An account with this email already exists. Try signing in or resetting your password.",
        );
      } else if (result.status === 422) {
        setError(
          "Please use a valid email and a password of at least 8 characters.",
        );
      } else {
        setError("Registration failed. Please try again.");
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
        <h1>Create account</h1>
        <p className="auth-subtitle">Join Hakwa as a passenger</p>

        <form
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="form-group">
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Ada Citizen"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

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
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={pwError ? "input-error" : ""}
              required
            />
            {pwError && <span className="field-error">{pwError}</span>}
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
            disabled={!canSubmit || loading}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/auth/sign-in">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
