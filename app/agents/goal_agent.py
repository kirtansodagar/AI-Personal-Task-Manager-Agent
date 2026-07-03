import os
from pydantic import BaseModel, Field
from typing import List
from google import genai
from google.genai import types

class GoalAnalysis(BaseModel):
    goal: str = Field(description="A concise summary of the goal.")
    duration_days: int = Field(description="Extracted duration in days. If not specified, estimate a reasonable default.")
    hours_per_day: float = Field(description="Suggested hours per day the user needs to spend.")
    deadline: str = Field(description="Calculated target deadline date in YYYY-MM-DD format based on current date (e.g. {current_date}) and duration.")
    difficulty: str = Field(description="Difficulty level of the goal: Beginner, Intermediate, or Advanced.")
    priority: str = Field(description="Priority of the goal: Low, Medium, or High.")
    skills_needed: List[str] = Field(description="Key skills needed to achieve this goal.")
    constraints: List[str] = Field(description="Any constraints or limitations extracted from the goal.")

def analyze_goal(goal_text: str, current_date: str, api_key: str = None) -> GoalAnalysis:
    """
    Extract goal details from raw text using Gemini API with structured outputs.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("Gemini API key not found. Please configure it in Settings.")
        
    client = genai.Client(api_key=key)
    
    prompt = f"""
    You are an expert project manager agent.
    Analyze the following user goal and extract its parameters.
    
    Current Date: {current_date}
    User Goal: "{goal_text}"
    
    Calculate the deadline precisely as {current_date} + duration_days.
    If the user has not specified a duration, estimate a reasonable default (e.g. 30 days for interview prep, 60 days for learning a new language).
    If they do not specify hours per day, suggest a realistic workload based on the goal and difficulty.
    """
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GoalAnalysis,
            temperature=0.1
        )
    )
    
    # The SDK automatically returns a parsed object in response.parsed
    # if response_schema is passed and response_mime_type is application/json.
    if response.parsed:
        return response.parsed
        
    # Fallback to manual parsing if needed
    import json
    data = json.loads(response.text)
    return GoalAnalysis(**data)
