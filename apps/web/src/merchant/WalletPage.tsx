/**
 * T018 — Merchant Wallet Page (Web Portal)
 *
 * Displays balance, pending payout, last payout date, and a paginated ledger.
 * Real-time refresh via WebSocket `balance_updated` event.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = import.meta.env["VITE_API_URL"] ?? "http://localhost:3000";
const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";

interface WalletBalance {
  balance: string;
  currency: string;
  pendingPayoutAmount: string;
  lastPayoutAt: string | null;
}

interface LedgerItem {
  id: string;
  entryType: string;
  amount: string;
  label: string;
  tripId: string | null;
  payoutId: string | null;
  createdAt: string;
}

interface LedgerPage {
  items: LedgerItem[];
  nextCursor: string | null;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("hakwa_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatCurrency(amount: string, currency = "FJD") {
  return `${currency} ${parseFloat(amount).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function WalletPage() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/merchant/wallet/balance`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) setBalance((await res.json()) as WalletBalance);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  const fetchLedger = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/merchant/wallet/ledger?limit=20`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const page = (await res.json()) as LedgerPage;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      }
    } finally {
      setLoadingLedger(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `${API_URL}/api/merchant/wallet/ledger?cursor=${encodeURIComponent(nextCursor)}&limit=20`,
        { headers: getAuthHeaders() },
      );
      if (res.ok) {
        const page = (await res.json()) as LedgerPage;
        setItems((prev) => [...prev, ...page.items]);
        setNextCursor(page.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  useEffect(() => {
    void fetchBalance();
    void fetchLedger();
  }, [fetchBalance, fetchLedger]);

  // T018: Real-time balance refresh via WebSocket
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const token = localStorage.getItem("hakwa_token");
      const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type?: string };
          if (msg.type === "balance_updated") {
            void fetchBalance();
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [fetchBalance]);

  return (
    <div className="wallet-page" style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Wallet</h1>

      {/* Balance card */}
      <div style={{ background: "#0a7ea4", color: "#fff", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <p style={{ margin: 0, opacity: 0.8, fontSize: 14 }}>Current balance</p>
        {loadingBalance ? (
          <p style={{ fontSize: 32, fontWeight: 700, margin: "8px 0 0" }}>—</p>
        ) : (
          <p style={{ fontSize: 36, fontWeight: 700, margin: "8px 0 0" }}>
            {balance ? formatCurrency(balance.balance, balance.currency) : "—"}
          </p>
        )}
        {balance && parseFloat(balance.pendingPayoutAmount) > 0 && (
          <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.9 }}>
            Pending payout: {formatCurrency(balance.pendingPayoutAmount, balance.currency)}
          </p>
        )}
        {balance?.lastPayoutAt && (
          <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.7 }}>
            Last payout: {formatDate(balance.lastPayoutAt)}
          </p>
        )}
      </div>

      {/* Ledger */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Transaction history</h2>

      {loadingLedger ? (
        <p style={{ color: "#687076" }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "#687076", textAlign: "center", marginTop: 32 }}>No transactions yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
              <th style={{ padding: "8px 6px", fontSize: 13, color: "#687076", fontWeight: 500 }}>Description</th>
              <th style={{ padding: "8px 6px", fontSize: 13, color: "#687076", fontWeight: 500 }}>Date</th>
              <th style={{ padding: "8px 6px", fontSize: 13, color: "#687076", fontWeight: 500, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isCredit = parseFloat(item.amount) >= 0;
              return (
                <tr key={item.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "12px 6px", fontSize: 14 }}>{item.label}</td>
                  <td style={{ padding: "12px 6px", fontSize: 13, color: "#687076" }}>{formatDate(item.createdAt)}</td>
                  <td style={{
                    padding: "12px 6px",
                    fontSize: 14,
                    fontWeight: 600,
                    textAlign: "right",
                    color: isCredit ? "#1B8A2E" : "#C0392B",
                  }}>
                    {isCredit ? "+" : ""}{formatCurrency(item.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {nextCursor && (
        <button
          onClick={() => void loadMore()}
          disabled={loadingMore}
          style={{
            display: "block",
            margin: "20px auto 0",
            padding: "10px 24px",
            background: "#0a7ea4",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: loadingMore ? "not-allowed" : "pointer",
            fontSize: 14,
          }}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
