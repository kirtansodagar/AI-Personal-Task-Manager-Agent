import os
from pydantic import BaseModel, Field
from typing import List
from google import genai
from google.genai import types
from .goal_agent import GoalAnalysis
from .planner_agent import MilestonePlan

class TaskTemplate(BaseModel):
    title: str = Field(description="Actionable, clear task name, e.g. 'Solve 5 BFS problems' or 'Read MDN docs on Promises'.")
    description: str = Field(description="Specific instructions or notes on what to cover.")
    estimated_minutes: int = Field(description="Estimated duration in minutes.")
    difficulty: str = Field(description="Difficulty level: Easy, Medium, or Hard.")
    priority: str = Field(description="Priority: Low, Medium, or High.")
    resource_type: str = Field(description="Resource type: Video, Article, Coding Practice, Revision, Quiz.")
    suggested_resource: str = Field(description="Specific reference, URL, search term, or LeetCode question name/number.")
    day_number: int = Field(description="The relative day of the week for this task (1 to 7).")
    week_number: int = Field(default=1, description="The week number this task belongs to.")

class MilestoneTasks(BaseModel):
    tasks: List[TaskTemplate] = Field(description="A comprehensive list of daily tasks covering all 7 days of the week.")

def generate_tasks_for_milestone(goal: GoalAnalysis, milestone: MilestonePlan, api_key: str = None) -> MilestoneTasks:
    """
    Generate daily tasks for a specific milestone.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("Gemini API key not found. Please configure it in Settings.")
        
    client = genai.Client(api_key=key)
    
    prompt = f"""
    You are an expert personal tutor and organizer.
    Generate a series of daily tasks (spread from Day 1 to Day 7) for the following milestone:
    
    Goal: {goal.goal}
    Goal Difficulty: {goal.difficulty}
    Goal Constraints: {', '.join(goal.constraints)}
    
    Milestone Title: {milestone.title}
    Milestone Objective: {milestone.objective}
    Estimated Hours: {milestone.estimated_hours} hours
    Topics to Cover: {', '.join(milestone.topics)}
    Suggested Resources: {', '.join(milestone.learning_resources)}
    
    For this week, generate a detailed list of actionable daily tasks. 
    Distribute the tasks realistically across 7 days (day_number 1 to 7).
    Each day should have roughly (estimated_hours / 7) * 60 minutes of tasks.
    Ensure there is a healthy mix of:
    - Core learning (Videos / Articles) at the beginning of the week.
    - Active exercises / Coding Practice in the middle.
    - Revision, summaries, or short quizzes toward the end.
    
    Make the suggested resources as specific as possible (e.g. mention concrete LeetCode problems by name/number or specific YouTube channel tutorial titles).
    """
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MilestoneTasks,
            temperature=0.2
        )
    )
    
    if response.parsed:
        return response.parsed
        
    import json
    data = json.loads(response.text)
    return MilestoneTasks(**data)
