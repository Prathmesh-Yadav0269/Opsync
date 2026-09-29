import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { userApi } from '../../api/user.js';
import { authApi } from '../../api/auth.js';
import { useTheme } from '../../context/ThemeContext.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import {
  User,
  Shield,
  Building,
  Briefcase,
  Key,
  Lock,
  Palette,
  CheckCircle2,
} from 'lucide-react';

export const ProfilePage = () => {
  const { user, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();

  // Profile info state
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    department: user?.department || '',
    position: user?.position || '',
    theme: user?.settings?.theme || theme || 'system',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSuccess('');
    setProfileError('');

    if (!profileForm.name.trim()) {
      setProfileError('Name cannot be empty');
      return;
    }

    setProfileLoading(true);
    try {
      const res = await userApi.updateMyProfile(profileForm);
      if (res.data?.user) {
        updateUser(res.data.user);
        if (profileForm.theme) {
          setTheme(profileForm.theme);
        }
      }
      setProfileSuccess('Profile updated successfully.');
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordSuccess('');
    setPasswordError('');

    if (!passwordForm.currentPassword) {
      setPasswordError('Current password is required');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      await authApi.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordSuccess('Password changed successfully.');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Account Profile & Preferences
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage your personal details, workspace preferences, and authentication security.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Information */}
        <Card className="space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <User className="w-4 h-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Personal Information
            </h2>
          </div>

          {profileSuccess && <Alert type="success" message={profileSuccess} />}
          {profileError && <Alert type="error" message={profileError} />}

          <form onSubmit={handleProfileSubmit} className="space-y-3.5">
            <Input
              label="Full Name"
              id="profile-name"
              required
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
            />

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Email Address
              </label>
              <input
                type="text"
                disabled
                value={user?.email || ''}
                className="w-full text-sm py-2 px-3 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 rounded-lg text-zinc-500 cursor-not-allowed"
              />
              <p className="text-[11px] text-zinc-400 mt-1">Email is verified and fixed.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Department"
                id="profile-dept"
                icon={Building}
                placeholder="e.g. Engineering"
                value={profileForm.department}
                onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
              />
              <Input
                label="Position"
                id="profile-pos"
                icon={Briefcase}
                placeholder="e.g. Developer"
                value={profileForm.position}
                onChange={(e) => setProfileForm({ ...profileForm, position: e.target.value })}
              />
            </div>

            <div className="space-y-1.5 pt-1">
              <label htmlFor="theme-select" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Theme Preference
              </label>
              <div className="relative">
                <select
                  id="theme-select"
                  value={profileForm.theme}
                  onChange={(e) => {
                    setProfileForm({ ...profileForm, theme: e.target.value });
                    setTheme(e.target.value);
                  }}
                  className="w-full text-sm py-2 px-3 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="system">System (Follow OS mode)</option>
                  <option value="light">Light Mode</option>
                  <option value="dark">Dark Mode</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={profileLoading}
                className="w-full sm:w-auto"
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Card>

        {/* Change Password */}
        <Card className="space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <Key className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Security & Password
            </h2>
          </div>

          {passwordSuccess && <Alert type="success" message={passwordSuccess} />}
          {passwordError && <Alert type="error" message={passwordError} />}

          <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
            <Input
              label="Current Password"
              id="current-password"
              type="password"
              required
              icon={Lock}
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
              }
            />

            <Input
              label="New Password"
              id="new-password"
              type="password"
              required
              icon={Lock}
              placeholder="Minimum 8 characters"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, newPassword: e.target.value })
              }
            />

            <Input
              label="Confirm New Password"
              id="confirm-password"
              type="password"
              required
              icon={Lock}
              placeholder="Repeat new password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
              }
            />

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={passwordLoading}
                className="w-full sm:w-auto"
              >
                Update Password
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* Role & Permissions Read-Only Card */}
      <Card className="space-y-3 bg-zinc-50/50 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Role & System Permissions
            </h3>
          </div>
          <Badge variant={user?.role}>{user?.role || 'employee'}</Badge>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          User roles dictate workspace permissions and cannot be modified via self-service profile updates.
          Administrator privileges are assigned via backend seed or admin management in Phase 2.
        </p>
      </Card>
    </div>
  );
};
