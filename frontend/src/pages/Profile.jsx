import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import ItemCard from '../components/ItemCard.jsx';
import ReportButton from '../components/ReportButton.jsx';
import * as userService from '../services/userService.js';
import { startConversation } from '../services/flowService.js';
import { formatDate } from '../utils/format.js';

const Stars = ({ value }) => <span className="stars" aria-label={`${value} out of 5`}>{'★'.repeat(Math.round(value))}{'☆'.repeat(5 - Math.round(value))}</span>;

/** /profile shows (and lets you edit) your own profile; /users/:id shows any student's public profile. */
export default function Profile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const profileId = id ? Number(id) : user.id;
  const isOwn = profileId === user?.id;

  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [form, setForm] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const fileInput = useRef(null);

  const load = () => userService.getProfile(profileId).then((p) => { setProfile(p); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { setProfile(null); load(); /* eslint-disable-next-line */ }, [profileId]);
  useEffect(() => { if (isOwn && user) setForm({ fullName: user.fullName, college: user.college, department: user.department, academicYear: user.academicYear }); }, [isOwn, user]);

  const flash = (type, text) => setMsg({ type, text });
  const message = async () => { try { navigate(`/messages/${await startConversation(profileId)}`); } catch (err) { flash('error', err.message); } };

  const saveProfile = async (e) => {
    e.preventDefault();
    try { const r = await userService.updateMe({ ...form, academicYear: Number(form.academicYear) }); setUser(r.user); flash('success', r.message); load(); }
    catch (err) { flash('error', err.message); }
  };
  const savePassword = async (e) => {
    e.preventDefault();
    try { const r = await userService.changePassword(pw); setPw({ currentPassword: '', newPassword: '' }); flash('success', r.message); }
    catch (err) { flash('error', err.message); }
  };
  const pickAvatar = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return flash('error', 'Use a JPEG, PNG or WebP image');
    if (file.size > 2 * 1024 * 1024) return flash('error', 'Image must be 2 MB or smaller');
    try { const r = await userService.uploadAvatar(file); setUser(r.user); flash('success', r.message); load(); }
    catch (err) { flash('error', err.message); }
  };

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!profile) return <p className="center-note">Loading…</p>;

  const listingsAsItems = profile.activeListings.map((l) => ({ ...l, condition: l.condition, images: l.cover ? [{ url: l.cover }] : [] }));

  return (
    <>
      <section className="card profile-head">
        <span className="avatar lg">{profile.profileImage ? <img src={profile.profileImage} alt="" /> : profile.fullName[0]}</span>
        <div>
          <h2>{profile.fullName}</h2>
          <p className="muted">{profile.department} · Year {profile.academicYear} · {profile.college}</p>
          <p className="muted small">Member since {formatDate(profile.memberSince)}</p>
          {!isOwn && <div className="actions"><button className="btn btn-primary btn-sm" onClick={message}>✉ Message</button><ReportButton userId={profileId} /></div>}
          {isOwn && <><button className="btn btn-outline btn-sm" onClick={() => fileInput.current.click()}>Change photo</button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickAvatar} /></>}
        </div>
        <div className="stats">
          <div><strong>{profile.activeListings.length}</strong><span>Active listings</span></div>
          <div><strong>{profile.completedTransactions}</strong><span>Completed deals</span></div>
          <div><strong>{profile.rating.average ?? '–'}</strong><span>{profile.rating.count ? `${profile.rating.count} review${profile.rating.count > 1 ? 's' : ''}` : 'No reviews yet'}</span></div>
        </div>
      </section>

      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <h3>Active listings</h3>
      {listingsAsItems.length ? <div className="grid">{listingsAsItems.map((i) => <ItemCard key={i.id} item={i} />)}</div> : <p className="muted">No active listings.</p>}

      <h3>Reviews</h3>
      {profile.reviews.length ? profile.reviews.map((r) => (
        <div className="card review" key={r.id}>
          <Stars value={r.rating} /> <strong>{r.reviewerName}</strong> <span className="muted small">{formatDate(r.createdAt)}</span>
          {r.comment && <p>{r.comment}</p>}
        </div>
      )) : <p className="muted">No reviews yet.</p>}

      {isOwn && form && (
        <div className="two-col">
          <form className="card" onSubmit={saveProfile}>
            <h3>Edit profile</h3>
            <label>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
            <label>College<input value={form.college} onChange={(e) => setForm({ ...form, college: e.target.value })} required /></label>
            <label>Department<input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required /></label>
            <label>Academic year
              <select value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })}>
                {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </label>
            <button className="btn btn-primary">Save profile</button>
          </form>
          <form className="card" onSubmit={savePassword}>
            <h3>Change password</h3>
            <label>Current password<input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" required /></label>
            <label>New password<input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" required /></label>
            <p className="muted small">At least 8 characters with a letter and a number.</p>
            <button className="btn btn-primary">Change password</button>
          </form>
        </div>
      )}
    </>
  );
}
