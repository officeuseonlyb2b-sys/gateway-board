import { createFileRoute } from "@tanstack/react-router";
import HelpTraining from "@/pages/help-training";
export const Route = createFileRoute("/_authenticated/help")({ component: HelpTraining });
