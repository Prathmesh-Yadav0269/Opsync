import React, { useState, useEffect, useCallback } from 'react';
import { teamsApi } from '../../api/teams.js';
import { usersApi } from '../../api/users.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import {
  Layers,
  Plus,
  UserPlus,
  UserMinus,
  Archive,
  Trash2,
  Edit2,
  Shield,
  Users,
} from 'lucide-react';

export const TeamsPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';

  const [teams, setTeams] = useState([]);
  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [availableManagers, setAvailableManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    manager: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const teamsRes = await teamsApi.getTeams();
      setTeams(teamsRes.data?.teams || []);

      if (isAdmin) {
        const usersRes = await usersApi.getUsers();
        const allUsers = usersRes.data?.users || [];
        setAvailableManagers(allUsers.filter((u) => u.role === 'manager'));
        setAvailableEmployees(allUsers.filter((u) => u.role === 'employee'));
      } else if (isManager) {
        // Manager can fetch unassigned employees or team members
        const usersRes = await usersApi.getUsers().catch(() => ({ data: { users: [] } }));
        setAvailableEmployees((usersRes.data?.users || []).filter((u) => u.role === 'employee'));
      }
    } catch (err) {
      setError(err.message || 'Failed to load teams.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isManager]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setFormLoading(true);
    try {
      await teamsApi.createTeam({
        name: createForm.name,
        description: createForm.description,
        manager: createForm.manager || null,
      });
      setActionSuccess(`Team '${createForm.name}' created successfully.`);
      setCreateModalOpen(false);
      setCreateForm({ name: '', description: '', manager: '' });
      loadData();
    } catch (err) {
      setModalError(err.message || 'Failed to create team.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setFormLoading(true);
    try {
      await teamsApi.updateTeam(selectedTeam._id, {
        name: selectedTeam.name,
        description: selectedTeam.description,
        manager: selectedTeam.manager?._id || selectedTeam.manager || null,
      });
      setActionSuccess(`Team '${selectedTeam.name}' updated successfully.`);
      setEditModalOpen(false);
      loadData();
    } catch (err) {
      setModalError(err.message || 'Failed to update team.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setModalError('Please select an employee.');
      return;
    }
    setFormLoading(true);
    setModalError('');
    try {
      await teamsApi.addMember(selectedTeam._id, selectedEmployeeId);
      setActionSuccess('Employee added to team successfully.');
      setAddMemberModalOpen(false);
      setSelectedEmployeeId('');
      loadData();
    } catch (err) {
      setModalError(err.message || 'Failed to add member.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleRemoveMember = async (teamId, userId, memberName) => {
    try {
      await teamsApi.removeMember(teamId, userId);
      setActionSuccess(`Removed '${memberName}' from team.`);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to remove member.');
    }
  };

  const handleToggleArchive = async (team) => {
    try {
      await teamsApi.toggleArchiveTeam(team._id);
      setActionSuccess(`Team '${team.name}' ${team.isArchived ? 'restored' : 'archived'}.`);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to toggle archive.');
    }
  };

  const handleDeleteConfirm = async () => {
    setFormLoading(true);
    try {
      await teamsApi.deleteTeam(selectedTeam._id);
      setActionSuccess(`Team '${selectedTeam.name}' deleted safely.`);
      setDeleteModalOpen(false);
      loadData();
    } catch (err) {
      setModalError(err.message || 'Failed to delete team.');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Layers className="w-6 h-6 text-brand-600" /> {isAdmin ? 'Team Management' : 'My Team'}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAdmin
              ? 'Organize workspace departments, assign team managers, and allocate team memberships.'
              : 'View and coordinate members within your assigned team.'}
          </p>
        </div>

        {isAdmin && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => {
              setModalError('');
              setCreateModalOpen(true);
            }}
          >
            Create Team
          </Button>
        )}
      </div>

      {actionSuccess && <Alert type="success" message={actionSuccess} />}
      {error && <Alert type="error" message={error} />}

      {/* Teams Grid */}
      {loading ? (
        <LoadingSpinner message="Loading team directory..." />
      ) : teams.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={Layers}
            title={isAdmin ? 'No teams created yet' : 'You do not manage a team yet'}
            description={
              isAdmin
                ? 'Create a team to group workspace employees and assign team managers.'
                : 'An administrator will assign you to manage a team in this workspace.'
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {teams.map((t) => (
            <Card key={t._id} className="flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{t.name}</h2>
                      {t.isArchived && <Badge variant="neutral">Archived</Badge>}
                    </div>
                    {t.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t.description}</p>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTeam({ ...t });
                          setModalError('');
                          setEditModalOpen(true);
                        }}
                        className="p-1.5 text-zinc-400 hover:text-brand-600 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Edit Team"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleArchive(t)}
                        className="p-1.5 text-zinc-400 hover:text-amber-600 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title={t.isArchived ? 'Restore Team' : 'Archive Team'}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTeam(t);
                          setModalError('');
                          setDeleteModalOpen(true);
                        }}
                        className="p-1.5 text-zinc-400 hover:text-red-600 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Delete Team"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Manager Information */}
                <div className="py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                  <span className="text-zinc-500 flex items-center gap-1.5 font-medium">
                    <Shield className="w-3.5 h-3.5 text-brand-600" /> Team Manager:
                  </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {t.manager ? `${t.manager.name} (${t.manager.email})` : <span className="text-zinc-400 italic">Unassigned</span>}
                  </span>
                </div>

                {/* Members list */}
                <div className="pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Members ({t.members?.length || 0})
                    </span>
                    {(isAdmin || isManager) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={UserPlus}
                        onClick={() => {
                          setSelectedTeam(t);
                          setSelectedEmployeeId('');
                          setModalError('');
                          setAddMemberModalOpen(true);
                        }}
                      >
                        Add Member
                      </Button>
                    )}
                  </div>

                  {!t.members || t.members.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic py-2">No employee members currently in this team.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {t.members.map((m) => (
                        <div
                          key={m._id}
                          className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 text-xs border border-zinc-200/60 dark:border-zinc-800"
                        >
                          <div>
                            <span className="font-medium text-zinc-900 dark:text-zinc-100 block">{m.name}</span>
                            <span className="text-[11px] text-zinc-400 block">{m.email} {m.position ? `• ${m.position}` : ''}</span>
                          </div>
                          {(isAdmin || isManager) && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(t._id, m._id, m.name)}
                              className="text-zinc-400 hover:text-red-500 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                              title="Remove from team"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Team Modal (Admin) */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Team"
        description="Establish a new department or team unit and assign leadership."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {modalError && <Alert type="error" message={modalError} />}

          <Input
            label="Team Name"
            required
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
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

          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Assign Team Manager
            </label>
            <select
              value={createForm.manager}
              onChange={(e) => setCreateForm({ ...createForm, manager: e.target.value })}
              className="w-full py-2 px-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
            >
              <option value="">No Manager (Assign later)</option>
              {availableManagers.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={formLoading}>
              Create Team
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Team Modal (Admin) */}
      {selectedTeam && (
        <Modal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title={`Edit Team: ${selectedTeam.name}`}
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {modalError && <Alert type="error" message={modalError} />}

            <Input
              label="Team Name"
              required
              value={selectedTeam.name}
              onChange={(e) => setSelectedTeam({ ...selectedTeam, name: e.target.value })}
            />

            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Description
              </label>
              <textarea
                rows={3}
                value={selectedTeam.description || ''}
                onChange={(e) =>
                  setSelectedTeam({ ...selectedTeam, description: e.target.value })
                }
                className="w-full text-sm p-3 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Team Manager
              </label>
              <select
                value={selectedTeam.manager?._id || selectedTeam.manager || ''}
                onChange={(e) =>
                  setSelectedTeam({
                    ...selectedTeam,
                    manager: e.target.value ? e.target.value : null,
                  })
                }
                className="w-full py-2 px-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
              >
                <option value="">No Manager</option>
                {availableManagers.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <Button variant="secondary" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={formLoading}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Member Modal */}
      {selectedTeam && (
        <Modal
          isOpen={addMemberModalOpen}
          onClose={() => setAddMemberModalOpen(false)}
          title={`Add Member to ${selectedTeam.name}`}
          description="Select an employee account to assign to this team."
        >
          <form onSubmit={handleAddMemberSubmit} className="space-y-4">
            {modalError && <Alert type="error" message={modalError} />}

            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Employee
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full py-2 px-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
                required
              >
                <option value="">Select Employee...</option>
                {availableEmployees
                  .filter((emp) => !selectedTeam.members?.some((m) => (m._id || m) === emp._id))
                  .map((emp) => (
                    <option key={emp._id} value={emp._id}>
                      {emp.name} ({emp.email}) {emp.department ? `[${emp.department}]` : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <Button variant="secondary" onClick={() => setAddMemberModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={formLoading}>
                Add Member
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Team Modal (Admin) */}
      {selectedTeam && (
        <Modal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Confirm Safe Team Deletion"
        >
          <div className="space-y-4">
            {modalError && <Alert type="error" message={modalError} />}
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Are you sure you want to delete team{' '}
              <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                {selectedTeam.name}
              </strong>?
            </p>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-800 dark:text-amber-300">
              Referential safety will block deletion if there are unresolved tasks assigned to this team.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" isLoading={formLoading} onClick={handleDeleteConfirm}>
                Delete Team
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
