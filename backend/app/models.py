from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

def utcnow():
    return datetime.now(timezone.utc)

class Student(Base):
    __tablename__ = "students"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    roll_no: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    room: Mapped[str] = mapped_column(String(30))
    qr_token: Mapped[str] = mapped_column(String(120), unique=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    attendance = relationship("MealAttendance", back_populates="student")
    ledger = relationship("MealLedger", back_populates="student")

class MealRate(Base):
    __tablename__ = "meal_rates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meal_type: Mapped[str] = mapped_column(String(20), unique=True)
    amount_paise: Mapped[int] = mapped_column(Integer)

class MealAttendance(Base):
    __tablename__ = "meal_attendance"
    __table_args__ = (UniqueConstraint("student_id", "meal_type", "meal_date", name="uq_student_meal_day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    meal_type: Mapped[str] = mapped_column(String(20))
    meal_date: Mapped[str] = mapped_column(String(10), index=True)
    method: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    student = relationship("Student", back_populates="attendance")

class MealLedger(Base):
    __tablename__ = "meal_ledger"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    attendance_id: Mapped[int] = mapped_column(ForeignKey("meal_attendance.id"), unique=True)
    description: Mapped[str] = mapped_column(String(100))
    amount_paise: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    student = relationship("Student", back_populates="ledger")

class Bill(Base):
    __tablename__ = "bills"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    period: Mapped[str] = mapped_column(String(7), index=True)
    total_paise: Mapped[int] = mapped_column(Integer)
    paid_paise: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="unpaid")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id"), index=True)
    provider_order_id: Mapped[str] = mapped_column(String(100), unique=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    amount_paise: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="created")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
