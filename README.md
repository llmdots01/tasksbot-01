# Task Reminder System

A comprehensive task management and reminder system built with FastAPI backend and Streamlit frontend.

## 🚀 Features

- **Task Management**: Create, read, update, and delete tasks
- **Priority Levels**: Set task priorities (low, medium, high)
- **Due Dates**: Set due dates for tasks with overdue tracking
- **Categories & Tags**: Organize tasks with categories and tags
- **Reminder System**: Set custom reminders for tasks
- **Status Tracking**: Track task status (pending, in_progress, completed)
- **Dashboard**: View task statistics and recent activities
- **Background Reminders**: Automatic reminder checking and notifications
- **Modern UI**: Beautiful Streamlit interface

## 📁 Project Structure

```
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI main application
│   ├── models.py            # SQLAlchemy models
│   ├── database.py          # Database configuration
│   ├── crud.py              # Database operations
│   └── schemas.py           # Pydantic schemas
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

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Notify_Me_Of_My_Everydaywork
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**

   **Option 1: Run both backend and frontend separately**
   
   Terminal 1 (Backend):
   ```bash
   python run_api.py
   ```
   
   Terminal 2 (Frontend):
   ```bash
   python run_frontend.py
   ```

   **Option 2: Run with uvicorn and streamlit directly**
   
   Terminal 1 (Backend):
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   
   Terminal 2 (Frontend):
   ```bash
   streamlit run frontend/streamlit_app.py --server.port 8501
   ```

## 🌐 Access Points

- **Frontend**: http://localhost:8501
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Interactive API Docs**: http://localhost:8000/redoc

## 📋 API Endpoints

### Tasks
- `GET /tasks/` - Get all tasks
- `POST /tasks/` - Create a new task
- `GET /tasks/{task_id}` - Get a specific task
- `PUT /tasks/{task_id}` - Update a task
- `DELETE /tasks/{task_id}` - Delete a task

### Task Properties
- **title** (required): Task title
- **description**: Task description
- **due_date**: Due date and time
- **priority**: low, medium, high
- **status**: pending, in_progress, completed
- **category**: Task category
- **tags**: Comma-separated tags
- **is_reminder_set**: Boolean for reminder status
- **reminder_time**: When to send reminder

## ⏰ Reminder System

The system includes a background reminder service that:

- Checks for due reminders every minute
- Logs reminders to `reminders.log`
- Supports multiple notification methods (email, SMS, webhooks, desktop)
- Can be extended with custom notification providers

### Reminder Logs
- Reminders are logged to `reminder_service.log`
- Individual reminders are logged to `reminders.log`

## 🎨 Frontend Features

### Dashboard
- Task statistics (total, pending, completed, overdue)
- Recent tasks overview
- Quick task management

### Task Management
- Add new tasks with all properties
- View and filter tasks by status, priority, and overdue status
- Mark tasks as complete
- Delete tasks
- Set reminders for tasks

### Reminder Management
- Set custom reminders for tasks
- View reminder status
- Manage reminder settings

## 🗄️ Database

The application uses SQLite as the default database:
- Database file: `task_reminder.db`
- Automatically created on first run
- Tables created automatically

## 🔧 Configuration

### Environment Variables
You can configure the application using environment variables:

```bash
# Database
DATABASE_URL=sqlite:///./task_reminder.db

# API Settings
API_HOST=0.0.0.0
API_PORT=8000

# Frontend Settings
FRONTEND_PORT=8501
```

### Customization
- **Notification Methods**: Extend `reminder_service.py` to add email, SMS, or webhook notifications
- **Database**: Change `database.py` to use PostgreSQL, MySQL, or other databases
- **UI**: Customize the Streamlit interface in `streamlit_app.py`

## 🚀 Deployment

### Local Development
```bash
# Install dependencies
pip install -r requirements.txt

# Run backend
python run_api.py

# Run frontend (in another terminal)
python run_frontend.py
```

### Production Deployment
1. Use a production WSGI server like Gunicorn
2. Set up a reverse proxy (Nginx)
3. Use a production database (PostgreSQL)
4. Configure environment variables
5. Set up proper logging

## 📝 Usage Examples

### Creating a Task via API
```bash
curl -X POST "http://localhost:8000/tasks/" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Complete project report",
       "description": "Finish the quarterly project report",
       "due_date": "2024-01-15T17:00:00",
       "priority": "high",
       "category": "Work",
       "tags": "report,quarterly,deadline"
     }'
```

### Setting a Reminder
```bash
curl -X PUT "http://localhost:8000/tasks/1" \
     -H "Content-Type: application/json" \
     -d '{
       "is_reminder_set": true,
       "reminder_time": "2024-01-15T16:00:00"
     }'
```

## 🐛 Troubleshooting

### Common Issues

1. **Port already in use**
   - Change ports in `run_api.py` or `run_frontend.py`
   - Kill existing processes using the ports

2. **Database errors**
   - Delete `task_reminder.db` to reset the database
   - Check database permissions

3. **Import errors**
   - Ensure all dependencies are installed: `pip install -r requirements.txt`
   - Check Python path and virtual environment

4. **Frontend not connecting to backend**
   - Ensure backend is running on http://localhost:8000
   - Check CORS settings in `app/main.py`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation at http://localhost:8000/docs
- Review the logs in `reminder_service.log` and `reminders.log` 