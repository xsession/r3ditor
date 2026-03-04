"""Shared pytest fixtures for r3ditor tests."""
import sys
import pathlib

# Ensure project root is on path
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import pytest
from server import app as flask_app


@pytest.fixture
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as c:
        yield c


@pytest.fixture
def scene_id(client):
    """Create a scene and return its ID."""
    resp = client.post("/api/scene", json={"name": "Test Scene"})
    data = resp.get_json()
    return data["id"]
