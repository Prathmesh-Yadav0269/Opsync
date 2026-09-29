import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { getNavItemsForRole } from '../../routes/navConfig.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { NotificationBell } from './NotificationBell.jsx';
import { Badge } from '../common/Badge.jsx';
import {
  Menu,
  X,
  LogOut,
  User as UserIcon,
  Shield,
  Radio,
} from 'lucide-react';

export const AppLayout = () => {
  const { user, logout } = useAuth();
  const { connected, syncPulse } = useSocket();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const navItems = getNavItemsForRole(user?.role);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col md:flex-row">
      {/* Mobile top navigation header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-base tracking-wider shadow-sm">
            OS
          </div>
          <span className="font-semibold text-base tracking-tight text-zinc-900 dark:text-zinc-100">
            OPSYNC
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Sync indicator */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border ${
              connected
                ? syncPulse
                  ? 'bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-950/60 dark:border-brand-700 dark:text-brand-300 ring-2 ring-brand-400/40'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300'
                : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300'
            } transition-all duration-300`}
            title={connected ? (syncPulse ? 'Syncing...' : 'Connected') : 'Disconnected'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connected ? (syncPulse ? 'bg-brand-600 animate-ping' : 'bg-emerald-500') : 'bg-amber-500'
              }`}
            />
            <span>{connected ? (syncPulse ? 'Sync' : 'Live') : 'Offline'}</span>
          </div>

          <NotificationBell />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar navigation */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="h-16 px-5 hidden md:flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm tracking-wider shadow-sm">
              OS
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-zinc-900 dark:text-zinc-100 block leading-tight">
                OPSYNC
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-semibold block">
                Workspace
              </span>
            </div>
          </div>
        </div>

        {/* Navigation links */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            Main Menu
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </div>

        {/* User profile & session footer */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-zinc-400">Theme</span>
            <ThemeToggle />
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 font-medium text-xs shrink-0">
                {user?.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  {user?.email}
                </p>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/40 flex items-center justify-between">
              <Badge variant={user?.role}>{user?.role || 'employee'}</Badge>
              <button
                type="button"
                onClick={handleLogout}
                className="text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 p-1 rounded transition-colors text-xs flex items-center gap-1 focus:outline-none"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop top header */}
        <header className="hidden md:flex h-16 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-8 items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              OPSYNC Platform
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Phase 1 Foundation
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Global Real-Time Sync Indicator */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                connected
                  ? syncPulse
                    ? 'bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-950/60 dark:border-brand-700 dark:text-brand-300 ring-2 ring-brand-400/40'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300'
              } transition-all duration-300`}
              title={connected ? (syncPulse ? 'Real-time synchronization active' : 'Connected to real-time collaboration server') : 'Real-time connection offline'}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? (syncPulse ? 'bg-brand-600 animate-ping' : 'bg-emerald-500') : 'bg-amber-500'
                }`}
              />
              <span>{connected ? (syncPulse ? 'Sync Active' : 'Live') : 'Disconnected'}</span>
            </div>

            <NotificationBell />

            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 border-l border-zinc-200 dark:border-zinc-800 pl-4">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>RBAC Active</span>
            </div>
          </div>
        </header>

        {/* Page content view */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
