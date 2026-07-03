"""
V3 Database Migration Script
Applies V3 schema updates (Users, Sessions, settings restructuring) to planner.db safely.
"""
import sqlite3
import os

DB_PATH = "f:/ruflo/planner/planner.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print("Database file does not exist yet. No migration needed.")
        return

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    print("Running V3 DB migration...")

    # --- Create users table ---
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    print("OK: Created users table")

    # --- Create user_sessions table ---
    c.execute("""
    CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)
    print("OK: Created user_sessions table")

    # --- Goals: add user_id column ---
    goal_cols = [row[1] for row in c.execute("PRAGMA table_info(goals)")]
    if "user_id" not in goal_cols:
        c.execute("ALTER TABLE goals ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
        print("OK: Added user_id to goals table")

    # --- Weekly Reports: add user_id column ---
    weekly_cols = [row[1] for row in c.execute("PRAGMA table_info(weekly_reports)")]
    if "user_id" not in weekly_cols:
        c.execute("ALTER TABLE weekly_reports ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
        print("OK: Added user_id to weekly_reports table")

    # --- Settings: restructure from key-primary-key to id, user_id, key, value ---
    setting_cols = [row[1] for row in c.execute("PRAGMA table_info(settings)")]
    if "id" not in setting_cols:
        print("Restructuring settings table...")
        
        # 1. Rename existing settings to old
        c.execute("ALTER TABLE settings RENAME TO settings_old")
        
        # 2. Create new settings table
        c.execute("""
        CREATE TABLE settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value TEXT NOT NULL
        )
        """)
        
        # 3. Migrate old settings as global defaults (user_id = NULL)
        c.execute("INSERT INTO settings (user_id, key, value) SELECT NULL, key, value FROM settings_old")
        
        # 4. Drop old table
        c.execute("DROP TABLE settings_old")
        print("OK: Restructured settings table successfully")

    conn.commit()
    conn.close()
    print("V3 Migration complete!")

if __name__ == "__main__":
    migrate()
