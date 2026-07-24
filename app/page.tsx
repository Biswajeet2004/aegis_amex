"use client";

import { useMemo, useState } from "react";

type Agent = {
  id: string;
  name: string;
  role: string;
  status: "Active" | "Paused" | "Revoked";
  spent: number;
  cap: number;
  risk: "Low" | "Medium" | "High";
  actions: string[];
};

const seedAgents: Agent[] = [
  { id: "AG-1042", name: "Treasury Rebalancer", role: "Corporate treasury", status: "Active", spent: 284000, cap: 500000, risk: "Low", actions: ["Initiate ACH", "Read positions", "FX conversion"] },
  { id: "AG-0871", name: "Vendor Payables", role: "Accounts payable", status: "Active", spent: 187400, cap: 200000, risk: "High", actions: ["Create payment", "Verify vendor", "Read invoices"] },
  { id: "AG-0618", name: "Fraud Investigator", role: "Risk operations", status: "Paused", spent: 0, cap: 25000, risk: "Medium", actions: ["Hold transaction", "Read KYC", "Open case"] },
  { id: "AG-0533", name: "Card Disputes", role: "Customer operations", status: "Active", spent: 43200, cap: 100000, risk: "Low", actions: ["Issue provisional credit", "Read account", "Open dispute"] },
];

const events = [
  { time: "10:42:18.441", agent: "Vendor Payables", action: "payment.create", result: "DENIED", reason: "Velocity limit: 18/15 per hour", amount: "$12,840", tone: "danger" },
  { time: "10:42:16.024", agent: "Treasury Rebalancer", action: "fx.convert", result: "ALLOWED", reason: "Within mandate · step-up signed", amount: "$84,000", tone: "ok" },
  { time: "10:41:58.199", agent: "Card Disputes", action: "credit.issue", result: "ALLOWED", reason: "Amount under $2,500 threshold", amount: "$428", tone: "ok" },
  { time: "10:41:40.607", agent: "Fraud Investigator", action: "transaction.hold", result: "DENIED", reason: "Agent paused by operator", amount: "—", tone: "danger" },
  { time: "10:41:22.310", agent: "Vendor Payables", action: "vendor.read", result: "ALLOWED", reason: "Resource scope matched", amount: "—", tone: "ok" },
];

export default function Home() {
  const [agents, setAgents] = useState(seedAgents);
  const [fleetStopped, setFleetStopped] = useState(false);
  const [selected, setSelected] = useState(seedAgents[1].id);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");

  const active = agents.filter((a) => a.status === "Active").length;
  const spend = agents.reduce((n, a) => n + a.spent, 0);
  const selectedAgent = agents.find((a) => a.id === selected) ?? agents[0];
  const filtered = useMemo(
    () => agents.filter((a) => `${a.name} ${a.id} ${a.role}`.toLowerCase().includes(query.toLowerCase())),
    [agents, query]
  );

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function toggleFleet() {
    if (!fleetStopped) {
      setAgents((items) => items.map((a) => ({ ...a, status: a.status === "Revoked" ? "Revoked" : "Paused" })));
      setFleetStopped(true);
      notify("Fleet stop engaged — all execution tokens invalidated");
    } else {
      setFleetStopped(false);
      notify("Fleet stop cleared — agents remain paused pending review");
    }
  }

  function toggleAgent(id: string) {
    setAgents((items) => items.map((a) => a.id === id ? { ...a, status: a.status === "Active" ? "Paused" : "Active" } : a));
    notify("Agent state changed and written to the audit log");
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brandmark">A</div>
          <div><strong>AEGIS</strong><span>Agent Governance</span></div>
        </div>
        <div className="top-actions">
          <div className="environment"><i /> Production · us-east-1</div>
          <button className={fleetStopped ? "estop engaged" : "estop"} onClick={toggleFleet}>
            <span>{fleetStopped ? "↻" : "■"}</span>{fleetStopped ? "CLEAR FLEET STOP" : "EMERGENCY STOP"}
          </button>
          <button className="avatar" aria-label="Operator menu">MK</button>
        </div>
      </header>

      <aside className="sidebar">
        <nav>
          <a className="active" href="#overview"><span>⌁</span>Overview</a>
          <a href="#agents"><span>◫</span>Agent registry</a>
          <a href="#policies"><span>◇</span>Policy studio</a>
          <a href="#budgets"><span>◎</span>Budgets & limits</a>
          <a href="#audit"><span>≡</span>Audit trail</a>
        </nav>
        <div className="sidebar-foot">
          <div><span className="pulse" /> Policy engine healthy</div>
          <small>OPA bundle v4.12.7<br/>p95 decision 4.8 ms</small>
        </div>
      </aside>

      <section className="content" id="overview">
        <div className="headline">
          <div>
            <p className="eyebrow">CONTROL PLANE / FLEET OVERVIEW</p>
            <h1>Every agent. Every action.<br/><em>Under control.</em></h1>
            <p className="lede">Real-time authorization, budget enforcement, and instant revocation for autonomous financial agents.</p>
          </div>
          <div className="system-state">
            <span>System posture</span><strong>{fleetStopped ? "FLEET HALTED" : "PROTECTED"}</strong><small>{fleetStopped ? "Execution disabled globally" : "All controls operational"}</small>
          </div>
        </div>

        <div className="metrics">
          <article><span>Active agents</span><strong>{active}<small> / {agents.length}</small></strong><p><i className="good"/> {agents.length - active} require attention</p></article>
          <article><span>24h policy decisions</span><strong>1.84<small>M</small></strong><p><b>99.94%</b> allowed safely</p></article>
          <article><span>Fleet spend · 24h</span><strong>${(spend / 1000).toFixed(1)}<small>k</small></strong><p>of $825k aggregate cap</p><div className="bar"><i style={{width: `${Math.min(spend / 825000 * 100, 100)}%`}}/></div></article>
          <article><span>Enforcement latency</span><strong>4.8<small>ms</small></strong><p><b>↓ 0.7 ms</b> vs 7d average</p></article>
        </div>

        <div className="grid">
          <section className="panel agents-panel" id="agents">
            <div className="panel-head"><div><p className="eyebrow">FLEET</p><h2>Agent registry</h2></div><input aria-label="Search agents" placeholder="Search agents…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <div className="agent-list">
              {filtered.map((agent) => {
                const pct = Math.round(agent.spent / agent.cap * 100);
                return <button className={`agent-row ${selected === agent.id ? "selected" : ""}`} key={agent.id} onClick={() => setSelected(agent.id)}>
                  <div className="agent-icon">{agent.name.split(" ").map((x) => x[0]).join("").slice(0,2)}</div>
                  <div className="agent-name"><strong>{agent.name}</strong><span>{agent.id} · {agent.role}</span></div>
                  <div className={`status ${agent.status.toLowerCase()}`}><i/>{agent.status}</div>
                  <div className="spend"><span>${(agent.spent/1000).toFixed(1)}k / ${(agent.cap/1000).toFixed(0)}k</span><div><i style={{width: `${pct}%`}}/></div></div>
                  <span className={`risk ${agent.risk.toLowerCase()}`}>{agent.risk}</span>
                </button>
              })}
            </div>
          </section>

          <section className="panel inspector" id="policies">
            <div className="panel-head"><div><p className="eyebrow">POLICY INSPECTOR</p><h2>{selectedAgent.name}</h2></div><button className="more" aria-label="More options">•••</button></div>
            <div className="identity"><span>{selectedAgent.id}</span><span>Workload identity verified</span></div>
            <div className="rule"><span>Execution state</span><button onClick={() => toggleAgent(selectedAgent.id)} className={selectedAgent.status === "Active" ? "toggle on" : "toggle"}><i/></button></div>
            <div className="rule vertical"><span>Allowed capabilities</span><div className="chips">{selectedAgent.actions.map((a) => <b key={a}>{a}</b>)}</div></div>
            <div className="rule vertical" id="budgets"><span>Dynamic spend policy</span><div className="limit"><strong>${selectedAgent.spent.toLocaleString()}</strong><span>of ${selectedAgent.cap.toLocaleString()}</span></div><div className="bar large"><i style={{width: `${selectedAgent.spent/selectedAgent.cap*100}%`}}/></div><small>Caps tighten automatically when risk score rises</small></div>
            <div className="rule"><span>Approval threshold</span><strong>$25,000 <em>2-person</em></strong></div>
            <button className="policy-btn" onClick={() => notify("Policy draft opened for review")}>Edit policy</button>
          </section>
        </div>

        <section className="panel audit" id="audit">
          <div className="panel-head"><div><p className="eyebrow">IMMUTABLE LEDGER</p><h2>Live authorization stream</h2></div><div className="live"><i/> LIVE · 2,481 events/min</div></div>
          <div className="audit-head"><span>TIME (UTC)</span><span>AGENT</span><span>ACTION</span><span>DECISION</span><span>POLICY REASON</span><span>VALUE</span></div>
          {events.map((e) => <div className="audit-row" key={e.time}>
            <code>{e.time}</code><strong>{e.agent}</strong><code>{e.action}</code><b className={e.tone}>{e.result}</b><span>{e.reason}</span><strong>{e.amount}</strong>
          </div>)}
          <div className="audit-foot"><span>Hash-chained · WORM retained 7 years · Export ready</span><button onClick={() => notify("Audit export prepared with evidence manifest")}>Export evidence ↗</button></div>
        </section>
      </section>
      {toast && <div className="toast"><i/> {toast}</div>}
    </main>
  );
}
