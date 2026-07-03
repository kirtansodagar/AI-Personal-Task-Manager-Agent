import os
import json
import datetime
from typing import List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db, Goal, Milestone, Task, Setting
from app.agents.goal_agent import analyze_goal, GoalAnalysis
from app.agents.planner_agent import generate_plan
from app.agents.task_agent import generate_tasks_for_milestone
from app.agents.scheduler_agent import schedule_tasks
from app.agents.replanner_agent import replan_remaining_tasks

router = APIRouter()

# --- Schemas ---
from pydantic import BaseModel

class AvailabilityUpdate(BaseModel):
    availability: Dict[str, float]
    gemini_api_key: Optional[str] = None
    start_date: Optional[str] = None

class GoalCreate(BaseModel):
    goal_text: str

class TaskUpdate(BaseModel):
    status: Optional[str] = None # pending, completed, missed, skipped
    notes: Optional[str] = None

# --- Helpers ---
def get_setting_val(db: Session, key: str, default=None):
    s = db.query(Setting).filter(Setting.key == key).first()
    if s:
        try:
            return json.loads(s.value)
        except:
            return s.value
    return default

def set_setting_val(db: Session, key: str, value):
    s = db.query(Setting).filter(Setting.key == key).first()
    val_str = json.dumps(value)
    if s:
        s.value = val_str
    else:
        s = Setting(key=key, value=val_str)
        db.add(s)
    db.commit()

# --- Endpoints ---

@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    availability = get_setting_val(db, "availability", {
        "Monday": 2.0, "Tuesday": 2.0, "Wednesday": 2.0,
        "Thursday": 2.0, "Friday": 2.0, "Saturday": 4.0, "Sunday": 4.0
    })
    # Fetch API key strictly from environment variables (.env)
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    start_date = get_setting_val(db, "start_date", datetime.date.today().strftime("%Y-%m-%d"))
    
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
def update_settings(data: AvailabilityUpdate, db: Session = Depends(get_db)):
    set_setting_val(db, "availability", data.availability)
    if data.start_date is not None:
        # Validate format
        try:
            datetime.datetime.strptime(data.start_date, "%Y-%m-%d")
            set_setting_val(db, "start_date", data.start_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    return {"message": "Settings updated successfully."}

@router.get("/goals/active")
def get_active_goal(db: Session = Depends(get_db)):
    goal = db.query(Goal).order_by(Goal.created_at.desc()).first()
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
def create_goal(data: GoalCreate, db: Session = Depends(get_db)):
    # Create goal structure, then clean up old goals/milestones/tasks.
    # In Version 1, we support one active goal at a time.
    db.query(Task).delete()
    db.query(Milestone).delete()
    db.query(Goal).delete()
    db.commit()
    
    # Save a temporary Goal record, will be updated during generation
    goal = Goal(
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
    db: Session = Depends(get_db)
):
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
        
    # Fetch API Key strictly from environment variables (.env)
    resolved_api_key = os.environ.get("GEMINI_API_KEY")
    if not resolved_api_key or resolved_api_key == "your_gemini_api_key_here":
        raise HTTPException(status_code=400, detail="Gemini API Key is missing or invalid in your backend .env file. Please check your .env file configuration.")
        
    start_date_str = get_setting_val(db, "start_date", datetime.date.today().strftime("%Y-%m-%d"))
    availability = get_setting_val(db, "availability", {
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
            
            # Step 3: Task Generation & Scheduling
            yield f"data: {json.dumps({'step': 'task_generation', 'status': 'in_progress', 'message': 'Task generator agent creating daily tasks...'})}\n\n"
            
            all_task_templates = []
            # We fetch milestones from database to get IDs
            milestones_in_db = db.query(Milestone).filter(Milestone.goal_id == goal.id).order_by(Milestone.week_number).all()
            
            for m_db in milestones_in_db:
                # Find matching milestone plan
                plan_m = next((pm for pm in plan.milestones if pm.week_number == m_db.week_number), None)
                if not plan_m:
                    continue
                
                # Call task generator for each milestone
                m_tasks_output = generate_tasks_for_milestone(analysis, plan_m, resolved_api_key)
                
                # Keep templates in list for scheduling
                for task_t in m_tasks_output.tasks:
                    # Set the week number from milestone
                    task_t.week_number = m_db.week_number
                    # Store reference to db milestone for later insert
                    all_task_templates.append((task_t, m_db.id))
                    
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
    db: Session = Depends(get_db)
):
    query = db.query(Task)
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
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
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
def get_milestones(db: Session = Depends(get_db)):
    milestones = db.query(Milestone).order_by(Milestone.week_number).all()
    
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
def trigger_replan(db: Session = Depends(get_db)):
    goal = db.query(Goal).order_by(Goal.created_at.desc()).first()
    if not goal:
        raise HTTPException(status_code=404, detail="No active goal found to replan.")
        
    # Get all tasks
    tasks = db.query(Task).filter(Task.goal_id == goal.id).all()
    if not tasks:
        raise HTTPException(status_code=400, detail="No tasks found to reschedule.")
        
    availability = get_setting_val(db, "availability", {
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
        raise HTTPException(status_code=500, detail=f"Replanning failed: {str(e)}")

@router.get("/dashboard")
def get_dashboard_stats(db: Session = Depends(get_db)):
    goal = db.query(Goal).order_by(Goal.created_at.desc()).first()
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

    return {
        "has_goal": True,
        "goal_title": goal.goal_text,
        "completion_percentage": completion_percentage,
        "streak": streak,
        "hours_studied": hours_studied,
        "completed_count": completed_count,
        "remaining_count": remaining_count,
        "missed_count": missed_count,
        "total_count": total_count,
        "days_left": days_left,
        "weekly_chart": weekly_chart
    }
