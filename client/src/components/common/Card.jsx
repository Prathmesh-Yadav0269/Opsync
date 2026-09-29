import React from 'react';

export const Card = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-card shadow-sm p-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
