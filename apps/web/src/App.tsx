import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import RegisterPage from "./auth/RegisterPage";
import SignInPage from "./auth/SignInPage";
import VerifyEmailPage from "./auth/VerifyEmailPage";
import VerifyEmailSentPage from "./auth/VerifyEmailSentPage";
import ForgotPasswordPage from "./auth/ForgotPasswordPage";
import ResetPasswordPage from "./auth/ResetPasswordPage";
import "./App.css";

function HomePage() {
  return (
    <main className="auth-page">
      <div
        className="auth-card"
        style={{ textAlign: "center" }}
      >
        <h1>Hakwa Portal</h1>
        <p className="auth-subtitle">
          Ride-hailing platform for passengers, drivers, and merchants.
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginTop: "1.5rem",
          }}
        >
          <Link
            to="/auth/sign-in"
            className="btn-primary"
            style={{ textDecoration: "none", textAlign: "center" }}
          >
            Sign in
          </Link>
          <Link
            to="/auth/register"
            className="btn-secondary"
            style={{ textDecoration: "none", textAlign: "center" }}
          >
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<HomePage />}
        />
        <Route
          path="/auth/register"
          element={<RegisterPage />}
        />
        <Route
          path="/auth/sign-in"
          element={<SignInPage />}
        />
        <Route
          path="/auth/verify-email"
          element={<VerifyEmailPage />}
        />
        <Route
          path="/auth/verify-email-sent"
          element={<VerifyEmailSentPage />}
        />
        <Route
          path="/auth/forgot-password"
          element={<ForgotPasswordPage />}
        />
        <Route
          path="/auth/reset-password"
          element={<ResetPasswordPage />}
        />
      </Routes>
    </BrowserRouter>
  );
}
