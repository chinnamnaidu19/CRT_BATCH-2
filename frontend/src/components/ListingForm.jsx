import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getCategories } from '../services/itemService.js';
import ImageUploader, { MAX_IMAGES } from './ImageUploader.jsx';
import { CONDITION_LABELS, TYPE_LABELS, CURRENCY } from '../utils/format.js';

const DURATIONS = [[1, '1 hour'], [6, '6 hours'], [12, '12 hours'], [24, '1 day'], [48, '2 days'], [72, '3 days'], [120, '5 days'], [168, '7 days'], [336, '14 days']];

/** Shared by Add and Edit pages. `initial` is an existing item (edit mode) or null (create mode). */
export default function ListingForm({ initial, submitLabel, onSubmit }) {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    categoryId: initial?.category.id || '',
    listingType: initial?.listingType || 'sale',
    condition: initial?.condition || 'good',
    price: initial?.price ?? '',
    college: initial?.college || user.college,
    startingPrice: initial?.auction?.startingPrice ?? '',
    minIncrement: initial?.auction?.minIncrement ?? 10,
    durationHours: 72,
  });
  const [existing, setExisting] = useState(initial?.images || []);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getCategories().then(setCategories).catch((e) => setError(e.message)); }, []);

  const isEdit = Boolean(initial);
  const lockedType = isEdit; // the listing type cannot change after creation
  const auctionLocked = isEdit && initial.auction?.bidCount > 0; // prices freeze once bidding starts
  const type = form.listingType;
  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  function check() {
    if (form.title.trim().length < 3) return 'Enter a title (at least 3 characters)';
    if (form.description.trim().length < 10) return 'Description must be at least 10 characters';
    if (!form.categoryId) return 'Choose a category';
    if (existing.length + files.length < 1) return 'Please add at least one photo of the item';
    if ((type === 'sale' || type === 'both') && !(Number(form.price) > 0)) return 'Enter a valid price';
    if (type === 'auction') {
      if (!(Number(form.startingPrice) > 0)) return 'Enter a valid starting price';
      if (!(Number(form.minIncrement) > 0)) return 'Enter a valid minimum bid increment';
    }
    return '';
  }

  const submit = async (e) => {
    e.preventDefault();
    const problem = check();
    if (problem) return setError(problem);
    setError('');

    const fd = new FormData();
    ['title', 'description', 'categoryId', 'listingType', 'condition', 'college'].forEach((k) => fd.append(k, form[k]));
    if (type === 'sale' || type === 'both') fd.append('price', form.price);
    if (type === 'auction') {
      fd.append('startingPrice', form.startingPrice);
      fd.append('minIncrement', form.minIncrement);
      if (!isEdit) fd.append('durationHours', form.durationHours);
    }
    existing.forEach((img) => fd.append('keepImageIds', img.id));
    files.forEach((f) => fd.append('images', f));

    setBusy(true);
    try {
      await onSubmit(fd);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="card listing-form" onSubmit={submit}>
      {error && <div className="alert alert-error">{error}</div>}

      <label>Photos</label>
      <ImageUploader
        existing={existing} files={files} onError={setError}
        onRemoveExisting={(id) => setExisting(existing.filter((i) => i.id !== id))}
        onAddFiles={(f) => setFiles([...files, ...f].slice(0, MAX_IMAGES - existing.length))}
        onRemoveFile={(i) => setFiles(files.filter((_, idx) => idx !== i))}
      />

      <label>Title<input name="title" value={form.title} onChange={set} maxLength={150} required /></label>
      <label>Description<textarea name="description" rows={4} value={form.description} onChange={set} maxLength={2000} required /></label>

      <div className="row">
        <label>Category
          <select name="categoryId" value={form.categoryId} onChange={set} required>
            <option value="">Select…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Condition
          <select name="condition" value={form.condition} onChange={set}>
            {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      <label>How do you want to list it?
        <select name="listingType" value={type} onChange={set} disabled={lockedType}>
          {Object.entries(TYPE_LABELS).filter(([k]) => !isEdit || (k === 'auction') === (initial.listingType === 'auction')).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>

      {(type === 'sale' || type === 'both') && (
        <label>Price ({CURRENCY})<input name="price" type="number" min="1" step="0.01" value={form.price} onChange={set} required /></label>
      )}

      {type === 'auction' && (
        <div className="auction-box">
          <div className="row">
            <label>Starting bid ({CURRENCY})<input name="startingPrice" type="number" min="1" step="0.01" value={form.startingPrice} onChange={set} disabled={auctionLocked} required /></label>
            <label>Minimum increment ({CURRENCY})<input name="minIncrement" type="number" min="1" step="0.01" value={form.minIncrement} onChange={set} disabled={auctionLocked} required /></label>
          </div>
          {!isEdit && (
            <label>Auction length
              <select name="durationHours" value={form.durationHours} onChange={set}>
                {DURATIONS.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
              </select>
            </label>
          )}
          <p className="muted small">
            {auctionLocked ? 'Bidding has started, so prices can no longer be changed.' : 'Bidders must beat the current bid by at least the minimum increment. The auction ends automatically at the end time.'}
          </p>
        </div>
      )}

      <label>College / pickup location<input name="college" value={form.college} onChange={set} maxLength={150} /></label>

      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
