# Aegis — Governance Layer for Financial Agents

Aegis is a policy enforcement control plane that sits between autonomous financial agents and the bank systems they act on. Every attempted action is authorized before execution, checked against a real-time budget ledger, and written to a tamper-evident audit stream. Operators can pause one identity or invalidate the fleet’s execution epoch in seconds.

## Core design

- **Granular permissions:** workload identity + role, action, resource, geography, time window, transaction attributes, and approval requirements.
- **Dynamic spend controls:** hierarchical caps at fleet, business unit, agent, counterparty, and time-window levels; atomic reservations prevent concurrent overspend.
- **Instant revocation:** short-lived signed execution tokens, centrally incremented revocation epochs, and deny-by-default behavior when policy state is unavailable.
- **Full auditability:** every decision records input hash, policy bundle version, reason codes, latency, actor identity, and outcome in a hash-chained WORM ledger.
- **Operator control room:** fleet posture, agent registry, policy inspection, spend utilization, emergency stop, and live authorization events.

## Reference architecture

Agent requests pass through an enforcement gateway. The gateway authenticates workload identity, obtains a policy decision from OPA, atomically reserves funds in Redis, and forwards approved actions to bank APIs. PostgreSQL stores policy and agent configuration. Audit events stream to immutable object storage and SIEM. Revocation epochs are pushed through pub/sub to every gateway instance.

## Trust and failure behavior

High-risk financial actions fail closed. Read-only operations may use a tightly bounded, signed last-known-good policy bundle during a control-plane outage. Two-person approval protects policy publication, cap increases, and emergency-stop release. All administrative changes are themselves governed and audited.

## Success targets

- Policy decision p95 under 10 ms; p99 under 20 ms
- Fleet-stop propagation p99 under 2 seconds
- Zero overspend under 10,000 concurrent reservation attempts
- 100% decisions attributable to an immutable policy version and reason code
- 99.99% control-plane availability with multi-region policy bundle distribution

## Demo

The included web dashboard is an interactive front-end prototype. Search and inspect agents, pause or resume an individual agent, engage the fleet emergency stop, review budget utilization, and export audit evidence.
