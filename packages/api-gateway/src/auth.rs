//! JWT authentication middleware.

use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts, StatusCode},
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// JWT claims
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,         // user ID
    pub org: Uuid,         // organization / tenant ID
    pub role: String,      // admin, operator, viewer
    pub exp: usize,        // expiration timestamp
    pub iat: usize,        // issued at timestamp
}

/// Create a JWT token
pub fn create_token(claims: &Claims, secret: &str) -> anyhow::Result<String> {
    let token = encode(
        &Header::default(),
        claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    Ok(token)
}

/// Verify and decode a JWT token
pub fn verify_token(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(token_data.claims)
}

/// Extract authenticated user from request
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub org_id: Uuid,
    pub role: String,
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    fn from_request_parts<'life0, 'life1, 'async_trait>(
        parts: &'life0 mut Parts,
        _state: &'life1 S,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Self, Self::Rejection>> + Send + 'async_trait>,
    >
    where
        Self: 'async_trait,
        'life0: 'async_trait,
        'life1: 'async_trait,
    {
        Box::pin(async move {
            let auth_header = parts
                .headers
                .get(header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .ok_or(StatusCode::UNAUTHORIZED)?;

            let token = auth_header
                .strip_prefix("Bearer ")
                .ok_or(StatusCode::UNAUTHORIZED)?;

            // TODO: get secret from state instead of hardcoded
            let claims =
                verify_token(token, "secret").map_err(|_| StatusCode::UNAUTHORIZED)?;

            Ok(AuthUser {
                user_id: claims.sub,
                org_id: claims.org,
                role: claims.role,
            })
        })
    }
}
