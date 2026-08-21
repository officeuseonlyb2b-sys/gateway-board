import { createFileRoute } from '@tanstack/react-router'
import QueryDetail from '../../../pages/query-detail'

export const Route = createFileRoute('/_authenticated/query/$queryId')({
  component: QueryDetail,
})