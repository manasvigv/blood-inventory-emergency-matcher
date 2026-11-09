import { handle, readJson, badRequest } from "@/lib/api";
import { db } from "@/lib/mysql";
import { requireApiRole } from "@/lib/session";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

interface RequestInput {
  hospital_id?: number;
  patient_id?: number;
  blood_group?: string;
  family_code?: string;
  paediatric?: boolean;
  units_requested?: number;
  priority?: string;
  notes?: string;
}

export async function GET() {
  return handle(async () => {
    const session = await requireApiRole("admin", "hospital");

    const [requests] = await db(session.role).query<RowDataPacket[]>(`
      SELECT br.*, h.name AS hospital_name,
             p.full_name AS patient_name
      FROM blood_request br
      JOIN hospital h ON h.hospital_id = br.hospital_id
      JOIN patient p ON p.patient_id = br.patient_id
      ORDER BY
        FIELD(br.priority, 'emergency', 'urgent', 'routine'),
        br.requested_at DESC
    `);

    const [hospitals] = await db(session.role).query<RowDataPacket[]>(
      "SELECT hospital_id, name FROM hospital ORDER BY name"
    );

    const [patients] = await db(session.role).query<RowDataPacket[]>(
      `SELECT patient_id, hospital_id, full_name, blood_group
       FROM patient ORDER BY full_name`
    );

    return { requests, hospitals, patients };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "hospital");
    const body = await readJson<RequestInput>(req);

    const hospitalId = session.role === "hospital"
      ? session.hospitalId
      : Number(body.hospital_id);

    const patientId = Number(body.patient_id);
    const units = Number(body.units_requested);

    if (!hospitalId || !patientId || !Number.isInteger(units) || units < 1 || units > 20) {
      badRequest("Valid hospital, patient and units (1–20) are required");
    }

    const bloodGroup = String(body.blood_group || "");
    const family = String(body.family_code || "");
    const priority = String(body.priority || "routine");

    if (!["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].includes(bloodGroup)) {
      badRequest("Invalid blood group");
    }

    if (!["RBC", "PLT", "FFP"].includes(family)) {
      badRequest("Component must be RBC, PLT or FFP");
    }

    if (!["routine", "urgent", "emergency"].includes(priority)) {
      badRequest("Invalid priority");
    }

    const [patients] = await db(session.role).execute<RowDataPacket[]>(
      `SELECT patient_id FROM patient
       WHERE patient_id = ? AND hospital_id = ?`,
      [patientId, hospitalId]
    );

    if (!patients.length) badRequest("Patient does not belong to this hospital");

    const [result] = await db(session.role).execute<ResultSetHeader>(
      `INSERT INTO blood_request
       (hospital_id, patient_id, blood_group, family_code,
        paediatric, units_requested, priority, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        hospitalId, patientId, bloodGroup, family,
        body.paediatric ? 1 : 0, units, priority,
        String(body.notes || "").slice(0, 500) || null
      ]
    );

    return { success: true, request_id: result.insertId };
  });
}
