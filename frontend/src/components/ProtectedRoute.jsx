import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/** <ProtectedRoute> = any logged-in user. <ProtectedRoute role="admin"> = admins only.
 *  This only controls the UI; the server enforces the same rules on every API. */
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="center-note">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;
  return children;
}
