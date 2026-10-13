import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { Activity, BadgeIndianRupee, Camera, CheckCircle2, CreditCard, LayoutDashboard, ReceiptText, RefreshCw, ScanLine, ShieldCheck, Users, Utensils, Wallet } from 'lucide-react'
import './style.css'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0)
async function request(path, options={}) {
  const res = await fetch(`${API}${path}`, { headers: {'Content-Type':'application/json'}, ...options })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Request failed')
  return data
}

function App() {
  const [students, setStudents] = useState([])
  const [rates, setRates] = useState([])
  const [attendance, setAttendance] = useState([])
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [roll, setRoll] = useState('STU001')
  const [meal, setMeal] = useState('lunch')
  const [token, setToken] = useState('demo-STU001')
  const [period, setPeriod] = useState(new Date().toISOString().slice(0,7))
  const [ledger, setLedger] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [section, setSection] = useState('Overview')

  async function refresh() {
    try {
      const [s,r,a,b,p] = await Promise.all([
        request('/api/students'), request('/api/rates'), request('/api/attendance/today'),
        request('/api/bills'), request('/api/payments')
      ])
      setStudents(s); setRates(r); setAttendance(a); setBills(b); setPayments(p)
    } catch(e) { setError(`${e.message}. Is the FastAPI backend running?`) }
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => {
    if (!scanning) return
    const scanner = new Html5QrcodeScanner('qr-reader', { fps: 8, qrbox: {width: 220, height: 220} }, false)
    scanner.render(decoded => {
      setToken(decoded.trim())
      setScanning(false)
      scanner.clear().catch(()=>{})
      setNotice('QR captured. Confirm the meal to record attendance.')
    }, () => {})
    return () => { scanner.clear().catch(()=>{}) }
  }, [scanning])

  const todayTotal = attendance.length
  const chargesToday = useMemo(() => attendance.reduce((sum, a) => {
    const r = rates.find(x => x.meal_type === a.meal_type)
    return sum + (r?.amount || 0)
  }, 0), [attendance, rates])
  const pending = bills.reduce((sum,b) => sum + (b.due || 0), 0)
  const paid = bills.reduce((sum,b) => sum + (b.paid || 0), 0)

  async function markAttendance(e) {
    e?.preventDefault(); setError(''); setNotice('')
    try {
      const result = await request('/api/attendance', {method:'POST', body:JSON.stringify({qr_token:token, meal_type:meal})})
      setNotice(`${result.student}: ${meal} recorded. Charge ${money(result.charge)}.`)
      await refresh()
    } catch(e) { setError(e.message) }
  }
  async function loadLedger() {
    setError(''); setNotice('')
    try { setLedger(await request(`/api/ledger/${roll}`)) } catch(e) { setError(e.message) }
  }
  async function makeBill() {
    setError(''); setNotice('')
    try {
      const bill = await request('/api/bills', {method:'POST', body:JSON.stringify({roll_no:roll, period})})
      setNotice(`Bill #${bill.id} generated. Total ${money(bill.total)}.`)
      await refresh()
    } catch(e) { setError(e.message) }
  }
  async function payBill(bill) {
    setError(''); setNotice('')
    try {
      const order = await request('/api/payments/order', {method:'POST', body:JSON.stringify({bill_id:bill.id})})
      if (!window.Razorpay) {
        await new Promise((resolve,reject) => {
          const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'
          script.onload = resolve; script.onerror = reject; document.body.appendChild(script)
        })
      }
      const checkout = new window.Razorpay({
        key: order.key_id, amount: order.amount, currency: order.currency,
        name: 'MessMate Hostel Mess', description: `Mess bill ${bill.id}`,
        order_id: order.order_id,
        handler: async response => {
          try {
            const verified = await request('/api/payments/verify', {method:'POST', body:JSON.stringify(response)})
            setNotice(`Payment verified. Bill status: ${verified.bill.status}.`)
            await refresh()
          } catch(e) { setError(`Verification failed: ${e.message}`) }
        },
        modal: { ondismiss: () => setNotice('Checkout closed. No payment was marked as paid.') },
        theme: { color: '#22c7a9' }
      })
      checkout.open()
    } catch(e) { setError(e.message) }
  }

  const nav = [
    ['Overview',LayoutDashboard],['Attendance',ScanLine],['Students',Users],['Billing desk',ReceiptText],['Payments',CreditCard]
  ]
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Utensils size={21}/></div><div><b>MessMate</b><small>SMART DINING OS</small></div></div>
      <div className="workspace"><span className="live-dot"/> HOSTEL ADMIN <span className="chevron">⌄</span></div>
      <div className="nav-label">WORKSPACE</div>
      {nav.map(([name,Icon]) => <button key={name} className={`nav-item ${section===name?'active':''}`} onClick={()=>setSection(name)}><Icon size={18}/><span>{name}</span>{name==='Attendance'&&<i>{todayTotal}</i>}</button>)}
      <div className="sidebar-bottom"><div className="secure"><ShieldCheck size={18}/><div><b>Secure by design</b><small>Sandbox environment</small></div></div><div className="profile"><div className="avatar">AD</div><div><b>Mess Admin</b><small>Demo workspace</small></div><span>•••</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> <b>{section}</b></div><div className="top-actions"><span className="env-pill"><i/> TEST ENVIRONMENT</span><button className="icon-button" onClick={refresh} title="Refresh"><RefreshCw size={17}/></button><div className="avatar">AD</div></div></header>
      <div className="content">
        <div className="welcome"><div><div className="eyebrow">TUESDAY · MESS OPERATIONS</div><h1>{section === 'Overview' ? 'Mess overview' : section}</h1><p>Track meals, automate billing, keep your hostel running smoothly.</p></div><button className="button button-secondary" onClick={refresh}><RefreshCw size={16}/> Refresh data</button></div>
        {error && <div className="alert error">{error}<button onClick={()=>setError('')}>×</button></div>}
        {notice && <div className="alert success"><CheckCircle2 size={17}/>{notice}<button onClick={()=>setNotice('')}>×</button></div>}
        <div className="metrics">
          <Metric icon={Users} label="Registered students" value={students.length} foot="Active demo profiles" color="mint"/>
          <Metric icon={Utensils} label="Meals served today" value={todayTotal} foot="Verified meal entries" color="blue"/>
          <Metric icon={BadgeIndianRupee} label="Today's meal charges" value={money(chargesToday)} foot="Based on configured rates" color="purple"/>
          <Metric icon={Wallet} label="Outstanding bills" value={money(pending)} foot="Generated bills only" color="orange"/>
        </div>
        <div className="two-col">
          <section className="panel attendance-panel">
            <div className="panel-heading"><div><div className="eyebrow">MESS CHECK-IN</div><h2>Record a meal</h2></div><span className="status-chip"><span className="live-dot"/> Ready</span></div>
            <p className="muted">Scan a student's demo QR token or enter it manually to verify attendance.</p>
            <form onSubmit={markAttendance}>
              <label>QR token</label><div className="input-row"><input value={token} onChange={e=>setToken(e.target.value)} placeholder="e.g. demo-STU001" required/><button type="button" className="button button-secondary scan-button" onClick={()=>setScanning(!scanning)}><Camera size={17}/>{scanning?'Stop':'Scan'}</button></div>
              {scanning && <div className="scanner-box"><div id="qr-reader"/><small>Allow camera access. Use a QR code containing one of the demo tokens.</small></div>}
              <label>Meal session</label><div className="meal-options">{['breakfast','lunch','dinner'].map(m=><button type="button" key={m} className={`meal-option ${meal===m?'selected':''}`} onClick={()=>setMeal(m)}><span>{m==='breakfast'?'☀️':m==='lunch'?'🌤️':'🌙'}</span><b>{m[0].toUpperCase()+m.slice(1)}</b><small>{money(rates.find(r=>r.meal_type===m)?.amount)}</small></button>)}</div>
              <button className="button button-primary full-width" type="submit"><CheckCircle2 size={17}/> Verify & record meal</button>
            </form>
            <div className="hint"><ShieldCheck size={16}/><span>Duplicate meals are blocked by the database. Demo QR tokens are not secure for production use.</span></div>
          </section>
          <section className="panel">
            <div className="panel-heading"><div><div className="eyebrow">LIVE ACTIVITY</div><h2>Today's attendance</h2></div><span className="count-badge">{attendance.length} records</span></div>
            <div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>MEAL</th><th>METHOD</th></tr></thead><tbody>
              {attendance.slice(0,7).map(a=><tr key={a.id}><td><b>{a.student}</b><small>{a.roll_no} · {a.room}</small></td><td><span className="meal-tag">{a.meal_type}</span></td><td><span className="method"><CheckCircle2 size={13}/> {a.method}</span></td></tr>)}
              {!attendance.length&&<tr><td colSpan="3"><div className="empty"><Activity size={23}/><b>No meals recorded today</b><small>Record a demo meal to see activity here.</small></div></td></tr>}
            </tbody></table></div>
            <div className="panel-footer"><span>Showing latest entries</span><button className="text-button" onClick={()=>setSection('Attendance')}>View attendance →</button></div>
          </section>
        </div>
        <div className="two-col lower-grid">
          <section className="panel">
            <div className="panel-heading"><div><div className="eyebrow">STUDENT ACCOUNT</div><h2>Meal ledger</h2></div><ReceiptText size={20} className="muted-icon"/></div>
            <div className="form-grid"><div><label>Student</label><select value={roll} onChange={e=>{setRoll(e.target.value);setLedger(null)}}>{students.map(s=><option value={s.roll_no} key={s.id}>{s.name} ({s.roll_no})</option>)}</select></div><div><label>Billing month</label><input type="month" value={period} onChange={e=>setPeriod(e.target.value)}/></div></div>
            <div className="action-row"><button className="button button-secondary" onClick={loadLedger}>View ledger</button><button className="button button-primary" onClick={makeBill}>Generate bill</button></div>
            {ledger && <div className="ledger-result"><div className="ledger-total"><span>{ledger.student} · {ledger.roll_no}</span><b>{money(ledger.total_charges)}</b></div>{ledger.entries.slice(0,5).map(e=><div className="ledger-entry" key={e.id}><span>{e.description}</span><b>{money(e.amount)}</b></div>)}{!ledger.entries.length&&<small>No meal charges yet.</small>}</div>}
          </section>
          <section className="panel">
            <div className="panel-heading"><div><div className="eyebrow">BILLING QUEUE</div><h2>Recent bills</h2></div><span className="count-badge">{bills.length} bills</span></div>
            <div className="bill-list">{bills.slice(0,5).map(b=><div className="bill-item" key={b.id}><div className="bill-icon"><ReceiptText size={18}/></div><div className="bill-info"><b>Bill #{b.id} · {b.period}</b><small>{students.find(s=>s.id===b.student_id)?.name || `Student #${b.student_id}`}</small></div><div className="bill-amount"><b>{money(b.total)}</b><small className={b.due>0?'due':'paid'}>{b.due>0?`${money(b.due)} due`:'Paid'}</small></div>{b.due>0&&<button className="mini-pay" onClick={()=>payBill(b)} title="Pay with Razorpay"><CreditCard size={16}/></button>}</div>)}
              {!bills.length&&<div className="empty"><ReceiptText size={23}/><b>No bills yet</b><small>Choose a student and generate a monthly bill.</small></div>}
            </div>
            <div className="panel-footer"><span>Razorpay Test Mode</span><span className="secure-note"><ShieldCheck size={14}/> Server verified</span></div>
          </section>
        </div>
        <section className="panel payment-panel">
          <div className="panel-heading"><div><div className="eyebrow">TRANSACTION MONITOR</div><h2>Payment activity</h2></div><span className="count-badge">{payments.length} transactions</span></div>
          <div className="table-wrap"><table><thead><tr><th>BILL</th><th>ORDER REFERENCE</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>
            {payments.slice(0,6).map(p=><tr key={p.id}><td>#{p.bill_id}</td><td className="mono">{p.order_id}</td><td><b>{money(p.amount)}</b></td><td><span className={`payment-status ${p.status}`}>{p.status}</span></td></tr>)}
            {!payments.length&&<tr><td colSpan="4" className="muted table-empty">Payments will appear here after a Razorpay test checkout.</td></tr>}
          </tbody></table></div>
        </section>
        <footer>MessMate MVP <span>•</span> Demo data only <span>•</span> Payments in test mode</footer>
      </div>
    </main>
  </div>
}

function Metric({icon:Icon,label,value,foot,color}) {
  return <div className="metric-card"><div className={`metric-icon ${color}`}><Icon size={19}/></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot"><span className="tiny-dot"/> {foot}</div></div>
}
createRoot(document.getElementById('root')).render(<App/>)
