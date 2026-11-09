import { handle } from "@/lib/api";
import { db } from "@/lib/mysql";
import { requireApiRole } from "@/lib/session";
import type { RowDataPacket } from "mysql2";

export async function GET() {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab", "hospital");

    const [rows] = await db(session.role).query<RowDataPacket[]>(
      "SELECT * FROM v_unit_status LIMIT 500"
    );

    return rows;
  });
}
