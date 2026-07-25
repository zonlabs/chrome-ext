-- 001_init.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'premium')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
