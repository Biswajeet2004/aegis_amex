import os
import tempfile

os.environ["DATABASE_PATH"] = tempfile.mktemp(suffix=".db")

from fastapi.testclient import TestClient
from main import app


def test_health_and_fleet_stop():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        denied = client.post("/v1/control/fleet-stop", json={"engaged": True, "operator_role": "Developer"})
        assert denied.status_code == 403
        allowed = client.post("/v1/control/fleet-stop", json={"engaged": True, "operator_role": "Risk Officer"})
        assert allowed.status_code == 200
        assert allowed.json()["fleet_stopped"] is True


def test_scope_enforcement():
    with TestClient(app) as client:
        client.post("/v1/control/fleet-stop", json={"engaged": False, "operator_role": "Risk Officer"})
        response = client.post("/v1/authorize", json={"agent_id": "AG-0533", "action": "payment:create", "amount": 100})
        assert response.json()["decision"] == "DENIED"
