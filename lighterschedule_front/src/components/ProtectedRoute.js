import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Auth from './Auth';

const ProtectedRoute = ({ children, requireManager = false }) => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('access');
    if (!token) {
      setLoading(false);
      return;
    }

    Auth.fetchCurrentUser()
      .then((data) => setUser(data))
      .catch(() => {
        Auth.logout();
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Ładowanie...</div>;
  }

  if (!localStorage.getItem('access') || !user) {
    return <Navigate to="/login" replace />;
  }

  if (requireManager && !user.is_manager) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
