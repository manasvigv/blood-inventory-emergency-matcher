import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";

export type Role = "admin" | "lab" | "hospital" | "donor";
export const ROLES: Role[] = ["admin", "lab", "hospital", "donor"];

export interface Session {
  userId: number | null;
  role: Role;
  name: string;
  donorId?: number | null; // set when role = donor
  hospitalId?: number | null; // set when role = hospital
}

export const SESSION_COOKIE = "ll_session";
export const DEV_SESSION_COOKIE = "ll_dev_session";

function getSecretKey() {
  const secret = process.env.SESSION_SECRET || "LifeLineSessionSecret2026_UseOnlyForLocalDevelopment_8xK9pQ2";
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({
    userId: session.userId,
    role: session.role,
    name: session.name,
    donorId: session.donorId ?? null,
    hospitalId: session.hospitalId ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const role = payload.role as Role;
    if (!ROLES.includes(role)) return null;
    return {
      userId: typeof payload.userId === "number" ? payload.userId : null,
      role,
      name: String(payload.name || role),
      donorId: typeof payload.donorId === "number" ? payload.donorId : undefined,
      hospitalId: typeof payload.hospitalId === "number" ? payload.hospitalId : undefined,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();

  // 1. Signed JWT session cookie (Member B authentication)
  const signedToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (signedToken) {
    const session = await verifySessionToken(signedToken);
    if (session) return session;
  }

  // 2. Fallback to development session cookie if present
  const raw = cookieStore.get(DEV_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    return ROLES.includes(s.role) ? s : null;
  } catch {
    return null;
  }
}

/** For pages: redirect to /login when signed out, or home when the role is not allowed. */
export async function requirePageRole(...allowed: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (allowed.length && !allowed.includes(session.role)) redirect("/");
  return session;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** For API route handlers: throws HttpError(401/403), turned into JSON by handle(). */
export async function requireApiRole(...allowed: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Not signed in");
  if (allowed.length && !allowed.includes(session.role)) throw new HttpError(403, "Not allowed for your role");
  return session;
}

/** Change fields of the current session (e.g. a donor who just registered gets their donorId). */
export async function updateSession(patch: Partial<Session>) {
  const current = await getSession();
  if (!current) return;
  const updated: Session = { ...current, ...patch };
  const token = await createSessionToken(updated);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}
