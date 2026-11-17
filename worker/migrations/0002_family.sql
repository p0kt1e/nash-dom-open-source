-- Additive migration: retain existing inventory, pets, and stock_movements.
ALTER TABLE inventory ADD COLUMN threshold REAL NOT NULL DEFAULT 0 CHECK(threshold >= 0);
ALTER TABLE inventory ADD COLUMN note TEXT NOT NULL DEFAULT '';
UPDATE inventory SET threshold = min_quantity;
CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS movements (id INTEGER PRIMARY KEY, inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE, delta REAL NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, note TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, category TEXT NOT NULL, amount REAL NOT NULL CHECK(amount > 0), description TEXT NOT NULL, spent_on TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS budgets (category TEXT PRIMARY KEY, monthly_limit REAL NOT NULL CHECK(monthly_limit >= 0));
CREATE TABLE IF NOT EXISTS care (id INTEGER PRIMARY KEY, title TEXT NOT NULL, pet_id INTEGER REFERENCES pets(id) ON DELETE SET NULL, interval_days INTEGER NOT NULL CHECK(interval_days >= 1), last_done TEXT, enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS menu (day TEXT NOT NULL, meal TEXT NOT NULL, title TEXT NOT NULL, PRIMARY KEY(day,meal));
CREATE INDEX IF NOT EXISTS idx_movements_inventory ON movements(inventory_id);
