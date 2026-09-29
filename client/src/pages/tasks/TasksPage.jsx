import React, { useState, useEffect, useCallback } from 'react';
import { tasksApi } from '../../api/tasks.js';
import { teamsApi } from '../../api/teams.js';
import { usersApi } from '../../api/users.js';
import { filesApi } from '../../api/files.js';
import { workSessionsApi } from '../../api/workSessions.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import {
  CheckSquare,
  Plus,
  Kanban,
  List,
  Calendar,
  Search,
  Clock,
  User,
  MessageSquare,
  Send,
  Trash2,
  Tag,
  AlertCircle,
  History,
  FileText,
  Download,
  Paperclip,
  Play,
  Pause,
  Square,
  Timer,
} from 'lucide-react';

const STATUS_COLUMNS = ['To Do', 'In Progress', 'Review', 'Done', 'Blocked'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

export const TasksPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isEmployee = user?.role === 'employee';

  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Current view: 'kanban' | 'list' | 'calendar'
  const [currentView, setCurrentView] = useState('kanban');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    team: '',
    assignedTo: '',
    priority: 'Medium',
    dueDate: '',
    tags: '',
  });
  const [newComment, setNewComment] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // Files state
  const [taskFiles, setTaskFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Work session state
  const [activeSession, setActiveSession] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionLoading, setSessionLoading] = useState(false);

  const formatSeconds = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const loadTaskFiles = useCallback(async (taskId) => {
    try {
      setLoadingFiles(true);
      const res = await filesApi.getTaskFiles(taskId);
      setTaskFiles(res.data?.files || []);
    } catch (err) {
      console.error('Failed to load task files', err);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const loadCurrentSession = useCallback(async () => {
    try {
      const res = await workSessionsApi.getCurrentSession();
      const sess = res.data?.session;
      setActiveSession(sess);
      if (sess) {
        const now = new Date();
        const startMs = new Date(sess.start).getTime();
        let pausedMs = 0;
        sess.pauses?.forEach((p) => {
          const pEnd = p.end ? new Date(p.end).getTime() : now.getTime();
          pausedMs += Math.max(0, pEnd - new Date(p.start).getTime());
        });
        const activeMs = Math.max(0, now.getTime() - startMs - pausedMs);
        setElapsedSeconds(Math.round(activeMs / 1000));
      } else {
        setElapsedSeconds(0);
      }
    } catch (err) {
      console.error('Failed to load current session', err);
    }
  }, []);

  useEffect(() => {
    loadCurrentSession();
  }, [loadCurrentSession]);

  useEffect(() => {
    if (selectedTask) {
      loadTaskFiles(selectedTask._id);
    }
  }, [selectedTask, loadTaskFiles]);

  // Local seconds ticker for active session UX (zero polling)
  useEffect(() => {
    if (!activeSession || activeSession.state !== 'active') return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (searchTerm) params.search = searchTerm;

      const [tasksRes, teamsRes, usersRes] = await Promise.all([
        tasksApi.getTasks(params),
        teamsApi.getTeams().catch(() => ({ data: { teams: [] } })),
        usersApi.getUsers().catch(() => ({ data: { users: [] } })),
      ]);

      setTasks(tasksRes.data?.tasks || []);
      setTeams(teamsRes.data?.teams || []);

      const allUsers = usersRes.data?.users || [];
      if (isAdmin) {
        setAssignees(allUsers);
      } else if (isManager) {
        // Manager can only assign to employees in their own team
        const managedTeam = (teamsRes.data?.teams || []).find((t) => t.manager?._id === user._id || t.manager === user._id);
        if (managedTeam) {
          setAssignees(managedTeam.members || []);
        } else {
          setAssignees([]);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, searchTerm, isAdmin, isManager, user]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const { socket, triggerSyncPulse } = useSocket();

  // Real-time Socket.IO listeners (TSK-08 & TSK-09)
  useEffect(() => {
    if (!socket) return;

    const handleTaskAssigned = (newTask) => {
      triggerSyncPulse();
      setTasks((prev) => {
        const exists = prev.some((t) => t._id === newTask._id);
        if (exists) {
          return prev.map((t) => (t._id === newTask._id ? newTask : t));
        }
        return [newTask, ...prev];
      });
    };

    const handleTaskStatusChanged = (updatedTask) => {
      triggerSyncPulse();
      setTasks((prev) =>
        prev.map((t) => (t._id === updatedTask._id ? updatedTask : t))
      );
      if (selectedTask && selectedTask._id === updatedTask._id) {
        setSelectedTask(updatedTask);
      }
    };

    socket.on('task:assigned', handleTaskAssigned);
    socket.on('task:statusChanged', handleTaskStatusChanged);

    return () => {
      socket.off('task:assigned', handleTaskAssigned);
      socket.off('task:statusChanged', handleTaskStatusChanged);
    };
  }, [socket, selectedTask, triggerSyncPulse]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setFormLoading(true);
    try {
      const tagsArray = createForm.tags
        ? createForm.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];

      await tasksApi.createTask({
        title: createForm.title,
        description: createForm.description,
        team: createForm.team || undefined,
        assignedTo: createForm.assignedTo,
        priority: createForm.priority,
        dueDate: createForm.dueDate ? new Date(createForm.dueDate).toISOString() : undefined,
        tags: tagsArray,
      });

      setActionSuccess(`Task '${createForm.title}' created successfully.`);
      setCreateModalOpen(false);
      setCreateForm({
        title: '',
        description: '',
        team: '',
        assignedTo: '',
        priority: 'Medium',
        dueDate: '',
        tags: '',
      });
      loadTasks();
    } catch (err) {
      setModalError(err.message || 'Failed to create task.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      const res = await tasksApi.updateTaskStatus(taskId, newStatus);
      setActionSuccess(`Status updated to '${newStatus}'.`);
      if (selectedTask && selectedTask._id === taskId) {
        setSelectedTask(res.data?.task);
      }
      loadTasks();
    } catch (err) {
      setError(err.message || 'Failed to update task status.');
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedTask) return;
    setFormLoading(true);
    try {
      const res = await tasksApi.addComment(selectedTask._id, newComment);
      setSelectedTask({ ...selectedTask, comments: res.data?.comments });
      setNewComment('');
      loadTasks();
    } catch (err) {
      setModalError(err.message || 'Failed to post comment.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to permanently delete this task?')) return;
    try {
      await tasksApi.deleteTask(taskId);
      setActionSuccess('Task deleted successfully.');
      setDetailModalOpen(false);
      loadTasks();
    } catch (err) {
      setError(err.message || 'Failed to delete task.');
    }
  };

  const handleStartSession = async () => {
    if (!selectedTask) return;
    setSessionLoading(true);
    setModalError('');
    try {
      const res = await workSessionsApi.startSession(selectedTask._id);
      setActiveSession(res.data?.session);
      setElapsedSeconds(0);
      setActionSuccess('Work session started.');
    } catch (err) {
      setModalError(err.message || 'Failed to start work session.');
    } finally {
      setSessionLoading(false);
    }
  };

  const handlePauseSession = async () => {
    if (!activeSession) return;
    setSessionLoading(true);
    try {
      const res = await workSessionsApi.pauseSession(activeSession._id);
      setActiveSession(res.data?.session);
      setActionSuccess('Work session paused.');
    } catch (err) {
      setModalError(err.message || 'Failed to pause work session.');
    } finally {
      setSessionLoading(false);
    }
  };

  const handleResumeSession = async () => {
    if (!activeSession) return;
    setSessionLoading(true);
    try {
      const res = await workSessionsApi.resumeSession(activeSession._id);
      setActiveSession(res.data?.session);
      setActionSuccess('Work session resumed.');
    } catch (err) {
      setModalError(err.message || 'Failed to resume work session.');
    } finally {
      setSessionLoading(false);
    }
  };

  const handleStopSession = async () => {
    if (!activeSession) return;
    setSessionLoading(true);
    try {
      const res = await workSessionsApi.stopSession(activeSession._id);
      setActionSuccess(`Work session completed. Total active duration: ${formatSeconds(res.data?.session?.activeDuration)}.`);
      setActiveSession(null);
      setElapsedSeconds(0);
    } catch (err) {
      setModalError(err.message || 'Failed to complete work session.');
    } finally {
      setSessionLoading(false);
    }
  };

  const handleUploadTaskFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTask) return;
    setUploadingFile(true);
    setModalError('');
    try {
      await filesApi.uploadTaskFile(selectedTask._id, file);
      setActionSuccess(`File '${file.name}' attached successfully.`);
      await loadTaskFiles(selectedTask._id);
      e.target.value = '';
    } catch (err) {
      setModalError(err.message || 'Failed to upload file.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteTaskFile = async (fileId, fileName) => {
    if (!window.confirm(`Delete file attachment '${fileName}'?`)) return;
    try {
      await filesApi.deleteFile(fileId);
      setActionSuccess('File deleted.');
      if (selectedTask) await loadTaskFiles(selectedTask._id);
    } catch (err) {
      setModalError(err.message || 'Failed to delete file.');
    }
  };

  const priorityBadges = {
    Low: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    Medium: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200',
    High: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200',
    Urgent: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-brand-600" />
            {isEmployee ? 'My Assigned Tasks' : 'Task Management'}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isEmployee
              ? 'View workflow status, add progress notes, and execute your assigned tasks.'
              : 'Orchestrate team tasks with real-time audit history, Kanban workflows, and team deadlines.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View switcher buttons */}
          <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setCurrentView('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                currentView === 'kanban'
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setCurrentView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                currentView === 'list'
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <List className="w-3.5 h-3.5" /> List
            </button>
            <button
              type="button"
              onClick={() => setCurrentView('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                currentView === 'calendar'
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Calendar
            </button>
          </div>

          {!isEmployee && (
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => {
                setModalError('');
                setCreateModalOpen(true);
              }}
            >
              New Task
            </Button>
          )}
        </div>
      </div>

      {actionSuccess && <Alert type="success" message={actionSuccess} />}
      {error && <Alert type="error" message={error} />}

      {/* Filter controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
          <input
            type="text"
            placeholder="Search tasks by title, description, or tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Statuses</option>
          {STATUS_COLUMNS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Tasks View Rendering */}
      {loading ? (
        <LoadingSpinner message="Fetching authentic tasks from workspace..." />
      ) : tasks.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={CheckSquare}
            title="No tasks found"
            description={
              isEmployee
                ? 'You do not have any assigned tasks currently.'
                : 'No tasks match the active filters. Create a new task to begin organizing work.'
            }
          />
        </Card>
      ) : currentView === 'kanban' ? (
        /* KANBAN VIEW */
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {STATUS_COLUMNS.map((columnStatus) => {
            const columnTasks = tasks.filter((t) => t.status === columnStatus);
            return (
              <div
                key={columnStatus}
                className="flex flex-col bg-zinc-100/70 dark:bg-zinc-900/60 rounded-xl p-3 border border-zinc-200/80 dark:border-zinc-800/80 min-h-[500px]"
              >
                {/* Column header */}
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    {columnStatus}
                  </span>
                  <span className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 flex items-center justify-center">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-2.5 flex-1">
                  {columnTasks.map((t) => (
                    <div
                      key={t._id}
                      onClick={() => {
                        setSelectedTask(t);
                        setModalError('');
                        setDetailModalOpen(true);
                      }}
                      className="bg-white dark:bg-zinc-800/90 rounded-lg p-3.5 border border-zinc-200 dark:border-zinc-700/70 shadow-sm hover:border-brand-500/50 hover:shadow-md cursor-pointer transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">
                          {t.title}
                        </h3>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${
                            priorityBadges[t.priority] || ''
                          }`}
                        >
                          {t.priority}
                        </span>
                      </div>

                      {t.description && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
                          {t.description}
                        </p>
                      )}

                      {/* Card footer */}
                      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-700/50 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-zinc-400" />
                          <span className="truncate max-w-[80px]">{t.assignedTo?.name || 'Unassigned'}</span>
                        </span>

                        {t.dueDate ? (
                          <span className="flex items-center gap-1 text-zinc-500">
                            <Clock className="w-3 h-3 text-zinc-400" />
                            {new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : currentView === 'list' ? (
        /* LIST VIEW */
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Task</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Priority</th>
                  <th className="px-6 py-3.5">Assignee</th>
                  <th className="px-6 py-3.5">Team</th>
                  <th className="px-6 py-3.5">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                {tasks.map((t) => (
                  <tr
                    key={t._id}
                    onClick={() => {
                      setSelectedTask(t);
                      setModalError('');
                      setDetailModalOpen(true);
                    }}
                    className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-zinc-900 dark:text-zinc-100">
                      <div>{t.title}</div>
                      {t.tags?.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {t.tags.map((tag) => (
                            <span key={tag} className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        {t.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${priorityBadges[t.priority]}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-700 dark:text-zinc-300">
                      {t.assignedTo?.name || 'Unassigned'}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 dark:text-zinc-400">
                      {t.team?.name || '—'}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 dark:text-zinc-400">
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* CALENDAR VIEW */
        <Card className="space-y-4">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-600" /> Deadline Calendar Overview
            </h2>
            <span className="text-xs text-zinc-400">Real tasks plotted by dueDate</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {tasks.map((t) => (
              <div
                key={t._id}
                onClick={() => {
                  setSelectedTask(t);
                  setModalError('');
                  setDetailModalOpen(true);
                }}
                className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700/60 hover:border-brand-500 cursor-pointer space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                    {t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No Due Date'}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${priorityBadges[t.priority]}`}>
                    {t.priority}
                  </span>
                </div>
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">{t.title}</p>
                <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                  <User className="w-3 h-3" /> {t.assignedTo?.name || 'Unassigned'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Task Creation Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Task"
        description="Allocate work items with team scoping and assigned ownership."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {modalError && <Alert type="error" message={modalError} />}

          <Input
            label="Task Title"
            required
            value={createForm.title}
            onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
          />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Description
            </label>
            <textarea
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              className="w-full text-sm p-3 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Priority
              </label>
              <select
                value={createForm.priority}
                onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                className="w-full py-2 px-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <Input
              label="Due Date"
              type="date"
              value={createForm.dueDate}
              onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
            />
          </div>

          {isAdmin && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Team
              </label>
              <select
                value={createForm.team}
                onChange={(e) => setCreateForm({ ...createForm, team: e.target.value })}
                className="w-full py-2 px-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
              >
                <option value="">Select Team...</option>
                {teams.map((t) => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Assignee <span className="text-red-500">*</span>
            </label>
            <select
              value={createForm.assignedTo}
              onChange={(e) => setCreateForm({ ...createForm, assignedTo: e.target.value })}
              required
              className="w-full py-2 px-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
            >
              <option value="">Select Assignee...</option>
              {assignees.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} ({u.role}) {u.department ? `[${u.department}]` : ''}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Tags (comma-separated)"
            placeholder="frontend, auth, bug"
            icon={Tag}
            value={createForm.tags}
            onChange={(e) => setCreateForm({ ...createForm, tags: e.target.value })}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={formLoading}>
              Create Task
            </Button>
          </div>
        </form>
      </Modal>

      {/* Task Details Modal with Status Changer, Comments, and Audit Trail */}
      {selectedTask && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={selectedTask.title}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-6">
            {modalError && <Alert type="error" message={modalError} />}

            {/* Work Session Tracker (if assigned to current user) */}
            {((selectedTask.assignedTo?._id || selectedTask.assignedTo) === user._id && selectedTask.status !== 'Done') && (
              <div className="p-4 bg-purple-50/60 dark:bg-purple-950/20 rounded-xl border border-purple-200/70 dark:border-purple-900/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Timer className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Work Session Tracker
                  </span>

                  {activeSession && (
                    <Badge variant={activeSession.state === 'active' ? 'primary' : 'neutral'}>
                      {activeSession.state === 'active' ? '● Recording Work' : '❚❚ Paused'}
                    </Badge>
                  )}
                </div>

                {activeSession && (activeSession.task?._id === selectedTask._id || activeSession.task === selectedTask._id) ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div>
                      <div className="text-2xl font-mono font-bold tracking-tight text-purple-950 dark:text-purple-100">
                        {formatSeconds(elapsedSeconds)}
                      </div>
                      <span className="text-[11px] text-purple-600 dark:text-purple-400">
                        {activeSession.interruptions} interruption{activeSession.interruptions === 1 ? '' : 's'} recorded
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeSession.state === 'active' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={Pause}
                          isLoading={sessionLoading}
                          onClick={handlePauseSession}
                        >
                          Pause
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={Play}
                          isLoading={sessionLoading}
                          onClick={handleResumeSession}
                        >
                          Resume
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        icon={Square}
                        isLoading={sessionLoading}
                        onClick={handleStopSession}
                      >
                        Stop
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      Track your focused work on this task with server-verified timestamps.
                    </p>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Play}
                      isLoading={sessionLoading}
                      onClick={handleStartSession}
                    >
                      Start Session
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Workflow status controller */}
            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
                  Workflow Status
                </span>
                <span className="text-sm font-bold text-brand-600 dark:text-brand-400">
                  {selectedTask.status}
                </span>
              </div>

              {/* Status transition dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Move to:</span>
                <select
                  value={selectedTask.status}
                  onChange={(e) => handleStatusChange(selectedTask._id, e.target.value)}
                  className="py-1.5 px-2.5 text-xs font-semibold rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700"
                >
                  {STATUS_COLUMNS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-zinc-50/70 dark:bg-zinc-800/40 rounded-lg">
                <span className="text-zinc-400 block mb-0.5">Assignee</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {selectedTask.assignedTo?.name || 'Unassigned'}
                </span>
              </div>
              <div className="p-2.5 bg-zinc-50/70 dark:bg-zinc-800/40 rounded-lg">
                <span className="text-zinc-400 block mb-0.5">Priority</span>
                <span className={`font-semibold ${priorityBadges[selectedTask.priority]}`}>
                  {selectedTask.priority}
                </span>
              </div>
              <div className="p-2.5 bg-zinc-50/70 dark:bg-zinc-800/40 rounded-lg">
                <span className="text-zinc-400 block mb-0.5">Team</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {selectedTask.team?.name || '—'}
                </span>
              </div>
              <div className="p-2.5 bg-zinc-50/70 dark:bg-zinc-800/40 rounded-lg">
                <span className="text-zinc-400 block mb-0.5">Due Date</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : 'No date'}
                </span>
              </div>
            </div>

            {selectedTask.description && (
              <div className="space-y-1 text-xs">
                <span className="font-semibold text-zinc-500 uppercase tracking-wider block">
                  Description
                </span>
                <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap p-3 bg-zinc-50/50 dark:bg-zinc-800/20 rounded-lg border border-zinc-200/60 dark:border-zinc-800">
                  {selectedTask.description}
                </p>
              </div>
            )}

            {/* Task File Attachments */}
            <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" /> Attachments ({taskFiles.length})
                </h4>

                {!isEmployee && (
                  <label className="cursor-pointer inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                    <Plus className="w-3.5 h-3.5" />
                    <span>{uploadingFile ? 'Uploading...' : 'Attach File'}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleUploadTaskFile}
                      disabled={uploadingFile}
                    />
                  </label>
                )}
              </div>

              {loadingFiles ? (
                <p className="text-xs text-zinc-400">Loading attachments...</p>
              ) : taskFiles.length === 0 ? (
                <p className="text-xs text-zinc-400 italic">No files attached to this task.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {taskFiles.map((f) => (
                    <div
                      key={f._id}
                      className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-700/60 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[150px]">
                            {f.originalName}
                          </p>
                          <p className="text-[10px] text-zinc-400">
                            {formatFileSize(f.size)} • {f.uploadedBy?.name || 'User'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={filesApi.downloadFileUrl(f._id)}
                          download={f.originalName}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded text-zinc-500 hover:text-brand-600 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                          title="Download file"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        {!isEmployee && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTaskFile(f._id, f.originalName)}
                            className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            title="Delete file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comments Feed */}
            <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Comments ({selectedTask.comments?.length || 0})
              </h4>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedTask.comments?.length > 0 ? (
                  selectedTask.comments.map((c) => (
                    <div key={c._id} className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 text-xs border border-zinc-200/60 dark:border-zinc-800 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {c.author?.name || 'Team Member'}
                        </span>
                        <span className="text-zinc-400">
                          {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400">{c.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-400 italic">No comments yet on this task.</p>
                )}
              </div>

              {/* Add comment form */}
              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Write a progress update or note..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="flex-1 text-xs py-2 px-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <Button type="submit" size="sm" variant="primary" icon={Send} isLoading={formLoading}>
                  Send
                </Button>
              </form>
            </div>

            {/* Audit History Trail */}
            <div className="space-y-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Audit History Trail
              </h4>
              <div className="space-y-1.5 max-h-32 overflow-y-auto text-[11px] pr-1">
                {selectedTask.history?.map((h) => (
                  <div key={h._id} className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 py-1 border-b border-zinc-100 dark:border-zinc-800/60">
                    <span>
                      <strong className="text-zinc-700 dark:text-zinc-300 font-medium">{h.changedBy?.name || 'User'}</strong>{' '}
                      {h.action === 'created' ? 'created task' : `${h.action}: ${h.oldValue || ''} → ${h.newValue || ''}`}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {new Date(h.changedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action footer */}
            {!isEmployee && (
              <div className="flex justify-between items-center pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => handleDeleteTask(selectedTask._id)}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Task
                </button>
                <Button variant="secondary" size="sm" onClick={() => setDetailModalOpen(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
