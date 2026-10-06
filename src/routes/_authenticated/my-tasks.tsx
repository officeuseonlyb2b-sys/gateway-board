import { createFileRoute } from '@tanstack/react-router'
import MyTasks from '../../pages/my-tasks'

export const Route = createFileRoute('/_authenticated/my-tasks')({
  component: MyTasks,
})