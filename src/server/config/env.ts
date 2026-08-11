import { z } from "zod";

const environmentSchema = z.object({
  APP_ORIGIN: z.url(),
  MONGODB_URI: z.string().min(1),
  MONGODB_MIGRATION_URI: z.string().min(1).optional(),
  MONGODB_DATABASE: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9_-]+$/),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
});

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function readEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): AppEnvironment {
  return environmentSchema.parse(source);
}
