// lib/crm/tasks.ts
import { useStore } from "./store"; // your Zustand/Redux store

export const useTasks = () => {
  const user = useAuth();
  const tasks = useStore(state => state.tasks.filter(t => t.owner === user?.name));
  return { tasks };
};

export const useAllTasks = () => {
  return useStore(state => state.tasks);
};

export const updateTaskProgress = (taskId: string, text: string) => {
  useStore.setState(state => ({
    tasks: state.tasks.map(t =>
      t.id === taskId
        ? { ...t, updates: [...(t.updates || []), { timestamp: new Date().toISOString(), text }] }
        : t
    )
  }));
};

export const completeTask = (taskId: string) => {
  useStore.setState(state => ({
    tasks: state.tasks.map(t =>
      t.id === taskId
        ? { ...t, done: true, completed_at: new Date().toISOString() }
        : t
    )
  }));
};

export const reassignTask = (taskId: string, newOwner: string) => {
  useStore.setState(state => ({
    tasks: state.tasks.map(t =>
      t.id === taskId ? { ...t, owner: newOwner } : t
    )
  }));
};