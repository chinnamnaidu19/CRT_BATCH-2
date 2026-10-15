import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const initial = { fullName: '', email: '', college: '', department: '', academicYear: '1', password: '', confirmPassword: '' };

// Frontend checks are for convenience only; the backend re-validates everything.
function validate(f) {
  if (f.fullName.trim().length < 2) return 'Enter your full name';
  if (!/^\S+@\S+\.\S+$/.test(f.email)) return 'Enter a valid email address';
  if (f.college.trim().length < 2) return 'Enter your college name';
  if (f.department.trim().length < 2) return 'Enter your department';
  if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password))
    return 'Password must be at least 8 characters with a letter and a number';
  if (f.password !== f.confirmPassword) return 'Passwords do not match';
  return '';
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    const problem = validate(form);
    if (problem) return setError(problem);
    setError('');
    setBusy(true);
    try {
      await register({ ...form, academicYear: Number(form.academicYear) });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card">
      <h2>Create your account</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={onSubmit}>
        <label>Full name<input name="fullName" value={form.fullName} onChange={onChange} required /></label>
        <label>Email<input name="email" type="email" value={form.email} onChange={onChange} required autoComplete="email" /></label>
        <label>College name<input name="college" value={form.college} onChange={onChange} required /></label>
        <label>Department<input name="department" value={form.department} onChange={onChange} required /></label>
        <label>Academic year
          <select name="academicYear" value={form.academicYear} onChange={onChange}>
            {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </label>
        <label>Password<input name="password" type="password" value={form.password} onChange={onChange} required autoComplete="new-password" /></label>
        <label>Confirm password<input name="confirmPassword" type="password" value={form.confirmPassword} onChange={onChange} required autoComplete="new-password" /></label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
      </form>
      <p className="muted">Already registered? <Link to="/login">Log in</Link></p>
    </div>
  );
}
