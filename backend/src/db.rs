use serde::{Deserialize, Serialize};
use worker::{D1Database, Result};

pub async fn insert_player(db: &D1Database, name: &str, play_time_ms: u32, is_oni: bool) -> Result<i64> {
    let id = db
        .prepare("INSERT INTO players (name, play_time_ms, is_oni) VALUES (?1, ?2, ?3) RETURNING id")
        .bind(&[name.into(), (play_time_ms as f64).into(), (is_oni as i32 as f64).into()])?
        .first::<i64>(Some("id"))
        .await?;
    id.ok_or_else(|| worker::Error::RustError("insert returned no id".into()))
}

#[derive(Deserialize)]
pub struct PlayerRow {
    pub id: i64,
    pub play_time_ms: i64,
    pub is_oni: i64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankingRow {
    pub id: i64,
    pub name: String,
    #[serde(alias = "play_time_ms")]
    pub play_time_ms: i64,
}

pub async fn count(db: &D1Database, is_oni: bool) -> Result<i64> {
    Ok(db
        .prepare("SELECT COUNT(*) AS c FROM players WHERE is_oni = ?1")
        .bind(&[(is_oni as i32 as f64).into()])?
        .first::<i64>(Some("c"))
        .await?
        .unwrap_or(0))
}

pub async fn find(db: &D1Database, id: i64) -> Result<Option<PlayerRow>> {
    db.prepare("SELECT id, play_time_ms, is_oni FROM players WHERE id = ?1")
        .bind(&[(id as f64).into()])?
        .first::<PlayerRow>(None)
        .await
}

/// 並び順は (play_time_ms, id) の昇順。同タイムは先に記録した人が上
pub async fn rank_of(db: &D1Database, row: &PlayerRow) -> Result<i64> {
    let before = db
        .prepare(
            "SELECT COUNT(*) AS c FROM players WHERE is_oni = ?1 \
             AND (play_time_ms < ?2 OR (play_time_ms = ?2 AND id < ?3))",
        )
        .bind(&[(row.is_oni as f64).into(), (row.play_time_ms as f64).into(), (row.id as f64).into()])?
        .first::<i64>(Some("c"))
        .await?
        .unwrap_or(0);
    Ok(before + 1)
}

pub async fn page(db: &D1Database, is_oni: bool, offset: i64, limit: i64) -> Result<Vec<RankingRow>> {
    db.prepare(
        "SELECT id, name, play_time_ms FROM players WHERE is_oni = ?1 \
         ORDER BY play_time_ms ASC, id ASC LIMIT ?2 OFFSET ?3",
    )
    .bind(&[(is_oni as i32 as f64).into(), (limit as f64).into(), (offset as f64).into()])?
    .all()
    .await?
    .results::<RankingRow>()
}
