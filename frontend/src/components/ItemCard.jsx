import { Link } from 'react-router-dom';
import { money, timeLeft, CONDITION_LABELS, TYPE_LABELS } from '../utils/format.js';

/** Product card used on every listing grid. `actions` renders extra controls under the card. */
export default function ItemCard({ item, actions }) {
  const cover = item.images?.[0]?.url;
  const a = item.auction;
  const inactive = item.status !== 'available';

  return (
    <article className="item-card">
      <Link to={`/items/${item.id}`} className="item-thumb">
        {cover ? <img src={cover} alt={item.title} loading="lazy" /> : <div className="no-img">No image</div>}
        <span className={`badge badge-type type-${item.listingType}`}>{TYPE_LABELS[item.listingType]}</span>
        {inactive && <span className={`badge badge-status status-${item.status}`}>{item.status}</span>}
      </Link>
      <div className="item-body">
        <Link to={`/items/${item.id}`} className="item-title">{item.title}</Link>
        <div className="item-meta">{CONDITION_LABELS[item.condition]}{item.category?.name ? ` · ${item.category.name}` : ''}</div>
        {a ? (
          <div className="item-price">
            {money(a.currentPrice)} <small>{a.bidCount ? `${a.bidCount} bid${a.bidCount > 1 ? 's' : ''}` : 'starting bid'} · {timeLeft(a.endsAt)}</small>
          </div>
        ) : item.price !== null ? (
          <div className="item-price">{money(item.price)}{item.listingType === 'both' && <small> or exchange</small>}</div>
        ) : (
          <div className="item-price exch">Exchange only</div>
        )}
      </div>
      {actions && <div className="item-actions">{actions}</div>}
    </article>
  );
}
