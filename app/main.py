import os
import uvicorn
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.api.routes import router

app = FastAPI(title="AI Personal Task Manager Agent API")

# Configure CORS to allow the frontend to interact with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In development, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the API router
app.include_router(router, prefix="/api")

@app.on_event("startup")
def startup_event():
    # Initialize the SQLite database and default settings
    init_db()

@app.get("/")
def read_root():
    return {"status": "running", "message": "AI Personal Task Manager Agent API is online."}

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
