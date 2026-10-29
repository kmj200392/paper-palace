"use client";
import { useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import type { AISettings } from "@/lib/ai-settings";
import type { AccountAIConnection } from "./use-account-ai";

export function AccountAIPanel({
  user,
  ai,
  account,
  busy,
  save,
  remove,
  useSaved,
}: {
  user: { id: number; login: string };
  ai: AISettings;
  account: AccountAIConnection;
  busy: boolean;
  save: () => void;
  remove: () => Promise<void>;
  useSaved: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const key = account.keys[ai.provider];
  return (
    <div className="ai-vault account-ai">
      <div className="vault-heading">
        <ShieldCheck size={17} />
        <strong>로그인 동안 AI 계속 사용</strong>
        {key && <span>연결됨</span>}
      </div>
      <p className="vault-copy">
        @{user.login} 계정으로 로그인하면 새로고침 후에도 바로 쓸 수 있어요.
        키는 이 브라우저에 암호화해 보관하며, 별도 비밀번호는 필요 없어요.
      </p>
      {account.loading && (
        <p className="vault-copy" role="status">
          계정의 AI 연결을 확인하는 중…
        </p>
      )}
      {(ai.apiKey || (ai.accountId && key?.model !== ai.model)) && (
        <button
          className="button primary small"
          disabled={busy || account.loading}
          onClick={save}
        >
          {busy ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <ShieldCheck size={15} />
          )}
          {key
            ? ai.apiKey
              ? "입력한 키로 계정 연결 교체"
              : "모델 변경 저장"
            : "로그인 동안 계속 사용"}
        </button>
      )}
      {!ai.apiKey && !key && !account.loading && (
        <p className="vault-copy">
          API 키를 위에 입력하거나, 아래 기존 비밀번호 보관함에서 한 번만 잠금을
          풀어 주세요.
        </p>
      )}
      {!ai.apiKey && !ai.accountId && key && (
        <button
          className="button small"
          disabled={busy || account.loading}
          onClick={useSaved}
        >
          연결된 키 사용
        </button>
      )}
      {key && (
        <div className="vault-delete">
          {confirm ? (
            <>
              <p className="vault-copy">
                이 브라우저의 계정 AI 연결을 해제할까요? 다시 연결하려면 키를
                등록해야 해요.
              </p>
              <div className="vault-actions">
                <button
                  className="button small"
                  disabled={busy || account.loading}
                  onClick={async () => {
                    await remove();
                    setConfirm(false);
                  }}
                >
                  계정 연결 해제하기
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setConfirm(false)}
                >
                  취소
                </button>
              </div>
            </>
          ) : (
            <button
              className="text-button"
              disabled={busy || account.loading}
              onClick={() => setConfirm(true)}
            >
              계정 AI 연결 해제
            </button>
          )}
        </div>
      )}
      {account.error && (
        <p className="vault-error" role="alert">
          {account.error}{" "}
          <button
            className="text-button"
            disabled={busy || account.loading}
            onClick={() => void account.refresh()}
          >
            다시 확인
          </button>
        </p>
      )}
      <p className="form-hint">
        이 브라우저에 최대 180일 보관해요. 로그아웃하면 사용할 수 없고, 같은
        계정으로 다시 로그인하면 이어져요. 다른 기기·브라우저에서는 키를 한 번
        등록해 주세요.
      </p>
    </div>
  );
}
