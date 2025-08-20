# app/schemas.py
from pydantic import BaseModel, Field
from pydantic import datetime as pydantic_datetime
from typing import Optional

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: pydantic_datetime
    priority: str = "Medium"

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[pydantic_datetime] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    is_reminder_set: Optional[bool] = None
    reminder_time: Optional[pydantic_datetime] = None
    category: Optional[str] = None
    tags: Optional[str] = None

class TaskResponse(TaskBase):
    id: int
    status: str
    created_at: pydantic_datetime
    reminder_sent: bool
    is_reminder_set: bool
    reminder_time: Optional[pydantic_datetime] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    updated_at: Optional[pydantic_datetime] = None
    
    class Config:
        from_attributes = True

# Update imports in other files to use this