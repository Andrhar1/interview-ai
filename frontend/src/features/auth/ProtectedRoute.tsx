import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Gate for authenticated routes. Waits for session bootstrap, then redirects. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-border-input border-t-blue" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
