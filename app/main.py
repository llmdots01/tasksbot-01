from flask import request, jsonify
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas import TaskCreate, TaskUpdate
from app import crud
from datetime import datetime
import json

# Routes will be registered with the app instance from __init__.py

def read_root():
    return jsonify({"message": "Task Reminder System API", "version": "1.0.0"})

def create_task():
    data = request.get_json()
    task_data = TaskCreate(**data)
    
    db = next(get_db())
    try:
        task = crud.create_task(db=db, task=task_data)
        return jsonify({
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "priority": task.priority,
            "status": task.status,
            "created_at": task.created_at.isoformat(),
            "reminder_sent": task.reminder_sent,
            "is_reminder_set": task.is_reminder_set,
            "reminder_time": task.reminder_time.isoformat() if task.reminder_time else None,
            "category": task.category,
            "tags": task.tags
        }), 201
    finally:
        db.close()

def read_tasks():
    skip = request.args.get("skip", 0, type=int)
    limit = request.args.get("limit", 100, type=int)
    
    db = next(get_db())
    try:
        tasks = crud.get_tasks(db, skip=skip, limit=limit)
        return jsonify([{
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "priority": task.priority,
            "status": task.status,
            "created_at": task.created_at.isoformat(),
            "reminder_sent": task.reminder_sent,
            "is_reminder_set": task.is_reminder_set,
            "reminder_time": task.reminder_time.isoformat() if task.reminder_time else None,
            "category": task.category,
            "tags": task.tags
        } for task in tasks])
    finally:
        db.close()

def read_task(task_id):
    db = next(get_db())
    try:
        task = crud.get_task(db, task_id=task_id)
        if task is None:
            return jsonify({"error": "Task not found"}), 404
        
        return jsonify({
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "priority": task.priority,
            "status": task.status,
            "created_at": task.created_at.isoformat(),
            "reminder_sent": task.reminder_sent,
            "is_reminder_set": task.is_reminder_set,
            "reminder_time": task.reminder_time.isoformat() if task.reminder_time else None,
            "category": task.category,
            "tags": task.tags
        })
    finally:
        db.close()

def update_task(task_id):
    data = request.get_json()
    task_update = TaskUpdate(**data)
    
    db = next(get_db())
    try:
        updated_task = crud.update_task(db, task_id=task_id, task_update=task_update)
        if updated_task is None:
            return jsonify({"error": "Task not found"}), 404
        
        return jsonify({
            "id": updated_task.id,
            "title": updated_task.title,
            "description": updated_task.description,
            "due_date": updated_task.due_date.isoformat() if updated_task.due_date else None,
            "priority": updated_task.priority,
            "status": updated_task.status,
            "created_at": updated_task.created_at.isoformat(),
            "reminder_sent": updated_task.reminder_sent,
            "is_reminder_set": updated_task.is_reminder_set,
            "reminder_time": updated_task.reminder_time.isoformat() if updated_task.reminder_time else None,
            "category": updated_task.category,
            "tags": updated_task.tags
        })
    finally:
        db.close()

def delete_task(task_id):
    db = next(get_db())
    try:
        success = crud.delete_task(db, task_id=task_id)
        if not success:
            return jsonify({"error": "Task not found"}), 404
        return jsonify({"message": "Task deleted successfully"})
    finally:
        db.close()

def get_pending_reminders():
    db = next(get_db())
    try:
        tasks = crud.get_tasks_with_reminders(db)
        return jsonify([{
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "priority": task.priority,
            "status": task.status,
            "created_at": task.created_at.isoformat(),
            "reminder_sent": task.reminder_sent,
            "is_reminder_set": task.is_reminder_set,
            "reminder_time": task.reminder_time.isoformat() if task.reminder_time else None,
            "category": task.category,
            "tags": task.tags
        } for task in tasks])
    finally:
        db.close()

def get_task_statistics():
    db = next(get_db())
    try:
        stats = crud.get_task_statistics(db)
        return jsonify(stats)
    finally:
        db.close()