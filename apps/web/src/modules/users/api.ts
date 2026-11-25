import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User, UserCreate, UserUpdate } from "@support-agent/shared/api/users";
import { api } from "@/lib/api";

const keys = { all: ["users"] as const };

export function useUsers() {
  return useQuery({
    queryKey: keys.all,
    queryFn: () => api.get<{ items: User[] }>("/users").then((data) => data.items),
  });
}

export function useCreateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UserCreate) => api.post<User>("/users", input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UserUpdate & { id: string }) => api.patch<User>(`/users/${id}`, input),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.all }),
        client.invalidateQueries({ queryKey: ["me"] }),
      ]),
  });
}

export function useDeleteUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}
