import { and, eq, gt } from "drizzle-orm";
import { roleSchema } from "@support-agent/shared/roles";
import type { Db } from "../db/client";
import { sessions, users } from "../db/schema";
import { auth } from "./auth";
import type { UserPrincipal } from "./principal";

/** The signed-in person of a request, or null (no session, revoked session, deactivated person). */
export async function resolvePrincipal(db: Db, headers: Headers): Promise<UserPrincipal | null> {
  const session = await auth().api.getSession({ headers });
  if (!session) return null;
  // The cookie cache can outlive a revoked session by a minute; check the row.
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      image: users.image,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, session.session.id), gt(sessions.expiresAt, new Date())));
  if (!row?.isActive) return null;
  const role = roleSchema.safeParse(row.role);
  return {
    kind: "user",
    id: row.id,
    email: row.email,
    name: row.name,
    role: role.success ? role.data : "editor",
    image: row.image,
  };
}
