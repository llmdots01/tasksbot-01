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