import datetime
from typing import List, Dict
from pydantic import BaseModel
from .task_agent import TaskTemplate

def schedule_tasks(
    tasks: List[TaskTemplate], 
    start_date_str: str, 
    availability: Dict[str, float]
) -> List[dict]:
    """
    Schedule tasks onto specific calendar dates starting from start_date_str,
    respecting daily hours availability (converted to minutes).
    
    availability: Dict mapping weekday name (e.g. 'Monday') to hours (float)
    """
    try:
        current_date = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()
    except ValueError:
        current_date = datetime.date.today()
        
    scheduled_tasks = []
    
    # Sort tasks by week_number, then day_number, then task index
    # We want to schedule them in the order they are designed to be completed
    sorted_tasks = sorted(tasks, key=lambda t: (t.week_number, t.day_number))
    
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    
    current_day_minutes_used = 0
    
    for task in sorted_tasks:
        # Check current day availability
        day_name = current_date.strftime("%A")
        daily_hours = availability.get(day_name, 2.0) # Default to 2 hours if not found
        daily_minutes = int(daily_hours * 60)
        
        # If user is not available at all on this day, roll over to the next day
        while daily_minutes <= 0:
            current_date += datetime.timedelta(days=1)
            day_name = current_date.strftime("%A")
            daily_hours = availability.get(day_name, 2.0)
            daily_minutes = int(daily_hours * 60)
            
        task_duration = task.estimated_minutes
        
        # If adding this task exceeds the daily minutes, and we've already scheduled something today,
        # roll over to the next day (unless the task itself is larger than the entire day's budget,
        # in which case we schedule it today anyway to avoid infinite loop)
        if current_day_minutes_used > 0 and (current_day_minutes_used + task_duration > daily_minutes):
            current_date += datetime.timedelta(days=1)
            current_day_minutes_used = 0
            
            # Recalculate daily minutes for new day
            day_name = current_date.strftime("%A")
            daily_hours = availability.get(day_name, 2.0)
            daily_minutes = int(daily_hours * 60)
            
            while daily_minutes <= 0:
                current_date += datetime.timedelta(days=1)
                day_name = current_date.strftime("%A")
                daily_hours = availability.get(day_name, 2.0)
                daily_minutes = int(daily_hours * 60)

        # Allocate start and end times based on minutes used
        start_hour = 9 # Start tasks at 9 AM by default
        start_total_minutes = start_hour * 60 + current_day_minutes_used
        start_h = start_total_minutes // 60
        start_m = start_total_minutes % 60
        
        end_total_minutes = start_total_minutes + task_duration
        end_h = end_total_minutes // 60
        end_m = end_total_minutes % 60
        
        start_time_str = f"{start_h:02d}:{start_m:02d}"
        end_time_str = f"{end_h:02d}:{end_m:02d}"
        
        scheduled_tasks.append({
            "title": task.title,
            "description": task.description,
            "estimated_minutes": task.estimated_minutes,
            "difficulty": task.difficulty,
            "priority": task.priority,
            "resource_type": task.resource_type,
            "suggested_resource": task.suggested_resource,
            "scheduled_date": current_date.strftime("%Y-%m-%d"),
            "start_time": start_time_str,
            "end_time": end_time_str,
            "status": "pending",
            "week_number": task.week_number
        })
        
        current_day_minutes_used += task_duration
        
    return scheduled_tasks
