import React, { useState, useEffect, useCallback } from 'react';
import { standupsApi } from '../../api/standups.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  RotateCw,
  Layers,
} from 'lucide-react';

const formatSeconds = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours === 0 && minutes === 0 && s > 0) return `${s}s`;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
};

export const TeamStandupPage = () => {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTeamStandups = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await standupsApi.getTeamStandup(selectedDate);
      setTeamData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load team standup digest.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadTeamStandups();
  }, [loadTeamStandups]);

  const standups = teamData?.standups || [];

  return (
    <div className="space-y-6">
      {/* Header & Date Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-card p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Team Standup Digest
            </h1>
            <Badge variant="primary">{teamData?.team?.name || 'My Team'}</Badge>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Aggregated progress and blockers across all assigned team members for {selectedDate}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs py-2 px-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg"
          />
          <Button
            variant="secondary"
            size="sm"
            icon={RotateCw}
            isLoading={loading}
            onClick={loadTeamStandups}
          >
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Gathering team member standup records..." />
      ) : error ? (
        <Card className="p-8 text-center text-red-600">{error}</Card>
      ) : standups.length === 0 ? (
        <Card className="p-12">
          <EmptyState
            icon={Users}
            title="No team standups recorded"
            description="Team members will automatically appear here as they complete work sessions and progress tasks."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {standups.map((s) => (
            <Card key={s._id} className="p-6 space-y-4">
              {/* Member header */}
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {s.user?.name || 'Team Member'}
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    {s.user?.position || s.user?.role} • {s.user?.department || 'Engineering'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-mono font-bold text-purple-600 dark:text-purple-400 block">
                    {formatSeconds(s.activeDuration)}
                  </span>
                  <span className="text-[10px] text-zinc-400">{s.interruptions} pauses</span>
                </div>
              </div>

              {/* Completed Tasks */}
              <div className="space-y-1.5 text-xs">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Completed ({s.completedTasks?.length || 0})
                </span>
                {s.completedTasks?.length === 0 ? (
                  <p className="text-[11px] text-zinc-400 italic">None</p>
                ) : (
                  <ul className="space-y-1 pl-4 list-disc text-zinc-600 dark:text-zinc-400 text-[11px]">
                    {s.completedTasks.map((t) => (
                      <li key={t._id}>{t.title}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* In Progress Tasks */}
              <div className="space-y-1.5 text-xs">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-blue-600" /> In Progress ({s.inProgressTasks?.length || 0})
                </span>
                {s.inProgressTasks?.length === 0 ? (
                  <p className="text-[11px] text-zinc-400 italic">None</p>
                ) : (
                  <ul className="space-y-1 pl-4 list-disc text-zinc-600 dark:text-zinc-400 text-[11px]">
                    {s.inProgressTasks.map((t) => (
                      <li key={t._id}>
                        {t.title} <span className="text-zinc-400">({t.hoursLogged}h logged)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Blockers */}
              {s.blockers?.length > 0 && (
                <div className="p-2.5 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/50 space-y-1 text-xs">
                  <span className="font-semibold text-red-800 dark:text-red-300 flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Blockers ({s.blockers.length})
                  </span>
                  <ul className="space-y-0.5 pl-4 list-disc text-red-700 dark:text-red-400 text-[11px]">
                    {s.blockers.map((b) => (
                      <li key={b._id}>{b.title}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* User Context note */}
              {s.userContext && (
                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/60 space-y-1 text-[11px]">
                  <span className="font-semibold text-zinc-500 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Member Note:
                  </span>
                  <p className="text-zinc-700 dark:text-zinc-300 italic">{s.userContext}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
