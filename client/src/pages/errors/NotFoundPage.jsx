import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/common/Button.jsx';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export const NotFoundPage = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 mb-6">
        <FileQuestion className="w-8 h-8" />
      </div>
      <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
        404 Not Found
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-2">
        Page Not Found
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md">
        The requested page does not exist or has been moved.
      </p>

      <div className="mt-6">
        <Link to="/dashboard">
          <Button variant="primary" size="md" icon={ArrowLeft}>
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
};
