import { NavLink, Outlet } from 'react-router-dom';

const LINKS = [['/admin', 'Dashboard', true], ['/admin/users', 'Students'], ['/admin/listings', 'Listings'], ['/admin/requests', 'Requests'], ['/admin/reports', 'Reports'], ['/admin/stats', 'Statistics']];

export default function AdminLayout() {
  return (
    <div className="admin">
      <nav className="admin-nav card" aria-label="Admin">
        <strong className="admin-title">Admin</strong>
        {LINKS.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
      </nav>
      <div className="admin-main"><Outlet /></div>
    </div>
  );
}
