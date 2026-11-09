"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Donation {
  donation_id: number;
  donor_id: number;
  donor_name: string;
  blood_group: string;
  donated_at: string;
  bag_number: string;
  test_status: string | null;
  component_count: number;
}

export default function LabPage() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isNotSignedIn, setIsNotSignedIn] = useState(false);
  const [message, setMessage] = useState("");

  const loadDonations = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/lab/tests");
      const data = await response.json();

      if (response.status === 401) {
        setIsNotSignedIn(true);
        return;
      }

      if (!response.ok) throw new Error(data.error || "Could not load donations");

      setIsNotSignedIn(false);
      setDonations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDonations();
  }, [loadDonations]);

  async function submitResult(donationId: number, status: "passed" | "failed") {
    const confirmation = window.confirm(
      `Are you sure you want to mark donation #${donationId} as ${status.toUpperCase()}?`
    );
    if (!confirmation) return;

    setProcessing(donationId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/lab/tests/${donationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_status: status,
          remarks: remarks[donationId] || ""
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save test result");

      setMessage(
        `Donation #${donationId} marked ${status}. ${data.components_updated} component(s) marked ${data.component_status} in inventory and logged to MongoDB audit.`
      );

      await loadDonations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setProcessing(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-red-600">MEMBER B · LABORATORY CLEARANCE</p>
          <h1 className="mt-1 text-3xl font-bold">Blood Screening & Clearance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review collected donations, record laboratory screening outcomes, and release tested stock.
          </p>
        </div>
        <button
          onClick={loadDonations}
          disabled={loading}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh Queue"}
        </button>
      </header>

      {isNotSignedIn && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm space-y-2">
          <p className="font-bold text-amber-900">Sign In Required</p>
          <p className="text-sm text-amber-800">
            You must be signed in as a Laboratory Technician or Administrator to record test results and clear blood units.
          </p>
          <Link
            href="/login"
            className="inline-block rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            Sign In with Demo Lab Account →
          </Link>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs uppercase font-semibold text-gray-500">Awaiting Laboratory Testing</p>
          <p className="mt-2 text-3xl font-bold">{donations.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs uppercase font-semibold text-gray-500">Components Awaiting Clearance</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">
            {donations.reduce((total, donation) => total + Number(donation.component_count), 0)}
          </p>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <h2 className="text-lg font-semibold">Pending Donations Queue</h2>
          <p className="mt-1 text-sm text-gray-500">
            Record the screening outcome for each donation. Passing releases components to available stock; failing immediately discards all derived units.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-gray-500">Loading donation queue...</p>
        ) : donations.length === 0 ? (
          <p className="p-8 text-center text-gray-500">
            No donations are currently awaiting laboratory testing.
          </p>
        ) : (
          <div className="divide-y">
            {donations.map((donation) => (
              <article key={donation.donation_id} className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {donation.donor_name}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Donation #{donation.donation_id} · Bag <span className="font-mono font-bold text-slate-800">{donation.bag_number}</span>
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Donor ID: {donation.donor_id} · Collected: {new Date(donation.donated_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-800">
                      {donation.blood_group}
                    </span>
                    <span className="text-xs font-semibold text-slate-600 bg-slate-100 rounded px-2 py-1">
                      {donation.component_count} derived component(s)
                    </span>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Laboratory remarks / observations</span>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={remarks[donation.donation_id] || ""}
                    onChange={(event) =>
                      setRemarks((previous) => ({
                        ...previous,
                        [donation.donation_id]: event.target.value
                      }))
                    }
                    placeholder="Enter screening observations (e.g. Non-reactive for viral markers)..."
                    className="w-full rounded-lg border p-3 text-sm outline-none focus:border-red-400"
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => submitResult(donation.donation_id, "passed")}
                    disabled={processing !== null}
                    className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {processing === donation.donation_id ? "Saving..." : "✓ Pass Screening (Mark Available)"}
                  </button>
                  <button
                    onClick={() => submitResult(donation.donation_id, "failed")}
                    disabled={processing !== null}
                    className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    ✗ Fail Screening (Discard Units)
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
