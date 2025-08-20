from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from . import models, schemas

def get_task(db: Session, task_id: int) -> Optional[models.Task]:
    return db.query(models.Task).filter(models.Task.id == task_id).first()

def get_tasks(db: Session, skip: int = 0, limit: int = 100) -> List[models.Task]:
    return db.query(models.Task).offset(skip).limit(limit).all()

def get_tasks_by_status(db: Session, status: str) -> List[models.Task]:
    return db.query(models.Task).filter(models.Task.status == status).all()

def get_tasks_by_priority(db: Session, priority: str) -> List[models.Task]:
    return db.query(models.Task).filter(models.Task.priority == priority).all()

def get_overdue_tasks(db: Session) -> List[models.Task]:
    return db.query(models.Task).filter(
        models.Task.due_date < datetime.utcnow(),
        models.Task.status != "completed"
    ).all()

def get_tasks_with_reminders(db: Session) -> List[models.Task]:
    return db.query(models.Task).filter(
        models.Task.is_reminder_set == True,
        models.Task.reminder_time <= datetime.utcnow(),
        models.Task.status != "completed"
    ).all()

def create_task(db: Session, task: schemas.TaskCreate) -> models.Task:
    db_task = models.Task(**task.dict())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

def update_task(db: Session, task_id: int, task_update: schemas.TaskUpdate) -> Optional[models.Task]:
    db_task = get_task(db, task_id)
    if db_task:
        update_data = task_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_task, field, value)
        db_task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_task)
    return db_task

def delete_task(db: Session, task_id: int) -> bool:
    db_task = get_task(db, task_id)
    if db_task:
        db.delete(db_task)
        db.commit()
        return True
    return False

def get_task_statistics(db: Session) -> dict:
    total_tasks = db.query(models.Task).count()
    completed_tasks = db.query(models.Task).filter(models.Task.status == "completed").count()
    pending_tasks = db.query(models.Task).filter(models.Task.status == "pending").count()
    overdue_tasks = len(get_overdue_tasks(db))
    
    return {
        "total": total_tasks,
        "completed": completed_tasks,
        "pending": pending_tasks,
        "overdue": overdue_tasks,
        "completion_rate": (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
    }