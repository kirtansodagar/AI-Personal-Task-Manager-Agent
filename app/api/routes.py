import os
import json
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db, Goal, Milestone, Task, Setting, TaskNote, WeeklyReport, User, UserSession
from app.api.auth import hash_password, verify_password, generate_session_token
from app.agents.goal_agent import analyze_goal, GoalAnalysis
from app.agents.planner_agent import generate_plan
from app.agents.task_agent import generate_tasks_for_milestone
from app.agents.scheduler_agent import schedule_tasks
from app.agents.replanner_agent import replan_remaining_tasks
from app.agents.chat_agent import run_chat
from app.agents.review_agent import generate_weekly_review

router = APIRouter()
security = HTTPBearer(auto_error=False)

# --- Schemas ---
from pydantic import BaseModel

class UserRegister(BaseModel):
    username: str
    password: str

class GoogleAuthRequest(BaseModel):
    credential: str

class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

class AvailabilityUpdate(BaseModel):
    availability: Dict[str, float]
    gemini_api_key: Optional[str] = None
    start_date: Optional[str] = None

class GoalCreate(BaseModel):
    goal_text: str

class TaskUpdate(BaseModel):
    status: Optional[str] = None  # pending, completed, missed, skipped
    notes: Optional[str] = None

class ChatMessage(BaseModel):
    role: str   # 'user' or 'assistant'
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class TaskNoteCreate(BaseModel):
    content: str

class GoalStatusUpdate(BaseModel):
    status: str  # active, paused, completed, archived

# --- Helpers ---
def get_setting_val(db: Session, key: str, user_id: Optional[int] = None, default=None):
    if user_id is not None:
        s = db.query(Setting).filter(Setting.key == key, Setting.user_id == user_id).first()
        if s:
            try:
                return json.loads(s.value)
            except:
                return s.value
    s = db.query(Setting).filter(Setting.key == key, Setting.user_id.is_(None)).first()
    if s:
        try:
            return json.loads(s.value)
        except:
            return s.value
    return default

def set_setting_val(db: Session, key: str, value, user_id: Optional[int] = None):
    if user_id is not None:
        s = db.query(Setting).filter(Setting.key == key, Setting.user_id == user_id).first()
    else:
        s = db.query(Setting).filter(Setting.key == key, Setting.user_id.is_(None)).first()
    val_str = json.dumps(value)
    if s:
        s.value = val_str
    else:
        s = Setting(key=key, value=val_str, user_id=user_id)
        db.add(s)
    db.commit()

# --- Auth Dependency ---
def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security), 
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> User:
    resolved_token = None
    if credentials:
        resolved_token = credentials.credentials
    elif token:
        resolved_token = token

    if not resolved_token:
        raise HTTPException(status_code=401, detail="Authentication token missing.")

    session = db.query(UserSession).filter(UserSession.token == resolved_token).first()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session token.")
    if session.expires_at < datetime.datetime.utcnow():
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=401, detail="Session expired.")
    return session.user

# --- Auth Endpoints ---

@router.post("/auth/register")
def register_user(data: UserRegister, db: Session = Depends(get_db)):
    # Check if username exists
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username is already taken.")
    
    hashed_pwd, salt = hash_password(data.password)
    user = User(username=data.username, hashed_password=hashed_pwd, salt=salt)
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Generate session
    token = generate_session_token()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=7)
    session = UserSession(token=token, user_id=user.id, expires_at=expires_at)
    db.add(session)
    db.commit()
    
    return {
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username
        }
    }

@router.post("/auth/login")
def login_user(data: UserRegister, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password, user.salt):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
        
    token = generate_session_token()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=7)
    session = UserSession(token=token, user_id=user.id, expires_at=expires_at)
    db.add(session)
    db.commit()
    
    return {
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username
        }
    }

@router.post("/auth/logout")
def logout_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security), db: Session = Depends(get_db)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication token missing.")
    token = credentials.credentials
    session = db.query(UserSession).filter(UserSession.token == token).first()
    if session:
        db.delete(session)
        db.commit()
    return {"message": "Logged out successfully."}

@router.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "avatar_url": current_user.avatar_url,
        "provider": current_user.provider
    }

@router.get("/auth/config")
def get_auth_config():
    return {
        "google_client_id": os.environ.get("GOOGLE_CLIENT_ID", "")
    }

@router.post("/auth/google")
def google_auth(data: GoogleAuthRequest, db: Session = Depends(get_db)):
    import urllib.request
    import json
    
    token = data.credential
    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={token}"
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            info = json.loads(response.read().decode())
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid Google authentication credential.")
        
    if "error" in info or "sub" not in info:
        raise HTTPException(status_code=400, detail="Failed to verify Google identity.")
        
    google_id = info["sub"]
    email = info.get("email")
    name = info.get("name", f"GoogleUser_{google_id[:8]}")
    picture = info.get("picture")
    
    # 1. Match by google_id
    user = db.query(User).filter(User.google_id == google_id).first()
    
    # 2. Match by email to link local account
    if not user and email:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.google_id = google_id
            user.avatar_url = picture or user.avatar_url
            db.commit()
            
    # 3. Create new user if not found
    if not user:
        username = name
        base_username = username
        counter = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}_{counter}"
            counter += 1
            
        user = User(
            username=username,
            email=email,
            google_id=google_id,
            avatar_url=picture,
            provider="google"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
    # Generate session
    session_token = generate_session_token()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=7)
    session = UserSession(token=session_token, user_id=user.id, expires_at=expires_at)
    db.add(session)
    db.commit()
    
    return {
        "token": session_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "avatar_url": user.avatar_url,
            "provider": user.provider
        }
    }

@router.get("/auth/profile")
def get_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "avatar_url": current_user.avatar_url,
        "provider": current_user.provider,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None
    }

@router.patch("/auth/profile")
def update_profile(data: ProfileUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.username is not None:
        username_trimmed = data.username.strip()
        if not username_trimmed:
            raise HTTPException(status_code=400, detail="Username cannot be empty.")
        
        # Check if username is taken by someone else
        existing = db.query(User).filter(User.username == username_trimmed, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username is already taken.")
        current_user.username = username_trimmed

    if data.email is not None:
        email_trimmed = data.email.strip()
        if email_trimmed:
            existing_email = db.query(User).filter(User.email == email_trimmed, User.id != current_user.id).first()
            if existing_email:
                raise HTTPException(status_code=400, detail="Email is already in use.")
            current_user.email = email_trimmed
        else:
            current_user.email = None

    if data.new_password is not None:
        if current_user.provider == "google" and not current_user.hashed_password:
            # Google-only user setting up password for the first time
            hashed_pwd, salt = hash_password(data.new_password)
            current_user.hashed_password = hashed_pwd
            current_user.salt = salt
        else:
            # Local user changing password, verify old password
            if not data.current_password:
                raise HTTPException(status_code=400, detail="Current password is required to change password.")
            if not verify_password(data.current_password, current_user.hashed_password, current_user.salt):
                raise HTTPException(status_code=401, detail="Incorrect current password.")
            
            hashed_pwd, salt = hash_password(data.new_password)
            current_user.hashed_password = hashed_pwd
            current_user.salt = salt

    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "avatar_url": current_user.avatar_url,
        "provider": current_user.provider
    }

@router.post("/auth/profile/reset")
def reset_profile_data(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_goal_ids = [g.id for g in db.query(Goal).filter(Goal.user_id == current_user.id).all()]
    if user_goal_ids:
        db.query(TaskNote).filter(TaskNote.task_id.in_(
            db.query(Task.id).filter(Task.goal_id.in_(user_goal_ids))
        )).delete(synchronize_session=False)
        db.query(Task).filter(Task.goal_id.in_(user_goal_ids)).delete(synchronize_session=False)
        db.query(Milestone).filter(Milestone.goal_id.in_(user_goal_ids)).delete(synchronize_session=False)
        db.query(Goal).filter(Goal.id.in_(user_goal_ids)).delete(synchronize_session=False)
    
    db.query(WeeklyReport).filter(WeeklyReport.user_id == current_user.id).delete(synchronize_session=False)
    db.commit()
    return {"message": "All workspace data reset successfully."}

@router.delete("/auth/profile")
def delete_account(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_goal_ids = [g.id for g in db.query(Goal).filter(Goal.user_id == current_user.id).all()]
    if user_goal_ids:
        db.query(TaskNote).filter(TaskNote.task_id.in_(
            db.query(Task.id).filter(Task.goal_id.in_(user_goal_ids))
        )).delete(synchronize_session=False)
        db.query(Task).filter(Task.goal_id.in_(user_goal_ids)).delete(synchronize_session=False)
        db.query(Milestone).filter(Milestone.goal_id.in_(user_goal_ids)).delete(synchronize_session=False)
        db.query(Goal).filter(Goal.id.in_(user_goal_ids)).delete(synchronize_session=False)
    
    db.query(WeeklyReport).filter(WeeklyReport.user_id == current_user.id).delete(synchronize_session=False)
    db.query(Setting).filter(Setting.user_id == current_user.id).delete(synchronize_session=False)
    db.query(UserSession).filter(UserSession.user_id == current_user.id).delete(synchronize_session=False)
    db.query(User).filter(User.id == current_user.id).delete(synchronize_session=False)
    
    db.commit()
    return {"message": "Account deleted permanently."}

# --- Endpoints ---

@router.get("/settings")
def get_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    availability = get_setting_val(db, "availability", current_user.id, {
        "Monday": 2.0, "Tuesday": 2.0, "Wednesday": 2.0,
        "Thursday": 2.0, "Friday": 2.0, "Saturday": 4.0, "Sunday": 4.0
    })
    # Fetch API key strictly from environment variables (.env)
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    start_date = get_setting_val(db, "start_date", current_user.id, datetime.date.today().strftime("%Y-%m-%d"))
    
    masked_key = ""
    if gemini_api_key and gemini_api_key != "your_gemini_api_key_here":
        masked_key = gemini_api_key[:4] + "..." + gemini_api_key[-4:] if len(gemini_api_key) > 8 else "********"
        
    return {
        "availability": availability,
        "has_api_key": bool(gemini_api_key and gemini_api_key != "your_gemini_api_key_here"),
        "masked_api_key": masked_key,
        "start_date": start_date
    }

@router.post("/settings")
def update_settings(data: AvailabilityUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    set_setting_val(db, "availability", data.availability, current_user.id)
    if data.start_date is not None:
        # Validate format
        try:
            datetime.datetime.strptime(data.start_date, "%Y-%m-%d")
            set_setting_val(db, "start_date", data.start_date, current_user.id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    return {"message": "Settings updated successfully."}

@router.get("/goals/active")
def get_active_goal(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).order_by(Goal.created_at.desc()).first()
    if not goal:
        return {"goal": None}
    
    return {
        "id": goal.id,
        "goal_text": goal.goal_text,
        "duration_days": goal.duration_days,
        "hours_per_day": goal.hours_per_day,
        "deadline": goal.deadline,
        "difficulty": goal.difficulty,
        "priority": goal.priority,
        "skills_needed": json.loads(goal.skills_needed) if goal.skills_needed else [],
        "constraints": json.loads(goal.constraints) if goal.constraints else []
    }

@router.post("/goals")
def create_goal(data: GoalCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Create goal structure, then clean up old goals/milestones/tasks.
    # In Version 1, we support one active goal at a time.
    user_goal_ids = [g.id for g in db.query(Goal).filter(Goal.user_id == current_user.id).all()]
    if user_goal_ids:
        db.query(TaskNote).filter(TaskNote.task_id.in_(
            db.query(Task.id).filter(Task.goal_id.in_(user_goal_ids))
        )).delete(synchronize_session=False)
        db.query(Task).filter(Task.goal_id.in_(user_goal_ids)).delete(synchronize_session=False)
        db.query(Milestone).filter(Milestone.goal_id.in_(user_goal_ids)).delete(synchronize_session=False)
        db.query(Goal).filter(Goal.id.in_(user_goal_ids)).delete(synchronize_session=False)
    db.commit()
    
    # Save a temporary Goal record, will be updated during generation
    goal = Goal(
        user_id=current_user.id,
        goal_text=data.goal_text,
        duration_days=30, # default placeholder
        hours_per_day=2.0, # default placeholder
        deadline=(datetime.date.today() + datetime.timedelta(days=30)).strftime("%Y-%m-%d"),
        difficulty="Intermediate",
        priority="Medium",
        skills_needed="[]",
        constraints="[]"
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    
    return {"message": "Goal initialized. Start stream to generate milestones and tasks.", "goal_id": goal.id}

@router.get("/goals/generate-stream")
def generate_goal_stream(
    goal_id: int, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
        
    # Fetch API Key strictly from environment variables (.env)
    resolved_api_key = os.environ.get("GEMINI_API_KEY")
    if not resolved_api_key or resolved_api_key == "your_gemini_api_key_here":
        raise HTTPException(status_code=400, detail="Gemini API Key is missing or invalid in your backend .env file. Please check your .env file configuration.")
        
    start_date_str = get_setting_val(db, "start_date", current_user.id, datetime.date.today().strftime("%Y-%m-%d"))
    availability = get_setting_val(db, "availability", current_user.id, {
        "Monday": 2.0, "Tuesday": 2.0, "Wednesday": 2.0,
        "Thursday": 2.0, "Friday": 2.0, "Saturday": 4.0, "Sunday": 4.0
    })

    def event_stream():
        try:
            # Step 1: Goal Analyzer
            yield f"data: {json.dumps({'step': 'goal_analysis', 'status': 'in_progress', 'message': 'Goal analysis agent extracting metadata...'})}\n\n"
            
            analysis = analyze_goal(goal.goal_text, start_date_str, resolved_api_key)
            
            # Update goal table with extracted parameters
            goal.goal_text = analysis.goal
            goal.duration_days = analysis.duration_days
            goal.hours_per_day = analysis.hours_per_day
            goal.deadline = analysis.deadline
            goal.difficulty = analysis.difficulty
            goal.priority = analysis.priority
            goal.skills_needed = json.dumps(analysis.skills_needed)
            goal.constraints = json.dumps(analysis.constraints)
            db.commit()
            
            yield f"data: {json.dumps({'step': 'goal_analysis', 'status': 'completed', 'data': analysis.dict()})}\n\n"
            
            # Step 2: Milestone Generation
            yield f"data: {json.dumps({'step': 'planning', 'status': 'in_progress', 'message': 'Planning agent mapping weekly milestones...'})}\n\n"
            
            plan = generate_plan(analysis, resolved_api_key)
            
            db_milestones = []
            for m in plan.milestones:
                db_m = Milestone(
                    goal_id=goal.id,
                    title=m.title,
                    objective=m.objective,
                    week_number=m.week_number,
                    estimated_hours=m.estimated_hours,
                    dependencies=json.dumps(m.dependencies),
                    learning_resources=json.dumps(m.learning_resources)
                )
                db.add(db_m)
                db_milestones.append(db_m)
            db.commit()
            
            yield f"data: {json.dumps({'step': 'planning', 'status': 'completed', 'data': [m.dict() for m in plan.milestones]})}\n\n"
            
            # Step 3: Task Generation & Scheduling (PARALLEL - V2)
            yield f"data: {json.dumps({'step': 'task_generation', 'status': 'in_progress', 'message': 'Task generator agent creating daily tasks in parallel...'})}\n\n"

            all_task_templates = []
            # Fetch milestones from database to get IDs
            milestones_in_db = db.query(Milestone).filter(Milestone.goal_id == goal.id).order_by(Milestone.week_number).all()

            # Build a map of week_number → db milestone
            week_to_db_m = {m.week_number: m for m in milestones_in_db}

            def generate_for_milestone(plan_m):
                """Worker function to run in thread pool."""
                db_m = week_to_db_m.get(plan_m.week_number)
                if not db_m:
                    return []
                m_tasks_output = generate_tasks_for_milestone(analysis, plan_m, resolved_api_key)
                result = []
                for task_t in m_tasks_output.tasks:
                    task_t.week_number = db_m.week_number
                    result.append((task_t, db_m.id))
                return result

            # Run all milestones concurrently
            with ThreadPoolExecutor(max_workers=min(len(plan.milestones), 4)) as executor:
                futures = {executor.submit(generate_for_milestone, pm): pm for pm in plan.milestones}
                for future in as_completed(futures):
                    try:
                        all_task_templates.extend(future.result())
                    except Exception as ex:
                        yield f"data: {json.dumps({'step': 'warning', 'message': f'Skipped one milestone due to error: {str(ex)}'})}\n\n"

            # Sort by week then day so scheduling is deterministic
            all_task_templates.sort(key=lambda x: (x[0].week_number, x[0].day_number))

            yield f"data: {json.dumps({'step': 'task_generation', 'status': 'completed', 'count': len(all_task_templates)})}\n\n"

            
            # Step 4: Scheduling
            yield f"data: {json.dumps({'step': 'scheduling', 'status': 'in_progress', 'message': 'Scheduler agent organizing calendar...'})}\n\n"
            
            # Extract just the templates
            templates_list = [item[0] for item in all_task_templates]
            scheduled_list = schedule_tasks(templates_list, start_date_str, availability)
            
            # Save tasks to database
            for idx, item in enumerate(all_task_templates):
                template, milestone_id = item
                scheduled = scheduled_list[idx]
                
                db_task = Task(
                    goal_id=goal.id,
                    milestone_id=milestone_id,
                    title=scheduled["title"],
                    description=scheduled["description"],
                    estimated_minutes=scheduled["estimated_minutes"],
                    difficulty=scheduled["difficulty"],
                    priority=scheduled["priority"],
                    resource_type=scheduled["resource_type"],
                    suggested_resource=scheduled["suggested_resource"],
                    scheduled_date=scheduled["scheduled_date"],
                    start_time=scheduled["start_time"],
                    end_time=scheduled["end_time"],
                    status="pending"
                )
                db.add(db_task)
            db.commit()
            
            yield f"data: {json.dumps({'step': 'scheduling', 'status': 'completed', 'message': 'All tasks scheduled successfully!'})}\n\n"
            
        except Exception as e:
            db.rollback()
            yield f"data: {json.dumps({'step': 'error', 'message': str(e)})}\n\n"
            
    return StreamingResponse(event_stream(), media_type="text/event-stream")

@router.get("/tasks")
def get_tasks(
    date: Optional[str] = None, 
    week: Optional[int] = None, 
    status: Optional[str] = None, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Task).join(Goal).filter(Goal.user_id == current_user.id)
    if date:
        query = query.filter(Task.scheduled_date == date)
    if week:
        # Need to join milestone to filter by week
        query = query.join(Milestone).filter(Milestone.week_number == week)
    if status:
        query = query.filter(Task.status == status)
        
    tasks = query.order_by(Task.scheduled_date, Task.start_time).all()
    
    return [
        {
            "id": t.id,
            "goal_id": t.goal_id,
            "milestone_id": t.milestone_id,
            "title": t.title,
            "description": t.description,
            "estimated_minutes": t.estimated_minutes,
            "difficulty": t.difficulty,
            "priority": t.priority,
            "resource_type": t.resource_type,
            "suggested_resource": t.suggested_resource,
            "scheduled_date": t.scheduled_date,
            "start_time": t.start_time,
            "end_time": t.end_time,
            "status": t.status,
            "notes": t.notes,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None
        }
        for t in tasks
    ]

@router.patch("/tasks/{task_id}")
def update_task(task_id: int, data: TaskUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(Task).join(Goal).filter(Task.id == task_id, Goal.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    if data.status is not None:
        task.status = data.status
        if data.status == "completed":
            task.completed_at = datetime.datetime.utcnow()
        else:
            task.completed_at = None
            
    if data.notes is not None:
        task.notes = data.notes
        
    db.commit()
    db.refresh(task)
    return {"message": "Task updated successfully", "task_status": task.status}

@router.get("/milestones")
def get_milestones(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    milestones = db.query(Milestone).join(Goal).filter(Goal.user_id == current_user.id).order_by(Milestone.week_number).all()
    
    output = []
    for m in milestones:
        tasks = db.query(Task).filter(Task.milestone_id == m.id).all()
        completed_tasks = [t for t in tasks if t.status == "completed"]
        
        output.append({
            "id": m.id,
            "title": m.title,
            "objective": m.objective,
            "week_number": m.week_number,
            "estimated_hours": m.estimated_hours,
            "dependencies": json.loads(m.dependencies) if m.dependencies else [],
            "learning_resources": json.loads(m.learning_resources) if m.learning_resources else [],
            "total_tasks": len(tasks),
            "completed_tasks": len(completed_tasks),
            "completion_rate": int(len(completed_tasks) / len(tasks) * 100) if tasks else 0
        })
        
    return output

@router.post("/replan")
def trigger_replan(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).order_by(Goal.created_at.desc()).first()
    if not goal:
        raise HTTPException(status_code=404, detail="No active goal found to replan.")
        
    # Get all tasks
    tasks = db.query(Task).filter(Task.goal_id == goal.id).all()
    if not tasks:
        raise HTTPException(status_code=400, detail="No tasks found to reschedule.")
        
    availability = get_setting_val(db, "availability", current_user.id, {
        "Monday": 2.0, "Tuesday": 2.0, "Wednesday": 2.0,
        "Thursday": 2.0, "Friday": 2.0, "Saturday": 4.0, "Sunday": 4.0
    })
    
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    
    # Structure tasks as list of dicts for the replanner
    tasks_list = []
    for t in tasks:
        # Load week_number from milestone
        milestone = db.query(Milestone).filter(Milestone.id == t.milestone_id).first()
        week_num = milestone.week_number if milestone else 1
        
        tasks_list.append({
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "estimated_minutes": t.estimated_minutes,
            "difficulty": t.difficulty,
            "priority": t.priority,
            "resource_type": t.resource_type,
            "suggested_resource": t.suggested_resource,
            "scheduled_date": t.scheduled_date,
            "start_time": t.start_time,
            "end_time": t.end_time,
            "status": t.status,
            "week_number": week_num
        })
        
    try:
        updated_tasks = replan_remaining_tasks(tasks_list, today_str, availability)
        
        # Save updates back to database
        for updated in updated_tasks:
            # We match by ID
            if "id" in updated:
                db_t = db.query(Task).filter(Task.id == updated["id"]).first()
                if db_t:
                    db_t.scheduled_date = updated["scheduled_date"]
                    db_t.start_time = updated["start_time"]
                    db_t.end_time = updated["end_time"]
                    db_t.status = updated["status"]
            else:
                # If a task didn't exist somehow, skip or create (should not happen)
                pass
                
        db.commit()
        return {"message": "Replanning complete. Remaining tasks rescheduled starting from today."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Replanning failed: {str(e)}")@router.get("/dashboard")
def get_dashboard_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).order_by(Goal.created_at.desc()).first()
    if not goal:
        return {
            "has_goal": False,
            "completion_percentage": 0,
            "streak": 0,
            "hours_studied": 0.0,
            "completed_count": 0,
            "remaining_count": 0,
            "missed_count": 0,
            "total_count": 0,
            "days_left": 0
        }
        
    tasks = db.query(Task).filter(Task.goal_id == goal.id).all()
    total_count = len(tasks)
    
    completed_tasks = [t for t in tasks if t.status == "completed"]
    missed_tasks = [t for t in tasks if t.status == "missed"]
    pending_tasks = [t for t in tasks if t.status == "pending"]
    skipped_tasks = [t for t in tasks if t.status == "skipped"]
    
    completed_count = len(completed_tasks)
    missed_count = len(missed_tasks)
    remaining_count = len(pending_tasks)
    
    completion_percentage = int(completed_count / total_count * 100) if total_count > 0 else 0
    
    # Calculate hours studied (estimated_minutes of completed tasks / 60)
    minutes_studied = sum(t.estimated_minutes for t in completed_tasks)
    hours_studied = round(minutes_studied / 60.0, 1)
    
    # Calculate days left
    try:
        deadline_date = datetime.datetime.strptime(goal.deadline, "%Y-%m-%d").date()
        today = datetime.date.today()
        days_left = max(0, (deadline_date - today).days)
    except:
        days_left = goal.duration_days
        
    # Calculate streak (consecutive days of complete tasks looking backwards)
    # We aggregate task status by date
    date_status = {}
    for t in tasks:
        d = t.scheduled_date
        if d not in date_status:
            date_status[d] = []
        date_status[d].append(t.status)
        
    # Evaluate dates backwards starting from yesterday
    streak = 0
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    
    # Let's collect all distinct dates sorted ascending
    sorted_dates = sorted(date_status.keys())
    
    # Simple streak calculation: count consecutive dates before or including today where ALL tasks were completed or skipped
    # Or at least one task was completed and none were missed.
    # Let's count consecutive days going backwards from today/yesterday.
    check_date = datetime.date.today()
    
    # If today has tasks, and they are all completed, streak includes today.
    # Otherwise, check starting from yesterday.
    today_tasks = date_status.get(today_str, [])
    if today_tasks and all(s in ("completed", "skipped") for s in today_tasks):
        streak += 1
        
    # Go backwards
    check_date -= datetime.timedelta(days=1)
    while True:
        d_str = check_date.strftime("%Y-%m-%d")
        if d_str not in date_status:
            # If there were no tasks scheduled on this day, we skip it without breaking the streak
            # e.g., weekends with 0 hours don't break the streak.
            # But let's set a limit, say if we go back beyond the earliest task, we stop.
            if sorted_dates and d_str < sorted_dates[0]:
                break
            check_date -= datetime.timedelta(days=1)
            continue
            
        day_statuses = date_status[d_str]
        # If all tasks scheduled on this day were completed, increment streak
        if all(s in ("completed", "skipped") for s in day_statuses) and len(day_statuses) > 0:
            streak += 1
            check_date -= datetime.timedelta(days=1)
        else:
            break
            
    # Weekly completion chart data
    # Group tasks by week and status
    weekly_stats = {}
    for t in tasks:
        # Load milestone week_number
        milestone = db.query(Milestone).filter(Milestone.id == t.milestone_id).first()
        w = milestone.week_number if milestone else 1
        if w not in weekly_stats:
            weekly_stats[w] = {"completed": 0, "total": 0}
        weekly_stats[w]["total"] += 1
        if t.status == "completed":
            weekly_stats[w]["completed"] += 1
            
    weekly_chart = [
        {
            "week": f"Week {w}",
            "completed": stats["completed"],
            "total": stats["total"],
            "rate": int(stats["completed"] / stats["total"] * 100) if stats["total"] > 0 else 0
        }
        for w, stats in sorted(weekly_stats.items())
    ]

    # --- Daily activity heatmap data (for V2 heatmap component) ---
    daily_activity = {}
    for t in tasks:
        if t.status == "completed" and t.scheduled_date:
            daily_activity[t.scheduled_date] = daily_activity.get(t.scheduled_date, 0) + t.estimated_minutes
 
    heatmap_data = [{"date": d, "minutes": m} for d, m in sorted(daily_activity.items())]

    # --- Burndown chart: remaining tasks over time ---
    # Ideal burndown: spread total evenly over the date range
    all_dates = sorted(set(t.scheduled_date for t in tasks if t.scheduled_date))
    burndown_data = []
    remaining = total_count
    for d in all_dates:
        day_done = sum(1 for t in tasks if t.scheduled_date == d and t.status == "completed")
        remaining -= day_done
        burndown_data.append({"date": d, "remaining": remaining})

    # Resource type distribution
    resource_dist = {}
    for t in completed_tasks:
        rt = t.resource_type or "Other"
        resource_dist[rt] = resource_dist.get(rt, 0) + 1
    resource_chart = [{"type": k, "count": v} for k, v in resource_dist.items()]

    return {
        "has_goal": True,
        "goal_title": goal.goal_text,
        "deadline": goal.deadline,
        "completion_percentage": completion_percentage,
        "streak": streak,
        "hours_studied": hours_studied,
        "completed_count": completed_count,
        "remaining_count": remaining_count,
        "missed_count": missed_count,
        "total_count": total_count,
        "days_left": days_left,
        "weekly_chart": weekly_chart,
        "heatmap_data": heatmap_data,
        "burndown_data": burndown_data,
        "resource_chart": resource_chart,
    }

# ═══════════════════════════════════════════════════════
# V2 ENDPOINTS
# ═══════════════════════════════════════════════════════

@router.get("/goals")
def list_all_goals(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return all goals with their status (V2 multi-goal support)."""
    goals = db.query(Goal).filter(Goal.user_id == current_user.id).order_by(Goal.created_at.desc()).all()
    return [
        {
            "id": g.id,
            "goal_text": g.goal_text,
            "status": g.status or "active",
            "deadline": g.deadline,
            "difficulty": g.difficulty,
            "duration_days": g.duration_days,
            "created_at": g.created_at.isoformat() if g.created_at else None,
        }
        for g in goals
    ]

@router.patch("/goals/{goal_id}/status")
def update_goal_status(goal_id: int, data: GoalStatusUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update a goal's status (active, paused, completed, archived)."""
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    valid = {"active", "paused", "completed", "archived"}
    if data.status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")
    goal.status = data.status
    db.commit()
    return {"message": f"Goal status updated to '{data.status}'."}

@router.post("/chat")
def chat_with_agent(data: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Multi-turn AI coaching chat endpoint.
    Injects live goal context into the Gemini system prompt.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        raise HTTPException(status_code=400, detail="Gemini API key not configured in .env")

    # Build context from live DB data
    goal = db.query(Goal).filter(Goal.user_id == current_user.id, Goal.status == "active").order_by(Goal.created_at.desc()).first()
    if not goal:
        goal = db.query(Goal).filter(Goal.user_id == current_user.id).order_by(Goal.created_at.desc()).first()  # Build context from live DB data
    goal = db.query(Goal).filter(Goal.status == "active").order_by(Goal.created_at.desc()).first()
    if not goal:
        goal = db.query(Goal).order_by(Goal.created_at.desc()).first()

    context = {}
    if goal:
        tasks = db.query(Task).filter(Task.goal_id == goal.id).all()
        completed = [t for t in tasks if t.status == "completed"]
        missed = [t for t in tasks if t.status == "missed"]
        today_str = datetime.date.today().strftime("%Y-%m-%d")
        today_tasks = [
            {"title": t.title, "status": t.status, "estimated_minutes": t.estimated_minutes, "difficulty": t.difficulty}
            for t in tasks if t.scheduled_date == today_str
        ]
        try:
            deadline_date = datetime.datetime.strptime(goal.deadline, "%Y-%m-%d").date()
            days_left = max(0, (deadline_date - datetime.date.today()).days)
        except:
            days_left = goal.duration_days

        # Streak (reusing dashboard logic)
        date_status = {}
        for t in tasks:
            if t.scheduled_date not in date_status:
                date_status[t.scheduled_date] = []
            date_status[t.scheduled_date].append(t.status)
        streak = 0
        check_date = datetime.date.today()
        sorted_dates = sorted(date_status.keys())
        today_statuses = date_status.get(today_str, [])
        if today_statuses and all(s in ("completed", "skipped") for s in today_statuses):
            streak += 1
        check_date -= datetime.timedelta(days=1)
        for _ in range(365):
            d_str = check_date.strftime("%Y-%m-%d")
            if sorted_dates and d_str < sorted_dates[0]:
                break
            if d_str not in date_status:
                check_date -= datetime.timedelta(days=1)
                continue
            if all(s in ("completed", "skipped") for s in date_status[d_str]):
                streak += 1
                check_date -= datetime.timedelta(days=1)
            else:
                break

        context = {
            "today": today_str,
            "goal_title": goal.goal_text,
            "deadline": goal.deadline,
            "days_left": days_left,
            "completion_percentage": int(len(completed) / len(tasks) * 100) if tasks else 0,
            "streak": streak,
            "completed_count": len(completed),
            "missed_count": len(missed),
            "total_count": len(tasks),
            "today_tasks": today_tasks,
        }

    messages_dicts = [{"role": m.role, "content": m.content} for m in data.messages]

    try:
        reply = run_chat(messages_dicts, context, api_key)
        return {"reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat agent error: {str(e)}")

@router.get("/tasks/{task_id}/notes")
def get_task_notes(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all journal notes for a specific task."""
    task = db.query(Task).join(Goal).filter(Task.id == task_id, Goal.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    notes = db.query(TaskNote).filter(TaskNote.task_id == task_id).order_by(TaskNote.created_at.asc()).all()
    return [
        {
            "id": n.id,
            "task_id": n.task_id,
            "content": n.content,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notes
    ]

@router.post("/tasks/{task_id}/notes")
def add_task_note(task_id: int, data: TaskNoteCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Add a timestamped journal note to a task."""
    task = db.query(Task).join(Goal).filter(Task.id == task_id, Goal.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    note = TaskNote(task_id=task_id, content=data.content.strip())
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "task_id": note.task_id,
        "content": note.content,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }

@router.delete("/tasks/{task_id}/notes/{note_id}")
def delete_task_note(task_id: int, note_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a task journal note."""
    note = db.query(TaskNote).join(Task).join(Goal).filter(
        TaskNote.id == note_id,
        TaskNote.task_id == task_id,
        Goal.user_id == current_user.id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    db.delete(note)
    db.commit()
    return {"message": "Note deleted."}

@router.get("/review/weekly")
def get_weekly_review(force_refresh: bool = False, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Return the current week's AI-generated review report.
    Caches generated reports; pass ?force_refresh=true to regenerate.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        raise HTTPException(status_code=400, detail="Gemini API key not configured in .env")

    # Find the Monday of the current week
    today = datetime.date.today()
    week_start = today - datetime.timedelta(days=today.weekday())
    week_start_str = week_start.strftime("%Y-%m-%d")

    # Check cache
    if not force_refresh:
        cached = db.query(WeeklyReport).filter(WeeklyReport.user_id == current_user.id, WeeklyReport.week_start == week_start_str).order_by(WeeklyReport.generated_at.desc()).first()
        if cached:
            return {"week_start": week_start_str, "report": cached.report_markdown, "cached": True}

    # Generate fresh report
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).order_by(Goal.created_at.desc()).first()
    if not goal:
        raise HTTPException(status_code=404, detail="No active goal found.")

    # Get tasks from this week
    week_end_str = (week_start + datetime.timedelta(days=6)).strftime("%Y-%m-%d")
    tasks = db.query(Task).filter(
        Task.goal_id == goal.id,
        Task.scheduled_date >= week_start_str,
        Task.scheduled_date <= week_end_str
    ).all()

    tasks_list = [
        {
            "title": t.title,
            "status": t.status,
            "estimated_minutes": t.estimated_minutes,
            "resource_type": t.resource_type,
        }
        for t in tasks
    ]

    # Get current milestone week number
    from app.agents.replanner_agent import replan_remaining_tasks
    completed_tasks = [t for t in tasks if t.status == "completed"]
    hours_logged = round(sum(t.estimated_minutes for t in completed_tasks) / 60, 1)

    # Calculate streak
    all_tasks = db.query(Task).filter(Task.goal_id == goal.id).all()
    date_status = {}
    for t in all_tasks:
        if t.scheduled_date not in date_status:
            date_status[t.scheduled_date] = []
        date_status[t.scheduled_date].append(t.status)
    streak = 0
    check_date = today
    sorted_dates = sorted(date_status.keys())
    today_str = today.strftime("%Y-%m-%d")
    if date_status.get(today_str) and all(s in ("completed", "skipped") for s in date_status[today_str]):
        streak += 1
    check_date -= datetime.timedelta(days=1)
    for _ in range(365):
        d_str = check_date.strftime("%Y-%m-%d")
        if sorted_dates and d_str < sorted_dates[0]:
            break
        if d_str not in date_status:
            check_date -= datetime.timedelta(days=1)
            continue
        if all(s in ("completed", "skipped") for s in date_status[d_str]):
            streak += 1
            check_date -= datetime.timedelta(days=1)
        else:
            break

    week_stats = {
        "week_number": (today - datetime.datetime.strptime(goal.created_at.strftime("%Y-%m-%d"), "%Y-%m-%d").date()).days // 7 + 1 if goal.created_at else 1,
        "hours_logged": hours_logged,
        "streak": streak,
    }

    try:
        report_md = generate_weekly_review(
            week_start=week_start_str,
            week_stats=week_stats,
            tasks=tasks_list,
            goal_title=goal.goal_text,
            api_key=api_key
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Review generation failed: {str(e)}")

    # Cache it
    report_obj = WeeklyReport(user_id=current_user.id, week_start=week_start_str, report_markdown=report_md)
    db.add(report_obj)
    db.commit()

    return {"week_start": week_start_str, "report": report_md, "cached": False}

