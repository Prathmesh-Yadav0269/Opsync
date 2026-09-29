import React, { useState, useEffect, useCallback } from 'react';
import { standupsApi } from '../../api/standups.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Save,
  RotateCw,
  Calendar,
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

export const StandupPage = () => {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [standup, setStandup] = useState(null);
  const [userContext, setUserContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingContext, setSavingContext] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadStandup = useCallback(async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await standupsApi.getMyStandupByDate(selectedDate);
      const data = res.data?.standup;
      setStandup(data);
      setUserContext(data?.userContext || '');
    } catch (err) {
      setError(err.message || 'Failed to generate standup digest.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadStandup();
  }, [loadStandup]);

  const handleSaveContext = async (e) => {
    e.preventDefault();
    if (!standup) return;
    setSavingContext(true);
    setError('');
    setMessage('');
    try {
      const res = await standupsApi.updateStandupContext(standup._id, userContext);
      setStandup(res.data?.standup);
      setMessage('Context saved successfully.');
    } catch (err) {
      setError(err.message || 'Failed to save context.');
    } finally {
      setSavingContext(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header & Date Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-card p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Daily Standup Digest
            </h1>
            <Badge variant="primary">{selectedDate}</Badge>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Automatically compiled from verified task audit events and work sessions.
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
            onClick={loadStandup}
          >
            Regenerate
          </Button>
        </div>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {loading ? (
        <LoadingSpinner message="Aggregating daily work items and session logs..." />
      ) : !standup ? (
        <Card className="p-8 text-center">
          <EmptyState
            icon={Calendar}
            title="No standup digest generated"
            description="Select a date to aggregate your daily work records."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary metrics strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/50 rounded-xl space-y-1">
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold block">
                Completed Today
              </span>
              <span className="text-2xl font-bold text-emerald-900 dark:text-emerald-200">
                {standup.completedTasks?.length || 0}
              </span>
            </div>

            <div className="p-4 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/50 rounded-xl space-y-1">
              <span className="text-blue-700 dark:text-blue-400 font-semibold block">
                In Progress
              </span>
              <span className="text-2xl font-bold text-blue-900 dark:text-blue-200">
                {standup.inProgressTasks?.length || 0}
              </span>
            </div>

            <div className="p-4 bg-red-50/60 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/50 rounded-xl space-y-1">
              <span className="text-red-700 dark:text-red-400 font-semibold block">
                Blockers
              </span>
              <span className="text-2xl font-bold text-red-900 dark:text-red-200">
                {standup.blockers?.length || 0}
              </span>
            </div>

            <div className="p-4 bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/50 rounded-xl space-y-1">
              <span className="text-purple-700 dark:text-purple-400 font-semibold block">
                Active Hours
              </span>
              <span className="text-2xl font-mono font-bold text-purple-900 dark:text-purple-200">
                {formatSeconds(standup.activeDuration)}
              </span>
            </div>
          </div>

          {/* Section 1: Completed Tasks */}
          <Card className="p-6 space-y-3">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Completed Today ({standup.completedTasks?.length || 0})
            </h3>
            {standup.completedTasks?.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No tasks transitioned to Done on this date.</p>
            ) : (
              <div className="space-y-2">
                {standup.completedTasks.map((t) => (
                  <div
                    key={t._id}
                    className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 flex items-center justify-between text-xs"
                  >
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{t.title}</span>
                    <span className="text-[10px] text-zinc-400">
                      Completed {new Date(t.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Section 2: In Progress Work */}
          <Card className="p-6 space-y-3">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" /> In Progress / Under Review ({standup.inProgressTasks?.length || 0})
            </h3>
            {standup.inProgressTasks?.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No active or in-review tasks currently assigned.</p>
            ) : (
              <div className="space-y-2">
                {standup.inProgressTasks.map((t) => (
                  <div
                    key={t._id}
                    className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={t.status === 'Review' ? 'secondary' : 'primary'}>{t.status}</Badge>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{t.title}</span>
                    </div>
                    <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-semibold">
                      {t.hoursLogged} hrs logged
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Section 3: Blockers */}
          <Card className="p-6 space-y-3">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" /> Active Blockers ({standup.blockers?.length || 0})
            </h3>
            {standup.blockers?.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No blocked tasks recorded.</p>
            ) : (
              <div className="space-y-2">
                {standup.blockers.map((b) => (
                  <div
                    key={b._id}
                    className="p-3 bg-red-50/50 dark:bg-red-950/20 rounded-lg border border-red-200/60 dark:border-red-900/50 flex items-center justify-between text-xs"
                  >
                    <span className="font-semibold text-red-900 dark:text-red-200">{b.title}</span>
                    <Badge variant="danger">{b.priority} Priority</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Section 4: Optional User Context */}
          <Card className="p-6 space-y-3">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-500" /> Additional Context & Notes
            </h3>
            <p className="text-xs text-zinc-400">
              Add optional explanations, meeting updates, or dependencies. This note is preserved across automatic regenerations.
            </p>

            <form onSubmit={handleSaveContext} className="space-y-3">
              <textarea
                rows={3}
                placeholder="e.g., Attended sprint planning; waiting for client approval on design..."
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                className="w-full text-xs p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="primary" icon={Save} isLoading={savingContext}>
                  Save Context
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
