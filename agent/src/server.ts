// Drip agent — HTTP server (local demo API for the dashboard).
// GET  /status  -> { ok, contract_id, policy, stats }
// POST /run-day -> runs one day, returns the receipt
// POST /policy  -> set_policy via the OWNER key. TESTNET ONLY, local demo only:
//                 the owner key never leaves this server and is never sent to
//                 any client. In production this endpoint would not exist.
// Usage: npm run server   (AGENT_PORT, default 3001)
import express, { type Request, type Response } from "express";
import { AGENT_PORT, CONTRACT_ID } from "./config.js";
import { ContractNotDeployedError, runOneDay } from "./loop.js";
import { getLedger, getPolicy, getStats, setPolicyWithOwnerKey } from "./near.js";

const app = express();
app.use(express.json());

app.get("/status", async (_req: Request, res: Response) => {
  try {
    const [policy, stats, ledger] = await Promise.all([
      getPolicy(),
      getStats(),
      getLedger(),
    ]);
    res.json({ ok: true, contract_id: CONTRACT_ID, policy, stats, ledger });
  } catch (err) {
    res.status(503).json({
      ok: false,
      contract_id: CONTRACT_ID,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/run-day", async (_req: Request, res: Response) => {
  try {
    const receipt = await runOneDay();
    res.json(receipt);
  } catch (err) {
    if (err instanceof ContractNotDeployedError) {
      res.status(503).json({ ok: false, error: err.message, partial: err.partial });
      return;
    }
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/policy", async (req: Request, res: Response) => {
  try {
    const allowed = [
      "max_spend_per_call_yocto",
      "daily_cap_yocto",
      "allowlist",
      "kill_switch",
    ];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    const policy = await setPolicyWithOwnerKey(
      patch as Parameters<typeof setPolicyWithOwnerKey>[0],
    );
    res.json({ ok: true, policy });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.listen(AGENT_PORT, () => {
  console.log(`Drip agent listening on http://localhost:${AGENT_PORT}`);
  console.log(`Contract (testnet): ${CONTRACT_ID}`);
});
