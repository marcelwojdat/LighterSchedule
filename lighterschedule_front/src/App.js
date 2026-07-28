import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRedirect from './components/RoleRedirect';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import Manager from './components/Manager';
import Profile from './components/Profile';
import PublicLayout from './components/marketing/PublicLayout';
import Landing from './components/marketing/Landing';
import Pricing from './components/marketing/Pricing';
import CheckoutStub from './components/marketing/CheckoutStub';
import { TermsPage, PrivacyPage } from './components/marketing/LegalPages';

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/checkout" element={<CheckoutStub />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Route>

      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/app" element={<RoleRedirect />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager"
        element={
          <ProtectedRoute requireManager>
            <Manager />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
