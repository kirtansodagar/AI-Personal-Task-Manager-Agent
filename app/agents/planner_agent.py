import os
from pydantic import BaseModel, Field
from typing import List
from google import genai
from google.genai import types
from .goal_agent import GoalAnalysis

class MilestonePlan(BaseModel):
    title: str = Field(description="Short title of the milestone, indicating the focus or theme (e.g. 'Arrays & Hashing').")
    objective: str = Field(description="Detailed objective of what will be learned or achieved in this milestone.")
    week_number: int = Field(description="The sequential week number starting from 1.")
    estimated_hours: float = Field(description="Estimated hours required to complete this milestone.")
    topics: List[str] = Field(description="Core topics covered in this milestone (e.g., Arrays, Hashmaps, DFS, BFS).")
    dependencies: List[str] = Field(description="List of titles of other milestones that this milestone depends on. Leave empty if none.")
    learning_resources: List[str] = Field(description="Suggested high-quality learning resources, courses, articles, or documentation.")

class PlanOutput(BaseModel):
    milestones: List[MilestonePlan] = Field(description="List of weekly milestones covering the duration of the plan.")

def generate_plan(goal: GoalAnalysis, api_key: str = None) -> PlanOutput:
    """
    Generate a list of weekly milestones based on the goal analysis.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("Gemini API key not found. Please configure it in Settings.")
        
    client = genai.Client(api_key=key)
    
    # Calculate how many weeks the duration represents
    weeks_count = max(1, int(goal.duration_days / 7))
    
    prompt = f"""
    You are an expert curriculum developer and technical project manager.
    Create a detailed weekly milestone roadmap for the following goal:
    
    Goal: {goal.goal}
    Total Duration: {goal.duration_days} days (approx. {weeks_count} weeks)
    Target Hours per Day: {goal.hours_per_day}
    Target Difficulty: {goal.difficulty}
    Skills Needed: {', '.join(goal.skills_needed)}
    Constraints: {', '.join(goal.constraints)}
    
    Create exactly {weeks_count} weekly milestones. Adjust the depth and scope of topics to fit the difficulty and available time.
    For each milestone, provide an objective, estimated hours (should match weeks_count * hours_per_day * 7 in total, roughly),
    a list of topics, and realistic resource recommendations (like standard tutorials, documentation, YouTube channels, LeetCode, etc.).
    """
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=PlanOutput,
            temperature=0.2
        )
    )
    
    if response.parsed:
        return response.parsed
        
    import json
    data = json.loads(response.text)
    return PlanOutput(**data)
