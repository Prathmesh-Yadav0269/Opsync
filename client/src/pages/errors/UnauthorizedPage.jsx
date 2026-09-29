import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/common/Button.jsx';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export const UnauthorizedPage = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400 mb-6">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">
        403 Forbidden
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-2">
        Access Denied
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md">
        You do not have the required role or permissions to view this resource. Contact your workspace administrator if you believe this is an error.
      </p>

      <div className="mt-6 flex gap-3">
        <Link to="/dashboard">
          <Button variant="primary" size="md" icon={ArrowLeft}>
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
};
