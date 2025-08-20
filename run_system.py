import subprocess
import sys
import os
import time
import threading
import signal
from app import app as flask_app, db  # Import both app and db

def run_flask():
    """Run Flask server"""
    print("🚀 Starting Flask server...")
    print("📡 API will be available at: http://localhost:8000")
    print("📚 API documentation at: http://localhost:8000/")
    
    try:
        flask_app.run(host="0.0.0.0", port=8000, debug=False)
    except Exception as e:
        print(f"❌ Error starting Flask: {e}")
        raise

def run_streamlit():
    """Run Streamlit frontend"""
    print("🎨 Starting Streamlit frontend...")
    print("🌐 Frontend will be available at: http://localhost:8501")
    
    try:
        # Wait a moment for Flask to start
        time.sleep(3)
        
        frontend_path = os.path.join(os.path.dirname(__file__), "frontend", "streamlit_app.py")
        
        # Run streamlit with simplified parameters
        subprocess.run([
            sys.executable, "-m", "streamlit", "run", frontend_path,
            "--server.port", "8501"
        ])
    except Exception as e:
        print(f"❌ Error starting Streamlit: {e}")

def run_reminder_service():
    """Run reminder service in background"""
    print("⏰ Starting reminder service...")
    
    try:
        time.sleep(5)  # Wait for API to be ready
        
        import schedule
        import requests
        from datetime import datetime
        
        def check_reminders():
            try:
                response = requests.get("http://localhost:8000/reminders/pending", timeout=5)
                if response.status_code == 200:
                    pending_tasks = response.json()
                    for task in pending_tasks:
                        print(f"⚠️ REMINDER: Task '{task['title']}' is due soon!")
                        
                        # Try to send desktop notification
                        try:
                            from plyer import notification
                            due_date = datetime.fromisoformat(task["due_date"]) if task["due_date"] else None
                            
                            if due_date:
                                time_left = due_date - datetime.now()
                                
                                if time_left.total_seconds() < 0:
                                    time_msg = "OVERDUE!"
                                else:
                                    hours = int(time_left.total_seconds() // 3600)
                                    minutes = int((time_left.total_seconds() % 3600) // 60)
                                    if hours > 0:
                                        time_msg = f"due in {hours}h {minutes}m"
                                    else:
                                        time_msg = f"due in {minutes}m"
                            else:
                                time_msg = "due soon"
                            
                            notification.notify(
                                title="📋 Task Reminder",
                                message=f"'{task['title']}' is {time_msg}",
                                timeout=10
                            )
                        except:
                            pass  # Desktop notifications might not work on all systems
                        
                        # Mark as reminder sent
                        requests.put(f"http://localhost:8000/tasks/{task['id']}", 
                                   json={"is_reminder_set": False}, timeout=5)
            except:
                pass  # Silently handle connection errors
        
        # Check every 10 minutes
        schedule.every(10).minutes.do(check_reminders)
        
        while True:
            schedule.run_pending()
            time.sleep(60)
            
    except Exception as e:
        print(f"⚠️ Reminder service error: {e}")

def signal_handler(signum, frame):
    """Handle Ctrl+C gracefully"""
    print("\n🛑 Shutting down Task Reminder System...")
    sys.exit(0)

def main():
    print("🎯 Task Reminder System - Starting All Services")
    print("=" * 50)
    
    # Set up signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    
    try:
        # Pre-initialize the app context to ensure database schema is created
        with flask_app.app_context():
            print(f"Pre-initializing database schema in {flask_app.config['SQLALCHEMY_DATABASE_URI']}...")
            db.create_all()
            print("Database schema pre-initialized.")

        # Run Flask in the main process (remove multiprocessing for now)
        flask_process = threading.Thread(target=run_flask, daemon=True)
        flask_process.start()
        
        # Start reminder service in a separate thread
        reminder_thread = threading.Thread(target=run_reminder_service, daemon=True)
        reminder_thread.start()
        
        # Start Streamlit (this will block until Streamlit exits)
        run_streamlit()
        
    except KeyboardInterrupt:
        print("\n🛑 Received shutdown signal...")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        print("✅ Task Reminder System stopped.")

if __name__ == "__main__":
    main()