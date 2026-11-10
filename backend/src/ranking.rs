use serde::{Deserialize, Serialize};
use worker::*;

use crate::db::{self, RankingRow};

/// 1 ページの人数（Figma の「前の7人 / 次の7人」）
const PAGE_SIZE: i64 = 7;

#[derive(Deserialize)]
struct Query {
    /// "oni" | "runner"
    role: String,
    /// 自分の記録 ID。指定されると自分がページ中央に来るようにする
    me: Option<i64>,
    /// ページ送り時に明示するオフセット
    offset: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RankingResponse {
    total: i64,
    offset: i64,
    limit: i64,
    my_rank: Option<i64>,
    entries: Vec<RankingRow>,
}

pub async fn handle(req: Request, env: &Env) -> Result<Response> {
    let q: Query = req.query()?;
    let is_oni = match q.role.as_str() {
        "oni" => true,
        "runner" => false,
        _ => return Response::error("role must be oni or runner", 400),
    };
    let db = env.d1("DB")?;
    let total = db::count(&db, is_oni).await?;

    let mut my_rank = None;
    if let Some(me) = q.me {
        if let Some(row) = db::find(&db, me).await? {
            if (row.is_oni == 1) == is_oni {
                my_rank = Some(db::rank_of(&db, &row).await?);
            }
        }
    }

    let last_page_start = (total - PAGE_SIZE).max(0);
    let offset = match (q.offset, my_rank) {
        (Some(offset), _) => offset.clamp(0, (total - 1).max(0)),
        // 自分の上に 3 人・下に 3 人が並ぶ位置から始める。端では範囲内に収める
        (None, Some(rank)) => (rank - 1 - PAGE_SIZE / 2).clamp(0, last_page_start),
        (None, None) => 0,
    };
    let entries = db::page(&db, is_oni, offset, PAGE_SIZE).await?;

    Response::from_json(&RankingResponse {
        total,
        offset,
        limit: PAGE_SIZE,
        my_rank,
        entries,
    })
}
