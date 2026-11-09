
import { NextRequest, NextResponse } from "next/server";
import { DEV_SESSION_COOKIE, ROLES, type Role } from "@/lib/session";

const ROLE_NAMES: Record<Role, string> = {
  admin: "Administrator",
  lab: "Lab Technician",
  hospital: "Hospital User",
  donor: "Donor",
};

export async function POST(request: NextRequest) {
  // This temporary login is strictly for local development.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Development login is disabled." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const role = body.role as Role;

    if (!ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Invalid role selected." },
        { status: 400 }
      );
    }

    const session = {
      userId: 1,
      role,
      name: ROLE_NAMES[role],
      ...(role === "donor" ? { donorId: 1 } : {}),
      ...(role === "hospital" ? { hospitalId: 1 } : {}),
    };

    const response = NextResponse.json({ ok: true });

    response.cookies.set(DEV_SESSION_COOKIE, JSON.stringify(session), {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Invalid login request." },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(DEV_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
