import { useNavigate } from 'react-router-dom';
import ListingForm from '../components/ListingForm.jsx';
import { createItem } from '../services/itemService.js';

export default function AddListing() {
  const navigate = useNavigate();
  return (
    <div className="narrow">
      <h2>List an item</h2>
      <ListingForm submitLabel="Publish listing" onSubmit={async (fd) => { const { item } = await createItem(fd); navigate(`/items/${item.id}`); }} />
    </div>
  );
}
