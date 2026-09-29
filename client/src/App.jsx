import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { RoleRoute } from './routes/RoleRoute.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';

// Pages
import { LoginPage } from './pages/auth/LoginPage.jsx';
import { RegisterPage } from './pages/auth/RegisterPage.jsx';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage.jsx';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage.jsx';
import { DashboardPage } from './pages/dashboard/DashboardPage.jsx';
import { UsersPage } from './pages/users/UsersPage.jsx';
import { TeamsPage } from './pages/teams/TeamsPage.jsx';
import { TasksPage } from './pages/tasks/TasksPage.jsx';
import { ChatPage } from './pages/chat/ChatPage.jsx';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage.jsx';
import { StandupPage } from './pages/standup/StandupPage.jsx';
import { TeamStandupPage } from './pages/standup/TeamStandupPage.jsx';
import { MeetingsPage } from './pages/meetings/MeetingsPage.jsx';
import { MeetingRoomPage } from './pages/meetings/MeetingRoomPage.jsx';
import { SettingsPage } from './pages/settings/SettingsPage.jsx';
import { ProfilePage } from './pages/profile/ProfilePage.jsx';
import { UnauthorizedPage } from './pages/errors/UnauthorizedPage.jsx';
import { NotFoundPage } from './pages/errors/NotFoundPage.jsx';

export const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Auth Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
              <Route path="/unauthorized" element={<UnauthorizedPage />} />

              {/* Protected Application Routes inside AppLayout */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />

                {/* Tasks: all authenticated roles (internal role scoping) */}
                <Route path="/tasks" element={<TasksPage />} />

                {/* Chat: all authenticated roles */}
                <Route path="/chat" element={<ChatPage />} />

                {/* Analytics: all authenticated roles */}
                <Route path="/analytics" element={<AnalyticsPage />} />

                {/* Standup: employee personal standup */}
                <Route path="/standup" element={<StandupPage />} />

                {/* Meetings: all authenticated roles */}
                <Route path="/meetings" element={<MeetingsPage />} />
                <Route path="/meetings/:meetingId" element={<MeetingRoomPage />} />

                {/* Team Standup: Manager and Admin */}
                <Route
                  element={<RoleRoute allowedRoles={['admin', 'manager']} />}
                >
                  <Route path="/team-standup" element={<TeamStandupPage />} />
                  <Route path="/teams" element={<TeamsPage />} />
                </Route>

                {/* Users: Admin only */}
                <Route
                  element={<RoleRoute allowedRoles={['admin']} />}
                >
                  <Route path="/users" element={<UsersPage />} />
                </Route>
              </Route>

              {/* Default root redirect */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              {/* 404 Route */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
