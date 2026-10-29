import { z } from "zod";

const providerSchema = z.enum(["openai", "anthropic"]);
export type AIProvider = z.infer<typeof providerSchema>;
const settingsSchema = z
  .object({
    provider: providerSchema,
    model: z.string().trim().min(1).max(100),
    apiKey: z.string().trim().min(15).max(500),
  })
  .strict();
export type AISettings = z.infer<typeof settingsSchema>;

const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const recordSchema = z
  .object({
    version: z.literal(1),
    provider: providerSchema,
    kdf: z.literal("PBKDF2-SHA256"),
    iterations: z.literal(ITERATIONS),
    cipher: z.literal("AES-256-GCM"),
    salt: z.string().regex(/^[A-Za-z0-9+/]{22}==$/),
    iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
    ciphertext: z
      .string()
      .min(24)
      .max(4096)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type EncryptedAIKey = z.infer<typeof recordSchema>;

export const vaultStorageKey = (provider: AIProvider) =>
  `ai-vault:v1:${provider}`;
export const providerPreferenceKey = "ai-provider";
export const defaultAISettings = (provider: AIProvider): AISettings => ({
  provider,
  model: provider === "openai" ? "gpt-5-mini" : "claude-sonnet-4-5",
  apiKey: "",
});
export const supportsVault = () => !!globalThis.crypto?.subtle;

function checkCrypto() {
  if (!supportsVault())
    throw new Error(
      "이 브라우저에서는 암호화 저장을 사용할 수 없어요. HTTPS로 접속해 주세요.",
    );
}
function checkPassphrase(passphrase: string) {
  if (passphrase.trim().length < 12 || passphrase.length > 256)
    throw new Error("잠금 비밀번호는 12자 이상, 256자 이하로 정해 주세요.");
}
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const bytes = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const additionalData = (provider: AIProvider) =>
  encoder.encode(`paper-palace:ai-vault:v1:${provider}`);

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const passwordBytes = encoder.encode(passphrase);
  try {
    const material = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    passwordBytes.fill(0);
  }
}

export async function encryptAIKey(
  settings: AISettings,
  passphrase: string,
): Promise<EncryptedAIKey> {
  checkCrypto();
  checkPassphrase(passphrase);
  const parsed = settingsSchema.safeParse(settings);
  if (!parsed.success)
    throw new Error(
      "모델 ID와 API 키를 확인해 주세요. API 키는 15~500자로 입력해 주세요.",
    );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = encoder.encode(JSON.stringify(parsed.data));
  try {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: additionalData(settings.provider),
        tagLength: 128,
      },
      key,
      plaintext,
    );
    return {
      version: 1,
      provider: settings.provider,
      kdf: "PBKDF2-SHA256",
      iterations: ITERATIONS,
      cipher: "AES-256-GCM",
      salt: base64(salt),
      iv: base64(iv),
      ciphertext: base64(new Uint8Array(ciphertext)),
    };
  } finally {
    plaintext.fill(0);
  }
}

export async function decryptAIKey(
  record: unknown,
  provider: AIProvider,
  passphrase: string,
): Promise<AISettings> {
  checkCrypto();
  checkPassphrase(passphrase);
  const parsed = recordSchema.safeParse(record);
  if (!parsed.success || parsed.data.provider !== provider)
    throw new Error(
      "저장된 키 형식을 읽을 수 없어요. 저장된 키를 삭제하고 다시 등록해 주세요.",
    );
  const value = parsed.data;
  // Fixed, validated parameters prevent untrusted storage from selecting an expensive KDF.
  const key = await deriveKey(passphrase, bytes(value.salt));
  let plaintext: Uint8Array | undefined;
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: bytes(value.iv),
          additionalData: additionalData(provider),
          tagLength: 128,
        },
        key,
        bytes(value.ciphertext),
      ),
    );
    const settings = settingsSchema.parse(
      JSON.parse(new TextDecoder().decode(plaintext)),
    );
    if (settings.provider !== provider) throw new Error("Provider mismatch");
    return settings;
  } catch {
    throw new Error(
      "비밀번호가 맞지 않거나 저장된 키가 손상됐어요. 비밀번호를 다시 확인해 주세요.",
    );
  } finally {
    plaintext?.fill(0);
  }
}
