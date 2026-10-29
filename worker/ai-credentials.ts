import { z } from "zod";
import {
  aiProviderSchema,
  aiModelSchema,
  apiKeySchema,
  type AIProvider,
  type AccountAIKey,
} from "../src/lib/ai-settings";
import { seal, unseal, cookie, cookieValue } from "./security";

export const AI_COOKIE_AGE = 180 * 24 * 60 * 60;
export const aiCookieName = (provider: AIProvider) =>
  `__Host-pp-ai-${provider}`;
const encryptionSecret = (secret: string) => {
  if (secret.length < 32) throw new Error("Session secret is not configured");
  // Domain separation: AI cookies cannot be substituted for authentication cookies.
  return `${secret}:paper-palace:account-ai:v1`;
};
const credentialSchema = z
  .object({
    kind: z.literal("account-ai"),
    version: z.literal(1),
    userId: z.number().int().positive(),
    provider: aiProviderSchema,
    model: aiModelSchema,
    apiKey: apiKeySchema,
    updatedAt: z.number().int().positive(),
    expires: z.number().int().positive(),
  })
  .strict();
type Credential = z.infer<typeof credentialSchema>;
export const keyMetadata = (key: Credential): AccountAIKey => ({
  provider: key.provider,
  model: key.model,
  updatedAt: key.updatedAt,
  expires: key.expires,
});
export async function readAccountKey(
  req: Request,
  secret: string,
  userId: number,
  provider: AIProvider,
) {
  const value = cookieValue(req, aiCookieName(provider));
  if (!value || value.length > 4096) return null;
  const parsed = credentialSchema.safeParse(
    await unseal(value, encryptionSecret(secret)),
  );
  if (
    !parsed.success ||
    parsed.data.userId !== userId ||
    parsed.data.provider !== provider
  )
    return null;
  return parsed.data;
}
export async function saveAccountKey(
  secret: string,
  userId: number,
  input: { provider: AIProvider; model: string; apiKey: string },
) {
  const now = Date.now();
  const key = credentialSchema.parse({
    ...input,
    userId,
    kind: "account-ai",
    version: 1,
    updatedAt: now,
    expires: now + AI_COOKIE_AGE * 1000,
  });
  const sealed = await seal(key, encryptionSecret(secret));
  return {
    cookie: cookie(aiCookieName(key.provider), sealed, AI_COOKIE_AGE),
    metadata: keyMetadata(key),
  };
}
export const deleteAccountKeyCookie = (provider: AIProvider) =>
  cookie(aiCookieName(provider), "", 0);
