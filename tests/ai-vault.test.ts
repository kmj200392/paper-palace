import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptAIKey,
  decryptAIKey,
  vaultStorageKey,
  type AISettings,
  type EncryptedAIKey,
} from "../src/lib/ai-vault";

const settings: AISettings = {
  provider: "openai",
  model: "test-model-vault",
  apiKey: "sk-TEST-ONLY-NOT-A-REAL-KEY-vault",
};
const passphrase = "논문 보관함 테스트 비밀번호 2026";
let fixture: Promise<EncryptedAIKey> | undefined;
const saved = () => (fixture ??= encryptAIKey(settings, passphrase));

test("encrypted key survives JSON storage and restores provider, key and custom model", async () => {
  const record = await saved();
  const serialized = JSON.stringify(record);
  for (const secret of [settings.apiKey, settings.model, passphrase])
    assert.equal(serialized.includes(secret), false);
  assert.deepEqual(
    await decryptAIKey(JSON.parse(serialized), "openai", passphrase),
    settings,
  );
  assert.deepEqual(
    Object.keys(record).sort(),
    [
      "version",
      "provider",
      "kdf",
      "iterations",
      "cipher",
      "salt",
      "iv",
      "ciphertext",
    ].sort(),
  );
});

test("each save uses a fresh salt and IV, even for the same key and password", async () => {
  const [first, second] = await Promise.all([
    saved(),
    encryptAIKey(settings, passphrase),
  ]);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(Buffer.from(second.salt, "base64").length, 16);
  assert.equal(Buffer.from(second.iv, "base64").length, 12);
});

test("wrong passphrase and modified ciphertext, IV or salt cannot unlock", async () => {
  const record = await saved();
  await assert.rejects(
    decryptAIKey(record, "openai", "a different password"),
    /비밀번호가 맞지/,
  );
  for (const field of ["ciphertext", "iv", "salt"] as const) {
    const decoded = Buffer.from(record[field], "base64");
    decoded[0] ^= 1;
    await assert.rejects(
      decryptAIKey(
        { ...record, [field]: decoded.toString("base64") },
        "openai",
        passphrase,
      ),
      /비밀번호가 맞지/,
    );
  }
});

test("provider keys are isolated and provider relabeling fails authenticated decryption", async () => {
  const record = await saved();
  assert.notEqual(vaultStorageKey("openai"), vaultStorageKey("anthropic"));
  await assert.rejects(
    decryptAIKey(record, "anthropic", passphrase),
    /형식을 읽을 수/,
  );
  await assert.rejects(
    decryptAIKey({ ...record, provider: "anthropic" }, "anthropic", passphrase),
    /비밀번호가 맞지/,
  );
  const anthropic: AISettings = {
    provider: "anthropic",
    model: "test-claude",
    apiKey: "sk-ant-TEST-ONLY-NOT-A-REAL-KEY",
  };
  assert.deepEqual(
    await decryptAIKey(
      await encryptAIKey(anthropic, passphrase),
      "anthropic",
      passphrase,
    ),
    anthropic,
  );
});

test("untrusted records cannot choose KDF cost, algorithms, versions or unbounded ciphertext", async () => {
  const record = await saved();
  const invalid = [
    null,
    {},
    { ...record, version: 2 },
    { ...record, iterations: 1 },
    { ...record, iterations: 2 ** 31 },
    { ...record, cipher: "AES-CBC" },
    { ...record, kdf: "HKDF" },
    { ...record, iv: "broken" },
    { ...record, salt: "broken" },
    { ...record, ciphertext: "a".repeat(5000) },
    { ...record, apiKey: settings.apiKey },
  ];
  for (const value of invalid)
    await assert.rejects(
      decryptAIKey(value, "openai", passphrase),
      /형식을 읽을 수/,
    );
});

test("weak or oversized passwords and incomplete credentials are not saved", async () => {
  for (const password of ["short", " ".repeat(20), "a".repeat(257)])
    await assert.rejects(encryptAIKey(settings, password), /잠금 비밀번호/);
  for (const value of [
    { ...settings, apiKey: "" },
    { ...settings, apiKey: "a".repeat(501) },
    { ...settings, model: " " },
    { ...settings, model: "a".repeat(101) },
  ])
    await assert.rejects(encryptAIKey(value, passphrase), /모델 ID와 API 키/);
});
