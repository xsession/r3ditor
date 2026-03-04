//! Materials endpoint — list available sheet and CNC materials.

use axum::{routing::get, Json, Router};
use serde::Serialize;
use shared_types::materials::{self, CncMaterial, SheetMaterial};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/v1/materials", get(list_materials))
}

#[derive(Debug, Serialize)]
struct MaterialsResponse {
    sheet_materials: Vec<SheetMaterial>,
    cnc_materials: Vec<CncMaterial>,
}

async fn list_materials() -> Json<MaterialsResponse> {
    Json(MaterialsResponse {
        sheet_materials: materials::default_sheet_materials(),
        cnc_materials: materials::default_cnc_materials(),
    })
}
