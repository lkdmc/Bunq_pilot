from sqlalchemy import Column, Integer, String, Float, DateTime
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
    attachment_id = Column(Integer, nullable=True)  # Bunq attachment integer ID
    synced_at = Column(DateTime, default=datetime.datetime.utcnow)

class ReceiptItem(Base):
    __tablename__ = "receipt_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    transaction_id = Column(String, index=True)
    name = Column(String)
    category = Column(String)
    subcategory = Column(String)
    amount = Column(Float)
