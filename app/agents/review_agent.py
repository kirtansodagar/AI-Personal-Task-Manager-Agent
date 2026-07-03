import os
from typing import List, Dict
from google import genai
from google.genai import types


def generate_weekly_review(
    week_start: str,
    week_stats: Dict,
    tasks: List[Dict],
    goal_title: str,
    api_key: str = None
) -> str:
    """
    Generate a narrative weekly review report as Markdown using Gemini.

    `week_stats` contains aggregated metrics for the week.
    `tasks` is the full list of tasks scheduled in the week.
    Returns a Markdown-formatted report string.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("Gemini API key not found.")

    client = genai.Client(api_key=key)

    # Build task breakdown summary for the prompt
    completed = [t for t in tasks if t.get("status") == "completed"]
    missed = [t for t in tasks if t.get("status") == "missed"]
    pending = [t for t in tasks if t.get("status") == "pending"]
    skipped = [t for t in tasks if t.get("status") == "skipped"]

    completed_topics = ", ".join([t["title"] for t in completed[:10]]) or "None"
    missed_topics = ", ".join([t["title"] for t in missed[:10]]) or "None"

    hours_logged = round(sum(t.get("estimated_minutes", 0) for t in completed) / 60, 1)
    completion_rate = int(len(completed) / len(tasks) * 100) if tasks else 0

    prompt = f"""You are an expert learning coach writing a weekly progress report for a student.

=== WEEK SUMMARY ===
Goal: {goal_title}
Week Start: {week_start}
Tasks Completed: {len(completed)} / {len(tasks)} ({completion_rate}%)
Hours Logged: {hours_logged} hours
Tasks Missed: {len(missed)}
Tasks Pending (not yet due): {len(pending)}
Tasks Skipped: {len(skipped)}

Completed Topics:
{completed_topics}

Missed Topics:
{missed_topics}

Overall Streak: {week_stats.get("streak", 0)} days
====================

Write a weekly review report in Markdown format. Include these sections:
1. **Week {week_stats.get('week_number', '')} Overview** — a 2-3 sentence narrative summary of the week's performance, referencing the goal.
2. **What Went Well** — 2-3 bullet points celebrating specific wins from completed tasks.
3. **Areas to Improve** — 2-3 bullet points about missed or weak areas, framed constructively.
4. **Focus for Next Week** — 3 specific, actionable recommendations based on what was missed and what comes next.
5. **Motivational Note** — 1-2 sentences of genuine encouragement tailored to the progress made.

Keep the tone warm, specific, and professional. Reference actual task names where relevant.
Do NOT fabricate metrics not provided above.
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.6,
            max_output_tokens=1024,
        )
    )

    return response.text.strip()
