CREATE TABLE players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  play_time_ms INTEGER NOT NULL,
  is_oni INTEGER NOT NULL CHECK (is_oni IN (0, 1))
);

-- ランキング（is_oni ごとにプレイ時間の短い順）と順位計算を index だけで済ませるため
CREATE INDEX idx_players_ranking ON players (is_oni, play_time_ms, id);
