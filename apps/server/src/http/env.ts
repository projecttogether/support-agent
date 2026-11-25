import type { UserPrincipal } from "../auth/principal";

/** Variables every request carries (Hono context). */
export type AppEnv = {
  Variables: {
    requestId: string;
    /** Null for anonymous requests. Set by the `authenticate` middleware. */
    principal: UserPrincipal | null;
  };
};
