# AI Personal Task Manager Agent

> An AI-powered task planner that turns a single high-level goal into a fully scheduled, week-by-week action plan — and actively replans when life gets in the way.

---

## Features

- **Natural Language Goal Intake** — Describe your goal in plain English; the AI extracts duration, difficulty, deadline, and required skills automatically.
- **Agentic 4-Step Pipeline** — Four specialized AI agents work in sequence: Goal Analyzer → Milestone Planner → Daily Task Generator → Availability-Aware Scheduler.
- **Real-Time Streaming UI** — Server-Sent Events (SSE) stream live progress of the generation pipeline directly to the browser.
- **Interactive Calendar** — Color-coded weekly timeline with one-click task check-off, notes, and delay logging.
- **Milestones Tracker** — Drill into week-by-week objectives with per-milestone completion rates.
- **Dashboard & Analytics** — At-a-glance stats: completion %, daily streak, hours studied, missed tasks, and a weekly progress chart.
- **Daily Review Chat** — Conversational AI coach for daily check-ins and on-demand replanning.
- **Smart Replanner** — Reschedules all remaining/missed tasks starting from today while preserving the completion history.
- **Availability-Aware Scheduling** — Respects your custom daily availability (hours/day per weekday) when building the calendar.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **AI / LLM** | Google Gemini 2.5 Flash (`google-genai` SDK) |
| **Backend** | Python · FastAPI · Uvicorn |
| **ORM / DB** | SQLAlchemy · SQLite |
| **Frontend** | React 18 · Vite |
| **Styling** | Vanilla CSS (Glassmorphism design system) |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Frontend (React)            │
│  Dashboard │ Calendar │ Milestones │ Chat    │
│            SSE Stream ──────────────         │
└────────────────────┬────────────────────────┘
                     │ HTTP / SSE
┌────────────────────▼────────────────────────┐
│              FastAPI Backend                 │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │           Agent Pipeline             │   │
│  │  1. Goal Agent    (analysis)         │   │
│  │  2. Planner Agent (milestones)       │   │
│  │  3. Task Agent    (daily tasks)      │   │
│  │  4. Scheduler     (calendar slots)   │   │
│  │  5. Replanner     (reschedule)       │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  SQLite DB  (Goals · Milestones · Tasks)    │
└─────────────────────────────────────────────┘
```

### Agent Responsibilities

| Agent | File | Role |
|---|---|---|
| **Goal Agent** | `app/agents/goal_agent.py` | Parses raw goal text into structured metadata (duration, deadline, difficulty, skills) using Gemini structured output |
| **Planner Agent** | `app/agents/planner_agent.py` | Breaks the goal into numbered weekly milestones with objectives and estimated hours |
| **Task Agent** | `app/agents/task_agent.py` | Generates granular daily tasks for each milestone with time estimates and resource suggestions |
| **Scheduler Agent** | `app/agents/scheduler_agent.py` | Maps tasks to specific calendar dates and time slots based on user availability |
| **Replanner Agent** | `app/agents/replanner_agent.py` | Reschedules pending/missed tasks forward from today without touching completed ones |

---
