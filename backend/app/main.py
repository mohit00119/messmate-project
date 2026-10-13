from datetime import date
import hmac
import hashlib
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
import razorpay

from .config import settings
from .database import Base, engine, get_db, SessionLocal
from .models import Student, MealRate, MealAttendance, MealLedger, Bill, Payment
from .schemas import AttendanceRequest, BillCreate, PaymentOrderRequest

app = FastAPI(title="MessMate API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://127.0.0.1:5173"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
Base.metadata.create_all(bind=engine)

def seed():
    db = SessionLocal()
    try:
        if db.scalar(select(func.count(Student.id))) == 0:
            db.add_all([
                Student(roll_no="STU001", name="Aarav Sharma", room="A-101", qr_token="demo-STU001"),
                Student(roll_no="STU002", name="Priya Verma", room="A-102", qr_token="demo-STU002"),
                Student(roll_no="STU003", name="Kabir Singh", room="B-201", qr_token="demo-STU003"),
            ])
        if db.scalar(select(func.count(MealRate.id))) == 0:
            db.add_all([
                MealRate(meal_type="breakfast", amount_paise=3000),
                MealRate(meal_type="lunch", amount_paise=6000),
                MealRate(meal_type="dinner", amount_paise=5000),
            ])
        db.commit()
    finally:
        db.close()

seed()

def rupees(paise: int) -> float:
    return round(paise / 100, 2)

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "MessMate"}

@app.get("/api/students")
def list_students(db: Session = Depends(get_db)):
    return [{"id": s.id, "roll_no": s.roll_no, "name": s.name, "room": s.room}
            for s in db.scalars(select(Student).order_by(Student.roll_no)).all()]

@app.get("/api/rates")
def list_rates(db: Session = Depends(get_db)):
    return [{"meal_type": r.meal_type, "amount": rupees(r.amount_paise)}
            for r in db.scalars(select(MealRate).order_by(MealRate.id)).all()]

@app.post("/api/attendance")
def mark_attendance(body: AttendanceRequest, db: Session = Depends(get_db)):
    student = db.scalar(select(Student).where(Student.qr_token == body.qr_token, Student.active.is_(True)))
    if not student:
        raise HTTPException(404, "Student QR token not found or inactive")
    today = date.today().isoformat()
    rate = db.scalar(select(MealRate).where(MealRate.meal_type == body.meal_type))
    if not rate:
        raise HTTPException(400, "Meal rate is not configured")
    attendance = MealAttendance(student_id=student.id, meal_type=body.meal_type,
                                meal_date=today, method="qr")
    db.add(attendance)
    try:
        db.flush()
        db.add(MealLedger(student_id=student.id, attendance_id=attendance.id,
                          description=f"{body.meal_type.title()} - {today}",
                          amount_paise=rate.amount_paise))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Attendance already recorded for this meal today")
    return {"message": "Attendance recorded", "student": student.name,
            "roll_no": student.roll_no, "meal_type": body.meal_type,
            "charge": rupees(rate.amount_paise), "date": today}

@app.get("/api/attendance/today")
def today_attendance(db: Session = Depends(get_db)):
    today = date.today().isoformat()
    rows = db.execute(
        select(MealAttendance, Student).join(Student).where(MealAttendance.meal_date == today)
        .order_by(MealAttendance.id.desc())
    ).all()
    return [{"id": a.id, "student": s.name, "roll_no": s.roll_no, "room": s.room,
             "meal_type": a.meal_type, "method": a.method, "date": a.meal_date}
            for a, s in rows]

@app.get("/api/ledger/{roll_no}")
def student_ledger(roll_no: str, db: Session = Depends(get_db)):
    student = db.scalar(select(Student).where(Student.roll_no == roll_no))
    if not student:
        raise HTTPException(404, "Student not found")
    entries = db.scalars(select(MealLedger).where(MealLedger.student_id == student.id)
                         .order_by(MealLedger.id.desc())).all()
    total = sum(e.amount_paise for e in entries)
    return {"student": student.name, "roll_no": student.roll_no,
            "total_charges": rupees(total),
            "entries": [{"id": e.id, "description": e.description, "amount": rupees(e.amount_paise)}
                        for e in entries]}

@app.post("/api/bills")
def create_bill(body: BillCreate, db: Session = Depends(get_db)):
    student = db.scalar(select(Student).where(Student.roll_no == body.roll_no))
    if not student:
        raise HTTPException(404, "Student not found")
    existing = db.scalar(select(Bill).where(Bill.student_id == student.id, Bill.period == body.period))
    if existing:
        return bill_view(existing)
    entries = db.scalars(select(MealLedger).where(
        MealLedger.student_id == student.id,
        func.substr(MealLedger.created_at, 1, 7) == body.period
    )).all()
    # SQLite's DateTime serialization can vary; attendance date is the authoritative billing period.
    attendance_ids = select(MealAttendance.id).where(
        MealAttendance.student_id == student.id,
        MealAttendance.meal_date.startswith(body.period)
    )
    entries = db.scalars(select(MealLedger).where(
        MealLedger.student_id == student.id, MealLedger.attendance_id.in_(attendance_ids)
    )).all()
    total = sum(e.amount_paise for e in entries)
    bill = Bill(student_id=student.id, period=body.period, total_paise=total, paid_paise=0,
                status="unpaid" if total else "empty")
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return bill_view(bill)

def bill_view(b: Bill):
    return {"id": b.id, "student_id": b.student_id, "period": b.period,
            "total": rupees(b.total_paise), "paid": rupees(b.paid_paise),
            "due": rupees(max(0, b.total_paise - b.paid_paise)), "status": b.status}

@app.get("/api/bills")
def list_bills(db: Session = Depends(get_db)):
    bills = db.scalars(select(Bill).order_by(Bill.id.desc())).all()
    return [bill_view(b) for b in bills]

@app.post("/api/payments/order")
def create_payment_order(body: PaymentOrderRequest, db: Session = Depends(get_db)):
    bill = db.get(Bill, body.bill_id)
    if not bill:
        raise HTTPException(404, "Bill not found")
    due = bill.total_paise - bill.paid_paise
    if due <= 0:
        raise HTTPException(400, "Bill has no outstanding balance")
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(503, "Add Razorpay Test API keys to backend/.env first")
    client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    order = client.order.create(data={"amount": due, "currency": "INR",
                                      "receipt": f"messmate-bill-{bill.id}"})
    payment = Payment(bill_id=bill.id, provider_order_id=order["id"], amount_paise=due, status="created")
    db.add(payment)
    db.commit()
    return {"key_id": settings.razorpay_key_id, "order_id": order["id"],
            "amount": due, "currency": "INR", "bill_id": bill.id}

@app.post("/api/payments/verify")
def verify_payment(payload: dict, db: Session = Depends(get_db)):
    order_id = str(payload.get("razorpay_order_id", ""))
    payment_id = str(payload.get("razorpay_payment_id", ""))
    signature = str(payload.get("razorpay_signature", ""))
    if not all([order_id, payment_id, signature]):
        raise HTTPException(400, "Missing Razorpay checkout fields")
    if not settings.razorpay_key_secret:
        raise HTTPException(503, "Razorpay Test Secret is not configured")
    expected = hmac.new(settings.razorpay_key_secret.encode(),
                        f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(400, "Invalid payment signature")
    payment = db.scalar(select(Payment).where(Payment.provider_order_id == order_id))
    if not payment:
        raise HTTPException(404, "Payment order not found")
    if payment.status != "paid":
        bill = db.get(Bill, payment.bill_id)
        payment.provider_payment_id = payment_id
        payment.status = "paid"
        bill.paid_paise = min(bill.total_paise, bill.paid_paise + payment.amount_paise)
        bill.status = "paid" if bill.paid_paise >= bill.total_paise else "partial"
        db.commit()
    return {"message": "Payment verified", "status": payment.status,
            "bill": bill_view(db.get(Bill, payment.bill_id))}

@app.get("/api/payments")
def list_payments(db: Session = Depends(get_db)):
    rows = db.scalars(select(Payment).order_by(Payment.id.desc())).all()
    return [{"id": p.id, "bill_id": p.bill_id, "order_id": p.provider_order_id,
             "payment_id": p.provider_payment_id, "amount": rupees(p.amount_paise), "status": p.status}
            for p in rows]
