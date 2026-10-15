import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { createReport } from '../services/flowService.js';

const REASONS = [['spam', 'Spam'], ['inappropriate', 'Inappropriate content'], ['fraud', 'Fraud or fake item'], ['wrong_category', 'Wrong category'], ['other', 'Other']];

/** Report a listing (itemId) or a student (userId). Hidden for logged-out visitors. */
export default function ReportButton({ itemId, userId }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [msg, setMsg] = useState(null);
  if (!user) return null;

  const submit = async (e) => {
    e.preventDefault();
    try { const r = await createReport({ itemId, userId, reason, details }); setMsg({ ok: true, text: r.message }); setOpen(false); }
    catch (err) { setMsg({ ok: false, text: err.message }); }
  };

  return (
    <div className="report">
      {!open && <button className="link-btn" onClick={() => { setOpen(true); setMsg(null); }}>⚑ Report</button>}
      {msg && <span className={msg.ok ? 'ok-text small' : 'err-text small'}> {msg.text}</span>}
      {open && (
        <form className="card report-form" onSubmit={submit}>
          <label>Reason<select value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Details (optional)<textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} /></label>
          <div className="actions"><button className="btn btn-primary btn-sm">Submit report</button><button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}
