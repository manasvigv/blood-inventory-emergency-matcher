"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Hospital = { hospital_id: number; name: string };
type Patient = { patient_id: number; hospital_id: number; full_name: string; blood_group: string };
type RequestRow = {
  request_id: number;
  hospital_name: string;
  patient_name: string;
  blood_group: string;
  family_code: string;
  units_requested: number;
  priority: string;
  status: string;
  requested_at?: string;
};

export default function RequestsPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hospitalId, setHospitalId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [family, setFamily] = useState("RBC");
  const [units, setUnits] = useState("1");
  const [priority, setPriority] = useState("routine");
  const [message, setMessage] = useState("");
  const [isNotSignedIn, setIsNotSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/requests");
      const data = await response.json();
      if (response.status === 401) {
        setIsNotSignedIn(true);
        return;
      }
      if (!response.ok) throw new Error(data.error || "Unable to load requests");

      setIsNotSignedIn(false);
      setRequests(data.requests || []);
      setHospitals(data.hospitals || []);
      setPatients(data.patients || []);

      setHospitalId((curr) => {
        if (!curr && data.hospitals?.length) {
          const firstHospId = String(data.hospitals[0].hospital_id);
          const matchingPatients = (data.patients || []).filter(
            (p: Patient) => String(p.hospital_id) === firstHospId
          );
          if (matchingPatients.length) {
            setPatientId(String(matchingPatients[0].patient_id));
            setBloodGroup(matchingPatients[0].blood_group);
          }
          return firstHospId;
        }
        return curr;
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load requests");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hospitalPatients = patients.filter(
    (p) => String(p.hospital_id) === hospitalId
  );

  function handleHospitalChange(newHospId: string) {
    setHospitalId(newHospId);
    const matching = patients.filter((p) => String(p.hospital_id) === newHospId);
    if (matching.length) {
      setPatientId(String(matching[0].patient_id));
      setBloodGroup(matching[0].blood_group);
    } else {
      setPatientId("");
    }
  }

  function handlePatientChange(newPid: string) {
    setPatientId(newPid);
    const pat = patients.find((p) => String(p.patient_id) === newPid);
    if (pat) setBloodGroup(pat.blood_group);
  }

  async function createRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospital_id: Number(hospitalId),
          patient_id: Number(patientId),
          blood_group: bloodGroup,
          family_code: family,
          units_requested: Number(units),
          priority
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request creation failed");
      setMessage(`Blood Request #${data.request_id} created successfully! You can now allocate compatible stock via FEFO.`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function allocate(id: number) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/requests/${id}/allocate`, {
        method: "POST"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Allocation failed");
      setMessage(
        `FEFO Allocation Complete: Allocated ${data.allocated_units} unit(s). Remaining: ${data.remaining_units}. Status: ${data.status.toUpperCase()}`
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Allocation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-red-600">MEMBER B · HOSPITAL ISSUING WORKFLOW</p>
          <h1 className="mt-1 text-3xl font-bold">Hospital Blood Requests</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create patient blood requests and allocate eligible compatible units prioritising earliest expiry (FEFO).
          </p>
        </div>
        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
          FEFO Ordering & Compatibility Joins
        </span>
      </header>

      {isNotSignedIn && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm space-y-2">
          <p className="font-bold text-amber-900">Sign In Required</p>
          <p className="text-sm text-amber-800">
            You must be signed in as a Hospital Coordinator or Administrator to create requests and allocate blood units.
          </p>
          <Link
            href="/login"
            className="inline-block rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            Sign In with Demo Hospital Account →
          </Link>
        </div>
      )}

      {/* Request Form */}
      <form onSubmit={createRequest} className="grid gap-4 rounded-xl border bg-white p-6 shadow-sm md:grid-cols-2">
        <h2 className="text-lg font-semibold md:col-span-2">Create New Hospital Blood Request</h2>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Requesting Hospital</span>
          <select
            className="rounded-lg border p-2.5"
            value={hospitalId}
            onChange={(e) => handleHospitalChange(e.target.value)}
          >
            {hospitals.map((h) => (
              <option key={h.hospital_id} value={h.hospital_id}>{h.name}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Registered Patient</span>
          <select
            className="rounded-lg border p-2.5"
            value={patientId}
            onChange={(e) => handlePatientChange(e.target.value)}
            required
          >
            <option value="">Select patient</option>
            {hospitalPatients.map((p) => (
              <option key={p.patient_id} value={p.patient_id}>
                {p.full_name} ({p.blood_group})
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Required Blood Group</span>
          <select
            className="rounded-lg border p-2.5 font-semibold text-red-700"
            value={bloodGroup}
            onChange={(e) => setBloodGroup(e.target.value)}
          >
            {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Stock Family Component</span>
          <select
            className="rounded-lg border p-2.5"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
          >
            <option value="RBC">Packed Red Blood Cells (RBC)</option>
            <option value="PLT">Platelets (PLT)</option>
            <option value="FFP">Fresh Frozen Plasma (FFP)</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Units Requested</span>
          <input
            className="rounded-lg border p-2.5"
            type="number"
            min="1"
            max="20"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Clinical Priority</span>
          <select
            className="rounded-lg border p-2.5"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </select>
        </label>

        <button
          disabled={busy || !hospitals.length || !patientId}
          className="rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50 md:col-span-2 shadow"
        >
          {busy ? "Submitting request..." : "Create Blood Request"}
        </button>
      </form>

      {message && (
        <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-900">
          {message}
        </div>
      )}

      {/* Requests Queue Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Active Request Queue & Issuing ({requests.length})</h2>
          <span className="text-xs text-gray-500">Sorted by priority and date</span>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Hospital</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">Component</th>
                <th className="px-4 py-3">Units</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">FEFO Issuing</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.map((r) => (
                <tr key={r.request_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold">#{r.request_id}</td>
                  <td className="px-4 py-3">{r.hospital_name}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{r.patient_name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-800">{r.blood_group}</span>
                  </td>
                  <td className="px-4 py-3 font-medium">{r.family_code}</td>
                  <td className="px-4 py-3 font-semibold">{r.units_requested}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${
                        r.priority === "emergency"
                          ? "bg-red-100 text-red-800"
                          : r.priority === "urgent"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {r.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                        r.status === "fulfilled"
                          ? "bg-green-100 text-green-800"
                          : r.status === "partially_fulfilled"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {["pending", "approved", "partially_fulfilled"].includes(r.status) ? (
                      <button
                        disabled={busy}
                        onClick={() => allocate(r.request_id)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Allocate FEFO
                      </button>
                    ) : (
                      <span className="text-xs text-green-600 font-semibold">✓ Fulfilled</span>
                    )}
                  </td>
                </tr>
              ))}
              {!requests.length && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    No requests currently in the queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
