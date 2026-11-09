"use client";

import { useCallback, useEffect, useState } from "react";

interface AuditEvent {
  _id: string;
  unitId: number;
  unitCode: string;
  eventType: string;
  actor: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [unitFilter, setUnitFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  // Create event form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUnitId, setNewUnitId] = useState("");
  const [newUnitCode, setNewUnitCode] = useState("");
  const [newEventType, setNewEventType] = useState("tested");
  const [newNotes, setNewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (unitFilter.trim()) {
        if (/^\d+$/.test(unitFilter.trim())) {
          params.set("unitId", unitFilter.trim());
        } else {
          params.set("unitCode", unitFilter.trim());
        }
      }
      if (typeFilter && typeFilter !== "all") {
        params.set("eventType", typeFilter);
      }

      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load audit events");

      setEvents(data.events || []);
      setSummary(data.summary || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit events");
    } finally {
      setLoading(false);
    }
  }, [unitFilter, typeFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newUnitId) return;

    setSubmitting(true);
    setActionMessage("");

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: Number(newUnitId),
          unitCode: newUnitCode || `UNIT-${newUnitId}`,
          eventType: newEventType,
          details: {
            manualNote: newNotes || "Manual audit entry",
            source: "auditor_console"
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to insert audit event");

      setActionMessage(`Audit event added successfully (Doc ID: ${data.insertedId})`);
      setShowAddForm(false);
      setNewUnitId("");
      setNewUnitCode("");
      setNewNotes("");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add audit event");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEvent(id: string) {
    if (!confirm("Are you sure you want to delete this audit event?")) return;

    try {
      const res = await fetch(`/api/audit?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");

      setActionMessage("Audit event deleted from MongoDB.");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const getEventBadge = (type: string) => {
    switch (type) {
      case "tested":
        return "bg-green-100 text-green-800 border-green-200";
      case "issued":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "reserved":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "recalled":
      case "discarded":
        return "bg-red-100 text-red-800 border-red-200";
      case "expired":
        return "bg-gray-200 text-gray-800 border-gray-300";
      default:
        return "bg-blue-100 text-blue-800 border-blue-200";
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-red-600">MEMBER B · MONGODB AUDIT STORAGE</p>
          <h1 className="mt-1 text-3xl font-bold">Unit Audit History</h1>
          <p className="mt-1 text-sm text-gray-500">
            Append-only NoSQL event stream recording unit lifecycle transitions with actor accountability, timestamps, and schema validation.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          {showAddForm ? "Cancel" : "+ Record Audit Event"}
        </button>
      </header>

      {/* Summary KPI Badges */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {Object.entries(summary).map(([type, count]) => (
          <button
            key={type}
            type="button"
            onClick={() => setTypeFilter(type === typeFilter ? "all" : type)}
            className={`rounded-xl border p-3 text-left transition ${
              typeFilter === type
                ? "border-red-600 bg-red-50 ring-2 ring-red-200"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-xs uppercase font-medium text-gray-500">{type}</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{count}</p>
          </button>
        ))}
      </section>

      {/* Add Event Form Modal */}
      {showAddForm && (
        <form onSubmit={handleAddEvent} className="rounded-xl border border-red-200 bg-red-50/50 p-5 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-red-950">Record Unit Event (MongoDB Document Insert)</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Unit ID</span>
              <input
                type="number"
                required
                className="rounded-lg border bg-white p-2.5"
                placeholder="e.g. 8343"
                value={newUnitId}
                onChange={(e) => setNewUnitId(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Unit Code</span>
              <input
                type="text"
                className="rounded-lg border bg-white p-2.5"
                placeholder="e.g. BB2026001864-RBC"
                value={newUnitCode}
                onChange={(e) => setNewUnitCode(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Event Type</span>
              <select
                className="rounded-lg border bg-white p-2.5"
                value={newEventType}
                onChange={(e) => setNewEventType(e.target.value)}
              >
                <option value="collected">collected</option>
                <option value="tested">tested</option>
                <option value="status_change">status_change</option>
                <option value="reserved">reserved</option>
                <option value="issued">issued</option>
                <option value="recalled">recalled</option>
                <option value="discarded">discarded</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Audit Notes / Metadata</span>
            <input
              type="text"
              className="rounded-lg border bg-white p-2.5"
              placeholder="e.g. Cleared by senior haematologist for emergency issue"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save to MongoDB audit_log"}
          </button>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          className="flex-1 rounded-lg border p-3 text-sm"
          placeholder="Filter by Unit ID (e.g. 8343) or Unit Code (e.g. BB2026001864-RBC)..."
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadEvents()}
        />
        <select
          className="rounded-lg border px-4 py-3 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All event types</option>
          <option value="collected">Collected</option>
          <option value="tested">Tested</option>
          <option value="status_change">Status Change</option>
          <option value="reserved">Reserved</option>
          <option value="issued">Issued</option>
          <option value="recalled">Recalled</option>
          <option value="discarded">Discarded</option>
          <option value="expired">Expired</option>
        </select>
        <button
          onClick={loadEvents}
          disabled={loading}
          className="rounded-lg bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Apply Filter"}
        </button>
      </div>

      {actionMessage && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">
          {actionMessage}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Timeline Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Lifecycle Event Timeline</h2>
          <span className="text-xs text-gray-500">Showing {events.length} event(s)</span>
        </div>

        {loading ? (
          <p className="p-8 text-center text-gray-500">Loading audit history from MongoDB...</p>
        ) : events.length === 0 ? (
          <p className="rounded-xl border bg-white p-8 text-center text-gray-500">
            No audit events found matching the criteria.
          </p>
        ) : (
          <div className="relative border-l-2 border-slate-200 ml-4 space-y-6 pl-6">
            {events.map((evt) => (
              <div key={evt._id} className="relative group">
                {/* Timeline node icon */}
                <div className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-600 shadow" />

                <article className="rounded-xl border bg-white p-5 shadow-sm hover:border-slate-300 transition">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${getEventBadge(evt.eventType)}`}>
                        {evt.eventType}
                      </span>
                      <span className="font-mono text-sm font-bold text-slate-800">
                        {evt.unitCode || `Unit #${evt.unitId}`}
                      </span>
                      <span className="text-xs text-gray-400">Unit ID: {evt.unitId}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {new Date(evt.timestamp).toLocaleString()}
                      </span>
                      <button
                        onClick={() => handleDeleteEvent(evt._id)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-red-600 hover:underline transition"
                        title="Delete audit entry (admin only)"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                    <span className="font-medium text-slate-700">Actor:</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono">{evt.actor}</span>
                  </div>

                  {evt.details && Object.keys(evt.details).length > 0 && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs font-mono text-slate-700">
                      <p className="font-semibold text-slate-500 mb-1">Event Details:</p>
                      <pre className="whitespace-pre-wrap">{JSON.stringify(evt.details, null, 2)}</pre>
                    </div>
                  )}
                </article>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
