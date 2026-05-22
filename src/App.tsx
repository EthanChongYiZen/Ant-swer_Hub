import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './components/ui/toast'
import { RequireAuth, RequireRegion } from './components/Guards'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SelectRegionPage from './pages/SelectRegionPage'
import DashboardLayout from './pages/DashboardLayout'
import ChatPage from './pages/ChatPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import ForumPage from './pages/ForumPage'
import SupportPage from './pages/SupportPage'
import AIAssistantPage from './pages/AIAssistantPage'
import AdminPage from './pages/AdminPage'
import AdminRedirect from './pages/AdminRedirect'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route element={<RequireAuth />}>
              <Route path="/select-region" element={<SelectRegionPage />} />

              <Route element={<RequireRegion />}>
                <Route path="/dashboard" element={<DashboardLayout />}>
                  <Route index element={<AdminRedirect />} />
                  <Route path="chat" element={<ChatPage />} />
                  <Route path="announcements" element={<AnnouncementsPage />} />
                  <Route path="forum" element={<ForumPage />} />
                  <Route path="support" element={<SupportPage />} />
                  <Route path="ai-assistant" element={<AIAssistantPage />} />
                  <Route path="admin" element={<AdminPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  {/* Legacy redirect for old group-chat and blog URLs */}
                  <Route path="group-chat" element={<Navigate to="/dashboard/chat" replace />} />
                  <Route path="blog" element={<Navigate to="/dashboard/forum" replace />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
