import { createFileRoute } from '@tanstack/react-router'
import QueryTracker from '../../pages/query-tracker'

export const Route = createFileRoute('/_authenticated/query-tracker')({
  component: QueryTracker,
})