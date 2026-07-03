import datetime
from typing import List, Dict
from .scheduler_agent import schedule_tasks
from .task_agent import TaskTemplate

def replan_remaining_tasks(
    all_tasks: List[dict],
    today_str: str,
    availability: Dict[str, float]
) -> List[dict]:
    """
    Replans remaining tasks by rescheduling them starting from today.
    Tasks that are already completed or skipped remain unchanged on their original dates.
    Incomplete tasks (pending or missed) are gathered and rescheduled.
    """
    completed_tasks = []
    incomplete_tasks = []
    
    for task in all_tasks:
        if task.get("status") in ("completed", "skipped"):
            completed_tasks.append(task)
        else:
            # Prepare task template to be rescheduled
            # Reset schedule date, time, and status back to pending
            task_template = TaskTemplate(
                title=task["title"],
                description=task.get("description") or "",
                estimated_minutes=task["estimated_minutes"],
                difficulty=task["difficulty"],
                priority=task["priority"],
                resource_type=task.get("resource_type") or "Revision",
                suggested_resource=task.get("suggested_resource") or "",
                day_number=1, # Will be determined by scheduler ordering
                week_number=task["week_number"]
            )
            incomplete_tasks.append(task_template)
            
    # Reschedule incomplete tasks starting from today
    new_scheduled_incomplete = schedule_tasks(incomplete_tasks, today_str, availability)
    
    # Merge them back with their original task IDs if applicable
    # We want to preserve the task IDs for database updates. Let's align them by week and index
    # But since we return the list of updated dicts, the calling function can update the DB.
    # To make it easy, we'll return the list of rescheduled tasks with their original database IDs if they were provided
    # Let's map them:
    # First, sort the original incomplete tasks (from all_tasks) and the new scheduled tasks, then match them.
    original_incomplete_objs = [t for t in all_tasks if t.get("status") not in ("completed", "skipped")]
    # Sort both lists by week_number and title/description to match them as closely as possible
    original_incomplete_objs = sorted(original_incomplete_objs, key=lambda t: (t["week_number"], t["title"]))
    new_scheduled_incomplete = sorted(new_scheduled_incomplete, key=lambda t: (t["week_number"], t["title"]))
    
    rescheduled_tasks = []
    for i, new_task in enumerate(new_scheduled_incomplete):
        if i < len(original_incomplete_objs):
            # Maintain ID and database relationships
            orig = original_incomplete_objs[i]
            updated_task = {
                **orig,
                "scheduled_date": new_task["scheduled_date"],
                "start_time": new_task["start_time"],
                "end_time": new_task["end_time"],
                "status": "pending" # Reset status to pending for new attempts
            }
            rescheduled_tasks.append(updated_task)
        else:
            # Fallback if mismatch
            rescheduled_tasks.append(new_task)
            
    return completed_tasks + rescheduled_tasks
