"""
V4 Database Migration Script
Applies V4 schema updates (Google OAuth columns, nullable passwords) to planner.db safely.
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

    print("Running V4 DB migration...")

    # Disable foreign keys temporarily for restructure
    c.execute("PRAGMA foreign_keys = OFF")

    # Check if the users table already has 'google_id' column
    user_cols = [row[1] for row in c.execute("PRAGMA table_info(users)")]

    if "google_id" not in user_cols:
        print("Restructuring users table to support OAuth fields and nullable passwords...")
        
        # 1. Rename existing users to old
        c.execute("ALTER TABLE users RENAME TO users_old")
        
        # 2. Create new users table
        c.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            hashed_password TEXT,
            salt TEXT,
            google_id TEXT UNIQUE,
            avatar_url TEXT,
            provider TEXT NOT NULL DEFAULT 'local',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """)
        
        # 3. Copy existing users from old to new
        c.execute("""
        INSERT INTO users (id, username, hashed_password, salt, created_at, provider)
        SELECT id, username, hashed_password, salt, created_at, 'local' FROM users_old
        """)
        
        # 4. Drop old table
        c.execute("DROP TABLE users_old")
        print("OK: Restructured users table successfully.")
    else:
        print("users table already restructured.")

    # Re-enable foreign keys
    c.execute("PRAGMA foreign_keys = ON")
    conn.commit()
    conn.close()
    print("V4 Migration complete!")

if __name__ == "__main__":
    migrate()
