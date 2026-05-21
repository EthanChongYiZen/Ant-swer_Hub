import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function AdminRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin' || user.role === 'manager') {
    return <Navigate to="/dashboard/admin" replace />
  }
  return <Navigate to="/dashboard/group-chat" replace />
}
