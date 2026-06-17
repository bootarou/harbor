"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  accountFromPrivateKey,
  deriveAccount,
  generateMnemonic,
  isValidMnemonic,
} from "@/lib/wallet/symbol";
import { encryptPrivateKey, WebCryptoUnavailableError } from "@/lib/wallet/crypto";
import { saveStoredWallet } from "@/lib/wallet/storage";
import { didLoginWithPrivateKey } from "@/lib/wallet/did-client";
import type { SmdCandidate } from "@/lib/smd";

type Mode = "select" | "create" | "import";

const PRIVATE_KEY_RE = /^[0-9a-fA-F]{64}$/;

function BackupChecks({
  c1,
  c2,
  setC1,
  setC2,
}: {
  c1: boolean;
  c2: boolean;
  setC1: (v: boolean) => void;
  setC2: (v: boolean) => void;
}) {
  return (
    <div className="rounded-md bg-yellow-50 p-3 text-xs text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
      <p>
        秘密鍵またはリカバリー情報を失うと、アカウントにアクセスできなくなる可能性があります。
        運営は秘密鍵を保存していないため、復旧できません。
      </p>
      <label className="mt-2 flex items-start gap-2">
        <input type="checkbox" checked={c1} onChange={(e) => setC1(e.target.checked)} className="mt-0.5" />
        リカバリーフレーズ（または秘密鍵）を安全な場所にバックアップしました
      </label>
      <label className="mt-1 flex items-start gap-2">
        <input type="checkbox" checked={c2} onChange={(e) => setC2(e.target.checked)} className="mt-0.5" />
        リカバリー情報を失うと復旧できないことを理解しました
      </label>
    </div>
  );
}

export function RegisterFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const initialMode = params.get("mode");
  const [mode, setMode] = useState<Mode>(
    initialMode === "create" || initialMode === "import" ? initialMode : "select"
  );

  if (mode === "create") return <CreateFlow onBack={() => setMode("select")} router={router} />;
  if (mode === "import") return <ImportFlow onBack={() => setMode("select")} router={router} />;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        メールアドレスは不要です。Symbol アドレスでアカウントを作成します。
      </p>
      <button
        type="button"
        onClick={() => setMode("create")}
        className="rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        新しいSymbolアドレスを作成する
      </button>
      <button
        type="button"
        onClick={() => setMode("import")}
        className="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium dark:border-gray-700"
      >
        リカバリーフレーズ／秘密鍵で復元する
      </button>
    </div>
  );
}

type Router = ReturnType<typeof useRouter>;

function PassphraseFields({
  p1,
  p2,
  setP1,
  setP2,
}: {
  p1: string;
  p2: string;
  setP1: (v: string) => void;
  setP2: (v: string) => void;
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        ウォレットパスワード（8文字以上）
        <input type="password" value={p1} onChange={(e) => setP1(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        ウォレットパスワード（確認）
        <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
      </label>
    </>
  );
}

function CreateFlow({ onBack, router }: { onBack: () => void; router: Router }) {
  const mnemonic = useMemo(() => generateMnemonic(), []);
  const words = useMemo(() => mnemonic.split(" "), [mnemonic]);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setError(null);
    if (p1.length < 8) return setError("パスワードは8文字以上にしてください。");
    if (p1 !== p2) return setError("パスワードが一致しません。");
    if (!c1 || !c2) return setError("バックアップ確認にチェックしてください。");
    setBusy(true);
    try {
      const account = deriveAccount(mnemonic);
      const enc = await encryptPrivateKey(account.privateKey, p1, account.address);
      saveStoredWallet(enc);
      const res = await didLoginWithPrivateKey(account.privateKey);
      if (!res.ok) {
        setError(res.error ?? "登録に失敗しました");
        setBusy(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      console.error(e);
      setError(
        e instanceof WebCryptoUnavailableError ? e.message : "登録に失敗しました"
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-xs underline">
        ← 戻る
      </button>
      <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
        以下の24語（リカバリーフレーズ）を順番どおり控えてください。サーバーには保存されません。
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {words.map((w, i) => (
          <li key={i} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-700">
            <span className="w-5 text-right text-xs text-gray-400">{i + 1}</span>
            <span className="font-mono">{w}</span>
          </li>
        ))}
      </ol>
      <PassphraseFields p1={p1} p2={p2} setP1={setP1} setP2={setP2} />
      <BackupChecks c1={c1} c2={c2} setC1={setC1} setC2={setC2} />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <button type="button" onClick={finish} disabled={busy} className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {busy ? "作成・ログイン中..." : "作成してログイン"}
      </button>
    </div>
  );
}

function ImportFlow({ onBack, router }: { onBack: () => void; router: Router }) {
  // 既定はリカバリーフレーズ（作成時にバックアップを案内している情報）。
  const [via, setVia] = useState<"phrase" | "privateKey">("phrase");
  const [phrase, setPhrase] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // input: 入力中 / smd: SMD候補を確認して項目選択中（ここで自動ログインしない）
  const [phase, setPhase] = useState<"input" | "smd">("input");
  const [smd, setSmd] = useState<SmdCandidate | null>(null);
  const [smdNote, setSmdNote] = useState<string | null>(null);
  const [applyName, setApplyName] = useState(true);
  const [applyImageUrl, setApplyImageUrl] = useState(true);
  const [applyUrl, setApplyUrl] = useState(false);
  const [applyNamespace, setApplyNamespace] = useState(false);

  // 入力（フレーズ or 秘密鍵）から秘密鍵を導出する。失敗時は error をセットし null。
  function derivePrivateKey(): string | null {
    try {
      if (via === "phrase") {
        const words = phrase.trim().replace(/\s+/g, " ");
        if (!isValidMnemonic(words)) {
          setError("リカバリーフレーズが正しくありません（12語または24語）。");
          return null;
        }
        return deriveAccount(words).privateKey;
      }
      const pk = privateKey.trim();
      if (!PRIVATE_KEY_RE.test(pk)) {
        setError("秘密鍵の形式が正しくありません（64桁の16進数）。");
        return null;
      }
      return accountFromPrivateKey(pk).privateKey;
    } catch {
      setError("入力からウォレットを復元できませんでした。");
      return null;
    }
  }

  function validateInputs(): boolean {
    if (p1.length < 8) {
      setError("パスワードは8文字以上にしてください。");
      return false;
    }
    if (p1 !== p2) {
      setError("パスワードが一致しません。");
      return false;
    }
    if (!c1 || !c2) {
      setError("バックアップ確認にチェックしてください。");
      return false;
    }
    return true;
  }

  // 1段階目: 入力検証 → SMD候補を取得。候補があれば確認フェーズで停止（自動ログインしない）。
  async function proceed() {
    setError(null);
    const pk = derivePrivateKey();
    if (!pk) return;
    if (!validateInputs()) return;
    setBusy(true);
    try {
      const account = accountFromPrivateKey(pk);
      try {
        const r = await fetch(`/api/smd?address=${account.address}`);
        const data = (await r.json()) as
          | { status: "ok"; candidate: SmdCandidate }
          | { status: "none" }
          | { status: "invalid"; reason: string };
        if (data.status === "ok") {
          // 候補あり → ここで停止してユーザーに項目選択させる。
          setSmd(data.candidate);
          setPhase("smd");
          setBusy(false);
          return;
        }
        if (data.status === "invalid")
          setSmdNote("SMDが見つかりましたが形式が正しくないため自動適用できません。");
      } catch {
        /* SMD取得失敗は無視して続行 */
      }
      // 候補なし → そのまま作成・ログイン。
      await commit(pk);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof WebCryptoUnavailableError ? e.message : "復元に失敗しました"
      );
      setBusy(false);
    }
  }

  // 2段階目: 暗号化保存 → ログイン → 選択した SMD 項目を適用 → 遷移。
  async function commit(pk?: string) {
    setError(null);
    const key = pk ?? derivePrivateKey();
    if (!key) return;
    setBusy(true);
    try {
      const account = accountFromPrivateKey(key);
      const enc = await encryptPrivateKey(account.privateKey, p1, account.address);
      saveStoredWallet(enc);
      const res = await didLoginWithPrivateKey(account.privateKey);
      if (!res.ok) {
        setError(res.error ?? "インポートに失敗しました");
        setBusy(false);
        return;
      }
      // SMD候補を確認した場合のみ、選択項目を適用（サーバーが本人アドレスで再取得）。
      if (smd) {
        await fetch("/api/smd/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applyName, applyImageUrl, applyUrl, applyNamespace }),
        }).catch(() => {});
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      console.error(e);
      setError(
        e instanceof WebCryptoUnavailableError ? e.message : "復元に失敗しました"
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-xs underline">
        ← 戻る
      </button>
      <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-200">
        入力はブラウザ内で処理され、サーバーには送信されません。
        リカバリーフレーズまたは秘密鍵を失うと、アカウントにアクセスできなくなる可能性があります。
      </p>

      {/* 入力方法の切り替え */}
      <div className="inline-flex rounded-md border border-gray-300 p-0.5 text-xs dark:border-gray-700">
        <button
          type="button"
          onClick={() => setVia("phrase")}
          className={`rounded px-3 py-1.5 ${via === "phrase" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
        >
          リカバリーフレーズ
        </button>
        <button
          type="button"
          onClick={() => setVia("privateKey")}
          className={`rounded px-3 py-1.5 ${via === "privateKey" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
        >
          秘密鍵
        </button>
      </div>

      {via === "phrase" ? (
        <label className="flex flex-col gap-1 text-sm">
          リカバリーフレーズ（12語または24語をスペース区切りで入力）
          <textarea
            rows={3}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          秘密鍵（64桁の16進数）
          <input
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
      )}
      <PassphraseFields p1={p1} p2={p2} setP1={setP1} setP2={setP2} />
      <BackupChecks c1={c1} c2={c2} setC1={setC1} setC2={setC2} />

      {smd && (
        <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-700">
          <p className="font-semibold">SMDプロフィールが見つかりました。適用する項目を選び、下のボタンで確定してください。</p>
          <div className="mt-2 flex items-center gap-3">
            {smd.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={smd.imageUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
            )}
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {smd.name && <p>表示名: {smd.name}</p>}
              {smd.url && <p>Webサイト: {smd.url}</p>}
              {smd.namespace && <p>Namespace: {smd.namespace}</p>}
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-1 text-xs">
            {smd.name && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={applyName} onChange={(e) => setApplyName(e.target.checked)} />表示名を適用</label>
            )}
            {smd.imageUrl && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={applyImageUrl} onChange={(e) => setApplyImageUrl(e.target.checked)} />プロフィール画像を適用</label>
            )}
            {smd.url && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={applyUrl} onChange={(e) => setApplyUrl(e.target.checked)} />WebサイトURLを適用</label>
            )}
            {smd.namespace && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={applyNamespace} onChange={(e) => setApplyNamespace(e.target.checked)} />Namespaceを表示する</label>
            )}
          </div>
        </div>
      )}
      {smdNote && <p className="text-xs text-gray-500 dark:text-gray-400">{smdNote}</p>}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {phase === "smd" ? (
        <button
          type="button"
          onClick={() => commit()}
          disabled={busy}
          className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy ? "作成・ログイン中..." : "この内容でアカウント作成・ログイン"}
        </button>
      ) : (
        <button
          type="button"
          onClick={proceed}
          disabled={busy}
          className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy ? "確認中..." : "インポートして続行"}
        </button>
      )}
    </div>
  );
}
