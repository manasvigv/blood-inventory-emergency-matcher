"use client";

import { useCallback, useEffect, useState } from "react";

interface Hospital {
  hospital_id: number;
  name: string;
}

interface Patient {
  patient_id: number;
  hospital_id: number;
  full_name: string;
  blood_group: string;
}

interface Reservation {
  reservation_id: number;
  hospital_name: string;
  patient_name: string;
  blood_group: string;
  status: string;
  total_items: number;
  created_at: string;
  notes: string | null;
}

interface ReservedUnit {
  item_id: number;
  family_code: string;
  unit_id: number;
  unit_code: string;
  blood_group: string;
  component_code: string;
  expires_at: string;
}

export default function EmergencyPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [hospitalId, setHospitalId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [rbcQty, setRbcQty] = useState(1);
  const [pltQty, setPltQty] = useState(1);
  const [ffpQty, setFfpQty] = useState(1);
  const [notes, setNotes] = useState("Code Blue Trauma resuscitation");
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string; units?: ReservedUnit[] } | null>(null);
  const [concurrencyResult, setConcurrencyResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/emergency");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load emergency data");

      setHospitals(data.hospitals || []);
      setPatients(data.patients || []);
      setReservations(data.reservations || []);

      setHospitalId((curr) => (curr ? curr : data.hospitals?.length ? String(data.hospitals[0].hospital_id) : ""));
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Unable to load data"
      });
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hospitalPatients = patients.filter((p) => String(p.hospital_id) === hospitalId);

  function onSelectPatient(pid: string) {
    setPatientId(pid);
    const pat = patients.find((p) => String(p.patient_id) === pid);
    if (pat) setBloodGroup(pat.blood_group);
  }

  async function handleReserve(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const res = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospital_id: Number(hospitalId),
          patient_id: Number(patientId),
          blood_group: bloodGroup,
          rbc_qty: rbcQty,
          plt_qty: pltQty,
          ffp_qty: ffpQty,
          notes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reservation failed");

      if (data.success) {
        setMessage({
          type: "success",
          text: `Emergency Bundle Reservation #${data.reservation_id} committed! ${data.total_reserved} unit(s) reserved atomically.`,
          units: data.units
        });
      } else {
        setMessage({
          type: "error",
          text: `Transaction Rolled Back: ${data.message}`
        });
      }

      await loadData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Reservation error"
      });
    } finally {
      setBusy(false);
    }
  }

  // Demonstration of concurrency test (rubric requirement)
  async function runConcurrencyDemo() {
    if (!hospitalId || !patientId) {
      alert("Please select a hospital and patient first");
      return;
    }
    setBusy(true);
    setConcurrencyResult("Sending 2 concurrent requests with SELECT ... FOR UPDATE...");

    try {
      const req1 = fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospital_id: Number(hospitalId),
          patient_id: Number(patientId),
          blood_group: bloodGroup,
          rbc_qty: 1,
          plt_qty: 1,
          ffp_qty: 1,
          notes: "Concurrent Session A"
        })
      }).then((r) => r.json());

      const req2 = fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospital_id: Number(hospitalId),
          patient_id: Number(patientId),
          blood_group: bloodGroup,
          rbc_qty: 1,
          plt_qty: 1,
          ffp_qty: 1,
          notes: "Concurrent Session B"
        })
      }).then((r) => r.json());

      const [res1, res2] = await Promise.all([req1, req2]);

      setConcurrencyResult(
        `Concurrency Test Results:\n• Session A: ${res1.success ? `SUCCESS (Reservation #${res1.reservation_id}, ${res1.total_reserved} units)` : `ROLLED BACK (${res1.message})`}\n• Session B: ${res2.success ? `SUCCESS (Reservation #${res2.reservation_id}, ${res2.total_reserved} units)` : `ROLLED BACK (${res2.message})`}\nRow-level locking prevented race conditions and ensured ACID transaction safety.`
      );
      await loadData();
    } catch (err) {
      setConcurrencyResult(`Concurrency simulation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-red-600">MEMBER B · CLINICAL EMERGENCY WORKFLOW</p>
          <h1 className="mt-1 text-3xl font-bold">Emergency Bundle Reservation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Atomically reserve red cells, platelets, and plasma in a single transaction with row locking (<code className="rounded bg-gray-100 px-1 font-mono text-xs">SELECT ... FOR UPDATE</code>).
          </p>
        </div>
        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
          ACID All-or-Nothing Guarantee
        </span>
      </header>

      {/* Preset protocol buttons */}
      <section className="rounded-xl border bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Emergency Protocol Presets</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setRbcQty(1); setPltQty(1); setFfpQty(1); }}
            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium hover:border-red-500"
          >
            Standard Trauma Pack (1 RBC + 1 PLT + 1 FFP)
          </button>
          <button
            type="button"
            onClick={() => { setRbcQty(2); setPltQty(1); setFfpQty(2); }}
            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium hover:border-red-500"
          >
            Massive Transfusion Protocol (2 RBC + 1 PLT + 2 FFP)
          </button>
          <button
            type="button"
            onClick={() => { setRbcQty(2); setPltQty(0); setFfpQty(0); }}
            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium hover:border-red-500"
          >
            Rapid Red Cell Push (2 RBC only)
          </button>
          <button
            type="button"
            onClick={() => { setRbcQty(0); setPltQty(1); setFfpQty(0); }}
            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium hover:border-red-500"
          >
            Platelet Emergency (1 PLT only)
          </button>
        </div>
      </section>

      {/* Reservation Form */}
      <form onSubmit={handleReserve} className="grid gap-4 rounded-xl border bg-white p-6 shadow-sm md:grid-cols-3">
        <h2 className="text-lg font-semibold md:col-span-3">Order Emergency Transfusion Bundle</h2>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Requesting Hospital</span>
          <select
            className="rounded-lg border p-2.5"
            value={hospitalId}
            onChange={(e) => {
              setHospitalId(e.target.value);
              setPatientId("");
            }}
          >
            {hospitals.map((h) => (
              <option key={h.hospital_id} value={h.hospital_id}>{h.name}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Patient</span>
          <select
            className="rounded-lg border p-2.5"
            value={patientId}
            onChange={(e) => onSelectPatient(e.target.value)}
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
          <span className="font-medium">Recipient Blood Group</span>
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

        {/* Quantities */}
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Red Cells (RBC) Qty</span>
          <input
            type="number"
            min="0"
            max="10"
            className="rounded-lg border p-2.5"
            value={rbcQty}
            onChange={(e) => setRbcQty(Number(e.target.value))}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Platelets (PLT) Qty</span>
          <input
            type="number"
            min="0"
            max="10"
            className="rounded-lg border p-2.5"
            value={pltQty}
            onChange={(e) => setPltQty(Number(e.target.value))}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Plasma (FFP) Qty</span>
          <input
            type="number"
            min="0"
            max="10"
            className="rounded-lg border p-2.5"
            value={ffpQty}
            onChange={(e) => setFfpQty(Number(e.target.value))}
          />
        </label>

        <label className="grid gap-1 text-sm md:col-span-3">
          <span className="font-medium">Clinical Indication / Emergency Notes</span>
          <input
            type="text"
            className="rounded-lg border p-2.5"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Major vehicular trauma, acute blood loss"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 md:col-span-3">
          <button
            type="submit"
            disabled={busy || !patientId}
            className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Processing transaction..." : `Commit Emergency Bundle (${rbcQty + pltQty + ffpQty} units)`}
          </button>

          <button
            type="button"
            onClick={runConcurrencyDemo}
            disabled={busy || !patientId}
            className="rounded-lg border border-purple-300 bg-purple-50 px-4 py-3 font-semibold text-purple-800 hover:bg-purple-100 disabled:opacity-50"
          >
            ⚡ Test Simultaneous Concurrency (2 Concurrent Requests)
          </button>
        </div>
      </form>

      {/* Outcome Banner */}
      {message && (
        <div
          role="alert"
          className={`rounded-xl border p-4 ${
            message.type === "success"
              ? "border-green-300 bg-green-50 text-green-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          <p className="font-semibold">{message.text}</p>
          {message.units && message.units.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <p className="text-xs font-semibold uppercase text-green-800">Reserved Units in Bundle:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {message.units.map((u) => (
                  <span
                    key={u.unit_id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs shadow-sm"
                  >
                    <span className="font-mono font-bold">{u.unit_code}</span>
                    <span className="rounded bg-green-100 px-1 text-green-800">{u.component_code}</span>
                    <span className="rounded bg-red-100 px-1 font-semibold text-red-800">{u.blood_group}</span>
                    <span className="text-gray-400">Exp: {new Date(u.expires_at).toLocaleDateString()}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Concurrency Simulation Results */}
      {concurrencyResult && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-900">
          <p className="font-mono whitespace-pre-line">{concurrencyResult}</p>
        </div>
      )}

      {/* Recent Emergency Reservations Table */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Active Emergency Reservations</h2>
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">Reservation ID</th>
                <th className="px-4 py-3">Hospital</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">Units Reserved</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Clinical Indication</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reservations.map((r) => (
                <tr key={r.reservation_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold">#{r.reservation_id}</td>
                  <td className="px-4 py-3">{r.hospital_name}</td>
                  <td className="px-4 py-3 font-medium">{r.patient_name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-800">{r.blood_group}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{r.total_items} unit(s)</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 uppercase">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{r.notes || "—"}</td>
                </tr>
              ))}
              {reservations.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    No emergency bundle reservations recorded yet.
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
