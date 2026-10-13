from pydantic import BaseModel, Field
from typing import Literal

MealType = Literal["breakfast", "lunch", "dinner"]

class AttendanceRequest(BaseModel):
    qr_token: str = Field(min_length=1, max_length=120)
    meal_type: MealType

class BillCreate(BaseModel):
    roll_no: str
    period: str = Field(pattern=r"^\d{4}-\d{2}$")

class PaymentOrderRequest(BaseModel):
    bill_id: int
