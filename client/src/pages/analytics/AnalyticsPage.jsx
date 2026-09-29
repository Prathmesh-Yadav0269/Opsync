import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { analyticsApi } from '../../api/analytics.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Shield,
  Layers,
  Calendar,
  ChevronRight,
  Filter,
} from 'lucide-react';

const STATUS_COLORS = {
  'To Do': '#71717a',
  'In Progress': '#3b82f6',
  Review: '#a855f7',
  Done: '#10b981',
  Blocked: '#ef4444',
};

const formatSeconds = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours === 0 && minutes === 0 && s > 0) return `${s}s`;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
};

export const AnalyticsPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';

  const [period, setPeriod] = useState('weekly');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [analyticsData, setAnalyticsData] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isAdmin) {
        const res = await analyticsApi.getAdminAnalytics({ period, date: selectedDate });
        setAnalyticsData(res.data);
      } else if (isManager) {
        const res = await analyticsApi.getTeamAnalytics({ period, date: selectedDate });
        setAnalyticsData(res.data);
      } else {
        const [empRes, heatRes] = await Promise.all([
          analyticsApi.getMyAnalytics({ period, date: selectedDate }),
          analyticsApi.getMyHeatmap(selectedYear),
        ]);
        setAnalyticsData(empRes.data);
        setHeatmapData(heatRes.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isManager, period, selectedDate, selectedYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = analyticsData?.metrics || analyticsData?.organization || {};
  const statusDistribution = (analyticsData?.statusDistribution || []).filter((s) => s.count > 0);
  const workDurationTrend = analyticsData?.workDurationTrend || [];
  const completionTrend = analyticsData?.completionTrend || [];
  const memberComparison = analyticsData?.memberComparison || [];
  const teamComparison = analyticsData?.teamComparison || [];

  const hasAnyActivity =
    (metrics.tasksAssigned || metrics.totalTasks || 0) > 0 ||
    (metrics.totalActiveDuration || metrics.totalLoggedDuration || 0) > 0 ||
    workDurationTrend.length > 0;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-card p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {isAdmin ? 'Workspace Analytics' : isManager ? 'Team Analytics' : 'My Productivity Analytics'}
            </h1>
            <Badge variant="primary">{period.toUpperCase()}</Badge>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Genuine metrics computed directly from database Task history and WorkSession records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period Selector */}
          <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-1 text-xs">
            {['daily', 'weekly', 'monthly', 'yearly'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded-md font-medium capitalize transition-colors ${
                  period === p
                    ? 'bg-white dark:bg-zinc-900 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs py-1.5 px-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg"
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Calculating workspace productivity aggregates..." />
      ) : error ? (
        <Card className="p-8 text-center text-red-600">{error}</Card>
      ) : !hasAnyActivity ? (
        <Card className="p-12">
          <EmptyState
            icon={TrendingUp}
            title="No activity recorded yet."
            description="When tasks are progressed and work sessions are logged, productivity analytics and trends will appear here."
          />
        </Card>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  Active Work Time
                </span>
                <span className="text-2xl font-mono font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
                  {formatSeconds(metrics.totalActiveDuration ?? metrics.totalLoggedDuration ?? 0)}
                </span>
                <span className="text-[11px] text-zinc-500">Verified server duration</span>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950/60 text-purple-600 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  Tasks Completed
                </span>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">
                  {metrics.tasksCompleted ?? metrics.completedTasks ?? 0}
                </span>
                <span className="text-[11px] text-emerald-600">Marked Done</span>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  In Progress
                </span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1 block">
                  {metrics.tasksInProgress ?? metrics.inProgressTasks ?? 0}
                </span>
                <span className="text-[11px] text-blue-500">Currently active</span>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  {isAdmin ? 'Total Teams' : 'Blocked Tasks'}
                </span>
                <span className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1 block">
                  {isAdmin ? metrics.totalTeams : metrics.tasksBlocked ?? metrics.blockedTasks ?? 0}
                </span>
                <span className="text-[11px] text-zinc-500">
                  {isAdmin ? 'Active workspaces' : 'Requires intervention'}
                </span>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-600 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Work Duration Trend (Line Chart) */}
            <Card className="p-5 lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600" /> Active Work Hours
                </h3>
                <span className="text-xs text-zinc-400">{period.toUpperCase()} Breakdown</span>
              </div>

              {workDurationTrend.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-zinc-400 italic">
                  No work hours logged in this period.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={workDurationTrend}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="h" />
                      <Tooltip formatter={(val) => [`${val} hrs`, 'Logged Hours']} />
                      <Line
                        type="monotone"
                        dataKey="hours"
                        stroke="#8b5cf6"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#8b5cf6' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Task Status Distribution (Donut Chart) */}
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" /> Status Distribution
              </h3>

              {statusDistribution.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-zinc-400 italic">
                  No tasks to display.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="count"
                        nameKey="status"
                      >
                        {statusDistribution.map((entry) => (
                          <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val, name) => [`${val} tasks`, name]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* Manager: Member Comparison Bar Chart & Table */}
          {isManager && memberComparison.length > 0 && (
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-600" /> Team Member Productivity Comparison
              </h3>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={memberComparison}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="h" />
                    <Tooltip formatter={(val) => [`${val} hrs`, 'Work Hours']} />
                    <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <table className="w-full text-xs text-left">
                  <thead className="text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 font-semibold">
                    <tr>
                      <th className="py-2">Member</th>
                      <th className="py-2">Role</th>
                      <th className="py-2">Active Duration</th>
                      <th className="py-2">Interruptions</th>
                      <th className="py-2">Sessions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {memberComparison.map((m) => (
                      <tr key={m.userId}>
                        <td className="py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{m.name}</td>
                        <td className="py-2.5 text-zinc-500 capitalize">{m.role}</td>
                        <td className="py-2.5 font-mono font-semibold">{formatSeconds(m.duration)}</td>
                        <td className="py-2.5 text-zinc-500">{m.interruptions}</td>
                        <td className="py-2.5 text-zinc-500">{m.sessionsCompleted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Admin: Team Comparison Table */}
          {isAdmin && teamComparison.length > 0 && (
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" /> Workspace Team Productivity Comparison
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 font-semibold">
                    <tr>
                      <th className="py-2">Team Name</th>
                      <th className="py-2">Manager</th>
                      <th className="py-2">Members</th>
                      <th className="py-2">Tasks</th>
                      <th className="py-2">Completed</th>
                      <th className="py-2">In Progress</th>
                      <th className="py-2">Blocked</th>
                      <th className="py-2">Active Work</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {teamComparison.map((t) => (
                      <tr key={t._id}>
                        <td className="py-2.5 font-semibold text-zinc-900 dark:text-zinc-100">{t.name}</td>
                        <td className="py-2.5 text-zinc-600 dark:text-zinc-300">{t.managerName}</td>
                        <td className="py-2.5 text-zinc-500">{t.memberCount}</td>
                        <td className="py-2.5 font-semibold">{t.totalTasks}</td>
                        <td className="py-2.5 text-emerald-600 font-semibold">{t.completedTasks}</td>
                        <td className="py-2.5 text-blue-500">{t.inProgressTasks}</td>
                        <td className="py-2.5 text-red-500">{t.blockedTasks}</td>
                        <td className="py-2.5 font-mono font-bold text-purple-600 dark:text-purple-400">
                          {t.activeHours} hrs
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Employee: GitHub-style Contribution Heatmap */}
          {!isAdmin && !isManager && heatmapData && (
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-brand-600" /> Yearly Contribution Heatmap ({heatmapData.year})
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {formatSeconds(heatmapData.totalActiveDuration)} active work across {heatmapData.activeDays} working days.
                  </p>
                </div>

                {/* Intensity Legend */}
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <span>Less</span>
                  <span className="w-2.5 h-2.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-900/60" />
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 dark:bg-emerald-700" />
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-500" />
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-800 dark:bg-emerald-400" />
                  <span>More</span>
                </div>
              </div>

              {/* Heatmap Grid */}
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-1 min-w-[720px]">
                  {Array.from({ length: 53 }).map((_, weekIdx) => {
                    const weekDays = heatmapData.days.slice(weekIdx * 7, (weekIdx + 1) * 7);

                    return (
                      <div key={weekIdx} className="flex flex-col gap-1">
                        {weekDays.map((d) => {
                          const intensityClasses = [
                            'bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60',
                            'bg-emerald-200 dark:bg-emerald-900/80',
                            'bg-emerald-400 dark:bg-emerald-700',
                            'bg-emerald-600 dark:bg-emerald-500',
                            'bg-emerald-800 dark:bg-emerald-400',
                          ];

                          return (
                            <div
                              key={d.date}
                              title={`${d.date}: ${formatSeconds(d.duration)} (${d.count} sessions)`}
                              className={`w-3 h-3 rounded-sm ${intensityClasses[d.intensity]} transition-colors hover:ring-1 hover:ring-brand-500 cursor-pointer`}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
