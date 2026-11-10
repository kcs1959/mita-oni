use worker::*;

mod db;
mod game;
mod hub;
mod protocol;
mod ranking;

pub use hub::GameServer;

/// 全ルームを 1 つの Durable Object インスタンスで管理するため、名前は固定
const HUB_NAME: &str = "main";

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let path = req.path();
    match path.as_str() {
        "/api/ws/play" | "/api/ws/rooms" => {
            let is_upgrade = req
                .headers()
                .get("Upgrade")?
                .is_some_and(|v| v.eq_ignore_ascii_case("websocket"));
            if !is_upgrade {
                return Response::error("Expected WebSocket upgrade", 426);
            }
            let stub = env.durable_object("GAME")?.id_from_name(HUB_NAME)?.get_stub()?;
            stub.fetch_with_request(req).await
        }
        "/api/ranking" if req.method() == Method::Get => ranking::handle(req, &env).await,
        _ => Response::error("Not Found", 404),
    }
}
