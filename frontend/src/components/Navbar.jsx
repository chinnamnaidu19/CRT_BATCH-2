import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { unread } = useNotifications();
  const navigate = useNavigate();

  const handleLogout = async () => { await logout(); navigate('/'); };
  const closeMenu = (e) => e.currentTarget.closest('details')?.removeAttribute('open');

  return (
    <header className="navbar">
      <Link to="/" className="brand">Edu<span>Swap</span></Link>
      <nav>
        <Link to="/browse">Browse</Link>
        {!user && (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/register" className="btn btn-primary">Sign up</Link>
          </>
        )}
        {user && (
          <>
            <Link to="/messages">Messages</Link>
            <Link to="/notifications" className="bell" aria-label={`Notifications (${unread} unread)`}>🔔{unread > 0 && <span className="count">{unread > 99 ? '99+' : unread}</span>}</Link>
            <details className="menu">
              <summary>My EduSwap ▾</summary>
              <div className="menu-list" onClick={closeMenu}>
                <Link to="/dashboard">Dashboard</Link>
                <Link to="/my-listings">My listings</Link>
                <Link to="/requests">Requests</Link>
                <Link to="/transactions">Transactions</Link>
                <Link to="/wishlist">Wishlist</Link>
                <Link to="/profile">Profile</Link>
                {user.role === 'admin' && <Link to="/admin">Admin</Link>}
              </div>
            </details>
            <Link to="/listings/new" className="btn btn-primary">+ Sell</Link>
            <button className="btn btn-outline" onClick={handleLogout}>Log out</button>
          </>
        )}
      </nav>
    </header>
  );
}
