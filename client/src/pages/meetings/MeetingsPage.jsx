import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import {
  Video,
  Plus,
  Calendar,
  Users,
  Clock,
  ExternalLink,
  PhoneOff,
  Radio,
} from 'lucide-react';

export const MeetingsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHostRole = user?.role === 'admin' || user?.role === 'manager';

  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await meetingsApi.getMeetings();
      setMeetings(res.data?.meetings || []);
    } catch (err) {
      setError(err.message || 'Failed to load meetings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createTitle.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await meetingsApi.createMeeting({
        title: createTitle.trim(),
        teamId: user?.team?._id || user?.team,
      });
      setShowCreateModal(false);
      setCreateTitle('');
      const newMeeting = res.data?.meeting;
      if (newMeeting) {
        navigate(`/meetings/${newMeeting.meetingId}`);
      } else {
        loadMeetings();
      }
    } catch (err) {
      setError(err.message || 'Failed to create meeting.');
    } finally {
      setCreating(false);
    }
  };

  const handleEndMeeting = async (meetingId, e) => {
    e.stopPropagation();
    try {
      await meetingsApi.endMeeting(meetingId);
      loadMeetings();
    } catch (err) {
      setError(err.message || 'Failed to end meeting.');
    }
  };

  const activeMeetings = meetings.filter((m) => m.status === 'active');
  const pastMeetings = meetings.filter((m) => m.status === 'ended');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-card p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Video Meetings
            </h1>
            <Badge variant="primary">WebRTC</Badge>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Browser-native real-time video conferences with peer-to-peer mesh media streams.
          </p>
        </div>

        {isHostRole && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setShowCreateModal(true)}
          >
            Start New Meeting
          </Button>
        )}
      </div>

      {error && <Alert type="error" message={error} />}

      {/* Info notice about STUN / NAT limitation */}
      <div className="p-4 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/50 rounded-xl text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
        <Radio className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
        <div>
          <span className="font-semibold">Connectivity Notice:</span> Meetings operate peer-to-peer using Google Public STUN. Restrictive corporate firewalls or symmetric NATs may require TURN relay in future deployments.
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading video meeting rooms..." />
      ) : meetings.length === 0 ? (
        <Card className="p-12">
          <EmptyState
            icon={Video}
            title="No meetings found"
            description={
              isHostRole
                ? 'Create a new meeting room to collaborate with your team in real time.'
                : 'You do not have any active or upcoming meetings at this time.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Active Meetings Section */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Active Meetings ({activeMeetings.length})
            </h2>

            {activeMeetings.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No meetings currently in session.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeMeetings.map((m) => {
                  const isHost =
                    user?._id === m.createdBy?._id || user?.role === 'admin';

                  return (
                    <Card
                      key={m._id}
                      className="p-5 flex flex-col justify-between space-y-4 hover:border-brand-500/50 transition-colors"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1">
                            {m.title}
                          </h3>
                          <Badge variant="success">LIVE</Badge>
                        </div>
                        <p className="text-xs text-zinc-500">
                          Hosted by {m.createdBy?.name || 'Workspace Host'}
                        </p>
                        {m.team && (
                          <span className="inline-block text-[11px] text-zinc-400">
                            Team: {m.team.name}
                          </span>
                        )}
                      </div>

                      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> {m.participants?.length || 1} participant(s)
                        </span>

                        <div className="flex items-center gap-2">
                          {isHost && (
                            <Button
                              variant="danger"
                              size="xs"
                              onClick={(e) => handleEndMeeting(m.meetingId, e)}
                            >
                              End
                            </Button>
                          )}
                          <Button
                            variant="primary"
                            size="xs"
                            icon={ExternalLink}
                            onClick={() => navigate(`/meetings/${m.meetingId}`)}
                          >
                            Join
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past Meetings Section */}
          {pastMeetings.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <h2 className="text-sm font-bold text-zinc-500 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Past Meetings ({pastMeetings.length})
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pastMeetings.slice(0, 6).map((m) => (
                  <Card key={m._id} className="p-4 opacity-75 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 line-clamp-1">
                        {m.title}
                      </h3>
                      <Badge variant="default">ENDED</Badge>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Ended {m.endedAt ? new Date(m.endedAt).toLocaleDateString() : ''}
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Meeting Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Start Instant Video Meeting"
        >
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Meeting Title
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g., Weekly Team Sync or Product Demo"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                className="w-full text-xs p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={creating}
              >
                Launch Room
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
