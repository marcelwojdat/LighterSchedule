import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Auth from './Auth';

const RoleRedirect = () => {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('access');
    if (!token) {
      setTarget('/login');
      return;
    }

    Auth.fetchCurrentUser()
      .then((user) => setTarget(user.is_manager ? '/manager' : '/dashboard'))
      .catch(() => setTarget('/login'));
  }, []);

  if (!target) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Ładowanie...</div>;
  }

  return <Navigate to={target} replace />;
};

export default RoleRedirect;
