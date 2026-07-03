"""
V2 Database Migration Script
Adds new columns and tables to the existing planner.db without losing data.
"""
import sqlite3

DB_PATH = "f:/ruflo/planner/planner.db"

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

# --- Goals table: add 'status' and 'description' columns ---
existing_cols = [row[1] for row in c.execute("PRAGMA table_info(goals)")]
print("Current goal columns:", existing_cols)

if "status" not in existing_cols:
    c.execute("ALTER TABLE goals ADD COLUMN status TEXT DEFAULT 'active'")
    print("OK: Added goals.status")

if "description" not in existing_cols:
    c.execute("ALTER TABLE goals ADD COLUMN description TEXT")
    print("OK: Added goals.description")

# --- Create task_notes table ---
c.execute("""
CREATE TABLE IF NOT EXISTS task_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
)
""")
print("OK: Created task_notes table (if not exists)")

# --- Create weekly_reports table ---
c.execute("""
CREATE TABLE IF NOT EXISTS weekly_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL,
    report_markdown TEXT NOT NULL,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")
print("OK: Created weekly_reports table (if not exists)")

conn.commit()
conn.close()
print("Migration complete!")

