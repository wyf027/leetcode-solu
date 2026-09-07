import { useState, type FormEvent } from "react";
import type { CredentialStatus } from "./types";

export function SettingsView({
  credentialStatus,
  onClear,
  onClose,
  onSave,
}: {
  credentialStatus: CredentialStatus;
  onClear: () => Promise<void>;
  onClose: () => void;
  onSave: (username: string, token: string) => Promise<void>;
}) {
  const [username, setUsername] = useState(credentialStatus.username ?? "");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await onSave(username, token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setToken("");
      setSaving(false);
    }
  }

  async function clearCredentials() {
    setSaving(true);
    setMessage(null);
    try {
      await onClear();
      setUsername("");
      setToken("");
      setMessage("凭据已从 Keychain 删除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex h-screen w-screen select-none flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/92 p-4 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur-2xl">
      <header
        className="flex cursor-grab items-center justify-between active:cursor-grabbing"
        data-tauri-drag-region
      >
        <div data-tauri-drag-region>
          <p className="text-xs font-bold text-indigo-200">Jenkins 只读设置</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Token 仅保存到 macOS Keychain
          </p>
        </div>
        <button
          aria-label="关闭设置"
          className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      <form className="mt-4 flex flex-1 flex-col gap-3" onSubmit={submit}>
        <label className="grid gap-1 text-[10px] font-medium text-slate-400">
          Jenkins 用户名
          <input
            autoComplete="username"
            className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="只读账号"
            required
            value={username}
          />
        </label>
        <label className="grid gap-1 text-[10px] font-medium text-slate-400">
          API Token
          <input
            autoComplete="current-password"
            className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
            onChange={(event) => setToken(event.target.value)}
            placeholder={
              credentialStatus.configured
                ? "输入新 Token 以替换"
                : "Jenkins API Token"
            }
            required
            type="password"
            value={token}
          />
        </label>

        {message === null ? null : (
          <p className="text-[10px] leading-4 text-amber-300">{message}</p>
        )}

        <div className="mt-auto grid grid-cols-2 gap-2">
          <button
            className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            disabled={saving || !credentialStatus.configured}
            onClick={() => void clearCredentials()}
            type="button"
          >
            删除凭据
          </button>
          <button
            className="rounded-xl bg-indigo-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
            disabled={saving}
            type="submit"
          >
            {saving ? "保存中…" : "保存并刷新"}
          </button>
        </div>
      </form>
    </main>
  );
}
