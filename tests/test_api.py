"""Integration tests for r3ditor REST API."""


def test_index(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"r3ditor" in resp.data


def test_system_info(client):
    resp = client.get("/api/info")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["name"] == "r3ditor"
    assert "capabilities" in data


def test_create_scene(client):
    resp = client.post("/api/scene", json={"name": "My Scene"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert "id" in data
    assert data["name"] == "My Scene"


def test_list_scenes(client, scene_id):
    resp = client.get("/api/scenes")
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)
    assert any(s["id"] == scene_id for s in data)


def test_get_scene(client, scene_id):
    resp = client.get(f"/api/scene/{scene_id}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["id"] == scene_id


def test_create_box(client, scene_id):
    resp = client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "box",
        "params": {"width": 20, "height": 15, "depth": 10},
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["feature_type"] == "primitive"
    assert data["vertices"] is not None
    assert len(data["vertices"]) > 0
    assert data["indices"] is not None


def test_create_sphere(client, scene_id):
    resp = client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "sphere",
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["vertices"]) > 0


def test_create_cylinder(client, scene_id):
    resp = client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "cylinder",
    })
    assert resp.status_code == 200


def test_create_cone(client, scene_id):
    resp = client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "cone",
    })
    assert resp.status_code == 200


def test_create_torus(client, scene_id):
    resp = client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "torus",
    })
    assert resp.status_code == 200


def test_update_object(client, scene_id):
    # Create object
    resp = client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "box",
    })
    obj_id = resp.get_json()["id"]

    # Update transform
    resp = client.put(f"/api/scene/{scene_id}/object/{obj_id}", json={
        "name": "Renamed Box",
        "transform": {
            "position": {"x": 10, "y": 5, "z": 0},
            "rotation": {"x": 0, "y": 45, "z": 0},
            "scale": {"x": 1, "y": 1, "z": 1},
        },
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["name"] == "Renamed Box"
    assert data["transform"]["position"]["x"] == 10


def test_update_params(client, scene_id):
    resp = client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "box",
    })
    obj_id = resp.get_json()["id"]

    resp = client.put(f"/api/scene/{scene_id}/object/{obj_id}", json={
        "params": {"width": 50, "height": 50, "depth": 50},
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["params"]["width"] == 50


def test_delete_object(client, scene_id):
    resp = client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "box",
    })
    obj_id = resp.get_json()["id"]

    resp = client.delete(f"/api/scene/{scene_id}/object/{obj_id}")
    assert resp.status_code == 200

    # Verify it's gone
    resp = client.get(f"/api/scene/{scene_id}/object/{obj_id}")
    assert resp.status_code == 404


def test_duplicate_object(client, scene_id):
    resp = client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "sphere",
    })
    obj_id = resp.get_json()["id"]

    resp = client.post(f"/api/scene/{scene_id}/object/{obj_id}/duplicate")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["id"] != obj_id
    assert "(copy)" in data["name"]


def test_measure_object(client, scene_id):
    resp = client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "box",
        "params": {"width": 10, "height": 10, "depth": 10},
    })
    obj_id = resp.get_json()["id"]

    resp = client.get(f"/api/scene/{scene_id}/measure/{obj_id}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "volume" in data
    assert data["volume"] > 0


def test_export_stl(client, scene_id):
    client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "box",
    })

    resp = client.get(f"/api/scene/{scene_id}/export?format=stl")
    assert resp.status_code == 200
    assert len(resp.data) > 80  # At minimum the STL header


def test_export_obj(client, scene_id):
    client.post(f"/api/scene/{scene_id}/primitive", json={
        "primitive_type": "box",
    })

    resp = client.get(f"/api/scene/{scene_id}/export?format=obj")
    assert resp.status_code == 200
    assert b"v " in resp.data


def test_sketch_creation(client, scene_id):
    resp = client.post(f"/api/scene/{scene_id}/sketch", json={
        "plane": "XY",
        "name": "Sketch 1",
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["plane"] == "XY"
    assert "id" in data


def test_sketch_entity(client, scene_id):
    # Create sketch
    resp = client.post(f"/api/scene/{scene_id}/sketch", json={"plane": "XY"})
    sk_id = resp.get_json()["id"]

    # Add line
    resp = client.post(f"/api/scene/{scene_id}/sketch/{sk_id}/entity", json={
        "entity_type": "line",
        "x1": 0, "y1": 0, "x2": 10, "y2": 0,
    })
    assert resp.status_code == 200
    assert resp.get_json()["entity_type"] == "line"


def test_sketch_solve(client, scene_id):
    resp = client.post(f"/api/scene/{scene_id}/sketch", json={"plane": "XY"})
    sk_id = resp.get_json()["id"]

    # Add a line
    client.post(f"/api/scene/{scene_id}/sketch/{sk_id}/entity", json={
        "entity_type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 5,
    })

    # Add horizontal constraint
    resp = client.get(f"/api/scene/{scene_id}/sketch/{sk_id}")
    entities = resp.get_json()["entities"]
    eid = entities[0]["id"]

    client.post(f"/api/scene/{scene_id}/sketch/{sk_id}/constraint", json={
        "constraint_type": "horizontal",
        "entity_ids": [eid],
    })

    # Solve
    resp = client.post(f"/api/scene/{scene_id}/sketch/{sk_id}/solve")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True


def test_delete_scene(client, scene_id):
    resp = client.delete(f"/api/scene/{scene_id}")
    assert resp.status_code == 200

    resp = client.get(f"/api/scene/{scene_id}")
    assert resp.status_code == 404


def test_404(client):
    resp = client.get("/api/scene/nonexistent")
    assert resp.status_code == 404
