import { useCallback, useEffect, useState } from 'react'
import {
  AGENT_URL,
  CONTRACT_ID,
  EXPLORER,
  explorerAccount,
  explorerTx,
  getLedger,
  getPolicy,
  getStats,
  nearToYocto,
  yoctoToNear,
  type LedgerEntry,
  type Policy,
  type Stats,
} from './near'
import './App.css'

const REFRESH_MS = 15_000

interface Receipt {
  decision?: string
  quoteIn?: string
  quoteOut?: string
  quoteOutUsd?: string
  txHash?: string
  entryId?: number | string
  raw?: unknown
}

function pick<T>(obj: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T
  }
  return undefined
}

function parseReceipt(data: unknown): Receipt {
  if (!data || typeof data !== 'object') return { raw: data }
  const o = data as Record<string, unknown>
  const quote = (o.quote ?? o.receipt ?? {}) as Record<string, unknown>
  const txHash = pick<string>(o, ['txHash', 'tx_hash', 'transactionHash', 'transaction_hash'])
    ?? pick<string>(quote, ['txHash', 'tx_hash'])
  const entryId = pick<number | string>(o, ['entryId', 'entry_id', 'ledgerEntryId', 'ledger_entry_id'])
    ?? pick<number | string>(quote, ['entryId', 'entry_id'])
  return {
    decision: pick<string>(o, ['decision']) ?? pick<string>(quote, ['decision']),
    quoteIn:
      pick<string>(quote, ['amountInFormatted', 'amountIn', 'amount_in']) ??
      pick<string>(o, ['amountInFormatted', 'amountIn']),
    quoteOut:
      pick<string>(quote, ['amountOutFormatted', 'amountOut', 'amount_out']) ??
      pick<string>(o, ['amountOutFormatted', 'amountOut']),
    quoteOutUsd: pick<string>(quote, ['amountOutUsd', 'amount_out_usd']),
    txHash,
    entryId,
    raw: data,
  }
}

function fmtTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return String(ms)
  }
}

export default function App() {
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null)
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [contractError, setContractError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [agentUp, setAgentUp] = useState<boolean | null>(null)
  const [agentError, setAgentError] = useState<string | null>(null)

  const [maxSpend, setMaxSpend] = useState('')
  const [dailyCap, setDailyCap] = useState('')
  const [killSwitch, setKillSwitch] = useState(false)
  const [policySaving, setPolicySaving] = useState(false)
  const [policyMsg, setPolicyMsg] = useState<string | null>(null)

  const [running, setRunning] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const refreshContract = useCallback(async () => {
    setRefreshing(true)
    try {
      const [l, p, s] = await Promise.all([getLedger(), getPolicy(), getStats()])
      setLedger([...l].sort((a, b) => b.id - a.id))
      setPolicy(p)
      setStats(s)
      setContractError(null)
      setLastUpdated(new Date())
      if (maxSpend === '' && p) setMaxSpend(yoctoToNear(p.max_spend_per_call_yocto))
      if (dailyCap === '' && p) setDailyCap(yoctoToNear(p.daily_cap_yocto))
      if (p) setKillSwitch(p.kill_switch)
    } catch (e) {
      setContractError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkAgent = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/status`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAgentUp(true)
      setAgentError(null)
    } catch (e) {
      setAgentUp(false)
      setAgentError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    refreshContract()
    checkAgent()
    const t = setInterval(refreshContract, REFRESH_MS)
    return () => clearInterval(t)
  }, [refreshContract, checkAgent])

  async function savePolicy(e: React.FormEvent) {
    e.preventDefault()
    setPolicySaving(true)
    setPolicyMsg(null)
    try {
      const payload = {
        max_spend_per_call_near: maxSpend,
        daily_cap_near: dailyCap,
        max_spend_per_call_yocto: nearToYocto(maxSpend),
        daily_cap_yocto: nearToYocto(dailyCap),
        kill_switch: killSwitch,
      }
      const res = await fetch(`${AGENT_URL}/policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Agent returned HTTP ${res.status}`)
      setPolicyMsg('Policy saved on-chain. Refreshing…')
      await refreshContract()
    } catch (err) {
      setPolicyMsg(`Failed to save policy: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPolicySaving(false)
    }
  }

  async function runDay() {
    setRunning(true)
    setRunError(null)
    setReceipt(null)
    try {
      const res = await fetch(`${AGENT_URL}/run-day`, { method: 'POST' })
      if (!res.ok) throw new Error(`Agent returned HTTP ${res.status}`)
      const data: unknown = await res.json()
      setReceipt(parseReceipt(data))
      await refreshContract()
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const agentDown = agentUp === false

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>
            Drip <span className="accent">— the pay-per-sip DCA agent on NEAR</span>
          </h1>
          <p className="sub">
            Contract{' '}
            <a href={explorerAccount(CONTRACT_ID)} target="_blank" rel="noreferrer">
              {CONTRACT_ID}
            </a>{' '}
            ·{' '}
            <a href={EXPLORER} target="_blank" rel="noreferrer">
              explorer.testnet.near.org
            </a>
          </p>
        </div>
        <span className="badge">NEAR testnet</span>
      </header>

      {contractError && (
        <div className="alert error">
          Could not reach the NEAR testnet contract: {contractError}
        </div>
      )}
      {agentDown && (
        <div className="alert warn">
          Agent server at {AGENT_URL} is unreachable ({agentError}). “Run one day” and
          the policy editor are disabled until it is back — the ledger and policy
          panels below still show live on-chain data.
        </div>
      )}

      <section className="card actions">
        <div>
          <h2>Run the agent</h2>
          <p className="muted">
            One day of Drip: fetch a live 1Click quote for 10 USDC → SOL, decide
            buy / hold / skip, and pay the $0.003 quote fee through the on-chain
            policy contract.
          </p>
        </div>
        <button onClick={runDay} disabled={running || agentDown} className="btn primary">
          {running ? 'Running…' : '▶ Run one day'}
        </button>
      </section>

      {runError && <div className="alert error">Run failed: {runError}</div>}

      {receipt && (
        <section className="card receipt">
          <h2>Receipt</h2>
          <dl>
            {receipt.decision && (
              <>
                <dt>Decision</dt>
                <dd>
                  <span className={`pill ${receipt.decision}`}>{receipt.decision}</span>
                </dd>
              </>
            )}
            {(receipt.quoteIn || receipt.quoteOut) && (
              <>
                <dt>Quote</dt>
                <dd>
                  {receipt.quoteIn ?? '10'} USDC → {receipt.quoteOut ?? '≈ 0.11'} SOL
                  {receipt.quoteOutUsd ? ` (≈ $${receipt.quoteOutUsd})` : ''}
                </dd>
              </>
            )}
            {receipt.txHash && (
              <>
                <dt>Transaction</dt>
                <dd>
                  <a href={explorerTx(receipt.txHash)} target="_blank" rel="noreferrer">
                    {receipt.txHash}
                  </a>
                </dd>
              </>
            )}
            {receipt.entryId !== undefined && (
              <>
                <dt>Ledger entry</dt>
                <dd>#{String(receipt.entryId)}</dd>
              </>
            )}
          </dl>
          {!receipt.txHash && !receipt.decision && (
            <pre className="raw">{JSON.stringify(receipt.raw, null, 2)}</pre>
          )}
        </section>
      )}

      <div className="grid">
        <section className="card policy">
          <h2>Spending policy</h2>
          {!policy && !contractError && <p className="muted">Loading policy from the contract…</p>}
          {policy && (
            <dl>
              <dt>Max spend / call</dt>
              <dd>{yoctoToNear(policy.max_spend_per_call_yocto)} NEAR</dd>
              <dt>Daily cap</dt>
              <dd>{yoctoToNear(policy.daily_cap_yocto)} NEAR</dd>
              <dt>Spent today</dt>
              <dd>{stats ? `${yoctoToNear(stats.spent_today_yocto)} NEAR` : '—'}</dd>
              <dt>Contract balance</dt>
              <dd>{stats ? `${yoctoToNear(stats.balance_yocto)} NEAR` : '—'}</dd>
              <dt>Total spent</dt>
              <dd>{stats ? `${yoctoToNear(stats.total_spent_yocto)} NEAR` : '—'}</dd>
              <dt>Kill switch</dt>
              <dd>
                <span className={`pill ${policy.kill_switch ? 'blocked' : 'approved'}`}>
                  {policy.kill_switch ? 'ON — spending blocked' : 'OFF'}
                </span>
              </dd>
              <dt>Allowlist</dt>
              <dd>
                {policy.allowlist.length ? (
                  <ul className="allowlist">
                    {policy.allowlist.map((a) => (
                      <li key={a}>
                        <a href={explorerAccount(a)} target="_blank" rel="noreferrer">
                          {a}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  '—'
                )}
              </dd>
              <dt>Owner</dt>
              <dd>{policy.owner}</dd>
            </dl>
          )}

          <h3>Edit policy</h3>
          {agentDown ? (
            <p className="muted">
              Policy editing is disabled — the agent server ({AGENT_URL}) is unreachable.
              Start it with <code>npm run server</code> in the agent workspace, then
              refresh this page.
            </p>
          ) : (
            <form onSubmit={savePolicy} className="policy-form">
              <label>
                Max spend / call (NEAR)
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={maxSpend}
                  onChange={(e) => setMaxSpend(e.target.value)}
                  required
                />
              </label>
              <label>
                Daily cap (NEAR)
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                  required
                />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={killSwitch}
                  onChange={(e) => setKillSwitch(e.target.checked)}
                />
                Kill switch (block all spending)
              </label>
              <button type="submit" disabled={policySaving || agentUp === null} className="btn">
                {policySaving ? 'Saving…' : 'Save policy'}
              </button>
              {policyMsg && <p className="muted">{policyMsg}</p>}
            </form>
          )}
          <p className="muted small">
            Policy changes are signed by the agent server with the owner key (testnet
            demo only). No private key is ever stored in this frontend.
          </p>
        </section>

        <section className="card cost">
          <h2>Why pay-per-sip?</h2>
          <p className="muted">
            One price quote a day, 30 days a month — at $0.003 per quote instead of a
            $29/month API subscription.
          </p>
          <div className="bars">
            <div className="bar-row">
              <span className="bar-label">Drip · 30 days of quotes</span>
              <div className="bar-track">
                <div className="bar drip" style={{ width: '2%' }} />
              </div>
              <span className="bar-value">$0.09</span>
            </div>
            <div className="bar-row">
              <span className="bar-label">API subscription</span>
              <div className="bar-track">
                <div className="bar sub" style={{ width: '100%' }} />
              </div>
              <span className="bar-value">$29.00</span>
            </div>
          </div>
          <p className="big-number">
            322× <span>cheaper</span>
          </p>
          <p className="muted small">
            $0.003 × 30 days = $0.09/month vs $29.00/month subscription.
          </p>
        </section>
      </div>

      <section className="card ledger">
        <div className="ledger-head">
          <h2>Live ledger — on-chain, public</h2>
          <div className="ledger-actions">
            {lastUpdated && (
              <span className="muted small">
                Updated {lastUpdated.toLocaleTimeString()} · auto-refresh 15s
              </span>
            )}
            <button onClick={refreshContract} disabled={refreshing} className="btn">
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>
        {!ledger && !contractError && <p className="muted">Loading ledger from the contract…</p>}
        {ledger && ledger.length === 0 && (
          <p className="muted">
            No payments yet — the ledger is empty. Click “Run one day” to make the
            first on-chain entry.
          </p>
        )}
        {ledger && ledger.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Time</th>
                  <th>Payee</th>
                  <th>Amount (NEAR)</th>
                  <th>Purpose</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id}>
                    <td>{e.id}</td>
                    <td>{fmtTime(e.timestamp_ms)}</td>
                    <td>
                      <a href={explorerAccount(e.payee)} target="_blank" rel="noreferrer">
                        {e.payee}
                      </a>
                    </td>
                    <td>{yoctoToNear(e.amount_yocto)}</td>
                    <td>{e.purpose}</td>
                    <td>
                      <span className={`pill ${e.status}`}>{e.status}</span>
                    </td>
                    <td>{e.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {stats && <p className="muted small">{stats.entries} entries on-chain.</p>}
      </section>

      <footer className="footer">
        Demo on NEAR testnet. The real mainnet swap is never executed.
      </footer>
    </div>
  )
}
