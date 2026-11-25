import { z } from "zod";

/**
 * Who may do what in the admin interface.
 * - admin: everything, including providers, API keys, Slack, users and settings.
 * - editor: agents (instructions, channels, knowledge), tests and the conversation log.
 */
export const ROLES = ["admin", "editor"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;
