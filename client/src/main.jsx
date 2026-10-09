import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const initialTelemetry = { waiting: 0, active: 0, completed: 0, failed: 0 };

function App() {
  const [users, setUsers] = useState(["1"]);
  const [selected, setSelected] = useState(["1"]);
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [state, setState] = useState({ products: [], wallets: [] });
  const [message, setMessage] = useState("Ready");
  const [refreshing, setRefreshing] = useState(false);
  const [clearingRedis, setClearingRedis] = useState(false);
  const [parallelCount, setParallelCount] = useState(3);
  const [scenario, setScenario] = useState("different-users");
  const [idempotencyResult, setIdempotencyResult] = useState(null);
  const [testingIdempotency, setTestingIdempotency] = useState(false);
  const [checkingResults, setCheckingResults] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const [queue, database] = await Promise.all([
        fetch(`${API}/api/telemetry`).then((r) => r.json()),
        fetch(`${API}/api/state`).then((r) => r.json()),
      ]);
      setTelemetry(queue);
      setState(database);
    } finally {
      setRefreshing(false);
    }
  }

  async function clearRedis() {
    if (
      !window.confirm(
        "Clear settlement-engine Redis queues and idempotency keys?",
      )
    )
      return;
    setClearingRedis(true);
    try {
      const response = await fetch(`${API}/api/redis`, { method: "DELETE" });
      const body = await response.json();
      setMessage(
        response.ok ? `Redis cleared (${body.deletedKeys} keys)` : body.message,
      );
    } catch {
      setMessage("Redis cleanup failed");
    } finally {
      setClearingRedis(false);
    }
  }

  async function testIdempotency(event) {
    event.preventDefault();
    const count = Math.max(1, Math.min(100, Number(parallelCount) || 1));
    const key = `frontend-checkout-${crypto.randomUUID()}-${Date.now()}`;

    setTestingIdempotency(true);
    setIdempotencyResult(null);
    try {
      const requestKeys = Array.from({ length: count }, (_, index) =>
        scenario === "stock-contention" ? `${key}-${index + 1}` : key,
      );
      const requests = Array.from({ length: count }, (_, index) => {
        const userId = scenario === "same-user" ? "1" : String(index + 1);
        const requestKey = requestKeys[index];
        return fetch(`${API}/api/orders/checkout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": requestKey,
          },
          body: JSON.stringify({
            userId,
            productId: "5",
            quantity: 1,
            idempotencyKeys: requestKey,
          }),
        })
          .then(async (response) => {
            const body = await response.json();
            return {
              requestNumber: index + 1,
              userId,
              requestKey,
              status: response.status,
            passed: false,
            transaction: response.status === 202
              ? `Queued job ${body.jobId ?? ""}`
              : body.message ?? "No response details",
            };
          })
          .catch((error) => ({
            requestNumber: index + 1,
            userId,
            status: "NETWORK",
            passed: false,
            transaction:
              error instanceof Error ? error.message : "Network error",
          }));
      });
      const results = await Promise.all(requests);
      setIdempotencyResult({
        key,
        requestKeys,
        total: results.length,
        accepted: results.filter(({ status }) => status === 202).length,
        conflicts: results.filter(({ status }) => status === 409).length,
        badRequests: results.filter(
          ({ status }) => status >= 400 && status !== 409,
        ).length,
        results,
      });
      setMessage(`Completed ${results.length} parallel checkout requests`);
    } catch {
      setMessage("Idempotency test failed");
    } finally {
      setTestingIdempotency(false);
    }
  }

  async function checkFinalResults() {
    if (!idempotencyResult?.requestKeys?.length) return;
    setCheckingResults(true);
    try {
      const response = await fetch(`${API}/api/orders/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKeys: idempotencyResult.requestKeys,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      const resultsByKey = new Map(
        body.results.map((finalResult) => [finalResult.idempotencyKey, finalResult]),
      );
      setIdempotencyResult((current) => ({
        ...current,
        results: current.results.map((result) => {
          const finalResult = resultsByKey.get(result.requestKey);
          const order = finalResult?.order;
          return finalResult?.completed
            ? {
                ...result,
                passed: true,
                status: 201,
                transaction: `Order ${order.id}`,
              }
            : {
                ...result,
                passed: false,
                status: finalResult?.status ?? "NOT_COMPLETED",
                transaction: finalResult?.message ?? "Still processing",
              };
        }),
      }));
      setMessage(
        `Checked ${idempotencyResult.requestKeys.length} idempotency keys`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not check results",
      );
    } finally {
      setCheckingResults(false);
    }
  }

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
          <div className="mt-5 flex gap-3">
            <button
              onClick={refresh}
              disabled={refreshing}
              className="hidden"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={clearRedis}
              disabled={clearingRedis}
              className="rounded-xl border border-rose-400/50 px-4 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-400/10 disabled:opacity-50"
            >
              {clearingRedis ? "Clearing…" : "Clear Redis"}
            </button>
          </div>
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
          <Card title="Idempotency test" eyebrow="Parallel checkout requests">
            <form onSubmit={testIdempotency} className="space-y-4">
              <label className="block text-sm text-slate-400">
                Number of parallel requests
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={parallelCount}
                  onChange={(event) => setParallelCount(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-cyan-300"
                />
              </label>
              <label className="block text-sm text-slate-400">
                Test scenario
                <select
                  value={scenario}
                  onChange={(event) => setScenario(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-cyan-300"
                >
                  <option value="different-users">
                    Same key, different users
                  </option>
                  <option value="same-user">
                    Same key, same user repeatedly
                  </option>
                  <option value="stock-contention">
                    Different users, one product in stock
                  </option>
                </select>
              </label>
              {scenario === "stock-contention" && (
                <p className="text-xs text-amber-300">
                  Sends one checkout per user for product #5. This expects
                  product #5 to have stock quantity 1. Each request gets its own
                  generated key.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={testingIdempotency}
                  className="flex-1 rounded-xl bg-violet-300 px-4 py-3 font-bold text-slate-950 hover:bg-violet-200 disabled:opacity-50"
                >
                  {testingIdempotency ? "Sending…" : "Run Idempotency Test"}
                </button>
                <button
                  type="button"
                  onClick={checkFinalResults}
                  disabled={checkingResults || !idempotencyResult}
                  className="flex-1 rounded-xl border border-cyan-300/60 px-4 py-3 text-sm font-bold text-cyan-200 hover:bg-cyan-300/10 disabled:opacity-50"
                >
                  {checkingResults ? "Checking…" : "Check Final Results"}
                </button>
              </div>
              {idempotencyResult && (
                <div className="rounded-xl bg-slate-900/70 p-3 text-sm">
                  <p className="mb-2 break-all text-xs text-slate-500">
                    Generated key: {idempotencyResult.key}
                  </p>
                  <p className="text-slate-300">
                    {idempotencyResult.total} sent ·{" "}
                    {idempotencyResult.accepted} accepted ·{" "}
                    {idempotencyResult.conflicts} conflicts ·{" "}
                    {idempotencyResult.badRequests} other errors
                  </p>
                  <div className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                    {idempotencyResult.results.map((result, index) => (
                      <p
                        key={`${result.userId}-${index}`}
                        className={
                          result.passed ? "text-emerald-300" : "text-rose-300"
                        }
                      >
                        {result.passed ? "PASS" : "FAIL"} · Request{" "}
                        {result.requestNumber} · User {result.userId} · HTTP{" "}
                        {result.status} · {result.transaction}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </Card>
          <Card title="Queue telemetry" eyebrow="Manual refresh">
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
  if (title === "Simulate traffic" || title === "Database balance state") return null;
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
