import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertOverride } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useSubmissions() {
  return useQuery({
    queryKey: [api.submissions.list.path],
    queryFn: async () => {
      const res = await fetch(api.submissions.list.path);
      if (!res.ok) throw new Error("Failed to fetch submissions");
      return api.submissions.list.responses[200].parse(await res.json());
    },
  });
}

export function useSubmission(id: number) {
  return useQuery({
    queryKey: [api.submissions.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.submissions.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch submission details");
      return api.submissions.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useOverrideSubmission() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Omit<InsertOverride, 'submissionId'> }) => {
      const url = buildUrl(api.submissions.override.path, { id });
      const validated = api.submissions.override.input.parse(data);
      
      const res = await fetch(url, {
        method: api.submissions.override.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      if (!res.ok) throw new Error("Failed to override submission");
      return api.submissions.override.responses[201].parse(await res.json());
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.submissions.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.submissions.get.path, id] });
      toast({
        title: "Override Applied",
        description: "The severity band has been updated.",
      });
    },
    onError: (err) => {
      toast({
        title: "Override Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  });
}
