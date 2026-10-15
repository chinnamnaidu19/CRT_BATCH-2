import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ListingForm from '../components/ListingForm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getItem, updateItem } from '../services/itemService.js';

export default function EditListing() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { getItem(id).then(setItem).catch((e) => setError(e.message)); }, [id]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!item) return <p className="center-note">Loading…</p>;
  // UI courtesy only: the API itself rejects edits from anyone but the owner.
  if (item.owner.id !== user.id) return <div className="alert alert-error">You can only edit your own listings.</div>;
  if (item.status !== 'available') return <div className="alert alert-error">This listing is {item.status} and can no longer be edited.</div>;

  return (
    <div className="narrow">
      <h2>Edit listing</h2>
      <ListingForm initial={item} submitLabel="Save changes" onSubmit={async (fd) => { await updateItem(id, fd); navigate(`/items/${id}`); }} />
    </div>
  );
}
