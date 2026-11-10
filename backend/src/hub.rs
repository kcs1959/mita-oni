//! 全 50 ルーム・マッチング・/rooms 監視をまとめて受け持つ Durable Object。
//!
//! Durable Object はインスタンスごとにシングルスレッドで動くので、1 インスタンスに
//! 全ルームを載せれば排他制御なしで状態を共有できる（100 人 × 30Hz 程度なら十分軽い）。

use std::{cell::RefCell, collections::HashMap, rc::Rc, time::Duration};

use futures_util::StreamExt;
use worker::*;

use crate::db;
use crate::game::{Outcome, Phase, Room, TickEvent, COUNTDOWN_MS, GAME_DURATION_MS, MAZE, ROOM_COUNT, TICK_MS};
use crate::protocol::{to_json, ClientMsg, EndReason, RoomStatus, RoomView, ServerMsg};

/// /rooms 監視画面へ定期送信する間隔（プレイ中の残り時間表示の更新用）
const MONITOR_PUSH_MS: f64 = 1_000.0;
const NAME_MAX_CHARS: usize = 12;

fn now_ms() -> f64 {
    js_sys::Date::now()
}

enum ConnKind {
    /// ルーム番号（rooms の添字）。決着後や退出後は None
    Player { room: Option<usize> },
    Monitor,
}

struct Conn {
    ws: WebSocket,
    kind: ConnKind,
}

pub struct Hub {
    env: Env,
    next_conn: u32,
    conns: HashMap<u32, Conn>,
    rooms: Vec<Room>,
    loop_running: bool,
    last_monitor_push: f64,
}

impl Hub {
    fn new(env: Env) -> Self {
        Self {
            env,
            next_conn: 1,
            conns: HashMap::new(),
            rooms: (1..=ROOM_COUNT as u16).map(Room::new).collect(),
            loop_running: false,
            last_monitor_push: 0.0,
        }
    }

    fn send(&self, conn: u32, msg: &ServerMsg) {
        if let Some(c) = self.conns.get(&conn) {
            let _ = c.ws.send_with_str(to_json(msg));
        }
    }

    fn close(&mut self, conn: u32) {
        if let Some(c) = self.conns.remove(&conn) {
            let _ = c.ws.close(Some(1000), Some("bye"));
        }
    }

    fn detach_from_room(&mut self, conn: u32) {
        if let Some(Conn {
            kind: ConnKind::Player { room },
            ..
        }) = self.conns.get_mut(&conn)
        {
            *room = None;
        }
    }

    fn register(&mut self, ws: WebSocket, kind: ConnKind) -> u32 {
        let id = self.next_conn;
        self.next_conn += 1;
        self.conns.insert(id, Conn { ws, kind });
        id
    }

    fn has_active(&self) -> bool {
        self.rooms.iter().any(Room::is_active)
    }

    /// 相手が待っているルームを優先し、なければ空室に入れる
    fn matchmake(&mut self, conn: u32, name: String) {
        let now = now_ms();
        let index = self
            .rooms
            .iter()
            .position(|r| r.phase == Phase::Waiting)
            .or_else(|| self.rooms.iter().position(|r| r.phase == Phase::Empty));
        let Some(index) = index else {
            self.send(conn, &ServerMsg::Full);
            self.close(conn);
            return;
        };
        if let Some(Conn {
            kind: ConnKind::Player { room },
            ..
        }) = self.conns.get_mut(&conn)
        {
            *room = Some(index);
        }

        let became_ready = self.rooms[index].join(conn, name, now);
        let room = &self.rooms[index];
        if became_ready {
            for (me, other) in [(0, 1), (1, 0)] {
                let (me, other) = (&room.players[me], &room.players[other]);
                self.send(
                    me.conn,
                    &ServerMsg::Ready {
                        room_id: room.id,
                        role: me.role,
                        opponent: &other.name,
                        countdown_ms: COUNTDOWN_MS,
                        duration_ms: GAME_DURATION_MS,
                        maze: &MAZE,
                        you: [me.pos.0, me.pos.1],
                        opp: [other.pos.0, other.pos.1],
                    },
                );
            }
        } else {
            let occupied = self.rooms.iter().filter(|r| r.phase != Phase::Empty).count();
            self.send(
                conn,
                &ServerMsg::Matching {
                    room_id: room.id,
                    occupied_rooms: occupied,
                    total_rooms: ROOM_COUNT,
                },
            );
        }
        self.push_monitor(now);
    }

    fn on_message(&mut self, conn: u32, text: &str) {
        let Ok(ClientMsg::Move { dir }) = serde_json::from_str::<ClientMsg>(text) else {
            return;
        };
        if let Some(Conn {
            kind: ConnKind::Player { room: Some(index) },
            ..
        }) = self.conns.get(&conn)
        {
            let index = *index;
            self.rooms[index].push_input(conn, dir);
        }
    }

    fn on_disconnect(&mut self, conn: u32) {
        let Some(c) = self.conns.remove(&conn) else {
            return;
        };
        let ConnKind::Player { room: Some(index) } = c.kind else {
            return;
        };
        let now = now_ms();
        let room = &mut self.rooms[index];
        // 対戦中に抜けられたら残った側にだけ通知して終了。記録は残さない
        let elapsed_ms = GAME_DURATION_MS - room.remaining_ms(now).unwrap_or(GAME_DURATION_MS);
        let others: Vec<u32> = room.players.iter().map(|p| p.conn).filter(|c| *c != conn).collect();
        room.reset();
        for other in others {
            self.send(
                other,
                &ServerMsg::End {
                    reason: EndReason::OpponentLeft,
                    elapsed_ms,
                },
            );
            self.close(other);
        }
        self.push_monitor(now);
    }

    /// ゲームループ 1 回分。決着したゲームを返す（D1 保存は呼び出し側で非同期に行う）
    fn tick(&mut self, now: f64) -> Vec<Outcome> {
        let mut outcomes = Vec::new();
        let mut changed = false;
        for index in 0..self.rooms.len() {
            match self.rooms[index].tick(now) {
                TickEvent::None => {}
                TickEvent::Started => {
                    changed = true;
                    for p in &self.rooms[index].players {
                        self.send(
                            p.conn,
                            &ServerMsg::Start {
                                duration_ms: GAME_DURATION_MS,
                            },
                        );
                    }
                }
                TickEvent::Running => {
                    let room = &self.rooms[index];
                    let remaining_ms = room.remaining_ms(now).unwrap_or(0);
                    if let [a, b] = &room.players[..] {
                        for (me, other) in [(a, b), (b, a)] {
                            self.send(
                                me.conn,
                                &ServerMsg::State {
                                    remaining_ms,
                                    you: [me.pos.0, me.pos.1],
                                    opp: [other.pos.0, other.pos.1],
                                },
                            );
                        }
                    }
                }
                TickEvent::Finished(outcome) => {
                    changed = true;
                    for (conn, _, _) in &outcome.players {
                        self.send(
                            *conn,
                            &ServerMsg::End {
                                reason: outcome.reason,
                                elapsed_ms: outcome.elapsed_ms,
                            },
                        );
                        self.detach_from_room(*conn);
                    }
                    outcomes.push(outcome);
                }
            }
        }
        if changed || now - self.last_monitor_push >= MONITOR_PUSH_MS {
            self.push_monitor(now);
        }
        outcomes
    }

    fn push_monitor(&mut self, now: f64) {
        self.last_monitor_push = now;
        let monitors: Vec<u32> = self
            .conns
            .iter()
            .filter(|(_, c)| matches!(c.kind, ConnKind::Monitor))
            .map(|(id, _)| *id)
            .collect();
        if monitors.is_empty() {
            return;
        }
        let rooms: Vec<RoomView> = self.rooms.iter().map(|r| r.view(now)).collect();
        let count = |s: RoomStatus| rooms.iter().filter(|r| r.status == s).count();
        let json = to_json(&ServerMsg::Rooms {
            rooms: &rooms,
            playing: count(RoomStatus::Playing),
            waiting: count(RoomStatus::Waiting),
            total: ROOM_COUNT,
        });
        for id in monitors {
            if let Some(c) = self.conns.get(&id) {
                let _ = c.ws.send_with_str(&json);
            }
        }
    }
}

/// 対戦中のルームがある間だけ 30Hz のループを回す。
/// 誰も対戦していないときは止めて、無駄な CPU 時間を使わないようにする。
fn ensure_loop(hub: &Rc<RefCell<Hub>>) {
    {
        let mut h = hub.borrow_mut();
        if h.loop_running || !h.has_active() {
            return;
        }
        h.loop_running = true;
    }
    let hub = hub.clone();
    wasm_bindgen_futures::spawn_local(async move {
        let mut next = now_ms();
        loop {
            let now = now_ms();
            let outcomes = hub.borrow_mut().tick(now);
            for outcome in outcomes {
                wasm_bindgen_futures::spawn_local(save_outcome(hub.clone(), outcome));
            }
            {
                let mut h = hub.borrow_mut();
                if !h.has_active() {
                    h.loop_running = false;
                    break;
                }
            }
            // setTimeout は遅れることがあるので「次に起きるべき時刻」を基準に待ち時間を決め、
            // ずれが蓄積しないようにする。大きく遅れたときは追いつこうとせず仕切り直す。
            next += TICK_MS;
            if next < now {
                next = now + TICK_MS;
            }
            Delay::from(Duration::from_millis((next - now).max(0.0) as u64)).await;
        }
    });
}

async fn save_outcome(hub: Rc<RefCell<Hub>>, outcome: Outcome) {
    let db = hub.borrow().env.d1("DB");
    for (conn, name, is_oni) in outcome.players {
        let saved = match &db {
            Ok(db) => db::insert_player(db, &name, outcome.elapsed_ms, is_oni).await,
            Err(e) => Err(Error::RustError(e.to_string())),
        };
        let mut h = hub.borrow_mut();
        match saved {
            Ok(record_id) => h.send(conn, &ServerMsg::Saved { record_id }),
            Err(e) => console_error!("failed to save record: {e}"),
        }
        h.close(conn);
    }
}

fn normalize_name(raw: &str) -> Option<String> {
    let name: String = raw.trim().chars().take(NAME_MAX_CHARS).collect();
    (!name.is_empty()).then_some(name)
}

#[durable_object]
pub struct GameServer {
    hub: Rc<RefCell<Hub>>,
}

impl DurableObject for GameServer {
    fn new(_state: State, env: Env) -> Self {
        Self {
            hub: Rc::new(RefCell::new(Hub::new(env))),
        }
    }

    async fn fetch(&self, req: Request) -> Result<Response> {
        let url = req.url()?;
        let (kind, name) = match url.path() {
            "/api/ws/play" => {
                let name = url
                    .query_pairs()
                    .find(|(k, _)| k == "name")
                    .and_then(|(_, v)| normalize_name(&v));
                let Some(name) = name else {
                    return Response::error("name is required", 400);
                };
                (ConnKind::Player { room: None }, Some(name))
            }
            "/api/ws/rooms" => (ConnKind::Monitor, None),
            _ => return Response::error("Not Found", 404),
        };

        let pair = WebSocketPair::new()?;
        let server = pair.server;
        // ハイバネーション API ではなく通常の accept を使う。接続がある間 DO はメモリに常駐するので、
        // ルーム状態をストレージへ退避・復元する処理が不要になる。
        server.accept()?;

        let conn = self.hub.borrow_mut().register(server.clone(), kind);
        match name {
            Some(name) => self.hub.borrow_mut().matchmake(conn, name),
            None => {
                let mut h = self.hub.borrow_mut();
                let now = now_ms();
                h.push_monitor(now);
            }
        }
        ensure_loop(&self.hub);

        let hub = self.hub.clone();
        wasm_bindgen_futures::spawn_local(async move {
            if let Ok(mut events) = server.events() {
                while let Some(event) = events.next().await {
                    match event {
                        Ok(WebsocketEvent::Message(msg)) => {
                            if let Some(text) = msg.text() {
                                hub.borrow_mut().on_message(conn, &text);
                            }
                        }
                        Ok(WebsocketEvent::Close(_)) | Err(_) => break,
                    }
                }
            }
            hub.borrow_mut().on_disconnect(conn);
        });

        Response::from_websocket(pair.client)
    }
}
