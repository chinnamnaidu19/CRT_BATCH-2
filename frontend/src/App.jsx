import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Browse from './pages/Browse.jsx';
import ItemDetails from './pages/ItemDetails.jsx';
import AddListing from './pages/AddListing.jsx';
import EditListing from './pages/EditListing.jsx';
import MyListings from './pages/MyListings.jsx';
import Requests from './pages/Requests.jsx';
import Transactions from './pages/Transactions.jsx';
import Messages from './pages/Messages.jsx';
import Notifications from './pages/Notifications.jsx';
import Wishlist from './pages/Wishlist.jsx';
import Profile from './pages/Profile.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminListings from './pages/admin/AdminListings.jsx';
import AdminRequests from './pages/admin/AdminRequests.jsx';
import AdminReports from './pages/admin/AdminReports.jsx';
import AdminStats from './pages/admin/AdminStats.jsx';
import NotFound from './pages/NotFound.jsx';

const guard = (el) => <ProtectedRoute>{el}</ProtectedRoute>;

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/items/:id" element={<ItemDetails />} />

          <Route path="/dashboard" element={guard(<Dashboard />)} />
          <Route path="/listings/new" element={guard(<AddListing />)} />
          <Route path="/listings/:id/edit" element={guard(<EditListing />)} />
          <Route path="/my-listings" element={guard(<MyListings />)} />
          <Route path="/requests" element={guard(<Requests />)} />
          <Route path="/transactions" element={guard(<Transactions />)} />
          <Route path="/messages" element={guard(<Messages />)} />
          <Route path="/messages/:id" element={guard(<Messages />)} />
          <Route path="/notifications" element={guard(<Notifications />)} />
          <Route path="/wishlist" element={guard(<Wishlist />)} />
          <Route path="/profile" element={guard(<Profile />)} />
          <Route path="/users/:id" element={guard(<Profile />)} />

          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="listings" element={<AdminListings />} />
            <Route path="requests" element={<AdminRequests />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="stats" element={<AdminStats />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}
