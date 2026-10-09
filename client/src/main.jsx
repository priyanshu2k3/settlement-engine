import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const initialTelemetry = { waiting: 0, active: 0, completed: 0, failed: 0 };

function App() {
  const [users, setUsers] = useState(["1", "2", "3", "4", "5", "6", "7"]);
  const [selected, setSelected] = useState(["1"]);
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [state, setState] = useState({ products: [], wallets: [] });
  const [message, setMessage] = useState("Ready");

  async function refresh() {
    const [queue, database] = await Promise.all([
      fetch(`${API}/api/telemetry`).then((r) => r.json()),
      fetch(`${API}/api/state`).then((r) => r.json()),
    ]);
    setTelemetry(queue);
    setState(database);
  }

  useEffect(() => {
    refresh().catch(() => setMessage("API unavailable"));
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, []);

  async function simulate(event) {
    event.preventDefault();
    setMessage("Submitting 50 checkouts…");
    const response = await fetch(`${API}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: selected, productId: "5" }),
    });
    const body = await response.json();
    setMessage(response.ok ? `Submitted ${body.submitted} jobs` : body.message);
    refresh();
  }

  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  return (
    <main className="min-h-screen bg-[#08111f] px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Settlement engine
          </p>
          <h1 className="text-4xl font-bold tracking-tight">
            Concurrency control room
          </h1>
          <p className="mt-2 text-slate-400">
            Stress the checkout queue and watch balances stay consistent.
          </p>
        </header>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Simulate traffic" eyebrow="Load test">
            <form onSubmit={simulate}>
              <p className="mb-3 text-sm text-slate-400">
                Choose users to share the 50 concurrent requests.
              </p>
              <div className="mb-6 grid grid-cols-2 gap-2">
                {users.map((id) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() => toggle(id)}
                    className={`rounded-lg border px-3 py-2 text-sm ${selected.includes(id) ? "border-cyan-300 bg-cyan-300/15 text-cyan-200" : "border-slate-700 text-slate-400"}`}
                  >
                    User {id}
                  </button>
                ))}
              </div>
              <button
                disabled={!selected.length}
                className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Simulate 50 Concurrent Checkouts
              </button>
              <p className="mt-4 text-xs text-slate-500">{message}</p>
            </form>
          </Card>
          <Card title="Queue telemetry" eyebrow="Live · 1s">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Waiting", telemetry.waiting, "text-amber-300"],
                ["Active", telemetry.active, "text-blue-300"],
                ["Completed", telemetry.completed, "text-emerald-300"],
                ["Failed", telemetry.failed, "text-rose-300"],
              ].map(([label, value, color]) => (
                <div className="rounded-xl bg-slate-900/70 p-4" key={label}>
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    {label}
                  </p>
                  <p className={`mt-2 text-3xl font-semibold ${color}`}>
                    {value ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Database balance state" eyebrow="PostgreSQL · live">
            <div className="space-y-4">
              <section>
                <h3 className="mb-2 text-xs uppercase tracking-wider text-slate-500">
                  Inventory
                </h3>
                {state.products?.map((p) => (
                  <div
                    className="flex justify-between border-b border-slate-800 py-2 text-sm"
                    key={p.id}
                  >
                    <span>
                      {p.name} <span className="text-slate-500">#{p.id}</span>
                    </span>
                    <span
                      className={
                        p.stockQuantity === 0
                          ? "text-amber-300"
                          : "text-emerald-300"
                      }
                    >
                      {p.stockQuantity} units
                    </span>
                  </div>
                ))}
              </section>
              <section>
                <h3 className="mb-2 text-xs uppercase tracking-wider text-slate-500">
                  Wallet balances
                </h3>
                {state.wallets?.map((w) => (
                  <div
                    className="flex justify-between border-b border-slate-800 py-2 text-sm"
                    key={w.userId}
                  >
                    <span>User {w.userId}</span>
                    <span
                      className={
                        w.balanceCents < 0
                          ? "text-rose-300"
                          : "text-emerald-300"
                      }
                    >
                      ${(w.balanceCents / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </section>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
function Card({ title, eyebrow, children }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-black/20">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {eyebrow}
      </p>
      <h2 className="mb-5 mt-1 text-xl font-semibold">{title}</h2>
      {children}
    </article>
  );
}
createRoot(document.getElementById("root")).render(<App />);
