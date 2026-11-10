//! WebSocket で送受信する JSON メッセージの定義。
//! フロントエンドの `frontend/src/lib/protocol.ts` と形を揃えること。

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    Oni,
    Runner,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Dir {
    Up,
    Down,
    Left,
    Right,
}

impl Dir {
    pub fn delta(self) -> (i32, i32) {
        match self {
            Dir::Up => (0, -1),
            Dir::Down => (0, 1),
            Dir::Left => (-1, 0),
            Dir::Right => (1, 0),
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EndReason {
    /// 鬼が逃げをつかまえた
    Caught,
    /// 180 秒経過
    TimeUp,
    /// 相手が切断した（記録は残さない）
    OpponentLeft,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMsg {
    Move { dir: Dir },
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ServerMsg<'a> {
    /// ルームに入り、相手を待っている
    Matching {
        room_id: u16,
        occupied_rooms: usize,
        total_rooms: usize,
    },
    /// 空きルームがない
    Full,
    /// 2 人そろった。カウントダウン開始
    Ready {
        room_id: u16,
        role: Role,
        opponent: &'a str,
        countdown_ms: u32,
        duration_ms: u32,
        maze: &'a [&'a str],
        you: [i32; 2],
        opp: [i32; 2],
    },
    /// カウントダウン終了。ここからプレイ時間を計測する
    Start { duration_ms: u32 },
    /// 30Hz で送る盤面の状態
    State {
        remaining_ms: u32,
        you: [i32; 2],
        opp: [i32; 2],
    },
    End {
        reason: EndReason,
        elapsed_ms: u32,
    },
    /// D1 への記録が完了した（ランキングで「あなたはここ！」を出すための ID）
    Saved { record_id: i64 },
    /// /rooms 監視画面向けのルーム一覧
    Rooms {
        rooms: &'a [RoomView],
        playing: usize,
        waiting: usize,
        total: usize,
    },
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoomView {
    pub id: u16,
    pub status: RoomStatus,
    pub players: Vec<String>,
    /// プレイ中のみ。残り時間（ミリ秒）
    pub remaining_ms: Option<u32>,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RoomStatus {
    Empty,
    Waiting,
    Playing,
}

pub fn to_json(msg: &ServerMsg) -> String {
    serde_json::to_string(msg).unwrap_or_default()
}
