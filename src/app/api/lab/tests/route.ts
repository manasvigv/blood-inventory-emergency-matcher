import { handle } from "@/lib/api";
import { db } from "@/lib/mysql";
import { requireApiRole } from "@/lib/session";
import type { RowDataPacket } from "mysql2";

interface PendingDonation extends RowDataPacket {
  donation_id: number;
  donor_id: number;
  donor_name: string;
  blood_group: string;
  donated_at: string;
  bag_number: string;
  test_status: string | null;
  component_count: number;
}

export async function GET() {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const [rows] = await db(session.role).query<PendingDonation[]>(`
      SELECT
        d.donation_id,
        d.donor_id,
        dr.full_name AS donor_name,
        dr.blood_group,
        d.donated_at,
        d.bag_number,
        tr.test_status,
        COUNT(bc.unit_id) AS component_count
      FROM donation d
      JOIN donor dr ON dr.donor_id = d.donor_id
      LEFT JOIN test_result tr ON tr.donation_id = d.donation_id
      LEFT JOIN blood_component bc ON bc.donation_id = d.donation_id
      WHERE tr.test_id IS NULL
         OR tr.test_status = 'pending'
      GROUP BY
        d.donation_id, d.donor_id, dr.full_name,
        dr.blood_group, d.donated_at, d.bag_number,
        tr.test_status
      HAVING COUNT(bc.unit_id) > 0
      ORDER BY d.donated_at ASC
    `);

    return rows;
  });
}
