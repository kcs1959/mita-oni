//! ルーム 1 つ分のゲームロジック（盤面・移動・当たり判定・時間切れ）。
//! WebSocket や D1 には触れず、Hub から呼ばれる純粋な状態更新だけを持つ。

use std::collections::VecDeque;

use crate::protocol::{Dir, EndReason, Role, RoomStatus, RoomView};

pub const ROOM_COUNT: usize = 50;
/// ゲームループの 1 ループの長さ（約 30Hz）
pub const TICK_MS: f64 = 33.0;
pub const COUNTDOWN_MS: u32 = 3_000;
pub const GAME_DURATION_MS: u32 = 180_000;
/// 連打の先行入力として溜めておける最大数。これを超えた入力は捨てる
const MAX_QUEUED_INPUTS: usize = 3;

/// '#' = 壁, '.' = 通路。Figma「05 · 盤面デザイン」の 13x17 マス
pub const MAZE: [&str; 17] = [
    "#############",
    "#...#.......#",
    "#.#.#.#####.#",
    "#.#...#...#.#",
    "#.###.#.#.#.#",
    "#...#...#...#",
    "###.#.###.#.#",
    "#...#.....#.#",
    "#.###.#.###.#",
    "#.#...#.....#",
    "#.#.#####.#.#",
    "#...#.....#.#",
    "#.###.###.#.#",
    "#.....#.....#",
    "#.###.#.###.#",
    "#...#.......#",
    "#############",
];

const RUNNER_SPAWN: (i32, i32) = (1, 1);
const ONI_SPAWN: (i32, i32) = (11, 15);

fn is_road(x: i32, y: i32) -> bool {
    if x < 0 || y < 0 {
        return false;
    }
    MAZE.get(y as usize)
        .and_then(|row| row.as_bytes().get(x as usize))
        .is_some_and(|c| *c == b'.')
}

pub struct Player {
    pub conn: u32,
    pub name: String,
    pub role: Role,
    pub pos: (i32, i32),
    /// 直前の tick での位置。すれ違い（位置の入れ替わり）判定に使う
    pub prev: (i32, i32),
    inputs: VecDeque<Dir>,
}

impl Player {
    fn new(conn: u32, name: String) -> Self {
        Self {
            conn,
            name,
            role: Role::Runner,
            pos: RUNNER_SPAWN,
            prev: RUNNER_SPAWN,
            inputs: VecDeque::new(),
        }
    }
}

#[derive(Clone, Copy, PartialEq)]
pub enum Phase {
    Empty,
    Waiting,
    /// 2 人そろってカウントダウン中。`until` に開始する
    Ready { until: f64 },
    Playing { started: f64 },
}

pub struct Room {
    pub id: u16,
    pub phase: Phase,
    pub players: Vec<Player>,
}

/// 決着したゲームの記録。Hub が D1 への保存とクライアント通知に使う
pub struct Outcome {
    pub reason: EndReason,
    pub elapsed_ms: u32,
    /// (接続ID, 名前, is鬼)
    pub players: Vec<(u32, String, bool)>,
}

pub enum TickEvent {
    None,
    Started,
    Running,
    Finished(Outcome),
}

impl Room {
    pub fn new(id: u16) -> Self {
        Self {
            id,
            phase: Phase::Empty,
            players: Vec::new(),
        }
    }

    pub fn is_active(&self) -> bool {
        matches!(self.phase, Phase::Ready { .. } | Phase::Playing { .. })
    }

    pub fn reset(&mut self) {
        self.phase = Phase::Empty;
        self.players.clear();
    }

    /// プレイヤーを入れる。2 人目なら役割を決めてカウントダウンへ進み true を返す
    pub fn join(&mut self, conn: u32, name: String, now: f64) -> bool {
        self.players.push(Player::new(conn, name));
        if self.players.len() < 2 {
            self.phase = Phase::Waiting;
            return false;
        }
        let oni_index = if worker::js_sys::Math::random() < 0.5 { 0 } else { 1 };
        for (i, p) in self.players.iter_mut().enumerate() {
            let (role, spawn) = if i == oni_index {
                (Role::Oni, ONI_SPAWN)
            } else {
                (Role::Runner, RUNNER_SPAWN)
            };
            p.role = role;
            p.pos = spawn;
            p.prev = spawn;
            p.inputs.clear();
        }
        self.phase = Phase::Ready {
            until: now + COUNTDOWN_MS as f64,
        };
        true
    }

    pub fn push_input(&mut self, conn: u32, dir: Dir) {
        if !matches!(self.phase, Phase::Playing { .. }) {
            return;
        }
        if let Some(p) = self.players.iter_mut().find(|p| p.conn == conn) {
            if p.inputs.len() < MAX_QUEUED_INPUTS {
                p.inputs.push_back(dir);
            }
        }
    }

    pub fn remaining_ms(&self, now: f64) -> Option<u32> {
        match self.phase {
            Phase::Playing { started } => {
                Some(GAME_DURATION_MS.saturating_sub((now - started).max(0.0) as u32))
            }
            Phase::Ready { .. } => Some(GAME_DURATION_MS),
            _ => None,
        }
    }

    pub fn tick(&mut self, now: f64) -> TickEvent {
        match self.phase {
            Phase::Ready { until } if now >= until => {
                self.phase = Phase::Playing { started: now };
                TickEvent::Started
            }
            Phase::Playing { started } => {
                // 1 tick につき 1 マスだけ動かす。連打は先行入力として次の tick 以降に回る
                for p in self.players.iter_mut() {
                    p.prev = p.pos;
                    if let Some(dir) = p.inputs.pop_front() {
                        let (dx, dy) = dir.delta();
                        let next = (p.pos.0 + dx, p.pos.1 + dy);
                        if is_road(next.0, next.1) {
                            p.pos = next;
                        }
                    }
                }
                let elapsed = (now - started).max(0.0) as u32;
                if self.is_caught() {
                    TickEvent::Finished(self.finish(EndReason::Caught, elapsed.min(GAME_DURATION_MS)))
                } else if elapsed >= GAME_DURATION_MS {
                    TickEvent::Finished(self.finish(EndReason::TimeUp, GAME_DURATION_MS))
                } else {
                    TickEvent::Running
                }
            }
            _ => TickEvent::None,
        }
    }

    /// 同じマスにいる、または同じ tick 内ですれ違った（位置が入れ替わった）らタッチ成立
    fn is_caught(&self) -> bool {
        let [a, b] = &self.players[..] else {
            return false;
        };
        a.pos == b.pos || (a.pos == b.prev && b.pos == a.prev)
    }

    fn finish(&mut self, reason: EndReason, elapsed_ms: u32) -> Outcome {
        let players = self
            .players
            .iter()
            .map(|p| (p.conn, p.name.clone(), p.role == Role::Oni))
            .collect();
        self.reset();
        Outcome {
            reason,
            elapsed_ms,
            players,
        }
    }

    pub fn view(&self, now: f64) -> RoomView {
        let status = match self.phase {
            Phase::Empty => RoomStatus::Empty,
            Phase::Waiting => RoomStatus::Waiting,
            _ => RoomStatus::Playing,
        };
        RoomView {
            id: self.id,
            status,
            players: self.players.iter().map(|p| p.name.clone()).collect(),
            remaining_ms: self.remaining_ms(now),
        }
    }
}
