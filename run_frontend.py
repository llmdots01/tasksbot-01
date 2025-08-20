#!/usr/bin/env python3
"""
Script to run the Streamlit frontend application
"""

import subprocess
import sys
import os

def main():
    print("🎨 Starting Streamlit Frontend...")
    print("📱 Frontend will be available at http://localhost:8501")
    print("📡 Make sure the FastAPI backend is running on http://localhost:8000")
    print("Press Ctrl+C to stop the frontend")
    
    try:
        # Run Streamlit
        subprocess.run([
            sys.executable, "-m", "streamlit", "run", 
            "frontend/streamlit_app.py",
            "--server.port", "8501",
            "--server.address", "0.0.0.0"
        ])
    except KeyboardInterrupt:
        print("\n🛑 Stopping frontend...")
        print("✅ Frontend stopped successfully")

if __name__ == "__main__":
    main() 