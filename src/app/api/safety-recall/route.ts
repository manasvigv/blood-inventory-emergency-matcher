import { handle, readJson, badRequest } from "@/lib/api";
import { db } from "@/lib/mysql";
import { requireApiRole, HttpError } from "@/lib/session";
import { getMongo } from "@/lib/mongo";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const { searchParams } = new URL(req.url);
    const donationIdParam = searchParams.get("donationId");
    const searchParam = searchParams.get("search")?.trim();

    let donationId: number | null = donationIdParam ? Number(donationIdParam) : null;

    if (!donationId && searchParam) {
      // Find matching donation by bag number or donor name
      const [matches] = await db(session.role).query<RowDataPacket[]>(`
        SELECT d.donation_id
        FROM donation d
        JOIN donor dr ON dr.donor_id = d.donor_id
        WHERE d.bag_number LIKE ? OR dr.full_name LIKE ?
        LIMIT 1
      `, [`%${searchParam}%`, `%${searchParam}%`]);

      if (matches.length) {
        donationId = matches[0].donation_id;
      }
    }

    if (!donationId) {
      // Return recent donations list for search suggestion
      const [recent] = await db(session.role).query<RowDataPacket[]>(`
        SELECT d.donation_id, d.bag_number, d.donated_at,
               dr.donor_id, dr.full_name AS donor_name, dr.blood_group,
               COUNT(bc.unit_id) AS component_count
        FROM donation d
        JOIN donor dr ON dr.donor_id = d.donor_id
        LEFT JOIN blood_component bc ON bc.donation_id = d.donation_id
        GROUP BY d.donation_id
        ORDER BY d.donated_at DESC
        LIMIT 20
      `);

      return { recent };
    }

    // 1. Get donation & donor details
    const [donations] = await db(session.role).query<RowDataPacket[]>(`
      SELECT d.donation_id, d.bag_number, d.donated_at, d.donation_type,
             dr.donor_id, dr.full_name AS donor_name, dr.blood_group,
             dr.phone AS donor_phone, dr.email AS donor_email
      FROM donation d
      JOIN donor dr ON dr.donor_id = d.donor_id
      WHERE d.donation_id = ?
    `, [donationId]);

    if (!donations.length) {
      throw new HttpError(404, "Donation not found");
    }

    const donation = donations[0];

    // 2. Execute Recursive Lineage Recall Procedure
    const [traceResult] = await db(session.role).query<RowDataPacket[][]>(
      "CALL sp_trace_safety_recall(?)",
      [donationId]
    );

    const units = traceResult[0] || [];

    // Filter issued units to identify exposed recipients
    const transfused = units.filter((u) => u.issue_id !== null);
    const inStock = units.filter((u) => ["available", "reserved"].includes(u.status));

    return {
      donation,
      units,
      transfused,
      summary: {
        totalUnits: units.length,
        inStockCount: inStock.length,
        issuedCount: transfused.length,
        expiredDiscardedCount: units.filter((u) => ["expired", "discarded"].includes(u.status)).length
      }
    };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin");
    const body = await readJson<{ donation_id?: number; reason?: string }>(req);
    const donationId = Number(body.donation_id);
    const reason = String(body.reason || "Donor serology positive / safety recall").slice(0, 500);

    if (!donationId) {
      badRequest("donation_id is required");
    }

    // Find all lineage units that are currently available or reserved
    const [traceResult] = await db(session.role).query<RowDataPacket[][]>(
      "CALL sp_trace_safety_recall(?)",
      [donationId]
    );

    const units = traceResult[0] || [];
    const inStockUnits = units.filter((u) => ["available", "reserved"].includes(u.status));
    const inStockIds = inStockUnits.map((u) => u.unit_id);

    let quarantinedCount = 0;
    if (inStockIds.length > 0) {
      const [updateRes] = await db(session.role).query<ResultSetHeader>(
        "UPDATE blood_component SET status = 'discarded', status_changed_at = NOW() WHERE unit_id IN (?)",
        [inStockIds]
      );
      quarantinedCount = updateRes.affectedRows;
    }

    // Log safety recall audit event in MongoDB
    try {
      const mongo = await getMongo();
      if (mongo) {
        const auditEvents = units.map((u) => ({
          unitId: u.unit_id,
          unitCode: u.unit_code,
          eventType: "recalled",
          actor: session.name || session.role,
          details: {
            donation_id: donationId,
            reason,
            quarantined: inStockIds.includes(u.unit_id),
            was_issued: u.issue_id !== null,
            patient_id: u.patient_id,
            hospital_id: u.hospital_id
          },
          timestamp: new Date()
        }));

        if (auditEvents.length > 0) {
          await mongo.collection("audit_log").insertMany(auditEvents);
        }
      }
    } catch (err) {
      console.warn("MongoDB safety recall audit logging warning:", err);
    }

    return {
      success: true,
      donation_id: donationId,
      quarantined_count: quarantinedCount,
      total_affected_units: units.length,
      issued_transfused_count: units.filter((u) => u.issue_id !== null).length,
      reason
    };
  });
}
