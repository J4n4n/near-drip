import { JsonRpcProvider } from 'near-api-js'

export const CONTRACT_ID =
  import.meta.env.VITE_CONTRACT_ID || 'drip-treasury-2026.testnet'
export const AGENT_URL =
  import.meta.env.VITE_AGENT_URL || 'http://localhost:3001'
export const EXPLORER = 'https://explorer.testnet.near.org'

const RPC_URL = 'https://rpc.testnet.near.org'

export interface Policy {
  max_spend_per_call_yocto: string
  daily_cap_yocto: string
  allowlist: string[]
  kill_switch: boolean
  owner: string
  agent_account_id: string
}

export interface LedgerEntry {
  id: number
  timestamp_ms: number
  payee: string
  amount_yocto: string
  purpose: string
  status: 'approved' | 'blocked'
  reason?: string
}

export interface Stats {
  balance_yocto: string
  spent_today_yocto: string
  total_spent_yocto: string
  entries: number
}

const provider = new JsonRpcProvider({ url: RPC_URL })

async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await provider.query({
    request_type: 'call_function',
    account_id: CONTRACT_ID,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
    finality: 'final',
  })
  const raw = (res as unknown as { result: number[] }).result
  const text = new TextDecoder().decode(new Uint8Array(raw))
  return JSON.parse(text) as T
}

export const getPolicy = () => view<Policy>('get_policy')
export const getLedger = () => view<LedgerEntry[]>('get_ledger')
export const getStats = () => view<Stats>('get_stats')

/** Format a yoctoNEAR string as NEAR, trimmed to at most 5 decimals. */
export function yoctoToNear(yocto: string | undefined | null): string {
  if (!yocto) return '0'
  try {
    const v = BigInt(yocto)
    const whole = v / 10n ** 24n
    const frac = v % 10n ** 24n
    if (frac === 0n) return whole.toString()
    let fracStr = frac.toString().padStart(24, '0').replace(/0+$/, '')
    fracStr = fracStr.slice(0, 5)
    return `${whole.toString()}.${fracStr}`
  } catch {
    return yocto
  }
}

/** Convert a NEAR amount entered by a human to a yoctoNEAR string. */
export function nearToYocto(near: string): string {
  const [whole = '0', frac = ''] = near.trim().split('.')
  const fracPadded = (frac + '0'.repeat(24)).slice(0, 24)
  return (BigInt(whole || '0') * 10n ** 24n + BigInt(fracPadded || '0')).toString()
}

export function explorerAccount(accountId: string): string {
  return `${EXPLORER}/accounts/${accountId}`
}

export function explorerTx(txHash: string): string {
  return `${EXPLORER}/transactions/${txHash}`
}
