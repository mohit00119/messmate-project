# Manual MVP test checklist

- [ ] `GET /api/health` returns `{"status":"ok","app":"MessMate"}`
- [ ] `GET /api/students` returns 3 seeded demo students
- [ ] `POST /api/attendance` with `{"qr_token":"demo-STU001","meal_type":"lunch"}` records a charge
- [ ] Repeat the same student + meal on the same date; expect HTTP 409
- [ ] `GET /api/ledger/STU001` shows the meal charge
- [ ] `POST /api/bills` with `{"roll_no":"STU001","period":"YYYY-MM"}` creates a bill
- [ ] Without Razorpay keys, order endpoint returns a clear HTTP 503
- [ ] With Test API keys, complete a test checkout and confirm backend signature verification
