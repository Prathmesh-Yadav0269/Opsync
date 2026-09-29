import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { dashboardApi } from '../../api/dashboard.js';
import { workSessionsApi } from '../../api/workSessions.js';
import { Card } from '../../components/common/Card.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Button } from '../../components/common/Button.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import {
  User,
  Users,
  Layers,
  CheckSquare,
  Clock,
  ArrowRight,
  TrendingUp,
  Shield,
  Calendar,
  Timer,
  Play,
} from 'lucide-react';

export const DashboardPage = () => {
  const { user } = useAuth();
  const role = user?.role || 'employee';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Work session states
  const [currentSession, setCurrentSession] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const formatSeconds = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const [statsRes, sessRes, recentRes] = await Promise.all([
          dashboardApi.getStats(),
          workSessionsApi.getCurrentSession().catch(() => ({ data: { session: null } })),
          workSessionsApi.getRecentSessions().catch(() => ({ data: { sessions: [] } })),
        ]);
        setData(statsRes.data);
        const cur = sessRes.data?.session;
        setCurrentSession(cur);
        setRecentSessions(recentRes.data?.sessions || []);

        if (cur) {
          const now = new Date();
          const startMs = new Date(cur.start).getTime();
          let pausedMs = 0;
          cur.pauses?.forEach((p) => {
            const pEnd = p.end ? new Date(p.end).getTime() : now.getTime();
            pausedMs += Math.max(0, pEnd - new Date(p.start).getTime());
          });
          const activeMs = Math.max(0, now.getTime() - startMs - pausedMs);
          setElapsedSeconds(Math.round(activeMs / 1000));
        }
      } catch (err) {
        setError(err.message || 'Failed to load dashboard operational stats.');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  // Local seconds ticker for active session UX (zero polling)
  useEffect(() => {
    if (!currentSession || currentSession.state !== 'active') return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [currentSession]);

  const stats = data?.stats || {};
  const recentTasks = data?.recentTasks || [];

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-card p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Welcome back, {user?.name || 'User'}
            </h1>
            <Badge variant={role}>{role}</Badge>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Real-time operational dashboard for OPSYNC workspace. All counts reflect genuine database state.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {role === 'admin' && (
            <Link to="/users">
              <Button variant="secondary" size="sm" icon={Users}>
                Manage Users
              </Button>
            </Link>
          )}
          <Link to="/tasks">
            <Button variant="primary" size="sm" icon={CheckSquare}>
              {role === 'employee' ? 'My Tasks' : 'Workspace Tasks'}
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Calculating workspace operational statistics..." />
      ) : (
        <>
          {/* Operational Metrics Cards (Genuine MongoDB counts) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {role === 'admin' && (
              <>
                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      Total Users
                    </span>
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
                      {stats.totalUsers ?? 0}
                    </span>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      {stats.activeUsers ?? 0} Active Accounts
                    </span>
                  </div>
                  <div className="p-3 bg-brand-50 dark:bg-brand-950/60 text-brand-600 rounded-xl">
                    <Users className="w-5 h-5" />
                  </div>
                </Card>

                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      Workspace Teams
                    </span>
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
                      {stats.totalTeams ?? 0}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Organized Departments
                    </span>
                  </div>
                  <div className="p-3 bg-purple-50 dark:bg-purple-950/60 text-purple-600 rounded-xl">
                    <Layers className="w-5 h-5" />
                  </div>
                </Card>

                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      Total Tasks
                    </span>
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
                      {stats.totalTasks ?? 0}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {stats.tasksByStatus?.['Done'] ?? 0} Completed
                    </span>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 rounded-xl">
                    <CheckSquare className="w-5 h-5" />
                  </div>
                </Card>

                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      In Progress
                    </span>
                    <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 block">
                      {stats.tasksByStatus?.['In Progress'] ?? 0}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Active Workflows
                    </span>
                  </div>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/60 text-amber-600 rounded-xl">
                    <Clock className="w-5 h-5" />
                  </div>
                </Card>
              </>
            )}

            {role === 'manager' && (
              <>
                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      My Team Members
                    </span>
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
                      {stats.memberCount ?? 0}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {stats.teamName || 'Managed Team'}
                    </span>
                  </div>
                  <div className="p-3 bg-brand-50 dark:bg-brand-950/60 text-brand-600 rounded-xl">
                    <Users className="w-5 h-5" />
                  </div>
                </Card>

                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      Team Tasks
                    </span>
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
                      {stats.totalTasks ?? 0}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Assigned to Team
                    </span>
                  </div>
                  <div className="p-3 bg-purple-50 dark:bg-purple-950/60 text-purple-600 rounded-xl">
                    <Layers className="w-5 h-5" />
                  </div>
                </Card>

                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      Pending Tasks
                    </span>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1 block">
                      {(stats.tasksByStatus?.['To Do'] ?? 0) + (stats.tasksByStatus?.['In Progress'] ?? 0)}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Awaiting Completion
                    </span>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 rounded-xl">
                    <Clock className="w-5 h-5" />
                  </div>
                </Card>

                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      Completed
                    </span>
                    <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">
                      {stats.tasksByStatus?.['Done'] ?? 0}
                    </span>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                      Team Delivered
                    </span>
                  </div>
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-xl">
                    <CheckSquare className="w-5 h-5" />
                  </div>
                </Card>
              </>
            )}

            {role === 'employee' && (
              <>
                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      My Assigned Tasks
                    </span>
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
                      {stats.totalTasks ?? 0}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Total Allocated
                    </span>
                  </div>
                  <div className="p-3 bg-brand-50 dark:bg-brand-950/60 text-brand-600 rounded-xl">
                    <CheckSquare className="w-5 h-5" />
                  </div>
                </Card>

                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      Pending Work
                    </span>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1 block">
                      {stats.pendingTasks ?? 0}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Active or To Do
                    </span>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 rounded-xl">
                    <Clock className="w-5 h-5" />
                  </div>
                </Card>

                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      Completed
                    </span>
                    <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">
                      {stats.doneTasks ?? 0}
                    </span>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                      Marked Done
                    </span>
                  </div>
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-xl">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </Card>

                <Card className="p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      In Review
                    </span>
                    <span className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1 block">
                      {stats.tasksByStatus?.['Review'] ?? 0}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Under Peer Review
                    </span>
                  </div>
                  <div className="p-3 bg-purple-50 dark:bg-purple-950/60 text-purple-600 rounded-xl">
                    <Shield className="w-5 h-5" />
                  </div>
                </Card>
              </>
            )}
          </div>

          {/* Active Work Session (if one is in progress) */}
          {currentSession && (
            <div className="p-5 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-200 dark:border-purple-900/60 rounded-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 dark:bg-purple-950/80 text-purple-600 rounded-xl shrink-0">
                  <Timer className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                      Active Work Session
                    </span>
                    <Badge variant={currentSession.state === 'active' ? 'primary' : 'neutral'}>
                      {currentSession.state === 'active' ? '● Recording Work' : '❚❚ Paused'}
                    </Badge>
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {currentSession.task?.title || 'Current Task'}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Started at {new Date(currentSession.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {currentSession.interruptions} pause{currentSession.interruptions === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-3xl font-mono font-bold tracking-tight text-purple-900 dark:text-purple-100">
                  {formatSeconds(elapsedSeconds)}
                </div>
                <Link to="/tasks">
                  <Button variant="primary" size="sm">
                    Manage Timer
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Real Recent Tasks Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-brand-600" /> Active Workspace Tasks
              </h2>
              <Link to="/tasks" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
                View all tasks <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <Card className="p-0 overflow-hidden">
              {recentTasks.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={CheckSquare}
                    title="No tasks recorded yet."
                    description="When tasks are assigned, they will appear here with real-time status and ownership."
                  />
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {recentTasks.map((t) => (
                    <div key={t._id} className="p-4 flex items-center justify-between hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Link to="/tasks" className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 hover:underline">
                            {t.title}
                          </Link>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 font-medium text-zinc-600 dark:text-zinc-300">
                            {t.status}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Assigned to: <strong className="text-zinc-700 dark:text-zinc-300">{t.assignedTo?.name || 'Unassigned'}</strong>
                          {t.team?.name ? ` • Team: ${t.team.name}` : ''}
                        </p>
                      </div>

                      <span className="text-xs text-zinc-400">
                        {new Date(t.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Recent Work Sessions (Latest 5 - SRS Section 35/41) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Timer className="w-4 h-4 text-purple-600" /> Recent Work Sessions
              </h2>
              <span className="text-xs text-zinc-400">Latest 5 completed</span>
            </div>

            <Card className="p-0 overflow-hidden">
              {recentSessions.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={Timer}
                    title="No completed work sessions yet."
                    description="When you start and complete sessions on assigned tasks, your latest records will be logged here."
                  />
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {recentSessions.map((s) => (
                    <div key={s._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                            {s.task?.title || 'Task'}
                          </span>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            {s.state}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400">
                          {new Date(s.start).toLocaleDateString()} • Started {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Ended {s.end ? new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-right">
                          <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                            {formatSeconds(s.activeDuration)}
                          </span>
                          <p className="text-[10px] text-zinc-400">
                            {s.interruptions} interruption{s.interruptions === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
