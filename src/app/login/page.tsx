"use client";

import { useState } from "react";

const DEMO_ACCOUNTS = [
  {
    role: "admin",
    label: "Administrator",
    email: "admin@lifeline.local",
    desc: "Complete system access, forecasts, hospital management, safety recalls"
  },
  {
    role: "lab",
    label: "Laboratory Technician",
    email: "lab@lifeline.local",
    desc: "Record screening outcomes, update component availability, unit status"
  },
  {
    role: "hospital",
    label: "Hospital Coordinator",
    email: "hospital@lifeline.local",
    desc: "Create component requests, trigger FEFO allocation, emergency bundle matching"
  },
  {
    role: "donor",
    label: "Registered Donor",
    email: "donor@lifeline.local",
    desc: "View donation history, eligibility status, screening questionnaire"
  }
];

export default function LoginPage() {
  const [email, setEmail] = useState("admin@lifeline.local");
  const [password, setPassword] = useState("LifeLineDemo2026!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      // Redirect to home route for the role
      window.location.assign(data.redirectUrl || "/stock");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  async function quickLogin(accountEmail: string) {
    setEmail(accountEmail);
    setPassword("LifeLineDemo2026!");
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: accountEmail, password: "LifeLineDemo2026!" })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      window.location.assign(data.redirectUrl || "/stock");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quick sign-in failed");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-xl space-y-6">
        <div className="text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-2xl font-bold text-white shadow-md">
            ✚
          </span>
          <h1 className="mt-3 text-3xl font-extrabold text-slate-900">LifeLine Sign In</h1>
          <p className="mt-1 text-sm text-slate-500">
            Blood Component Inventory & Emergency Matching System
          </p>
          <div className="mt-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            Member B · Password Hash (bcrypt) & Cryptographic Signed Session (jose)
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Standard Email/Password Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Email Address</span>
            <input
              type="email"
              required
              className="mt-1 w-full rounded-xl border p-3 text-sm focus:border-red-500 focus:outline-none"
              placeholder="user@hospital.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Password</span>
            <input
              type="password"
              required
              className="mt-1 w-full rounded-xl border p-3 text-sm focus:border-red-500 focus:outline-none"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-red-600 py-3 text-sm font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In to LifeLine"}
          </button>
        </form>

        {/* Quick Demo Login Shelf */}
        <div className="pt-4 border-t space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              One-Click Role Profiles (Viva / Evaluation Demo)
            </p>
            <span className="text-[11px] font-mono text-slate-400">pwd: LifeLineDemo2026!</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.role}
                type="button"
                onClick={() => quickLogin(acc.email)}
                disabled={loading}
                className="rounded-xl border border-slate-200 p-3 text-left hover:border-red-400 hover:bg-red-50/50 transition group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-800 group-hover:text-red-700">{acc.label}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono uppercase text-slate-600">
                    {acc.role}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400 font-mono truncate">{acc.email}</p>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
