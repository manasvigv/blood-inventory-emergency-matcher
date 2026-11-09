import { handle, readJson, badRequest, toInt } from "@/lib/api";
import { db } from "@/lib/mysql";
import { requireApiRole } from "@/lib/session";
import { getMongo } from "@/lib/mongo";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

interface TestInput {
  test_status?: string;
  remarks?: string;
}

interface DonationRow extends RowDataPacket {
  donation_id: number;
}

interface ExistingTest extends RowDataPacket {
  test_id: number;
  test_status: string;
}

interface ComponentCount extends RowDataPacket {
  total: number;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const { id } = await context.params;
    const donationId = toInt(id, "Donation ID");
    if (donationId <= 0) badRequest("Invalid donation ID");

    const body = await readJson<TestInput>(req);
    const status = body.test_status;

    if (status !== "passed" && status !== "failed") {
      badRequest("test_status must be 'passed' or 'failed'");
    }

    const remarks = typeof body.remarks === "string"
      ? body.remarks.trim().slice(0, 500)
      : null;

    const connection = await db(session.role).getConnection();

    try {
      await connection.beginTransaction();

      const [donations] = await connection.execute<DonationRow[]>(
        `SELECT donation_id
         FROM donation
         WHERE donation_id = ?
         FOR UPDATE`,
        [donationId]
      );

      if (donations.length === 0) {
        throw Object.assign(new Error("Donation not found"), { status: 404 });
      }

      const [components] = await connection.execute<ComponentCount[]>(
        `SELECT COUNT(*) AS total
         FROM blood_component
         WHERE donation_id = ?
           AND status IN ('collected', 'testing')`,
        [donationId]
      );

      if (!components[0] || components[0].total === 0) {
        throw Object.assign(
          new Error("No collected or testing components are available for this donation"),
          { status: 409 }
        );
      }

      const [existing] = await connection.execute<ExistingTest[]>(
        `SELECT test_id, test_status
         FROM test_result
         WHERE donation_id = ?
         FOR UPDATE`,
        [donationId]
      );

      if (existing.length > 0 && existing[0].test_status !== "pending") {
        throw Object.assign(
          new Error("This donation already has a final test result"),
          { status: 409 }
        );
      }

      if (existing.length > 0) {
        await connection.execute(
          `UPDATE test_result
           SET test_status = ?,
               tested_by = ?,
               tested_at = NOW(),
               remarks = ?
           WHERE donation_id = ?`,
          [status, session.userId, remarks, donationId]
        );
      } else {
        await connection.execute(
          `INSERT INTO test_result
             (donation_id, test_status, tested_by, tested_at, remarks)
           VALUES (?, ?, ?, NOW(), ?)`,
          [donationId, status, session.userId, remarks]
        );
      }

      const componentStatus = status === "passed" ? "available" : "discarded";

      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE blood_component
         SET status = ?
         WHERE donation_id = ?
           AND status IN ('collected', 'testing')`,
        [componentStatus, donationId]
      );

      // Query component unit codes for audit
      const [affectedUnits] = await connection.execute<RowDataPacket[]>(
        "SELECT unit_id, unit_code FROM blood_component WHERE donation_id = ?",
        [donationId]
      );

      await connection.commit();

      // Log test outcome to MongoDB audit_log
      try {
        const mongoDb = await getMongo();
        if (mongoDb && affectedUnits.length > 0) {
          const auditDocs = affectedUnits.map((u) => ({
            unitId: u.unit_id,
            unitCode: u.unit_code,
            eventType: "tested",
            actor: session.name || session.role,
            details: {
              outcome: status,
              remarks,
              donation_id: donationId,
              component_status: componentStatus
            },
            timestamp: new Date()
          }));
          await mongoDb.collection("audit_log").insertMany(auditDocs);
        }
      } catch (auditErr) {
        console.warn("MongoDB lab audit logging warning:", auditErr);
      }

      return {
        success: true,
        donation_id: donationId,
        test_status: status,
        components_updated: updated.affectedRows,
        component_status: componentStatus
      };
    } catch (error) {
      await connection.rollback();

      const err = error as Error & { status?: number };
      if (err.status) {
        const { HttpError } = await import("@/lib/session");
        throw new HttpError(err.status, err.message);
      }
      throw error;
    } finally {
      connection.release();
    }
  });
}
