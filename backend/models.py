from sqlalchemy import Column, Integer, String, DateTime
from database import Base
import datetime

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String, unique=True, index=True) # ID from Bunq
    date = Column(String)
    merchant = Column(String)
    amount = Column(String)
    currency = Column(String)
    description = Column(String, nullable=True)
    synced_at = Column(DateTime, default=datetime.datetime.utcnow)
