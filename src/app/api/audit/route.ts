import { handle, readJson, badRequest } from "@/lib/api";
import { getMongo } from "@/lib/mongo";
import { requireApiRole, HttpError } from "@/lib/session";
import { ObjectId } from "mongodb";

export async function GET(req: Request) {
  return handle(async () => {
    await requireApiRole("admin", "lab", "hospital");
    const { searchParams } = new URL(req.url);
    const unitIdParam = searchParams.get("unitId");
    const unitCodeParam = searchParams.get("unitCode")?.trim();
    const eventType = searchParams.get("eventType")?.trim();

    const db = await getMongo();
    const query: Record<string, unknown> = {};

    if (unitIdParam) {
      query.unitId = Number(unitIdParam);
    } else if (unitCodeParam) {
      query.unitCode = unitCodeParam;
    }

    if (eventType && eventType !== "all") {
      query.eventType = eventType;
    }

    const events = await db
      .collection("audit_log")
      .find(query)
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    // Aggregation summary by event type
    const summary = await db
      .collection("audit_log")
      .aggregate([
        { $group: { _id: "$eventType", count: { $sum: 1 } } }
      ])
      .toArray();

    return {
      events: events.map((e) => ({
        ...e,
        _id: e._id.toString()
      })),
      summary: Object.fromEntries(summary.map((s) => [s._id, s.count])),
      totalCount: events.length
    };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const body = await readJson<{
      unitId?: number;
      unitCode?: string;
      eventType?: string;
      actor?: string;
      details?: Record<string, unknown>;
    }>(req);

    const unitId = Number(body.unitId);
    const eventType = String(body.eventType || "status_change");
    const unitCode = String(body.unitCode || `UNIT-${unitId}`);
    const actor = String(body.actor || session.name || session.role);
    const details = body.details || {};

    if (!unitId || isNaN(unitId)) {
      badRequest("Valid unitId is required");
    }

    const allowedEvents = [
      "collected",
      "tested",
      "status_change",
      "reserved",
      "issued",
      "recalled",
      "discarded",
      "expired"
    ];

    if (!allowedEvents.includes(eventType)) {
      badRequest(`Invalid eventType. Allowed: ${allowedEvents.join(", ")}`);
    }

    const db = await getMongo();
    const eventDoc = {
      unitId,
      unitCode,
      eventType,
      actor,
      details,
      timestamp: new Date()
    };

    const result = await db.collection("audit_log").insertOne(eventDoc);

    return {
      success: true,
      insertedId: result.insertedId.toString(),
      event: eventDoc
    };
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const body = await readJson<{
      id?: string;
      notes?: string;
      details?: Record<string, unknown>;
    }>(req);

    if (!body.id) {
      badRequest("Audit log document id is required");
    }

    const db = await getMongo();
    const updateFields: Record<string, unknown> = {
      "details.updatedAt": new Date(),
      "details.updatedBy": session.name || session.role
    };

    if (body.notes) {
      updateFields["details.reviewNotes"] = body.notes;
    }

    if (body.details) {
      for (const [key, val] of Object.entries(body.details)) {
        updateFields[`details.${key}`] = val;
      }
    }

    const result = await db.collection("audit_log").updateOne(
      { _id: new ObjectId(body.id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      throw new HttpError(404, "Audit log event not found");
    }

    return { success: true, modifiedCount: result.modifiedCount };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    await requireApiRole("admin");
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      badRequest("Audit log document id is required");
    }

    const db = await getMongo();
    const result = await db.collection("audit_log").deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      throw new HttpError(404, "Audit event not found");
    }

    return { success: true, deletedCount: result.deletedCount };
  });
}
