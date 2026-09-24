import { createFileRoute } from '@tanstack/react-router'
import NewLead from '../../pages/new-lead'

export const Route = createFileRoute('/_authenticated/new-lead')({
  component: NewLead,
})