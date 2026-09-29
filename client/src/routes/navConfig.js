import {
  LayoutDashboard,
  User,
  Users,
  Layers,
  CheckSquare,
  MessageSquare,
  TrendingUp,
  CalendarCheck,
  Video,
  Settings,
} from 'lucide-react';

/**
 * Phase 6 Role-Aware Navigation Configuration
 * Defines active accessible modules per user role.
 */
export const navigationItems = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'manager', 'employee'],
  },
  {
    name: 'Users',
    path: '/users',
    icon: Users,
    roles: ['admin'],
  },
  {
    name: 'Teams',
    path: '/teams',
    icon: Layers,
    roles: ['admin', 'manager'],
  },
  {
    name: 'Tasks',
    path: '/tasks',
    icon: CheckSquare,
    roles: ['admin', 'manager', 'employee'],
  },
  {
    name: 'Chat',
    path: '/chat',
    icon: MessageSquare,
    roles: ['admin', 'manager', 'employee'],
  },
  {
    name: 'Analytics',
    path: '/analytics',
    icon: TrendingUp,
    roles: ['admin', 'manager', 'employee'],
  },
  {
    name: 'Standup',
    path: '/standup',
    icon: CalendarCheck,
    roles: ['employee'],
  },
  {
    name: 'Team Standup',
    path: '/team-standup',
    icon: CalendarCheck,
    roles: ['manager'],
  },
  {
    name: 'Meetings',
    path: '/meetings',
    icon: Video,
    roles: ['admin', 'manager', 'employee'],
  },
  {
    name: 'Settings',
    path: '/settings',
    icon: Settings,
    roles: ['admin', 'manager', 'employee'],
  },
];

export const getNavItemsForRole = (role) => {
  return navigationItems
    .filter((item) => !item.roles || item.roles.includes(role))
    .map((item) => {
      // Friendly labels for Manager and Employee
      if (item.path === '/teams' && role === 'manager') {
        return { ...item, name: 'My Team' };
      }
      if (item.path === '/tasks' && role === 'employee') {
        return { ...item, name: 'My Tasks' };
      }
      return item;
    });
};
