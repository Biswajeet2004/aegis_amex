from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_NAME = "AEGIS-Gov Control Plane"
SIGNING_SECRET = os.getenv("SIGNING_SECRET", "development-only-change-me").encode()
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", "./aegis.db"))
ALLOWED_ORIGINS = [item.strip() for item in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if item.strip()]
HIGH_VALUE_THRESHOLD = 10_000
lock = threading.RLock()

app = FastAPI(title=APP_NAME, version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agents = {
    "AG-1042": {"name": "Treasury Rebalancer", "status": "Active", "spent": 284000, "cap": 500000, "scopes": ["positions:read", "ach:create", "fx:convert"]},
    "AG-0871": {"name": "Vendor Payables", "status": "Active", "spent": 187400, "cap": 200000, "scopes": ["invoice:read", "vendor:verify", "payment:create"]},
    "AG-0618": {"name": "Fraud Investigator", "status": "Paused", "spent": 0, "cap": 25000, "scopes": ["kyc:read", "case:create", "transaction:hold"]},
    "AG-0533": {"name": "Card Disputes", "status": "Active", "spent": 43200, "cap": 100000, "scopes": ["account:read", "dispute:create", "credit:issue"]},
}
state = {"fleet_stopped": False, "execution_epoch": 1, "l2_available": True, "safety_factor": 0.05}


@contextmanager
def database():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def initialize_database():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with database() as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS audit_events (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                decision TEXT NOT NULL,
                reason TEXT NOT NULL,
                payload TEXT NOT NULL,
                previous_hash TEXT NOT NULL,
                event_hash TEXT NOT NULL UNIQUE
            )"""
        )


def append_audit(actor: str, action: str, decision: str, reason: str, payload: dict) -> str:
    with lock, database() as connection:
        row = connection.execute("SELECT event_hash FROM audit_events ORDER BY sequence DESC LIMIT 1").fetchone()
        previous_hash = row["event_hash"] if row else "0" * 64
        timestamp = datetime.now(timezone.utc).isoformat()
        canonical = json.dumps(
            {"timestamp": timestamp, "actor": actor, "action": action, "decision": decision, "reason": reason, "payload": payload, "previous_hash": previous_hash},
            separators=(",", ":"),
            sort_keys=True,
        )
        event_hash = hashlib.sha256(canonical.encode()).hexdigest()
        connection.execute(
            "INSERT INTO audit_events(timestamp, actor, action, decision, reason, payload, previous_hash, event_hash) VALUES(?,?,?,?,?,?,?,?)",
            (timestamp, actor, action, decision, reason, json.dumps(payload, sort_keys=True), previous_hash, event_hash),
        )
        return event_hash


def b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def issue_token(agent_id: str, ttl_seconds: int = 300) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    now = int(time.time())
    payload = b64url(json.dumps({"sub": agent_id, "iat": now, "exp": now + ttl_seconds, "epoch": state["execution_epoch"]}, separators=(",", ":")).encode())
    signature = b64url(hmac.new(SIGNING_SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


class FleetStopRequest(BaseModel):
    engaged: bool
    operator_role: str


class StatusRequest(BaseModel):
    status: Literal["Active", "Paused", "Revoked"]
    operator_role: str


class TokenRequest(BaseModel):
    agent_id: str
    attestation: str = Field(min_length=8)


class AuthorizationRequest(BaseModel):
    agent_id: str
    action: str
    amount: float = Field(default=0, ge=0)
    approved_by: list[str] = Field(default_factory=list)
    schema_version: str = "payments.v3"


@app.on_event("startup")
def startup():
    initialize_database()


@app.get("/")
def root():
    return {"service": APP_NAME, "status": "healthy", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "healthy", "fleet_stopped": state["fleet_stopped"], "execution_epoch": state["execution_epoch"], "l2_available": state["l2_available"]}


@app.get("/v1/agents")
def list_agents():
    return [{"id": agent_id, **agent} for agent_id, agent in agents.items()]


@app.post("/v1/identity/token")
def token_vending_machine(request: TokenRequest):
    if request.agent_id not in agents:
        raise HTTPException(404, "Unknown workload identity")
    if not hmac.compare_digest(request.attestation, os.getenv("SIDECAR_ATTESTATION", "local-sidecar-demo")):
        append_audit(request.agent_id, "identity.token", "DENIED", "Invalid environment attestation", {})
        raise HTTPException(401, "Environment attestation failed")
    token = issue_token(request.agent_id)
    event_hash = append_audit(request.agent_id, "identity.token", "ALLOWED", "Short-lived token issued", {"ttl_seconds": 300})
    return {"access_token": token, "token_type": "bearer", "expires_in": 300, "audit_hash": event_hash}


@app.post("/v1/control/fleet-stop")
def fleet_stop(request: FleetStopRequest):
    if request.operator_role != "Risk Officer":
        raise HTTPException(403, "Second-line approval required")
    with lock:
        state["fleet_stopped"] = request.engaged
        state["execution_epoch"] += 1
    event_hash = append_audit(request.operator_role, "fleet.stop", "ALLOWED", "Execution epoch invalidated", {"engaged": request.engaged, "epoch": state["execution_epoch"]})
    return {**state, "audit_hash": event_hash}


@app.post("/v1/agents/{agent_id}/status")
def update_agent_status(agent_id: str, request: StatusRequest):
    if request.operator_role != "Risk Officer":
        raise HTTPException(403, "Second-line approval required")
    if agent_id not in agents:
        raise HTTPException(404, "Unknown agent")
    agents[agent_id]["status"] = request.status
    event_hash = append_audit(request.operator_role, "agent.status", "ALLOWED", "Agent enforcement state changed", {"agent_id": agent_id, "status": request.status})
    return {"id": agent_id, **agents[agent_id], "audit_hash": event_hash}


@app.post("/v1/authorize")
def authorize(request: AuthorizationRequest, raw_request: Request):
    started = time.perf_counter_ns()
    agent = agents.get(request.agent_id)
    decision, reason = "ALLOWED", "Policy and budget checks passed"
    if state["fleet_stopped"]:
        decision, reason = "DENIED", "Global fleet stop engaged"
    elif not agent or agent["status"] != "Active":
        decision, reason = "DENIED", "Agent is not active"
    elif request.action not in agent["scopes"]:
        decision, reason = "DENIED", "Requested capability is outside the grant"
    elif request.amount > 25_000 and len(set(request.approved_by)) < 2:
        decision, reason = "DENIED", "Two-person approval required"
    elif agent["spent"] + request.amount > agent["cap"]:
        decision, reason = "DENIED", "Agent budget exceeded"
    elif not state["l2_available"] and request.amount > agent["cap"] * state["safety_factor"]:
        decision, reason = "DENIED", "Degraded-mode safety allocation exceeded"
    elif request.amount >= HIGH_VALUE_THRESHOLD and not state["l2_available"]:
        decision, reason = "DENIED", "Strong-consistency ledger unavailable"
    if decision == "ALLOWED":
        with lock:
            agent["spent"] += request.amount
    latency_us = round((time.perf_counter_ns() - started) / 1000, 2)
    event_hash = append_audit(request.agent_id, request.action, decision, reason, {"amount": request.amount, "schema_version": request.schema_version, "latency_us": latency_us})
    return {"decision": decision, "reason": reason, "latency_us": latency_us, "audit_hash": event_hash, "request_id": raw_request.headers.get("x-request-id", secrets.token_hex(8))}


@app.get("/v1/audit")
def audit(limit: int = 50):
    with database() as connection:
        rows = connection.execute("SELECT * FROM audit_events ORDER BY sequence DESC LIMIT ?", (min(limit, 500),)).fetchall()
    return [dict(row) for row in rows]


@app.get("/v1/audit/verify")
def verify_audit_chain():
    with database() as connection:
        rows = connection.execute("SELECT * FROM audit_events ORDER BY sequence").fetchall()
    previous = "0" * 64
    for row in rows:
        if row["previous_hash"] != previous:
            return {"valid": False, "broken_at": row["sequence"]}
        canonical = json.dumps(
            {"timestamp": row["timestamp"], "actor": row["actor"], "action": row["action"], "decision": row["decision"], "reason": row["reason"], "payload": json.loads(row["payload"]), "previous_hash": row["previous_hash"]},
            separators=(",", ":"),
            sort_keys=True,
        )
        if hashlib.sha256(canonical.encode()).hexdigest() != row["event_hash"]:
            return {"valid": False, "broken_at": row["sequence"]}
        previous = row["event_hash"]
    return {"valid": True, "events_verified": len(rows), "head_hash": previous}
