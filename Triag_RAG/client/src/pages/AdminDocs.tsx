import { useDocuments, useUploadDocument } from "@/hooks/use-rag";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, FileText, CheckCircle } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

export default function AdminDocs() {
  const { data: docs, isLoading } = useDocuments();
  const { mutate: upload, isPending } = useUploadDocument();
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("");

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
        // Reset file input manually if needed
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if(fileInput) fileInput.value = '';
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/clinician">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display text-slate-900">Knowledge Base Management</h1>
            <p className="text-slate-500">Manage documents used by the RAG system.</p>
          </div>
        </div>

        <div className="grid gap-8">
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
                {isPending ? "Uploading & Processing..." : "Upload Document"}
              </Button>
            </form>
          </Card>

          <Card className="p-6">
             <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500" />
              Active Documents
            </h2>
            {isLoading ? (
              <p>Loading...</p>
            ) : (
              <div className="space-y-2">
                {docs?.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white border rounded flex items-center justify-center text-slate-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{doc.name}</p>
                        <p className="text-xs text-slate-500">{doc.source} • {format(new Date(doc.uploadedAt), "PPP")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded">
                      <CheckCircle className="w-3 h-3" />
                      Indexed
                    </div>
                  </div>
                ))}
                {docs?.length === 0 && <p className="text-slate-500 italic">No documents uploaded yet.</p>}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
