import { createFileRoute } from "@tanstack/react-router";
import EmployeeHome from "@/pages/employee-home";
export const Route = createFileRoute("/_authenticated/employee-home")({ component: EmployeeHome });
