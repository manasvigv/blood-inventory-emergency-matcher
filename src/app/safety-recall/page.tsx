"use client";

import { useEffect, useState } from "react";

interface RecentDonation {
  donation_id: number;
  bag_number: string;
  donated_at: string;
  donor_id: number;
  donor_name: string;
  blood_group: string;
  component_count: number;
}

interface LineageUnit {
  unit_id: number;
  parent_unit_id: number | null;
  depth: number;
  unit_code: string;
  component_code: string;
  component_name: string;
  blood_group: string;
  status: string;
  expires_at: string;
  issue_id: number | null;
  issued_at: string | null;
  hospital_id: number | null;
  hospital_name: string | null;
  hospital_phone: string | null;
  patient_id: number | null;
  patient_name: string | null;
  hospital_patient_ref: string | null;
  patient_blood_group: string | null;
  request_id: number | null;
}

interface RecallData {
  donation: {
    donation_id: number;
    bag_number: string;
    donated_at: string;
    donation_type: string;
    donor_id: number;
    donor_name: string;
    blood_group: string;
    donor_phone: string;
    donor_email: string;
  };
  units: LineageUnit[];
  transfused: LineageUnit[];
  summary: {
    totalUnits: number;
    inStockCount: number;
    issuedCount: number;
    expiredDiscardedCount: number;
  };
}

export default function SafetyRecallPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [recentDonations, setRecentDonations] = useState<RecentDonation[]>([]);
  const [recallData, setRecallData] = useState<RecallData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quarantineMessage, setQuarantineMessage] = useState("");

  useEffect(() => {
    async function loadRecent() {
      try {
        const res = await fetch("/api/safety-recall");
        const data = await res.json();
        if (data.recent) {
          setRecentDonations(data.recent);
          if (data.recent.length > 0) {
            // Auto-load first recent donation
            loadDonationTrace(data.recent[0].donation_id);
          }
        }
      } catch (err) {
        console.warn("Could not load recent donations:", err);
      }
    }
    loadRecent();
  }, []);

  async function loadDonationTrace(id: number) {
    setLoading(true);
    setError("");
    setQuarantineMessage("");

    try {
      const res = await fetch(`/api/safety-recall?donationId=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Recall trace failed");
      setRecallData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error tracing recall");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError("");
    setQuarantineMessage("");

    try {
      const res = await fetch(`/api/safety-recall?search=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No matching donation found");
      if (data.donation) {
        setRecallData(data);
      } else {
        setError(`No donation found matching "${searchTerm}"`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuarantine() {
    if (!recallData) return;
    const confirmAction = window.confirm(
      `QUARANTINE CONFIRMATION:\nAre you sure you want to recall and discard all remaining in-stock units from Donation #${recallData.donation.donation_id} (${recallData.donation.bag_number})?`
    );
    if (!confirmAction) return;

    try {
      const res = await fetch("/api/safety-recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donation_id: recallData.donation.donation_id,
          reason: "Donor tested positive on subsequent screening — safety recall triggered"
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Quarantine action failed");

      setQuarantineMessage(
        `🚨 Recall Action Completed: ${data.quarantined_count} unit(s) quarantined and marked discarded. Logged to MongoDB audit.`
      );
      await loadDonationTrace(recallData.donation.donation_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quarantine failed");
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-red-600">MEMBER B · CLINICAL GOVERNANCE</p>
          <h1 className="mt-1 text-3xl font-bold">Safety Recall & Lineage Tracing</h1>
          <p className="mt-1 text-sm text-gray-500">
            Traverse component lineage with a recursive CTE (<code className="rounded bg-gray-100 px-1 font-mono text-xs">sp_trace_safety_recall</code>) to trace all child units and identify transfused patients for clinical notification.
          </p>
        </div>
        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
          Recursive CTE Traceability
        </span>
      </header>

      {/* Search Bar */}
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            className="flex-1 rounded-lg border p-3 text-sm focus:border-red-500 focus:outline-none"
            placeholder="Search by Bag Number (e.g. BB2025000025), Donor Name, or Donation ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Searching..." : "Trace Recall Lineage"}
          </button>
        </form>

        {recentDonations.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Quick trace recent:</span>
            {recentDonations.slice(0, 6).map((d) => (
              <button
                key={d.donation_id}
                type="button"
                onClick={() => loadDonationTrace(d.donation_id)}
                className="rounded-md border bg-slate-50 px-2.5 py-1 text-xs hover:border-red-400"
              >
                #{d.donation_id} ({d.bag_number}) - {d.donor_name}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {quarantineMessage && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          {quarantineMessage}
        </div>
      )}

      {recallData && (
        <div className="space-y-6">
          {/* Source Overview & Metrics */}
          <section className="grid gap-4 rounded-xl border bg-white p-6 shadow-sm md:grid-cols-4">
            <div className="md:col-span-2 space-y-1">
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                Source Donation: #{recallData.donation.donation_id}
              </span>
              <h2 className="text-xl font-bold mt-2">{recallData.donation.donor_name}</h2>
              <p className="text-sm text-gray-500">
                Bag: <span className="font-mono font-semibold">{recallData.donation.bag_number}</span> · Blood Group: <span className="font-bold text-red-700">{recallData.donation.blood_group}</span>
              </p>
              <p className="text-xs text-gray-400">
                Donated: {new Date(recallData.donation.donated_at).toLocaleString()} · Phone: {recallData.donation.donor_phone || "—"}
              </p>
            </div>

            <div className="flex flex-col justify-center rounded-lg border bg-slate-50 p-4 text-center">
              <span className="text-xs text-gray-500 uppercase font-semibold">In-Stock At Risk</span>
              <span className="text-3xl font-bold text-amber-600">{recallData.summary.inStockCount}</span>
              <span className="text-xs text-gray-400">Available / Reserved</span>
            </div>

            <div className="flex flex-col justify-center rounded-lg border bg-slate-50 p-4 text-center">
              <span className="text-xs text-gray-500 uppercase font-semibold">Exposed Patients</span>
              <span className="text-3xl font-bold text-red-600">{recallData.summary.issuedCount}</span>
              <span className="text-xs text-gray-400">Already Transfused</span>
            </div>

            {recallData.summary.inStockCount > 0 && (
              <div className="md:col-span-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-medium text-red-800">
                  ⚠️ Action required: {recallData.summary.inStockCount} derived unit(s) are currently in active stock and must be quarantined.
                </p>
                <button
                  onClick={handleQuarantine}
                  className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800"
                >
                  Quarantine In-Stock Units
                </button>
              </div>
            )}
          </section>

          {/* Transfused Patients Notification List */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-red-700">
                🚨 Transfused Recipients & Hospital Notification List ({recallData.transfused.length})
              </h2>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-red-50 text-red-950 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Unit Code</th>
                    <th className="px-4 py-3">Component</th>
                    <th className="px-4 py-3">Transfused Patient</th>
                    <th className="px-4 py-3">Patient Group</th>
                    <th className="px-4 py-3">Hospital Contact</th>
                    <th className="px-4 py-3">Issued Date</th>
                    <th className="px-4 py-3">Clinical Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recallData.transfused.map((u) => (
                    <tr key={u.unit_id} className="hover:bg-red-50/50">
                      <td className="px-4 py-3 font-mono font-semibold">{u.unit_code}</td>
                      <td className="px-4 py-3 font-medium">{u.component_name}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {u.patient_name} <span className="text-xs text-gray-400">({u.hospital_patient_ref})</span>
                      </td>
                      <td className="px-4 py-3 font-bold text-red-800">{u.patient_blood_group || u.blood_group}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{u.hospital_name}</span>
                        <div className="text-xs text-gray-500">Ph: {u.hospital_phone || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {u.issued_at ? new Date(u.issued_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-800">
                          Notify Hospital HTC
                        </span>
                      </td>
                    </tr>
                  ))}
                  {recallData.transfused.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-gray-500">
                        No components from this donation were issued to patients. No recipient exposure detected.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Full Recursive Component Lineage Tree */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Full Component Lineage Tree ({recallData.units.length} total units)</h2>
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-4 py-3">Lineage Depth</th>
                    <th className="px-4 py-3">Unit ID</th>
                    <th className="px-4 py-3">Unit Code</th>
                    <th className="px-4 py-3">Component Type</th>
                    <th className="px-4 py-3">Blood Group</th>
                    <th className="px-4 py-3">Current Status</th>
                    <th className="px-4 py-3">Expiry Date</th>
                    <th className="px-4 py-3">Lineage Relationship</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recallData.units.map((u) => (
                    <tr key={u.unit_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold">
                          {u.depth === 0 ? "Root Bag" : `Level ${u.depth}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">#{u.unit_id}</td>
                      <td className="px-4 py-3 font-mono font-semibold">{u.unit_code}</td>
                      <td className="px-4 py-3 font-medium">{u.component_name} ({u.component_code})</td>
                      <td className="px-4 py-3 font-bold text-red-700">{u.blood_group}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
                            u.status === "available"
                              ? "bg-green-100 text-green-800"
                              : u.status === "issued"
                              ? "bg-purple-100 text-purple-800"
                              : u.status === "reserved"
                              ? "bg-amber-100 text-amber-800"
                              : u.status === "processed"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(u.expires_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {u.parent_unit_id ? `Derived from Unit #${u.parent_unit_id}` : "Parent Whole Blood Bag"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
