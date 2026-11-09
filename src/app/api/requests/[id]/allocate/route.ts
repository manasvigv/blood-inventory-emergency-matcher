import { handle } from "@/lib/api";
import { db } from "@/lib/mysql";
import { requireApiRole, HttpError } from "@/lib/session";
import type { RowDataPacket } from "mysql2";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const session = await requireApiRole("admin", "hospital");
    const { id } = await context.params;
    const requestId = Number(id);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new HttpError(400, "Invalid request ID");
    }

    const [rows] = await db(session.role).query<RowDataPacket[][]>(
      "CALL sp_allocate_fefo(?)",
      [requestId]
    );

    const result = rows[0]?.[0];
    if (!result) throw new HttpError(500, "Allocation failed to return status");

    return {
      success: true,
      request_id: requestId,
      allocated_units: Number(result.allocated_units || 0),
      remaining_units: Number(result.remaining_units || 0),
      status: String(result.status || "pending")
    };
  });
}
