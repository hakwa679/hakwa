import { Link } from "react-router-dom";

export default function ExploreMapEntry() {
  return (
    <main className="auth-page">
      <div
        className="auth-card"
        style={{ textAlign: "center" }}
      >
        <h1>Explore and Map Fiji</h1>
        <p className="auth-subtitle">
          Explore pending community map contributions and help verify data
          quality.
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginTop: "1.25rem",
          }}
        >
          <Link
            to="/map/fiji"
            className="btn-primary"
            style={{ textDecoration: "none", textAlign: "center" }}
          >
            Open Map Fiji
          </Link>
        </div>
      </div>
    </main>
  );
}
