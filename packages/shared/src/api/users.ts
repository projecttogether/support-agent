import { z } from "zod";
import { idSchema, pageQuerySchema } from "./common";
import { roleSchema } from "../roles";

export const meSchema = z.object({
  id: idSchema,
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  image: z.string().nullable(),
});
export type Me = z.infer<typeof meSchema>;

export const userSchema = z.object({
  id: idSchema,
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  isActive: z.boolean(),
  /** Listed in ADMIN_EMAILS: always an active admin; change it in the environment. */
  fromEnvironment: z.boolean(),
  lastSignInAt: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

/** Adding a person lets them sign in with that email address. */
export const userCreateSchema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  name: z.string().trim().max(120).default(""),
  role: roleSchema,
});
export type UserCreate = z.input<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UserUpdate = z.infer<typeof userUpdateSchema>;

export const auditEntrySchema = z.object({
  id: idSchema,
  createdAt: z.string(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  /** Short description, e.g. 'Changed agent "IT support"'. Never contains secrets. */
  summary: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export const auditListQuerySchema = pageQuerySchema;
export const auditListSchema = z.object({ items: z.array(auditEntrySchema), total: z.number().int() });

/** Public: what the sign-in page shows. */
export const authConfigSchema = z.object({
  appName: z.string(),
  providerName: z.string(),
});
export type AuthConfig = z.infer<typeof authConfigSchema>;
