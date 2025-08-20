import streamlit as st
import requests
import pandas as pd
from datetime import datetime, timedelta
import json

# API base URL
API_BASE = "http://127.0.0.1:8000"  # Ensure this matches your Flask server

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
                due_date = datetime.combine(deadline_date, deadline_time)
                
                task_data = {
                    "title": title,
                    "description": description,
                    "due_date": due_date.isoformat(),
                    "priority": priority
                }
                
                try:
                    response = requests.post(f"{API_BASE}/tasks/", json=task_data, timeout=10)
                    if response.status_code == 201:
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
        response = requests.get(f"{API_BASE}/tasks/", timeout=10)
        if response.status_code == 200:
            tasks = response.json()
            
            if not tasks:
                st.info("No tasks found. Add some tasks to get started!")
                return
            
            # Filter tasks
            filtered_tasks = tasks
            if status_filter != "All":
                filtered_tasks = [t for t in filtered_tasks if t["status"] == status_filter.lower()]
            if priority_filter != "All":
                filtered_tasks = [t for t in filtered_tasks if t["priority"] == priority_filter]
            
            # Display tasks
            for task in filtered_tasks:
                due_date = datetime.fromisoformat(task["due_date"])
                time_left = due_date - datetime.now()
                
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
                        st.write(f"**Due Date:** {due_date.strftime('%Y-%m-%d %H:%M')}")
                        st.write(f"**Created:** {datetime.fromisoformat(task['created_at']).strftime('%Y-%m-%d %H:%M')}")
                        
                        # Action buttons
                        col_btn1, col_btn2 = st.columns(2)
                        with col_btn1:
                            if st.button("✅ Complete", key=f"complete_{task['id']}"):
                                update_task_status(task['id'], "completed")
                        with col_btn2:
                            if st.button("🗑️ Delete", key=f"delete_{task['id']}"):
                                delete_task(task['id'])
                
    except requests.exceptions.RequestException as e:
        st.error(f"Error fetching tasks: {str(e)}")

def update_task_page():
    st.header("✏️ Update Task")
    
    # Get all tasks for selection
    try:
        response = requests.get(f"{API_BASE}/tasks/", timeout=10)
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
                        
                        current_due_date = datetime.fromisoformat(selected_task['due_date'])
                        due_date_date = st.date_input("Due Date", value=current_due_date.date())
                        due_date_time = st.time_input("Due Time", value=current_due_date.time())
                    
                    submitted = st.form_submit_button("Update Task")
                    
                    if submitted:
                        due_date = datetime.combine(due_date_date, due_date_time)
                        
                        update_data = {
                            "title": title,
                            "description": description,
                            "due_date": due_date.isoformat(),
                            "priority": priority,
                            "status": status
                        }
                        
                        try:
                            response = requests.put(f"{API_BASE}/tasks/{selected_task['id']}", json=update_data, timeout=10)
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
        response = requests.put(f"{API_BASE}/tasks/{task_id}", json={"status": status}, timeout=10)
        if response.status_code == 200:
            st.success(f"Task status updated to {status}!")
            st.rerun()
        else:
            st.error("Error updating task status")
    except requests.exceptions.RequestException as e:
        st.error(f"Connection error: {str(e)}")

def delete_task(task_id):
    try:
        response = requests.delete(f"{API_BASE}/tasks/{task_id}", timeout=10)
        if response.status_code == 200:
            st.success("Task deleted successfully!")
            st.rerun()
        else:
            st.error("Error deleting task")
    except requests.exceptions.RequestException as e:
        st.error(f"Connection error: {str(e)}")

if __name__ == "__main__":
    main()