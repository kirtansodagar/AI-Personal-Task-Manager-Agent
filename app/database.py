import os
import json
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///f:/ruflo/planner/planner.db")

engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=True)
    salt = Column(String, nullable=True)
    google_id = Column(String, unique=True, index=True, nullable=True)
    avatar_url = Column(Text, nullable=True)
    provider = Column(String, default="local", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    goals = relationship("Goal", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("Setting", back_populates="user", cascade="all, delete-orphan")
    weekly_reports = relationship("WeeklyReport", back_populates="user", cascade="all, delete-orphan")

class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")

class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)  # Nullable for existing migrations
    goal_text = Column(String, nullable=False)
    duration_days = Column(Integer, nullable=False)
    hours_per_day = Column(Float, nullable=False)
    deadline = Column(String, nullable=False)
    difficulty = Column(String, nullable=False)
    priority = Column(String, nullable=False)
    skills_needed = Column(Text, nullable=True)  # JSON list
    constraints = Column(Text, nullable=True)    # JSON list
    description = Column(Text, nullable=True)
    status = Column(String, default="active")    # active, paused, completed, archived
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="goals")
    milestones = relationship("Milestone", back_populates="goal", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="goal", cascade="all, delete-orphan")

class Milestone(Base):
    __tablename__ = "milestones"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    objective = Column(String, nullable=False)
    week_number = Column(Integer, nullable=False)
    estimated_hours = Column(Float, nullable=False)
    dependencies = Column(Text, nullable=True)         # JSON list
    learning_resources = Column(Text, nullable=True)   # JSON list

    goal = relationship("Goal", back_populates="milestones")
    tasks = relationship("Task", back_populates="milestone", cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    milestone_id = Column(Integer, ForeignKey("milestones.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    estimated_minutes = Column(Integer, nullable=False)
    difficulty = Column(String, nullable=False)       # Easy, Medium, Hard
    priority = Column(String, nullable=False)         # Low, Medium, High
    resource_type = Column(String, nullable=True)     # Video, Article, Coding Practice, Revision
    suggested_resource = Column(Text, nullable=True)
    scheduled_date = Column(String, nullable=False)   # YYYY-MM-DD
    start_time = Column(String, nullable=True)        # HH:MM
    end_time = Column(String, nullable=True)          # HH:MM
    status = Column(String, default="pending")        # pending, completed, missed, skipped
    completed_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    goal = relationship("Goal", back_populates="tasks")
    milestone = relationship("Milestone", back_populates="tasks")
    task_notes = relationship("TaskNote", back_populates="task", cascade="all, delete-orphan")

class TaskNote(Base):
    """Timestamped journal entries attached to a specific task."""
    __tablename__ = "task_notes"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("Task", back_populates="task_notes")

class WeeklyReport(Base):
    """Cached weekly AI review reports."""
    __tablename__ = "weekly_reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    week_start = Column(String, nullable=False)   # YYYY-MM-DD of Monday
    report_markdown = Column(Text, nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="weekly_reports")

class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)  # Scoped per user, or NULL for global default
    key = Column(String, nullable=False, index=True)
    value = Column(Text, nullable=False)  # JSON-serialized configuration

    user = relationship("User", back_populates="settings")

def init_db():
    Base.metadata.create_all(bind=engine)
    
    # Pre-populate default availability in settings if not present
    db = SessionLocal()
    try:
        # Check global setting (user_id is None)
        availability_setting = db.query(Setting).filter(Setting.user_id.is_(None), Setting.key == "availability").first()
        if not availability_setting:
            default_availability = {
                "Monday": 2.0,
                "Tuesday": 2.0,
                "Wednesday": 2.0,
                "Thursday": 2.0,
                "Friday": 2.0,
                "Saturday": 4.0,
                "Sunday": 4.0
            }
            setting = Setting(user_id=None, key="availability", value=json.dumps(default_availability))
            db.add(setting)
            db.commit()
    finally:
        db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
