# Task Reminder System

## Folder Structure

```
task_reminder_system/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI main application
│   ├── models.py            # Pydantic models
│   ├── database.py          # Database configuration
│   ├── crud.py              # Database operations
│   └── schemas.py           # API schemas
├── frontend/
│   └── streamlit_app.py     # Streamlit frontend
├── notifications/
│   ├── __init__.py
│   └── reminder_service.py  # Background reminder service
├── requirements.txt
├── run_api.py              # Script to run FastAPI
├── run_frontend.py         # Script to run Streamlit
└── README.md
```

## Installation & Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the system:
```bash
# Terminal 1: Run FastAPI backend
python run_api.py

# Terminal 2: Run Streamlit frontend
python run_frontend.py
```

## Files Implementation

### requirements.txt
```
fastapi==0.104.1
uvicorn==0.24.0
streamlit==1.28.1
sqlalchemy==2.0.23
sqlite3
pydantic==2.5.0
requests==2.31.0
python-multipart==0.0.6
schedule==1.2.0
plyer==2.1.0
```

### app/__init__.py
```python
# Empty file to make app a package
```

### app/database.py
```python
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./tasks.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    deadline = Column(DateTime)
    priority = Column(String, default="Medium")
    status = Column(String, default="Pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    reminder_sent = Column(Boolean, default=False)

# Create tables
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### app/models.py
```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    deadline: datetime
    priority: str = "Medium"

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    deadline: Optional[datetime] = None
    priority: Optional[str] = None
    status: Optional[str] = None

class TaskResponse(TaskBase):
    id: int
    status: str
    created_at: datetime
    reminder_sent: bool
    
    class Config:
        from_attributes = True
```

### app/crud.py
```python
from sqlalchemy.orm import Session
from app.database import Task
from app.models import TaskCreate, TaskUpdate
from datetime import datetime, timedelta

def create_task(db: Session, task: TaskCreate):
    db_task = Task(**task.dict())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

def get_tasks(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Task).offset(skip).limit(limit).all()

def get_task(db: Session, task_id: int):
    return db.query(Task).filter(Task.id == task_id).first()

def update_task(db: Session, task_id: int, task_update: TaskUpdate):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if db_task:
        for field, value in task_update.dict(exclude_unset=True).items():
            setattr(db_task, field, value)
        db.commit()
        db.refresh(db_task)
    return db_task

def delete_task(db: Session, task_id: int):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if db_task:
        db.delete(db_task)
        db.commit()
    return db_task

def get_pending_reminders(db: Session):
    now = datetime.utcnow()
    reminder_time = now + timedelta(hours=1)  # 1 hour before deadline
    
    return db.query(Task).filter(
        Task.status == "Pending",
        Task.reminder_sent == False,
        Task.deadline <= reminder_time
    ).all()

def mark_reminder_sent(db: Session, task_id: int):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if db_task:
        db_task.reminder_sent = True
        db.commit()
    return db_task
```

### app/main.py
```python
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TaskCreate, TaskUpdate, TaskResponse
from app import crud
from typing import List

app = FastAPI(title="Task Reminder API", version="1.0.0")

@app.post("/tasks/", response_model=TaskResponse)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    return crud.create_task(db=db, task=task)

@app.get("/tasks/", response_model=List[TaskResponse])
def read_tasks(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_tasks(db, skip=skip, limit=limit)

@app.get("/tasks/{task_id}", response_model=TaskResponse)
def read_task(task_id: int, db: Session = Depends(get_db)):
    task = crud.get_task(db, task_id=task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.put("/tasks/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, task: TaskUpdate, db: Session = Depends(get_db)):
    updated_task = crud.update_task(db, task_id=task_id, task_update=task)
    if updated_task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return updated_task

@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    deleted_task = crud.delete_task(db, task_id=task_id)
    if deleted_task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted successfully"}

@app.get("/reminders/pending")
def get_pending_reminders(db: Session = Depends(get_db)):
    return crud.get_pending_reminders(db)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### frontend/streamlit_app.py
```python
import streamlit as st
import requests
import pandas as pd
from datetime import datetime, timedelta
import json

# API base URL
API_BASE = "http://localhost:8000"

st.set_page_config(page_title="Task Reminder System", layout="wide")

def main():
    st.title("🗓️ Task Reminder System")
    
    # Sidebar for navigation
    st.sidebar.title("Navigation")
    page = st.sidebar.selectbox("Choose a page", ["Add Task", "View Tasks", "Update Task"])
    
    if page == "Add Task":
        add_task_page()
    elif page == "View Tasks":
        view_tasks_page()
    elif page == "Update Task":
        update_task_page()

def add_task_page():
    st.header("➕ Add New Task")
    
    with st.form("add_task_form"):
        col1, col2 = st.columns(2)
        
        with col1:
            title = st.text_input("Task Title*", placeholder="Enter task title")
            description = st.text_area("Description", placeholder="Task description (optional)")
            
        with col2:
            priority = st.selectbox("Priority", ["Low", "Medium", "High", "Critical"])
            
            # Date and time inputs
            deadline_date = st.date_input("Deadline Date", min_value=datetime.now().date())
            deadline_time = st.time_input("Deadline Time", value=datetime.now().time())
        
        submitted = st.form_submit_button("Add Task")
        
        if submitted:
            if title:
                # Combine date and time
                deadline = datetime.combine(deadline_date, deadline_time)
                
                task_data = {
                    "title": title,
                    "description": description,
                    "deadline": deadline.isoformat(),
                    "priority": priority
                }
                
                try:
                    response = requests.post(f"{API_BASE}/tasks/", json=task_data)
                    if response.status_code == 200:
                        st.success("✅ Task added successfully!")
                        st.balloons()
                    else:
                        st.error(f"Error adding task: {response.text}")
                except requests.exceptions.RequestException as e:
                    st.error(f"Connection error: {str(e)}")
            else:
                st.error("Please enter a task title!")

def view_tasks_page():
    st.header("📋 Your Tasks")
    
    # Filters
    col1, col2, col3 = st.columns(3)
    with col1:
        status_filter = st.selectbox("Filter by Status", ["All", "Pending", "Completed", "In Progress"])
    with col2:
        priority_filter = st.selectbox("Filter by Priority", ["All", "Low", "Medium", "High", "Critical"])
    with col3:
        if st.button("🔄 Refresh"):
            st.rerun()
    
    try:
        response = requests.get(f"{API_BASE}/tasks/")
        if response.status_code == 200:
            tasks = response.json()
            
            if not tasks:
                st.info("No tasks found. Add some tasks to get started!")
                return
            
            # Filter tasks
            filtered_tasks = tasks
            if status_filter != "All":
                filtered_tasks = [t for t in filtered_tasks if t["status"] == status_filter]
            if priority_filter != "All":
                filtered_tasks = [t for t in filtered_tasks if t["priority"] == priority_filter]
            
            # Display tasks
            for task in filtered_tasks:
                deadline = datetime.fromisoformat(task["deadline"])
                time_left = deadline - datetime.now()
                
                # Color coding based on urgency
                if time_left.total_seconds() < 0:
                    urgency_color = "🔴"
                    urgency_text = "OVERDUE"
                elif time_left.total_seconds() < 86400:  # Less than 24 hours
                    urgency_color = "🟡"
                    urgency_text = "DUE SOON"
                else:
                    urgency_color = "🟢"
                    urgency_text = "ON TIME"
                
                with st.expander(f"{urgency_color} {task['title']} - {urgency_text}"):
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.write(f"**Description:** {task['description'] or 'No description'}")
                        st.write(f"**Status:** {task['status']}")
                        st.write(f"**Priority:** {task['priority']}")
                        
                    with col2:
                        st.write(f"**Deadline:** {deadline.strftime('%Y-%m-%d %H:%M')}")
                        st.write(f"**Created:** {datetime.fromisoformat(task['created_at']).strftime('%Y-%m-%d %H:%M')}")
                        
                        # Action buttons
                        col_btn1, col_btn2 = st.columns(2)
                        with col_btn1:
                            if st.button("✅ Complete", key=f"complete_{task['id']}"):
                                update_task_status(task['id'], "Completed")
                        with col_btn2:
                            if st.button("🗑️ Delete", key=f"delete_{task['id']}"):
                                delete_task(task['id'])
                
    except requests.exceptions.RequestException as e:
        st.error(f"Error fetching tasks: {str(e)}")

def update_task_page():
    st.header("✏️ Update Task")
    
    # Get all tasks for selection
    try:
        response = requests.get(f"{API_BASE}/tasks/")
        if response.status_code == 200:
            tasks = response.json()
            
            if not tasks:
                st.info("No tasks available to update.")
                return
            
            # Task selection
            task_options = {f"{task['title']} (ID: {task['id']})": task for task in tasks}
            selected_task_key = st.selectbox("Select Task to Update", options=list(task_options.keys()))
            
            if selected_task_key:
                selected_task = task_options[selected_task_key]
                
                with st.form("update_task_form"):
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        title = st.text_input("Task Title", value=selected_task['title'])
                        description = st.text_area("Description", value=selected_task['description'] or "")
                        status = st.selectbox("Status", ["Pending", "In Progress", "Completed"], 
                                            index=["Pending", "In Progress", "Completed"].index(selected_task['status']))
                        
                    with col2:
                        priority = st.selectbox("Priority", ["Low", "Medium", "High", "Critical"],
                                              index=["Low", "Medium", "High", "Critical"].index(selected_task['priority']))
                        
                        current_deadline = datetime.fromisoformat(selected_task['deadline'])
                        deadline_date = st.date_input("Deadline Date", value=current_deadline.date())
                        deadline_time = st.time_input("Deadline Time", value=current_deadline.time())
                    
                    submitted = st.form_submit_button("Update Task")
                    
                    if submitted:
                        deadline = datetime.combine(deadline_date, deadline_time)
                        
                        update_data = {
                            "title": title,
                            "description": description,
                            "deadline": deadline.isoformat(),
                            "priority": priority,
                            "status": status
                        }
                        
                        try:
                            response = requests.put(f"{API_BASE}/tasks/{selected_task['id']}", json=update_data)
                            if response.status_code == 200:
                                st.success("✅ Task updated successfully!")
                                st.rerun()
                            else:
                                st.error(f"Error updating task: {response.text}")
                        except requests.exceptions.RequestException as e:
                            st.error(f"Connection error: {str(e)}")
                            
    except requests.exceptions.RequestException as e:
        st.error(f"Error fetching tasks: {str(e)}")

def update_task_status(task_id, status):
    try:
        response = requests.put(f"{API_BASE}/tasks/{task_id}", json={"status": status})
        if response.status_code == 200:
            st.success(f"Task status updated to {status}!")
            st.rerun()
        else:
            st.error("Error updating task status")
    except requests.exceptions.RequestException as e:
        st.error(f"Connection error: {str(e)}")

def delete_task(task_id):
    try:
        response = requests.delete(f"{API_BASE}/tasks/{task_id}")
        if response.status_code == 200:
            st.success("Task deleted successfully!")
            st.rerun()
        else:
            st.error("Error deleting task")
    except requests.exceptions.RequestException as e:
        st.error(f"Connection error: {str(e)}")

if __name__ == "__main__":
    main()
```

### notifications/reminder_service.py
```python
import schedule
import time
import requests
from plyer import notification
from datetime import datetime
import threading

API_BASE = "http://localhost:8000"

def check_and_send_reminders():
    """Check for pending reminders and send notifications"""
    try:
        response = requests.get(f"{API_BASE}/reminders/pending")
        if response.status_code == 200:
            pending_tasks = response.json()
            
            for task in pending_tasks:
                deadline = datetime.fromisoformat(task["deadline"])
                time_left = deadline - datetime.now()
                
                # Send notification
                notification.notify(
                    title="Task Reminder",
                    message=f"Task '{task['title']}' is due in {format_time_left(time_left)}!",
                    timeout=10
                )
                
                print(f"Reminder sent for task: {task['title']}")
                
                # Mark reminder as sent
                requests.put(f"{API_BASE}/tasks/{task['id']}", 
                           json={"reminder_sent": True})
                
    except Exception as e:
        print(f"Error checking reminders: {e}")

def format_time_left(time_delta):
    """Format time delta into readable string"""
    if time_delta.total_seconds() < 0:
        return "OVERDUE"
    
    hours = int(time_delta.total_seconds() // 3600)
    minutes = int((time_delta.total_seconds() % 3600) // 60)
    
    if hours > 0:
        return f"{hours}h {minutes}m"
    else:
        return f"{minutes}m"

def run_reminder_service():
    """Run the reminder service in background"""
    print("Starting reminder service...")
    
    # Schedule reminder checks every 15 minutes
    schedule.every(15).minutes.do(check_and_send_reminders)
    
    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute

if __name__ == "__main__":
    # Run reminder service in a separate thread
    reminder_thread = threading.Thread(target=run_reminder_service, daemon=True)
    reminder_thread.start()
    
    # Keep the main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Reminder service stopped.")
```

### run_api.py
```python
import uvicorn
from app.main import app

if __name__ == "__main__":
    print("Starting FastAPI server...")
    print("API will be available at: http://localhost:8000")
    print("API documentation at: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
```

### run_frontend.py
```python
import subprocess
import sys
import os

if __name__ == "__main__":
    print("Starting Streamlit frontend...")
    print("Frontend will be available at: http://localhost:8501")
    
    # Change to frontend directory
    frontend_path = os.path.join(os.path.dirname(__file__), "frontend", "streamlit_app.py")
    
    # Run streamlit
    subprocess.run([sys.executable, "-m", "streamlit", "run", frontend_path])
```

## Features

### ✅ Core Features
- **Task Management**: Create, read, update, delete tasks
- **Deadline Tracking**: Set specific deadlines with date and time
- **Priority Levels**: Low, Medium, High, Critical
- **Status Tracking**: Pending, In Progress, Completed
- **Real-time Notifications**: System notifications for upcoming deadlines
- **Web Interface**: User-friendly Streamlit frontend
- **REST API**: FastAPI backend with automatic documentation

### ⚡ Advanced Features
- **Smart Filtering**: Filter tasks by status, priority, urgency
- **Visual Indicators**: Color-coded urgency levels
- **Time Calculations**: Shows time remaining or overdue status
- **Background Service**: Automatic reminder checking
- **Database Persistence**: SQLite database for data storage
- **Responsive Design**: Works on different screen sizes

## Usage Instructions

1. **Start the Backend**: Run `python run_api.py`
2. **Start the Frontend**: Run `python run_frontend.py` (in a new terminal)
3. **Optional - Start Reminder Service**: Run `python notifications/reminder_service.py` (in a third terminal)

### Using the System

1. **Add Tasks**: Go to "Add Task" page and fill in task details
2. **View Tasks**: See all your tasks with urgency indicators
3. **Update Tasks**: Modify existing tasks or mark as complete
4. **Get Reminders**: System will notify you about upcoming deadlines

The system will automatically remind you about tasks approaching their deadlines, helping you stay on top of your work commitments!