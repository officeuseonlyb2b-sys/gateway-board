import { createFileRoute } from '@tanstack/react-router'
import ManagerDashboard from '../../pages/manager-dashboard'

export const Route = createFileRoute('/_authenticated/manager-dashboard')({
  component: ManagerDashboard,
})