import { handle, readJson, badRequest } from "@/lib/api";
import { db } from "@/lib/mysql";
import { requireApiRole, HttpError } from "@/lib/session";
import { getMongo } from "@/lib/mongo";
import type { RowDataPacket } from "mysql2";

interface EmergencyInput {
  hospital_id?: number;
  patient_id?: number;
  blood_group?: string;
  rbc_qty?: number;
  plt_qty?: number;
  ffp_qty?: number;
  notes?: string;
}

export async function GET() {
  return handle(async () => {
    const session = await requireApiRole("admin", "hospital");

    const [hospitals] = await db(session.role).query<RowDataPacket[]>(
      "SELECT hospital_id, name FROM hospital ORDER BY name"
    );

    const [patients] = await db(session.role).query<RowDataPacket[]>(
      `SELECT patient_id, hospital_id, full_name, blood_group
       FROM patient ORDER BY full_name`
    );

    const [reservations] = await db(session.role).query<RowDataPacket[]>(`
      SELECT er.*, h.name AS hospital_name, p.full_name AS patient_name,
             COUNT(eri.item_id) AS total_items
      FROM emergency_reservation er
      JOIN hospital h ON h.hospital_id = er.hospital_id
      JOIN patient p ON p.patient_id = er.patient_id
      LEFT JOIN emergency_reservation_item eri ON eri.reservation_id = er.reservation_id
      GROUP BY er.reservation_id
      ORDER BY er.created_at DESC
      LIMIT 50
    `);

    return { hospitals, patients, reservations };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "hospital");
    const body = await readJson<EmergencyInput>(req);

    const hospitalId = session.role === "hospital" && session.hospitalId
      ? session.hospitalId
      : Number(body.hospital_id);

    const patientId = Number(body.patient_id);
    const bloodGroup = String(body.blood_group || "");
    const rbcQty = Math.max(0, Number(body.rbc_qty || 0));
    const pltQty = Math.max(0, Number(body.plt_qty || 0));
    const ffpQty = Math.max(0, Number(body.ffp_qty || 0));
    const notes = String(body.notes || "Emergency bundle reservation").slice(0, 255);

    if (!hospitalId || !patientId) {
      badRequest("Hospital and patient are required");
    }

    if (!["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].includes(bloodGroup)) {
      badRequest("Invalid recipient blood group");
    }

    if (rbcQty + pltQty + ffpQty <= 0) {
      badRequest("At least one blood component quantity must be greater than zero");
    }

    // Call atomic stored procedure
    const [rows] = await db(session.role).query<RowDataPacket[][]>(
      "CALL sp_reserve_emergency_bundle(?, ?, ?, ?, ?, ?, ?)",
      [hospitalId, patientId, bloodGroup, rbcQty, pltQty, ffpQty, notes]
    );

    const outcome = rows[0]?.[0];
    if (!outcome) {
      throw new HttpError(500, "Emergency bundle procedure failed to return result");
    }

    const success = Boolean(outcome.success);

    // If successfully reserved, query reserved units and log to MongoDB audit
    let reservedUnits: RowDataPacket[] = [];
    if (success && outcome.reservation_id) {
      const [units] = await db(session.role).query<RowDataPacket[]>(`
        SELECT eri.item_id, eri.family_code, bc.unit_id, bc.unit_code,
               bc.blood_group, bc.component_code, bc.expires_at
        FROM emergency_reservation_item eri
        JOIN blood_component bc ON bc.unit_id = eri.unit_id
        WHERE eri.reservation_id = ?
      `, [outcome.reservation_id]);

      reservedUnits = units;

      try {
        const mongo = await getMongo();
        if (mongo) {
          const auditDocs = units.map((u) => ({
            unitId: u.unit_id,
            unitCode: u.unit_code,
            eventType: "reserved",
            actor: session.name || session.role,
            details: {
              reservation_id: outcome.reservation_id,
              emergency: true,
              hospital_id: hospitalId,
              patient_id: patientId
            },
            timestamp: new Date()
          }));
          await mongo.collection("audit_log").insertMany(auditDocs);
        }
      } catch (err) {
        console.warn("MongoDB audit logging error in emergency bundle:", err);
      }
    }

    return {
      success,
      reservation_id: outcome.reservation_id,
      message: outcome.message,
      total_reserved: Number(outcome.total_reserved || 0),
      units: reservedUnits
    };
  });
}
