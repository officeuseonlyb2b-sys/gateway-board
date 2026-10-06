import { createFileRoute } from '@tanstack/react-router'
import UsersRoles from '../../pages/users-roles'

export const Route = createFileRoute('/_authenticated/users-roles')({
  head: () => ({
    meta: [
      { title: 'Users & Roles — MP Tourism Operations Hub' },
      { name: 'description', content: 'Employee register: add, edit, activate or remove sales team members across the CRM.' },
      { property: 'og:title', content: 'Users & Roles — MP Tourism Operations Hub' },
      { property: 'og:description', content: 'Employee register for the MP Tourism sales CRM.' },
    ],
  }),
  component: UsersRoles,
})
