"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Unit {
  unit_id: number;
  unit_code: string;
  donation_id: number;
  component_code: string;
  blood_group: string;
  volume_ml: number;
  collected_at: string;
  expires_at: string;
  status: string;
  status_changed_at: string;
  effective_status: string;
}

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    async function loadUnits() {
      try {
        const response = await fetch("/api/units");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Could not load blood units");
        }

        setUnits(Array.isArray(data) ? data : data.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadUnits();
  }, []);

  const filtered = useMemo(() => {
    return units.filter((unit) => {
      const unitStatus = String(
        unit.effective_status ?? unit.status ?? ""
      ).toLowerCase();

      const matchesStatus = status === "all" || unitStatus === status;
      const matchesSearch =
        search === "" ||
        String(unit.unit_code || "").toLowerCase().includes(search.toLowerCase()) ||
        String(unit.blood_group || "").toLowerCase().includes(search.toLowerCase()) ||
        String(unit.component_code || "").toLowerCase().includes(search.toLowerCase()) ||
        String(unit.unit_id || "").includes(search);

      return matchesStatus && matchesSearch;
    });
  }, [units, search, status]);

  const getStatus = (unit: Unit) =>
    String(unit.effective_status ?? unit.status ?? "").toLowerCase();

  const available = units.filter((u) => getStatus(u) === "available").length;
  const expired = units.filter((u) => getStatus(u) === "expired").length;
  const reserved = units.filter((u) => getStatus(u) === "reserved").length;
  const issued = units.filter((u) => getStatus(u) === "issued").length;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold tracking-wide text-red-600">MEMBER B · INVENTORY MANAGEMENT</p>
        <h1 className="mt-1 text-3xl font-bold">Blood Component Inventory</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor component bags, availability, test clearance, and expiry status.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-500">Total Units</p>
          <p className="mt-2 text-3xl font-bold">{units.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-500">Available Stock</p>
          <p className="mt-2 text-3xl font-bold text-green-600">{available}</p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-500">Reserved / Issued</p>
          <p className="mt-2 text-3xl font-bold text-purple-600">{reserved + issued}</p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-500">Expired Stock</p>
          <p className="mt-2 text-3xl font-bold text-red-600">{expired}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className="w-full rounded-lg border px-4 py-3 text-sm focus:border-red-500 focus:outline-none"
          placeholder="Search by Unit Code (e.g. BB2026...), Blood Group, Component..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="rounded-lg border px-4 py-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="collected">Collected</option>
          <option value="testing">Testing</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="issued">Issued</option>
          <option value="discarded">Discarded</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {loading && <p className="text-center p-8 text-gray-500">Loading blood units...</p>}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">Unit Code</th>
                <th className="px-4 py-3">Component</th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">Volume</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expiry Date</th>
                <th className="px-4 py-3">Audit Timeline</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((u) => {
                const s = getStatus(u);
                return (
                  <tr key={u.unit_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900">{u.unit_code}</td>
                    <td className="px-4 py-3 font-medium">{u.component_code}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-800">{u.blood_group}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.volume_ml ? `${u.volume_ml} mL` : "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                          s === "available"
                            ? "bg-green-100 text-green-800"
                            : s === "issued"
                            ? "bg-purple-100 text-purple-800"
                            : s === "reserved"
                            ? "bg-amber-100 text-amber-800"
                            : s === "expired"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {s}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(u.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/audit?unitId=${u.unit_id}`}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        View Audit Log →
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    No blood units found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm text-gray-500">
        Showing {filtered.length} of {units.length} units.
      </p>
    </main>
  );
}
