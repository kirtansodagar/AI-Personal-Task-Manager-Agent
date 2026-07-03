import os
import json
from typing import List, Dict
from google import genai
from google.genai import types


def run_chat(
    messages: List[Dict],
    context: Dict,
    api_key: str = None
) -> str:
    """
    Multi-turn Gemini coaching chat agent.
    
    `messages` is a list of {role: 'user'|'assistant', content: str}
    `context` contains live goal + progress data injected as system prompt.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("Gemini API key not found.")

    client = genai.Client(api_key=key)

    # Build a rich system prompt with all user context
    today_tasks_text = ""
    if context.get("today_tasks"):
        lines = []
        for t in context["today_tasks"]:
            status_emoji = {"completed": "✅", "missed": "❌", "pending": "⏳", "skipped": "⏭️"}.get(t.get("status", "pending"), "⏳")
            lines.append(f"  {status_emoji} {t['title']} ({t.get('estimated_minutes', 0)} min, {t.get('difficulty', 'Medium')})")
        today_tasks_text = "\n".join(lines)
    else:
        today_tasks_text = "  No tasks scheduled today."

    system_prompt = f"""You are an expert AI Personal Project Manager and motivational coach.
Your job is to help the user stay on track with their learning goal through thoughtful, personalized coaching.

=== CURRENT USER CONTEXT ===
Today's Date: {context.get('today', 'Unknown')}
Active Goal: {context.get('goal_title', 'Unknown')}
Deadline: {context.get('deadline', 'Unknown')}
Days Remaining: {context.get('days_left', '?')} days
Overall Progress: {context.get('completion_percentage', 0)}% complete
Current Streak: {context.get('streak', 0)} consecutive days
Total Tasks Completed: {context.get('completed_count', 0)} / {context.get('total_count', 0)}
Tasks Missed: {context.get('missed_count', 0)}

Today's Scheduled Tasks:
{today_tasks_text}
============================

Guidelines:
- Be warm, encouraging, and specific. Reference the goal and today's actual tasks by name.
- If the user says they missed tasks, empathize briefly then ask for the reason before suggesting replanning.
- If the user asks what to focus on, refer to their pending tasks for today.
- If the user seems stuck on a concept, give a 2-3 sentence explanation and suggest a specific resource.
- Keep responses concise (2-4 sentences max unless asked for detail).
- Use emojis sparingly for warmth.
- Do NOT make up task names or dates not present in the context above.
"""

    # Convert our message history to Gemini contents format
    contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(types.Content(
            role=role,
            parts=[types.Part(text=msg["content"])]
        ))

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.7,
            max_output_tokens=512,
        )
    )

    return response.text.strip()
