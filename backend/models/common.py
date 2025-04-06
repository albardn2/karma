import uuid
from datetime import datetime

import bcrypt
from sqlalchemy import create_engine, Column, String, DateTime, Text, Float
from sqlalchemy.orm import declarative_base, sessionmaker

from models.base import Base

class User(Base):
    __tablename__ = 'user'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), nullable=False, unique=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    password = Column(String(128), nullable=False)
    email = Column(String(120), nullable=True, unique=True)
    permission_scope = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    phone_number = Column(String(256), nullable=True)

    # Method to set password securely
    def set_password(self, plaintext_password):
        hashed_pw = bcrypt.hashpw(
            plaintext_password.encode('utf-8'),
            bcrypt.gensalt()
        )
        self.password = hashed_pw.decode('utf-8')

    # Method to verify password securely
    def verify_password(self, plaintext_password):
        return bcrypt.checkpw(
            plaintext_password.encode('utf-8'),
            self.password.encode('utf-8')
        )


