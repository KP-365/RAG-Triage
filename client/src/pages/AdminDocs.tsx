import { useDocuments, useUploadDocument } from "@/hooks/use-rag";
import { useSubmissions } from "@/hooks/use-triage";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, FileText, CheckCircle, LogOut, User, Pencil, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { format } from "date-fns";

type Submission = {
  id: number;
  answers?: Record<string, unknown>;
  updatedBy?: string | null;
  updatedAt?: string | null;
  [k: string]: unknown;
};

export default function AdminDocs() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: docs, isLoading } = useDocuments();
  const { data: submissions, isLoading: subsLoading } = useSubmissions();
  const { mutate: upload, isPending } = useUploadDocument();
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.name) setLocation("/admin/login");
      })
      .catch(() => setLocation("/admin/login"));
  }, [setLocation]);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setLocation("/admin/login");
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("source", source || "Manual Upload");
    upload(formData, {
      onSuccess: () => {
        setFile(null);
        setSource("");
        const fileInput = document.getElementById("file-upload") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
      },
    });
  };

  const startEdit = (sub: Submission) => {
    setEditingId(sub.id);
    setEditName(String((sub.answers as Record<string, string>)?.patientName ?? ""));
  };

  const saveName = async () => {
    if (editingId == null) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/submissions/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patientName: editName.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Update failed");
      queryClient.invalidateQueries({ queryKey: [api.submissions.list.path] });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link href="/clinician">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold font-display text-slate-900">Admin</h1>
              <p className="text-slate-500">Knowledge base & case edits.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Log out
          </Button>
        </div>

        <div className="grid gap-8">
          <Card className="p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-slate-500" />
              Cases – change patient name
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Edits are stored as &quot;Changed by [your name]&quot;.
            </p>
            {subsLoading ? (
              <p className="text-slate-500">Loading…</p>
            ) : (
              <div className="space-y-3">
                {(submissions as Submission[] | undefined)?.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"
                  >
                    <span className="font-mono text-slate-600">#{sub.id}</span>
                    {editingId === sub.id ? (
                      <>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Patient name"
                          className="max-w-[200px]"
                        />
                        <Button size="sm" onClick={saveName} disabled={saving}>
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="font-medium">
                          {(sub.answers as Record<string, string>)?.patientName ?? "—"}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(sub)}>
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit name
                        </Button>
                        {(sub as Submission).updatedBy && (
                          <span className="text-xs text-slate-500">
                            Changed by {(sub as Submission).updatedBy}
                            {(sub as Submission).updatedAt &&
                              ` • ${format(new Date((sub as Submission).updatedAt!), "MMM d, HH:mm")}`}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {(!submissions || submissions.length === 0) && (
                  <p className="text-slate-500 italic">No cases yet.</p>
                )}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Upload New Document
            </h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="file-upload">Document (PDF/TXT)</Label>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source / Authority</Label>
                  <Input
                    placeholder="e.g. NICE Guidelines CG95"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" disabled={!file || isPending}>
                {isPending ? "Uploading & Processing…" : "Upload Document"}
              </Button>
            </form>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500" />
              Active Documents
            </h2>
            {isLoading ? (
              <p>Loading…</p>
            ) : (
              <div className="space-y-2">
                {docs?.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white border rounded flex items-center justify-center text-slate-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{doc.name}</p>
                        <p className="text-xs text-slate-500">
                          {doc.source} • {format(new Date(doc.uploadedAt), "PPP")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded">
                      <CheckCircle className="w-3 h-3" />
                      Indexed
                    </div>
                  </div>
                ))}
                {docs?.length === 0 && (
                  <p className="text-slate-500 italic">No documents uploaded yet.</p>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
