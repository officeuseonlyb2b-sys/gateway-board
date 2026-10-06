import { createFileRoute } from "@tanstack/react-router";
import AllTasks from "@/pages/all-tasks";

export const Route = createFileRoute("/_authenticated/tasks/all")({
  head: () => ({
    meta: [
      { title: "All Tasks — MP Tourism Hub" },
      { name: "description", content: "Every assigned task across the team with status, owner and due date." },
      { property: "og:title", content: "All Tasks — MP Tourism Hub" },
      { property: "og:description", content: "Every assigned task across the team with status, owner and due date." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AllTasks,
});
