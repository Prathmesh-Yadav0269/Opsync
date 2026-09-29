import React, { useState, useEffect, useCallback } from 'react';
import { usersApi } from '../../api/users.js';
import { teamsApi } from '../../api/teams.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import {
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Users,
  Shield,
  Clock,
} from 'lucide-react';

export const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    department: '',
    position: '',
    team: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, teamsRes] = await Promise.all([
        usersApi.getUsers({ search: searchTerm, role: roleFilter }),
        teamsApi.getTeams().catch(() => ({ data: { teams: [] } })),
      ]);
      setUsers(usersRes.data?.users || []);
      setTeams(teamsRes.data?.teams || []);
    } catch (err) {
      setError(err.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, roleFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setFormLoading(true);
    try {
      await usersApi.createUser(createForm);
      setActionSuccess(`User '${createForm.name}' created successfully.`);
      setCreateModalOpen(false);
      setCreateForm({
        name: '',
        email: '',
        password: '',
        role: 'employee',
        department: '',
        position: '',
        team: '',
      });
      loadData();
    } catch (err) {
      setModalError(err.message || 'Failed to create user.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setFormLoading(true);
    try {
      await usersApi.updateUser(selectedUser._id, {
        name: selectedUser.name,
        role: selectedUser.role,
        department: selectedUser.department,
        position: selectedUser.position,
        team: selectedUser.team?._id || selectedUser.team || null,
      });
      setActionSuccess(`User '${selectedUser.name}' updated successfully.`);
      setEditModalOpen(false);
      loadData();
    } catch (err) {
      setModalError(err.message || 'Failed to update user.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleStatus = async (user) => {
    try {
      await usersApi.updateUserStatus(user._id, !user.isActive);
      setActionSuccess(`User '${user.name}' has been ${!user.isActive ? 'activated' : 'deactivated'}.`);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to update user status.');
    }
  };

  const handleDeleteConfirm = async () => {
    setFormLoading(true);
    try {
      await usersApi.deleteUser(selectedUser._id);
      setActionSuccess(`User '${selectedUser.name}' deleted safely.`);
      setDeleteModalOpen(false);
      loadData();
    } catch (err) {
      setModalError(err.message || 'Failed to delete user.');
    } finally {
      setFormLoading(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return 'Never';
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-600" /> User Management
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Administer workspace user accounts, access roles, and organizational assignments.
          </p>
        </div>
        <Button
          variant="primary"
          icon={UserPlus}
          onClick={() => {
            setModalError('');
            setCreateModalOpen(true);
          }}
        >
          Create User
        </Button>
      </div>

      {actionSuccess && <Alert type="success" message={actionSuccess} />}
      {error && <Alert type="error" message={error} />}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name, email, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="employee">Employee</option>
        </select>
      </div>

      {/* Users Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <LoadingSpinner message="Loading user directory..." />
        ) : users.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Users}
              title="No users found"
              description="No user accounts match the current filter criteria."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Team</th>
                  <th className="px-6 py-3.5">Department</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Last Login</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">{u.name}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{u.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={u.role}>{u.role}</Badge>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-600 dark:text-zinc-400">
                      {u.team?.name || <span className="text-zinc-400 italic">None</span>}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-600 dark:text-zinc-400">
                      {u.department || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(u)}
                        title={`Click to ${u.isActive ? 'deactivate' : 'activate'}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium focus:outline-none"
                      >
                        {u.isActive ? (
                          <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" /> Active
                          </span>
                        ) : (
                          <span className="text-red-500 dark:text-red-400 flex items-center gap-1">
                            <XCircle className="w-4 h-4" /> Inactive
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        {formatDate(u.lastLogin)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUser({ ...u });
                            setModalError('');
                            setEditModalOpen(true);
                          }}
                          className="p-1.5 text-zinc-500 hover:text-brand-600 dark:hover:text-brand-400 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUser(u);
                            setModalError('');
                            setDeleteModalOpen(true);
                          }}
                          className="p-1.5 text-zinc-500 hover:text-red-600 dark:hover:text-red-400 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create User Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New User Account"
        description="Administratively create a Manager or Employee account."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {modalError && <Alert type="error" message={modalError} />}

          <Input
            label="Full Name"
            required
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
          />

          <Input
            label="Email Address"
            type="email"
            required
            value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
          />

          <Input
            label="Initial Password"
            type="password"
            required
            helperText="Minimum 8 characters"
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
          />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              className="w-full py-2 px-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Department"
              value={createForm.department}
              onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
            />
            <Input
              label="Position"
              value={createForm.position}
              onChange={(e) => setCreateForm({ ...createForm, position: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Assigned Team (Optional)
            </label>
            <select
              value={createForm.team}
              onChange={(e) => setCreateForm({ ...createForm, team: e.target.value })}
              className="w-full py-2 px-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
            >
              <option value="">No Team</option>
              {teams.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={formLoading}>
              Create User
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      {selectedUser && (
        <Modal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title={`Edit User: ${selectedUser.name}`}
          description="Update account role, organizational assignment, and profile details."
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {modalError && <Alert type="error" message={modalError} />}

            <Input
              label="Full Name"
              required
              value={selectedUser.name}
              onChange={(e) => setSelectedUser({ ...selectedUser, name: e.target.value })}
            />

            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Role
              </label>
              <select
                value={selectedUser.role}
                onChange={(e) => setSelectedUser({ ...selectedUser, role: e.target.value })}
                className="w-full py-2 px-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Department"
                value={selectedUser.department || ''}
                onChange={(e) => setSelectedUser({ ...selectedUser, department: e.target.value })}
              />
              <Input
                label="Position"
                value={selectedUser.position || ''}
                onChange={(e) => setSelectedUser({ ...selectedUser, position: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Assigned Team
              </label>
              <select
                value={selectedUser.team?._id || selectedUser.team || ''}
                onChange={(e) =>
                  setSelectedUser({
                    ...selectedUser,
                    team: e.target.value ? e.target.value : null,
                  })
                }
                className="w-full py-2 px-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
              >
                <option value="">No Team</option>
                {teams.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
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

      {/* Delete User Confirmation Modal */}
      {selectedUser && (
        <Modal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Confirm Safe User Deletion"
        >
          <div className="space-y-4">
            {modalError && <Alert type="error" message={modalError} />}
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Are you sure you want to delete user{' '}
              <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                {selectedUser.name}
              </strong>{' '}
              ({selectedUser.email})?
            </p>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-800 dark:text-amber-300">
              Referential safety enforcement will block deletion if this user is actively managing a team or has unresolved assigned tasks.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" isLoading={formLoading} onClick={handleDeleteConfirm}>
                Delete User
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
