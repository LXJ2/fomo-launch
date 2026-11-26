import { useRef, useState } from "react";

type Action = "contribute" | "claim" | "refund";
type Receipt = { hash: string; status: "success" | "pending" | "reverted" | "unverified" };
type Props = {
  context: {
    identity: { chainId: number };
    launcherAddress: string | null;
    previewOnly?: boolean;
    snapshot: {
      launched?: boolean | null;
      raisedWei?: string | null;
      targetWei?: string | null;
      deadline?: string | null;
      contribution?: string | null;
      claimed?: string | null;
    } | null;
  };
  messages: Record<string, string>;
  host?: {
    available?: boolean;
    submit?(request: { kind: "action"; action: Action; valueWei?: string }): Promise<Receipt>;
    checkReceipt?(hash: string): Promise<Receipt>;
  };
};

const unit = 10n ** 18n;
const validAddress = /^0x(?!0{40}$)[0-9a-fA-F]{40}$/;

function uint(value?: string | null) {
  return value && /^\d+$/.test(value) ? BigInt(value) : null;
}

function native(value: bigint | null, fallback: string) {
  if (value === null) return fallback;
  const fraction = String(value % unit).padStart(18, "0").replace(/0+$/, "");
  return String(value / unit) + (fraction ? "." + fraction : "") + " tBNB";
}

function parseAmount(value: string) {
  if (!/^\d{1,30}(\.\d{1,18})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * unit + BigInt(fraction.padEnd(18, "0"));
}

export function Launcher({ context, messages: m, host }: Props) {
  const { launcherAddress, snapshot } = context;
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const lock = useRef(false);
  const raised = uint(snapshot?.raisedWei);
  const target = uint(snapshot?.targetWei);
  const saleDeadline = uint(snapshot?.deadline);
  const contribution = uint(snapshot?.contribution);
  const expired = saleDeadline !== null && saleDeadline <= BigInt(Math.floor(Date.now() / 1000));
  const funding = snapshot?.launched === false && !expired && saleDeadline !== null && raised !== null && target !== null && raised < target;
  const launched = snapshot?.launched === true;
  const valid = context.identity.chainId === 97 && validAddress.test(launcherAddress ?? "");
  const value = parseAmount(amount.trim());
  const remaining = raised === null || target === null ? 0n : target - raised;
  const enabled = Boolean(valid && !context.previewOnly && host?.available && host.submit);
  const outstanding = receipt?.status === "pending" || receipt?.status === "unverified";
  const canContribute = Boolean(funding && value !== null && value > 0n && value <= remaining);
  const canClaim = launched && Boolean(contribution) && uint(snapshot?.claimed) === 0n;
  const canRefund = snapshot?.launched === false && expired && Boolean(contribution) && remaining > 0n;

  async function run(action?: Action) {
    if (lock.current || !enabled) return;
    if (action === "contribute" && !canContribute || action === "claim" && !canClaim || action === "refund" && !canRefund) return;
    lock.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = action
        ? await host?.submit?.({ kind: "action", action, ...(action === "contribute" ? { valueWei: value?.toString() } : {}) })
        : receipt && await host?.checkReceipt?.(receipt.hash);
      if (result) {
        setReceipt(result);
        if (action === "contribute" && result.status === "success") setAmount("");
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  return (
    <section style={{ display: "grid", gap: 12, padding: 20, border: "1px solid #484B51", borderRadius: 10, overflowWrap: "anywhere" }}>
      <h2 style={{ margin: 0 }}>FOMO Launch</h2>
      <p>{m.rules}</p>
      <p>{launched ? m.launched : expired ? m.expired : funding ? m.pending : m.unknown}</p>
      <p>{m.raised} {native(raised, m.unknown)} / {native(target, m.unknown)}</p>
      {funding && (
        <label>{m.amount}
          <input inputMode="decimal" value={amount} disabled={!enabled || busy || outstanding}
            onChange={event => setAmount(event.target.value)} />
        </label>
      )}
      {funding && <button type="button" disabled={!enabled || busy || outstanding || !canContribute} onClick={() => void run("contribute")}>{m.contribute}</button>}
      {canClaim && <button type="button" disabled={!enabled || busy || outstanding} onClick={() => void run("claim")}>{m.claim}</button>}
      {canRefund && <button type="button" disabled={!enabled || busy || outstanding} onClick={() => void run("refund")}>{m.refund}</button>}
      {valid && !enabled && !context.previewOnly && <p>{m.wallet}</p>}
      {error && <p role="alert">{m.error}</p>}
      {receipt && <p role="status">{m[receipt.status === "pending" ? "confirming" : receipt.status]} <code>{receipt.hash}</code></p>}
      {outstanding && host?.checkReceipt && <button type="button" disabled={busy} onClick={() => void run()}>{m.check}</button>}
      {valid && <a href={"https://fomo-launch-bsc-testnet.qq751378834.chatgpt.site/?launcher=" + launcherAddress}
        target="_blank" rel="noopener noreferrer">{m.open}</a>}
    </section>
  );
}
