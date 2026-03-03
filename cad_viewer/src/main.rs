use anyhow::Result;
use env_logger::Env;

mod app;

fn main() -> Result<()> {
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();
    app::run()
}
