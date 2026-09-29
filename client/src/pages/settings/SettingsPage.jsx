import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { usersApi } from '../../api/users.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import {
  User,
  Shield,
  Bell,
  Sun,
  Moon,
  Monitor,
  Camera,
  Save,
  Key,
  CheckCircle2,
} from 'lucide-react';

export const SettingsPage = () => {
  const { user, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState('account');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Account form state
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(null);

  // Security form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Notifications state
  const [notifications, setNotifications] = useState({
    taskAssignments: true,
    taskDeadlines: true,
    messages: true,
    fileUploads: true,
    teamMembership: true,
  });

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setDepartment(user.department || '');
      setPosition(user.position || '');
      if (user.settings?.notifications) {
        setNotifications((prev) => ({ ...prev, ...user.settings.notifications }));
      }
      setLoading(false);
    }
  }, [user]);

  const clearMessages = () => {
    setSuccessMsg('');
    setErrorMsg('');
  };

  // 1. Save Profile Account details
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    clearMessages();
    setSaving(true);
    try {
      const res = await usersApi.updateMyProfile({ name, department, position });
      if (res.data?.user) {
        updateUser(res.data.user);
      }
      setSuccessMsg('Account details updated successfully.');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update account.');
    } finally {
      setSaving(false);
    }
  };

  // 2. Upload Avatar Image
  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    clearMessages();
    const formData = new FormData();
    formData.append('avatar', file);

    setSaving(true);
    try {
      const res = await usersApi.uploadAvatar(formData);
      if (res.data?.user) {
        updateUser(res.data.user);
      }
      setAvatarPreview(URL.createObjectURL(file));
      setSuccessMsg('Profile photo updated successfully.');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to upload photo.');
    } finally {
      setSaving(false);
    }
  };

  // 3. Save Theme & Persist to DB
  const handleThemeChange = async (newTheme) => {
    clearMessages();
    try {
      await setTheme(newTheme);
      setSuccessMsg(`Appearance preference set to ${newTheme}.`);
    } catch (err) {
      setErrorMsg('Failed to persist theme preference.');
    }
  };

  // 4. Change Password
  const handleChangePassword = async (e) => {
    e.preventDefault();
    clearMessages();

    if (newPassword !== confirmPassword) {
      setErrorMsg('New password and confirmation do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters long.');
      return;
    }

    setSaving(true);
    try {
      await usersApi.changePassword({ currentPassword, newPassword });
      setSuccessMsg('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  // 5. Toggle and Save Notification Preferences
  const handleToggleNotification = async (key) => {
    const nextState = { ...notifications, [key]: !notifications[key] };
    setNotifications(nextState);
    clearMessages();

    try {
      const res = await usersApi.updateMySettings({ notifications: nextState });
      if (res.data?.user) {
        updateUser(res.data.user);
      }
      setSuccessMsg('Notification preferences updated.');
    } catch (err) {
      setErrorMsg('Failed to update notification settings.');
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading user account settings..." />;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-card p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Account Settings
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          Manage your personal profile details, appearance themes, security credentials, and notifications.
        </p>
      </div>

      {successMsg && <Alert type="success" message={successMsg} />}
      {errorMsg && <Alert type="error" message={errorMsg} />}

      {/* Tabs Navigation */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-6 text-xs font-semibold">
        {[
          { id: 'account', label: 'Account', icon: User },
          { id: 'appearance', label: 'Appearance', icon: Sun },
          { id: 'security', label: 'Security', icon: Shield },
          { id: 'notifications', label: 'Notifications', icon: Bell },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                clearMessages();
              }}
              className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
                isActive
                  ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Account Profile */}
      {activeTab === 'account' && (
        <Card className="p-6 space-y-6">
          {/* Avatar Section */}
          <div className="flex items-center gap-4 pb-6 border-b border-zinc-100 dark:border-zinc-800">
            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : user?.avatar ? (
                <img
                  src={`/api/users/${user._id}/avatar`}
                  alt={user?.name || 'Profile'}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <span className="text-xl font-bold text-zinc-400">
                  {user?.name?.charAt(0) || 'U'}
                </span>
              )}
            </div>

            <div>
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors">
                <Camera className="w-3.5 h-3.5" />
                <span>Change Photo</span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </label>
              <p className="text-[11px] text-zinc-400 mt-1">PNG, JPG, or WEBP up to 5MB.</p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Email Address (Read-only)
                </label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-400 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  placeholder="e.g., Engineering or Design"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Job Position
                </label>
                <input
                  type="text"
                  placeholder="e.g., Senior Software Engineer"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <Button type="submit" variant="primary" size="sm" icon={Save} isLoading={saving}>
                Save Changes
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tab 2: Appearance */}
      {activeTab === 'appearance' && (
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Interface Theme</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Select your preferred color scheme. Preferences are saved authoritatively to your account.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {[
              { id: 'light', label: 'Light', icon: Sun, desc: 'Clean high-contrast light mode' },
              { id: 'dark', label: 'Dark', icon: Moon, desc: 'Sleek low-glare dark theme' },
              { id: 'system', label: 'System', icon: Monitor, desc: 'Matches device OS appearance' },
            ].map((opt) => {
              const Icon = opt.icon;
              const isSelected = theme === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => handleThemeChange(opt.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-brand-600 bg-brand-50/20 dark:bg-brand-950/20 ring-1 ring-brand-500'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-400'}`} />
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
                  </div>
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{opt.label}</h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{opt.desc}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Tab 3: Security */}
      {activeTab === 'security' && (
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Key className="w-4 h-4 text-brand-600" /> Change Password
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Passwords must be at least 8 characters long.
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md pt-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full text-xs p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full text-xs p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full text-xs p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <Button type="submit" variant="primary" size="sm" isLoading={saving}>
              Update Password
            </Button>
          </form>
        </Card>
      )}

      {/* Tab 4: Notifications */}
      {activeTab === 'notifications' && (
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Notification Preferences</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Customize which notifications you receive in your in-app bell dropdown.
            </p>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 pt-2">
            {[
              {
                key: 'taskAssignments',
                title: 'Task Assignments',
                desc: 'Notify when new tasks are assigned to you.',
              },
              {
                key: 'taskDeadlines',
                title: 'Deadline Reminders',
                desc: 'Notify when assigned task deadlines approach or change.',
              },
              {
                key: 'messages',
                title: 'Chat Messages',
                desc: 'In-app notification for incoming direct and team chat messages.',
              },
              {
                key: 'fileUploads',
                title: 'File Attachments',
                desc: 'Notify when attachments are added to tasks you are working on.',
              },
              {
                key: 'teamMembership',
                title: 'Team Updates',
                desc: 'Notify when team memberships or roster assignments are updated.',
              },
            ].map((item) => (
              <div key={item.key} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-zinc-400">{item.desc}</p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications[item.key] !== false}
                    onChange={() => handleToggleNotification(item.key)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-brand-600" />
                </label>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
