import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { TriageInput, SubmissionResponse } from "@shared/routes";
import { insertOverrideSchema } from "@shared/schema";
import type { z } from "zod";

export function useSubmitTriage() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: TriageInput) => {
      const res = await fetch(api.triage.submit.path, {
        method: api.triage.submit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to submit triage");
      }
      return api.triage.submit.responses[201].parse(await res.json());
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

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
      if (!res.ok) throw new Error("Failed to fetch submission");
      return api.submissions.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useOverrideTriage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: z.infer<typeof api.submissions.override.input> }) => {
      const url = buildUrl(api.submissions.override.path, { id });
      const res = await fetch(url, {
        method: api.submissions.override.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to override triage");
      }
      return api.submissions.override.responses[201].parse(await res.json());
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.submissions.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.submissions.list.path] });
      toast({
        title: "Override Applied",
        description: "The triage category has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Override Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRAGExplanation(submissionId: number) {
  return useQuery({
    queryKey: ["rag-explanation", submissionId],
    queryFn: async () => {
      const res = await fetch(`/api/submissions/${submissionId}/rag-explanation`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to fetch RAG explanation");
      return res.json() as Promise<{ explanation: string; retrievedChunks: Array<{ chunkId: number; sourceTitle: string; content: string }> }>;
    },
    enabled: !!submissionId,
  });
}
