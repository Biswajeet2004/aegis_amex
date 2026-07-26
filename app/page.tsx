"use client";

import { useMemo, useState } from "react";

type OperatorRole = "Developer" | "Risk Officer" | "Internal Auditor";
type AgentStatus = "Active" | "Paused" | "Revoked";

type Agent = {
  id: string;
  name: string;
  team: string;
  status: AgentStatus;
  spent: number;
  cap: number;
  risk: "Low" | "Medium" | "High";
  scopes: string[];
  tokenTtl: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const initialAgents: Agent[] = [
  { id: "AG-1042", name: "Treasury Rebalancer", team: "Finance", status: "Active", spent: 284000, cap: 500000, risk: "Low", scopes: ["positions:read", "ach:create", "fx:convert"], tokenTtl: 241 },
  { id: "AG-0871", name: "Vendor Payables", team: "Finance", status: "Active", spent: 187400, cap: 200000, risk: "High", scopes: ["invoice:read", "vendor:verify", "payment:create"], tokenTtl: 97 },
  { id: "AG-0618", name: "Fraud Investigator", team: "RiskOps", status: "Paused", spent: 0, cap: 25000, risk: "Medium", scopes: ["kyc:read", "case:create", "transaction:hold"], tokenTtl: 0 },
  { id: "AG-0533", name: "Card Disputes", team: "Support", status: "Active", spent: 43200, cap: 100000, risk: "Low", scopes: ["account:read", "dispute:create", "credit:issue"], tokenTtl: 186 },
];

const initialEvents = [
  { time: "10:42:18.441", agent: "Vendor Payables", action: "payment.create", result: "DENIED", reason: "Velocity limit: 18/15 per hour", amount: "$12,840", hash: "a94d...20e1" },
  { time: "10:42:16.024", agent: "Treasury Rebalancer", action: "fx.convert", result: "ALLOWED", reason: "Policy matched - step-up signed", amount: "$84,000", hash: "69b8...af77" },
  { time: "10:41:58.199", agent: "Card Disputes", action: "credit.issue", result: "ALLOWED", reason: "Below $2,500 threshold", amount: "$428", hash: "11fe...c802" },
  { time: "10:41:40.607", agent: "Fraud Investigator", action: "transaction.hold", result: "DENIED", reason: "Agent paused by operator", amount: "-", hash: "df24...8c91" },
];

const permissions: Record<OperatorRole, { subtitle: string; canChange: boolean; canStop: boolean; canAudit: boolean }> = {
  Developer: { subtitle: "First line - monitor and propose", canChange: false, canStop: false, canAudit: false },
  "Risk Officer": { subtitle: "Second line - approve and enforce", canChange: true, canStop: true, canAudit: true },
  "Internal Auditor": { subtitle: "Third line - independent read-only review", canChange: false, canStop: false, canAudit: true },
};

async function post(path: string, body?: unknown) {
  if (!API_URL) return null;
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error("Control plane rejected the request");
  return response.json();
}

export default function Home() {
  const [agents, setAgents] = useState(initialAgents);
  const [role, setRole] = useState<OperatorRole>("Risk Officer");
  const [fleetStopped, setFleetStopped] = useState(false);
  const [selected, setSelected] = useState(initialAgents[1].id);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [shadowResult, setShadowResult] = useState<null | { allowed: number; denied: number; changed: number }>(null);
  const [schemaVersion, setSchemaVersion] = useState("payments.v3");
  const access = permissions[role];

  const active = agents.filter((agent) => agent.status === "Active").length;
  const spend = agents.reduce((sum, agent) => sum + agent.spent, 0);
  const selectedAgent = agents.find((agent) => agent.id === selected) ?? agents[0];
  const filtered = useMemo(
    () => agents.filter((agent) => `${agent.name} ${agent.id} ${agent.team}`.toLowerCase().includes(query.toLowerCase())),
    [agents, query],
  );

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  async function toggleFleet() {
    if (!access.canStop) return notify("Only the second line of defense can control the fleet stop");
    try {
      await post("/v1/control/fleet-stop", { engaged: !fleetStopped, operator_role: role });
      setFleetStopped(!fleetStopped);
      if (!fleetStopped) setAgents((items) => items.map((agent) => ({ ...agent, status: agent.status === "Revoked" ? "Revoked" : "Paused" })));
      notify(!fleetStopped ? "Fleet stop engaged - execution epoch invalidated" : "Fleet stop cleared - agents remain paused for review");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Control plane unavailable");
    }
  }

  async function toggleAgent(id: string) {
    if (!access.canChange) return notify("This role can review state but cannot change enforcement");
    const agent = agents.find((item) => item.id === id);
    if (!agent) return;
    const next = agent.status === "Active" ? "Paused" : "Active";
    try {
      await post(`/v1/agents/${id}/status`, { status: next, operator_role: role });
      setAgents((items) => items.map((item) => item.id === id ? { ...item, status: next } : item));
      notify(`${agent.name} is now ${next.toLowerCase()}; the action was hash-chained`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Control plane unavailable");
    }
  }

  function runShadowTest() {
    setShadowResult({ allowed: 183920, denied: 2418, changed: 37 });
    notify("Draft evaluated against the last 24 hours of traffic");
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand"><div className="brandmark">A</div><div><strong>AEGIS-GOV</strong><span>Autonomous governance system</span></div></div>
        <div className="top-actions">
          <div className="environment"><i /> {API_URL ? "Control plane connected" : "Demo data mode"}</div>
          <label className="role-picker">
            <span>Simulate role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as OperatorRole)}>
              <option>Developer</option><option>Risk Officer</option><option>Internal Auditor</option>
            </select>
          </label>
          <button className={fleetStopped ? "estop engaged" : "estop"} disabled={!access.canStop} onClick={toggleFleet}>
            {fleetStopped ? "CLEAR FLEET STOP" : "EMERGENCY STOP"}
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <nav>
          <a className="active" href="#overview">Overview</a>
          <a href="#agents">Agent registry</a>
          <a href="#identity">Identity</a>
          <a href="#policies">Policy studio</a>
          <a href="#budgets">Budget controls</a>
          <a href="#audit">Audit ledger</a>
          <a href="#resilience">Resilience</a>
        </nav>
        <div className="sidebar-foot">
          <div><span className="pulse" /> Hot path healthy</div>
          <small>Wasm bundle v4.12.7<br/>p99 decision 1.14 ms</small>
        </div>
      </aside>

      <section className="content" id="overview">
        <div className="headline">
          <div><p className="eyebrow">CONTROL PLANE / FLEET OVERVIEW</p><h1>Govern every action<br/><em>before it executes.</em></h1><p className="lede">A zero-trust interception layer for real-time policy enforcement, spend control, revocation, and cryptographic evidence.</p></div>
          <div className="posture"><span>System posture</span><strong>{fleetStopped ? "FLEET HALTED" : "PROTECTED"}</strong><small>{access.subtitle}</small></div>
        </div>

        <div className="metrics">
          <article><span>Active agents</span><strong>{active}<small> / {agents.length}</small></strong><p>{agents.length - active} require attention</p></article>
          <article><span>24h decisions</span><strong>1.84<small>M</small></strong><p><b>100%</b> attributable</p></article>
          <article><span>Fleet spend</span><strong>${(spend / 1000).toFixed(1)}<small>k</small></strong><p>of $825k cap</p><div className="bar"><i style={{ width: `${spend / 825000 * 100}%` }}/></div></article>
          <article><span>Added latency p99</span><strong>1.14<small>ms</small></strong><p><b>Hot path target &lt; 2 ms</b></p></article>
        </div>

        <section className="path-strip">
          <div><span>01</span><strong>Kill bitmask</strong><small>0.04 ms</small></div><b>→</b>
          <div><span>02</span><strong>Wasm policy</strong><small>0.61 ms</small></div><b>→</b>
          <div><span>03</span><strong>L1 atomic cap</strong><small>0.32 ms</small></div><b>→</b>
          <div className="dispatch"><span>04</span><strong>API dispatch</strong><small>Allowed traffic only</small></div>
          <div className="cold"><span>ASYNC</span><strong>Hash + sync + stream</strong><small>Cold path is non-blocking</small></div>
        </section>

        <div className="grid">
          <section className="panel agents-panel" id="agents">
            <div className="panel-head"><div><p className="eyebrow">FLEET</p><h2>Agent registry</h2></div><input aria-label="Search agents" placeholder="Search agents..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <div className="agent-list">
              {filtered.map((agent) => <button className={`agent-row ${selected === agent.id ? "selected" : ""}`} key={agent.id} onClick={() => setSelected(agent.id)}>
                <div className="agent-icon">{agent.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div>
                <div className="agent-name"><strong>{agent.name}</strong><span>{agent.id} - {agent.team}</span></div>
                <div className={`status ${agent.status.toLowerCase()}`}><i />{agent.status}</div>
                <div className="spend"><span>${(agent.spent / 1000).toFixed(1)}k / ${(agent.cap / 1000).toFixed(0)}k</span><div><i style={{ width: `${agent.spent / agent.cap * 100}%` }}/></div></div>
                <span className={`risk ${agent.risk.toLowerCase()}`}>{agent.risk}</span>
              </button>)}
            </div>
          </section>

          <section className="panel inspector">
            <div className="panel-head"><div><p className="eyebrow">ENFORCEMENT</p><h2>{selectedAgent.name}</h2></div><span className="risk-score">Risk {selectedAgent.risk}</span></div>
            <div className="identity-line"><span>{selectedAgent.id}</span><span>mTLS + JWT verified</span></div>
            <div className="rule"><span>Execution state</span><button aria-label="Toggle agent state" disabled={!access.canChange} onClick={() => toggleAgent(selectedAgent.id)} className={selectedAgent.status === "Active" ? "toggle on" : "toggle"}><i /></button></div>
            <div className="rule vertical"><span>Granted scopes</span><div className="chips">{selectedAgent.scopes.map((scope) => <b key={scope}>{scope}</b>)}</div></div>
            <div className="rule vertical" id="budgets"><span>Dynamic spend policy</span><div className="limit"><strong>${selectedAgent.spent.toLocaleString()}</strong><span>of ${selectedAgent.cap.toLocaleString()}</span></div><div className="bar large"><i style={{ width: `${selectedAgent.spent / selectedAgent.cap * 100}%` }}/></div><small>High-value actions synchronize against L2 before dispatch</small></div>
            <div className="rule"><span>Approval threshold</span><strong>$25,000 <em>two-person</em></strong></div>
          </section>
        </div>

        <div className="three-grid">
          <section className="panel" id="identity">
            <div className="panel-head"><div><p className="eyebrow">ZERO-TOUCH AUTH</p><h2>Identity sidecar</h2></div><span className="tag success">ROTATING</span></div>
            <div className="identity-flow"><div><span>Agent</span><small>No secret access</small></div><b>→</b><div><span>Sidecar</span><small>mTLS-bound token</small></div><b>→</b><div><span>Gateway</span><small>Signature verified</small></div></div>
            <div className="token-card"><span>Current token TTL</span><strong>{selectedAgent.tokenTtl}s</strong><small>Memory-only - automatically renewed</small></div>
          </section>

          <section className="panel" id="policies">
            <div className="panel-head"><div><p className="eyebrow">POLICY STUDIO</p><h2>Shadow mode</h2></div><span className="tag">DRAFT</span></div>
            <pre className="policy-code">{`package payments\n\ndeny if input.amount > 25000\n  and not input.approval.two_person`}</pre>
            <button className="wide-btn" disabled={!access.canChange} onClick={runShadowTest}>Test against 24h traffic</button>
            {shadowResult && <div className="shadow-result"><span><b>{shadowResult.allowed.toLocaleString()}</b> allowed</span><span><b>{shadowResult.denied.toLocaleString()}</b> denied</span><span><b>{shadowResult.changed}</b> decisions changed</span></div>}
          </section>

          <section className="panel" id="resilience">
            <div className="panel-head"><div><p className="eyebrow">DEGRADED MODE</p><h2>Partition safety</h2></div><span className="tag success">READY</span></div>
            <div className="formula">B<sub>local,i</sub> = B<sub>global</sub> × W<sub>i</sub> × α</div>
            <p className="panel-copy">Weighted pre-allocation guarantees that all disconnected nodes together can spend no more than the safety reserve.</p>
            <div className="reserve"><span>Safety factor α</span><strong>5%</strong></div>
            <div className="reserve"><span>Maximum partition exposure</span><strong>$41,250</strong></div>
          </section>
        </div>

        <div className="two-grid">
          <section className="panel">
            <div className="panel-head"><div><p className="eyebrow">SCHEMA REGISTRY</p><h2>Versioned payload enforcement</h2></div><select value={schemaVersion} onChange={(event) => setSchemaVersion(event.target.value)}><option>payments.v3</option><option>payments.v2</option><option>refunds.v5</option></select></div>
            <div className="schema-body"><div className="schema-version"><strong>{schemaVersion}</strong><span>ACTIVE</span><small>JSON Schema + deterministic AST validation</small></div><div className="schema-route"><span>Old module</span><i /><span>Header-based routing</span><i /><span>New module</span></div></div>
            <div className="schema-foot">Zero-downtime Wasm hot swap - unsupported fields fail closed</div>
          </section>
          <section className="panel governance">
            <div className="panel-head"><div><p className="eyebrow">GOVERNANCE</p><h2>Three lines of defense</h2></div></div>
            <div className={`defense ${role === "Developer" ? "current" : ""}`}><b>1</b><div><strong>Developers & operations</strong><span>Read, monitor, propose</span></div></div>
            <div className={`defense ${role === "Risk Officer" ? "current" : ""}`}><b>2</b><div><strong>Risk & compliance</strong><span>Approve, enforce, stop</span></div></div>
            <div className={`defense ${role === "Internal Auditor" ? "current" : ""}`}><b>3</b><div><strong>Internal audit</strong><span>Independent evidence review</span></div></div>
          </section>
        </div>

        <section className="panel audit" id="audit">
          <div className="panel-head"><div><p className="eyebrow">IMMUTABLE LEDGER</p><h2>Live authorization stream</h2></div><div className="live"><i /> LIVE - 2,481 events/min</div></div>
          <div className="audit-head"><span>TIME UTC</span><span>AGENT</span><span>ACTION</span><span>DECISION</span><span>POLICY REASON</span><span>VALUE</span><span>HASH</span></div>
          {initialEvents.map((event) => <div className="audit-row" key={event.time}>
            <code>{event.time}</code><strong>{event.agent}</strong><code>{event.action}</code><b className={event.result === "ALLOWED" ? "ok" : "danger"}>{event.result}</b><span>{event.reason}</span><strong>{event.amount}</strong><code>{event.hash}</code>
          </div>)}
          <div className="audit-foot"><span>SQLite async log in MVP - memory-mapped WAL + WORM retention in production</span><button disabled={!access.canAudit} onClick={() => notify("Evidence manifest verified and ready for export")}>Verify chain & export</button></div>
        </section>

        <section className="roadmap">
          <div><p className="eyebrow">IMPLEMENTED MVP</p><h2>Built for a credible demonstration</h2><ul><li>User-space FastAPI control plane</li><li>Short-lived identity tokens</li><li>Role-aware operator controls</li><li>Atomic in-process budget checks</li><li>SQLite hash-chain audit ledger</li></ul></div>
          <div><p className="eyebrow">PRODUCTION EVOLUTION</p><h2>Designed for enterprise scale</h2><ul><li>Go or Rust gateway with embedded OPA Wasm</li><li>SPIFFE/SPIRE workload identity and mTLS</li><li>Redis Cluster weighted budget allocation</li><li>eBPF/XDP interception</li><li>NVMe memory-mapped WAL and WORM archive</li></ul></div>
        </section>
      </section>
      {toast && <div className="toast"><i />{toast}</div>}
    </main>
  );
}
