import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please log in to access this page.</div>;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    return <div className="error">Access denied. Insufficient permissions.</div>;
  }

  return children;
};

export default ProtectedRoute;
