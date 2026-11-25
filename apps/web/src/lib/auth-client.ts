import { createAuthClient } from "better-auth/react";

/**
 * Sign-in and sign-out (server: /api/auth). The only sign-in is single
 * sign-on through the generic OAuth provider "oidc". Better Auth 1.7 serves
 * generic OAuth providers through the standard social sign-in, so no client
 * plugin is needed: `authClient.signIn.social({ provider: "oidc" })`.
 */
export const authClient = createAuthClient({ basePath: "/api/auth" });
