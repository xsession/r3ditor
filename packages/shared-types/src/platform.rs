//! Platform adapter types (Shopify, WooCommerce, etc.)

use serde::{Deserialize, Serialize};

/// Supported e-commerce platforms
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Platform {
    Shopify,
    WooCommerce,
    BigCommerce,
    Magento,
    Wix,
    Custom,
}

/// Platform integration configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformConfig {
    pub platform: Platform,
    pub api_url: String,
    pub api_key: String,
    pub shop_id: Option<String>,
    pub webhook_url: Option<String>,
}

/// A quote request from a platform
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformQuoteRequest {
    pub platform: Platform,
    pub external_order_id: String,
    pub customer_email: Option<String>,
    pub parts: Vec<PlatformPart>,
}

/// A part submitted from a platform
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformPart {
    pub filename: String,
    pub file_url: String,
    pub quantity: i32,
    pub process: Option<String>,
    pub material: Option<String>,
    pub finish: Option<String>,
}
