import { z } from "zod";

export const appSettingsSchema = z.object({
  /** Days the text of questions and answers is kept; 0 keeps no text (only outcomes and timings). */
  retentionDays: z.number().int().min(0).max(3650),
  /** Posted when an agent fails (model or knowledge source unreachable). */
  errorMessage: z.string().trim().min(1).max(1000),
  /** Emoji name added to a question while the agent works on it, e.g. "eyes"; null for none. */
  workingReaction: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z
      .string()
      .trim()
      .regex(/^[a-z0-9_+-]{1,64}$/, "Use an emoji name without colons, e.g. eyes")
      .nullable(),
  ),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  retentionDays: 90,
  errorMessage: "Sorry, I can't answer right now. Someone from the team will get back to you.",
  workingReaction: "eyes",
};
