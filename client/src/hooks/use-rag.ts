import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { z } from "zod";

export function useDocuments() {
  return useQuery({
    queryKey: [api.documents.list.path],
    queryFn: async () => {
      const res = await fetch(api.documents.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return api.documents.list.responses[200].parse(await res.json());
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(api.documents.upload.path, {
        method: api.documents.upload.method,
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to upload document");
      return api.documents.upload.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.documents.list.path] });
      toast({
        title: "Upload Successful",
        description: "Document has been added to the knowledge base.",
      });
    },
    onError: () => {
      toast({
        title: "Upload Failed",
        description: "Could not upload the document.",
        variant: "destructive",
      });
    },
  });
}

export function useRagQuery() {
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.rag.query.input>) => {
      const res = await fetch(api.rag.query.path, {
        method: api.rag.query.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to query knowledge base");
      return api.rag.query.responses[200].parse(await res.json());
    },
  });
}
