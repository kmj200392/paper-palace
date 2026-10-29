"use client";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowUpRight,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  defaultAISettings,
  decryptAIKey,
  encryptAIKey,
  providerPreferenceKey,
  supportsVault,
  vaultStorageKey,
  type AIProvider,
  type AISettings,
} from "@/lib/ai-vault";
import { deleteLocal, readLocal, writeLocal } from "@/lib/storage";

// Mounted only while settings are open: closing discards all password form state.
export function AIConnection({
  ai,
  setAi,
}: {
  ai: AISettings;
  setAi: Dispatch<SetStateAction<AISettings>>;
}) {
  const [vaults, setVaults] = useState<Record<AIProvider, unknown>>({
    openai: undefined,
    anthropic: undefined,
  });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const alive = useRef(false);
  const running = useRef(false);
  const available = supportsVault();
  const saved = vaults[ai.provider] !== undefined;

  useEffect(() => {
    alive.current = true;
    let stopped = false;
    void Promise.all([
      readLocal(vaultStorageKey("openai")),
      readLocal(vaultStorageKey("anthropic")),
      readLocal(providerPreferenceKey),
    ])
      .then(([openai, anthropic, preference]) => {
        if (stopped) return;
        setVaults({ openai, anthropic });
        if (preference === "openai" || preference === "anthropic")
          setAi((current) =>
            current.apiKey || current.provider === preference
              ? current
              : defaultAISettings(preference),
          );
        setLoaded(true);
      })
      .catch(() => {
        if (!stopped)
          setError(
            "브라우저 저장소를 읽지 못했어요. 이 탭에서 키를 쓰거나, 설정을 닫았다가 다시 열어 주세요.",
          );
      });
    return () => {
      stopped = true;
      alive.current = false;
    };
  }, [setAi]);

  const clearForm = () => {
    setPassword("");
    setConfirmation("");
    setSaving(false);
    setDeleting(false);
    setError("");
    setMessage("");
  };
  const act = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      running.current = false;
      if (alive.current) {
        setBusy(false);
        setPassword("");
        setConfirmation("");
      }
    }
  };
  const save = () =>
    act(async () => {
      if (password !== confirmation)
        throw new Error("두 비밀번호가 일치하지 않아요.");
      const provider = ai.provider;
      const encrypted = await encryptAIKey(ai, password);
      if (!alive.current) return;
      try {
        await writeLocal(vaultStorageKey(provider), encrypted);
      } catch {
        throw new Error(
          "암호화된 키를 저장하지 못했어요. 브라우저 저장 공간과 권한을 확인해 주세요. 현재 키는 이 탭에서 계속 사용할 수 있어요.",
        );
      }
      if (!alive.current) return;
      setVaults((v) => ({ ...v, [provider]: encrypted }));
      setSaving(false);
      setMessage(
        "암호화해서 저장했어요. 새로고침 후에는 비밀번호로 잠금을 풀어 주세요.",
      );
    });
  const unlock = () =>
    act(async () => {
      const provider = ai.provider;
      // Read again so an older tab cannot unlock a key already deleted or replaced elsewhere.
      const encrypted = await readLocal(vaultStorageKey(provider));
      if (!alive.current) return;
      setVaults((v) => ({ ...v, [provider]: encrypted }));
      if (encrypted === undefined)
        throw new Error("저장된 키가 삭제됐어요. API 키를 다시 입력해 주세요.");
      const settings = await decryptAIKey(encrypted, provider, password);
      if (!alive.current) return;
      setAi(settings);
      setMessage("잠금을 풀었어요. 이 탭에서 AI를 사용할 수 있어요.");
    });
  const remove = () =>
    act(async () => {
      const provider = ai.provider;
      await deleteLocal(vaultStorageKey(provider));
      if (!alive.current) return;
      setVaults((v) => ({ ...v, [provider]: undefined }));
      setAi((current) => ({ ...current, apiKey: "" }));
      setDeleting(false);
      setSaving(false);
      setMessage(
        "이 브라우저의 저장된 키를 삭제하고, 이 탭의 연결을 해제했어요.",
      );
    });

  return (
    <section className="settings-section ai-settings">
      <h3>
        <KeyRound size={18} /> AI 연결
      </h3>
      <p>
        나의 API 키로 논문을 읽어요. ChatGPT·Claude 구독과 API 사용료는
        별개입니다.
      </p>
      <div className="settings-row">
        <label>
          AI 제공자
          <select
            value={ai.provider}
            disabled={busy || (!loaded && !error)}
            onChange={(e) => {
              const provider = e.target.value as AIProvider;
              clearForm();
              setAi(defaultAISettings(provider));
              void writeLocal(providerPreferenceKey, provider).catch(() => {
                if (alive.current)
                  setError(
                    "제공자 선택을 기억하지 못했어요. 브라우저 저장 설정을 확인해 주세요.",
                  );
              });
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic Claude</option>
          </select>
        </label>
        <label>
          모델 ID
          <input
            value={ai.model}
            disabled={busy}
            onChange={(e) => {
              setMessage("");
              setAi((current) => ({ ...current, model: e.target.value }));
            }}
            placeholder="모델 ID"
            maxLength={100}
          />
        </label>
      </div>
      <label htmlFor="api-key">API 키</label>
      <div className="key-input">
        <input
          id="api-key"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={ai.apiKey}
          disabled={busy}
          maxLength={500}
          onChange={(e) => {
            clearForm();
            setAi((current) => ({ ...current, apiKey: e.target.value.trim() }));
          }}
          placeholder={
            saved && !ai.apiKey
              ? "저장된 키 · 잠금 해제 필요"
              : ai.provider === "openai"
                ? "sk-…"
                : "sk-ant-…"
          }
        />
        {ai.apiKey && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              clearForm();
              setAi((current) => ({ ...current, apiKey: "" }));
            }}
          >
            {saved ? "잠그기" : "해제"}
          </button>
        )}
      </div>

      <div className="ai-vault" aria-busy={busy}>
        <div className="vault-heading">
          {saved ? <ShieldCheck size={17} /> : <LockKeyhole size={17} />}
          <strong>
            {saved ? "암호화된 키 보관 중" : "이 브라우저에 키 보관하기"}
          </strong>
          {saved && <span>{ai.apiKey ? "AI 사용 가능" : "잠겨 있음"}</span>}
        </div>
        <p className="vault-copy">
          {saved
            ? "저장된 키와 모델은 이 브라우저에서만 불러올 수 있어요. 현재 입력을 바꾸면 다시 저장해 주세요."
            : "비밀번호로 암호화하면 새로고침해도 키가 남아요. 저장하지 않으면 이 탭에서만 사용해요."}
        </p>
        {!available && (
          <p className="vault-error" role="status">
            이 환경에서는 암호화 저장을 사용할 수 없어요. HTTPS와 Web Crypto를
            지원하는 브라우저가 필요해요.
          </p>
        )}
        {!loaded && !error && (
          <p className="vault-copy" role="status">
            저장된 키 확인 중…
          </p>
        )}

        {saved && !ai.apiKey && !deleting && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <label htmlFor="vault-password">잠금 비밀번호</label>
            <input
              id="vault-password"
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy || !available}
              minLength={12}
              maxLength={256}
              required
              placeholder="저장할 때 정한 비밀번호"
            />
            <button
              className="button primary small"
              disabled={busy || !available}
            >
              {busy ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <KeyRound size={15} />
              )}{" "}
              잠금 해제
            </button>
          </form>
        )}

        {ai.apiKey && !saving && !deleting && (
          <button
            className="button small"
            disabled={busy || !loaded || !available}
            onClick={() => {
              clearForm();
              setSaving(true);
            }}
          >
            <LockKeyhole size={15} />
            {saved ? "현재 키로 다시 저장" : "암호화 저장 설정"}
          </button>
        )}

        {ai.apiKey && saving && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <p className="vault-copy">
              나만 아는 비밀번호를 정해 주세요. 비밀번호는 저장하지 않으며,
              잊으면 API 키를 다시 등록해야 해요.
              {saved && " 저장하면 기존 키와 비밀번호를 교체해요."}
            </p>
            <label htmlFor="vault-new-password">
              잠금 비밀번호 · 12자 이상
            </label>
            <input
              id="vault-new-password"
              type="password"
              autoComplete="new-password"
              autoCapitalize="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              minLength={12}
              maxLength={256}
              required
            />
            <label htmlFor="vault-confirmation">잠금 비밀번호 확인</label>
            <input
              id="vault-confirmation"
              type="password"
              autoComplete="new-password"
              autoCapitalize="off"
              spellCheck={false}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={busy}
              minLength={12}
              maxLength={256}
              required
            />
            <div className="vault-actions">
              <button className="button primary small" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <ShieldCheck size={15} />
                )}
                암호화해서 저장
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={clearForm}
              >
                취소
              </button>
            </div>
          </form>
        )}

        {saved && !saving && (
          <div className="vault-delete">
            {deleting ? (
              <>
                <p className="vault-copy">
                  저장된 키를 삭제할까요? 다시 쓰려면 API 키를 입력해야 해요.
                  제공자 계정의 키 자체는 폐기되지 않아요.
                </p>
                <div className="vault-actions">
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    <Trash2 size={14} />
                    저장된 키 삭제하기
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={clearForm}
                  >
                    취소
                  </button>
                </div>
              </>
            ) : (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  clearForm();
                  setDeleting(true);
                }}
              >
                저장된 키 삭제
              </button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="vault-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="vault-success">
            {message}
          </p>
        )}
      </div>
      <p className="form-hint">
        새로고침·로그아웃 후에는 다시 잠금을 풀어 주세요. 암호화된 키는
        GitHub·로컬 폴더·JSON 내보내기에 포함되지 않아요. 분석할 때는
        Cloudflare를 거쳐 선택한 AI 제공자에게 키와 논문 텍스트를 전달합니다.
      </p>
      <a
        className="text-link small"
        href={
          ai.provider === "openai"
            ? "https://platform.openai.com/api-keys"
            : "https://console.anthropic.com/settings/keys"
        }
        target="_blank"
        rel="noreferrer"
      >
        API 키 발급하기 <ArrowUpRight size={13} />
      </a>
    </section>
  );
}
