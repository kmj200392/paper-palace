import { z } from "zod";

export const aiProviderSchema = z.enum(["openai", "anthropic"]);
export type AIProvider = z.infer<typeof aiProviderSchema>;
export const aiModelSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9._:-]+$/);
export const apiKeySchema = z
  .string()
  .trim()
  .min(15)
  .max(500)
  .regex(/^[!-~]+$/);
export type AISettings = {
  provider: AIProvider;
  model: string;
  apiKey: string;
  // Bind cookie-based requests to the account displayed in this tab.
  accountId?: number;
};
export type AccountAIKey = {
  provider: AIProvider;
  model: string;
  updatedAt: number;
  expires: number;
};
export type AccountAIKeys = Partial<Record<AIProvider, AccountAIKey>>;
export const hasAIConnection = (settings: AISettings) =>
  !!(settings.apiKey || settings.accountId);
export const defaultAISettings = (provider: AIProvider): AISettings => ({
  provider,
  model: provider === "openai" ? "gpt-6-luna" : "claude-sonnet-4-5",
  apiKey: "",
});
// Older connections persisted the former default alongside their key.
export const restoredAIModel = (provider: AIProvider, model: string) =>
  provider === "openai" && model === "gpt-5-mini"
    ? defaultAISettings(provider).model
    : model;
export function accountAISettings(
  key: AccountAIKey,
  accountId: number,
): AISettings {
  return { provider: key.provider, model: key.model, apiKey: "", accountId };
}
