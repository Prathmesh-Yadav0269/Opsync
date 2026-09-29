import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

export const Alert = ({ type = 'info', message, title, className = '', children }) => {
  const configs = {
    info: {
      icon: Info,
      wrapper: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300',
      iconClass: 'text-blue-500',
    },
    success: {
      icon: CheckCircle2,
      wrapper: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300',
      iconClass: 'text-emerald-500',
    },
    warning: {
      icon: AlertTriangle,
      wrapper: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300',
      iconClass: 'text-amber-500',
    },
    error: {
      icon: AlertCircle,
      wrapper: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300',
      iconClass: 'text-red-500',
    },
  };

  const config = configs[type] || configs.info;
  const Icon = config.icon;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-3.5 border rounded-lg text-sm ${config.wrapper} ${className}`}
    >
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${config.iconClass}`} aria-hidden="true" />
      <div className="space-y-0.5 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {message && <p>{message}</p>}
        {children}
      </div>
    </div>
  );
};
