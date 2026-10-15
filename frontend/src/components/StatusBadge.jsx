export default function StatusBadge({ status }) {
  return <span className={`badge st-${status}`}>{String(status).replace('_', ' ')}</span>;
}
