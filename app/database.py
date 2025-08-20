def get_db():
    """Provide a database session using Flask-SQLAlchemy."""
    from app import db  # Import db inside the function
    session = db.session()
    try:
        yield session
    finally:
        session.close()