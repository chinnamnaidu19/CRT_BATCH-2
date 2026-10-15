export const CURRENCY = '₹'; // change here to switch the currency symbol everywhere

export const money = (n) =>
  `${CURRENCY}${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const CONDITION_LABELS = { like_new: 'Like New', good: 'Good', fair: 'Fair' };
export const TYPE_LABELS = { sale: 'For Sale', exchange: 'For Exchange', both: 'Sale or Exchange', auction: 'Auction' };

export function timeLeft(iso) {
  const mins = Math.floor((new Date(iso) - Date.now()) / 60000);
  if (mins <= 0) return 'Ended';
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export const formatDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
