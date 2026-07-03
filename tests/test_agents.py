import unittest
import datetime
from app.agents.scheduler_agent import schedule_tasks
from app.agents.replanner_agent import replan_remaining_tasks
from app.agents.task_agent import TaskTemplate

class TestAgentScheduling(unittest.TestCase):
    def setUp(self):
        self.availability = {
            "Monday": 2.0,      # 120 mins
            "Tuesday": 1.0,     # 60 mins
            "Wednesday": 0.0,   # 0 mins (rest day)
            "Thursday": 2.0,    # 120 mins
            "Friday": 1.0,      # 60 mins
            "Saturday": 4.0,    # 240 mins
            "Sunday": 4.0       # 240 mins
        }
        self.start_date = "2026-07-06" # A Monday

        # Create dummy task templates
        self.tasks = [
            TaskTemplate(
                title="Task 1",
                description="Desc 1",
                estimated_minutes=60,
                difficulty="Easy",
                priority="High",
                resource_type="Video",
                suggested_resource="Resource 1",
                day_number=1,
                week_number=1
            ),
            TaskTemplate(
                title="Task 2",
                description="Desc 2",
                estimated_minutes=90,
                difficulty="Medium",
                priority="Medium",
                resource_type="Article",
                suggested_resource="Resource 2",
                day_number=2,
                week_number=1
            ),
            TaskTemplate(
                title="Task 3",
                description="Desc 3",
                estimated_minutes=60,
                difficulty="Hard",
                priority="Low",
                resource_type="Coding Practice",
                suggested_resource="Resource 3",
                day_number=3,
                week_number=1
            ),
        ]

    def test_deterministic_scheduler(self):
        scheduled = schedule_tasks(self.tasks, self.start_date, self.availability)
        
        self.assertEqual(len(scheduled), 3)
        
        # Task 1: 60 mins. Fits on Monday (budget: 120 mins).
        self.assertEqual(scheduled[0]["scheduled_date"], "2026-07-06")
        self.assertEqual(scheduled[0]["start_time"], "09:00")
        self.assertEqual(scheduled[0]["end_time"], "10:00")
        
        # Task 2: 90 mins. Adding to Monday would take it to 60 + 90 = 150 mins (> 120 mins).
        # Should roll over to Tuesday (budget: 60 mins).
        # Wait, Task 2 is 90 mins, which exceeds Tuesday's budget (60 mins).
        # However, since Tuesday was empty, it should be scheduled on Tuesday anyway (preventing infinite loop).
        self.assertEqual(scheduled[1]["scheduled_date"], "2026-07-07")
        self.assertEqual(scheduled[1]["start_time"], "09:00")
        self.assertEqual(scheduled[1]["end_time"], "10:30")
        
        # Task 3: 60 mins. Adding to Tuesday is > 60 mins budget (it already has 90 mins used).
        # Should roll over to Wednesday. But Wednesday availability is 0.0.
        # Should roll over to Thursday.
        self.assertEqual(scheduled[2]["scheduled_date"], "2026-07-09")
        self.assertEqual(scheduled[2]["start_time"], "09:00")
        self.assertEqual(scheduled[2]["end_time"], "10:00")

    def test_replanner(self):
        # Setup scheduled output
        scheduled = [
            {
                "title": "Task 1",
                "estimated_minutes": 60,
                "difficulty": "Easy",
                "priority": "High",
                "scheduled_date": "2026-07-06",
                "start_time": "09:00",
                "end_time": "10:00",
                "status": "completed", # Completed task, shouldn't change
                "week_number": 1
            },
            {
                "title": "Task 2",
                "estimated_minutes": 90,
                "difficulty": "Medium",
                "priority": "Medium",
                "scheduled_date": "2026-07-07",
                "start_time": "09:00",
                "end_time": "10:30",
                "status": "missed", # Missed task, should be rescheduled
                "week_number": 1
            },
            {
                "title": "Task 3",
                "estimated_minutes": 60,
                "difficulty": "Hard",
                "priority": "Low",
                "scheduled_date": "2026-07-09",
                "start_time": "09:00",
                "end_time": "10:00",
                "status": "pending", # Future pending task, should be rescheduled
                "week_number": 1
            }
        ]
        
        # Replanning on Wednesday "2026-07-08"
        # Task 1 (completed) should remain on 2026-07-06.
        # Task 2 (missed) and Task 3 (pending) should be rescheduled starting from 2026-07-08.
        replanned = replan_remaining_tasks(scheduled, "2026-07-08", self.availability)
        
        self.assertEqual(len(replanned), 3)
        
        # Find tasks in output
        task1 = next(t for t in replanned if t["title"] == "Task 1")
        task2 = next(t for t in replanned if t["title"] == "Task 2")
        task3 = next(t for t in replanned if t["title"] == "Task 3")
        
        self.assertEqual(task1["scheduled_date"], "2026-07-06")
        self.assertEqual(task1["status"], "completed")
        
        # Rescheduled starting on Wednesday (2026-07-08). But Wednesday availability is 0.0.
        # So they must roll over to Thursday (2026-07-09).
        # Task 2 (90 mins) scheduled on Thursday.
        self.assertEqual(task2["scheduled_date"], "2026-07-09")
        self.assertEqual(task2["status"], "pending") # Status reset to pending
        
        # Task 3 (60 mins) adding to Thursday makes it 90 + 60 = 150 mins (> 120 mins Thursday budget).
        # Should roll over to Friday (2026-07-10).
        self.assertEqual(task3["scheduled_date"], "2026-07-10")
        self.assertEqual(task3["status"], "pending")

if __name__ == '__main__':
    unittest.main()
