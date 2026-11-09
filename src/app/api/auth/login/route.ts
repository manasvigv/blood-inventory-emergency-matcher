import { handle, readJson, badRequest } from "@/lib/api";
import { db } from "@/lib/mysql";
import {
  createSessionToken,
  SESSION_COOKIE,
  DEV_SESSION_COOKIE,
  type Role,
  type Session,
  HttpError
} from "@/lib/session";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";

interface LoginInput {
  email?: string;
  password?: string;
}

interface UserRow extends RowDataPacket {
  user_id: number;
  email: string;
  password_hash: string;
  role: Role;
  hospital_id: number | null;
  is_active: number;
}

const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  admin: "Administrator",
  lab: "Laboratory Technician",
  hospital: "Hospital Staff",
  donor: "Registered Blood Donor"
};

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<LoginInput>(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      badRequest("Email and password are required");
    }

    // Connect via admin role to look up user credentials
    const [rows] = await db("admin").query<UserRow[]>(
      `SELECT user_id, email, password_hash, role, hospital_id, is_active
       FROM users
       WHERE email = ?`,
      [email]
    );

    if (rows.length === 0) {
      throw new HttpError(401, "Invalid email or password");
    }

    const user = rows[0];

    if (!user.is_active) {
      throw new HttpError(403, "Account is disabled. Please contact your system administrator.");
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      throw new HttpError(401, "Invalid email or password");
    }

    let donorId: number | null = null;
    if (user.role === "donor") {
      const [donorRows] = await db("admin").query<RowDataPacket[]>(
        "SELECT donor_id FROM donor WHERE user_id = ?",
        [user.user_id]
      );
      if (donorRows.length > 0) {
        donorId = donorRows[0].donor_id;
      }
    }

    const session: Session = {
      userId: user.user_id,
      role: user.role,
      name: ROLE_DISPLAY_NAMES[user.role] || user.role,
      donorId: donorId ?? undefined,
      hospitalId: user.hospital_id ?? undefined
    };

    const token = await createSessionToken(session);
    const cookieStore = await cookies();

    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 8
    });

    cookieStore.set(DEV_SESSION_COOKIE, JSON.stringify(session), {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 8
    });

    const homeRoutes: Record<Role, string> = {
      admin: "/stock",
      lab: "/lab",
      hospital: "/requests",
      donor: "/me"
    };

    return {
      success: true,
      role: user.role,
      name: session.name,
      redirectUrl: homeRoutes[user.role] || "/stock"
    };
  });
}
