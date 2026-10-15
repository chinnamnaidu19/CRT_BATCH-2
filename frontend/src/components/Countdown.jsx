import { useEffect, useState } from 'react';
import { timeLeft } from '../utils/format.js';

export default function Countdown({ endsAt }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 15000); return () => clearInterval(t); }, []);
  return <span>{timeLeft(endsAt)}</span>;
}
