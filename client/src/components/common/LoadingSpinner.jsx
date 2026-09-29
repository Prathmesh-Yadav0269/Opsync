import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = ({ size = 'md', message = 'Loading...', fullPage = false }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const content = (
    <div className="flex flex-col items-center justify-center gap-3 text-zinc-500 dark:text-zinc-400">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-brand-600`} aria-hidden="true" />
      {message && <p className="text-sm font-medium">{message}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        {content}
      </div>
    );
  }

  return <div className="p-4 flex justify-center">{content}</div>;
};
