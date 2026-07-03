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

class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    goal_text = Column(String, nullable=False)
    duration_days = Column(Integer, nullable=False)
    hours_per_day = Column(Float, nullable=False)
    deadline = Column(String, nullable=False)
    difficulty = Column(String, nullable=False)
    priority = Column(String, nullable=False)
    skills_needed = Column(Text, nullable=True) # JSON list
    constraints = Column(Text, nullable=True) # JSON list
    created_at = Column(DateTime, default=datetime.utcnow)

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
    dependencies = Column(Text, nullable=True) # JSON list
    learning_resources = Column(Text, nullable=True) # JSON list

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
    difficulty = Column(String, nullable=False) # Easy, Medium, Hard
    priority = Column(String, nullable=False) # Low, Medium, High
    resource_type = Column(String, nullable=True) # Video, Article, Coding Practice, Revision
    suggested_resource = Column(Text, nullable=True)
    scheduled_date = Column(String, nullable=False) # YYYY-MM-DD
    start_time = Column(String, nullable=True) # HH:MM
    end_time = Column(String, nullable=True) # HH:MM
    status = Column(String, default="pending") # pending, completed, missed, skipped
    completed_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    goal = relationship("Goal", back_populates="tasks")
    milestone = relationship("Milestone", back_populates="tasks")

class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(Text, nullable=False) # JSON-serialized configuration

def init_db():
    Base.metadata.create_all(bind=engine)
    
    # Pre-populate default availability in settings if not present
    db = SessionLocal()
    try:
        availability_setting = db.query(Setting).filter(Setting.key == "availability").first()
        if not availability_setting:
            # Default availability: Mon-Fri 2 hours, Sat-Sun 4 hours
            default_availability = {
                "Monday": 2.0,
                "Tuesday": 2.0,
                "Wednesday": 2.0,
                "Thursday": 2.0,
                "Friday": 2.0,
                "Saturday": 4.0,
                "Sunday": 4.0
            }
            setting = Setting(key="availability", value=json.dumps(default_availability))
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
