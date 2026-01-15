import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useSubmission, useOverrideTriage, useRAGExplanation } from "@/hooks/use-triage";
import { ChatInterface } from "@/components/ChatInterface";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowLeft, AlertTriangle, FileText, Activity, BookOpen } from "lucide-react";
import { format } from "date-fns";

export default function ClinicianCaseView() {
  const [, params] = useRoute("/clinician/submission/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  
  const { data: submission, isLoading } = useSubmission(id);
  const { mutate: override, isPending: isOverriding } = useOverrideTriage();
  const { data: ragData, isLoading: isLoadingRAG } = useRAGExplanation(id);
  
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideData, setOverrideData] = useState({ band: "", note: "" });

  if (isLoading || !submission) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  const handleOverride = () => {
    override(
      { id, data: { overrideBand: overrideData.band, note: overrideData.note } },
      { onSuccess: () => setOverrideOpen(false) }
    );
  };

  const currentBand = submission.overrides.length > 0 
    ? submission.overrides[submission.overrides.length - 1].overrideBand 
    : submission.riskBand;

  const redFlags = submission.redFlags as string[];
  const answers = submission.answers as Record<string, boolean>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col h-screen">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/clinician")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold font-display">Case #{id}</h1>
          <div className="w-px h-6 bg-slate-200" />
          <span className="font-medium text-slate-700">{submission.complaint}</span>
          <span className="text-slate-400">•</span>
          <span className="text-slate-500">{submission.age} yrs, {submission.sex}</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex flex-col items-end">
             <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Current Status</span>
             <StatusBadge status={currentBand} size="lg" />
          </div>
          
          <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Override Triage</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Override Triage Decision</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>New Risk Band</Label>
                  <Select onValueChange={(v) => setOverrideData({...overrideData, band: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select band..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Red">Red (Immediate)</SelectItem>
                      <SelectItem value="Amber">Amber (Urgent)</SelectItem>
                      <SelectItem value="Green">Green (Routine)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Clinical Rationale</Label>
                  <Textarea 
                    placeholder="Why are you overriding the system decision?" 
                    value={overrideData.note}
                    onChange={(e) => setOverrideData({...overrideData, note: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
                <Button onClick={handleOverride} disabled={isOverriding || !overrideData.band || !overrideData.note}>
                  Confirm Override
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-[1600px] mx-auto w-full">
        {/* Left Column: Patient Data */}
        <div className="space-y-6 overflow-y-auto pr-2 pb-10">
          <Card className="p-6 shadow-sm border-t-4 border-t-primary">
            <h2 className="text-lg font-bold font-display mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Clinical Summary
            </h2>
            <div className="bg-slate-50 p-4 rounded-xl text-slate-700 leading-relaxed border border-slate-100">
              {submission.summary || "No summary available."}
            </div>

            {redFlags.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Red Flags Identified
                </h3>
                <ul className="space-y-2">
                  {redFlags.map((flag, idx) => (
                    <li key={idx} className="bg-red-50 text-red-800 px-3 py-2 rounded-lg text-sm font-medium border border-red-100">
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="p-6 shadow-sm">
             <h2 className="text-lg font-bold font-display mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500" />
              Questionnaire Responses
            </h2>
            <div className="space-y-4">
              {Object.entries(answers).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center py-2 border-b last:border-0">
                  <span className="text-sm text-slate-600 font-medium">{key}</span>
                  <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${value ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'}`}>
                    {value ? "Yes" : "No"}
                  </span>
                </div>
              ))}
            </div>
            
            <div className="mt-6 pt-6 border-t">
              <div className="text-xs text-slate-400 font-mono">
                System Rules: v{submission.rulesVersion} | Model: v{submission.modelVersion} <br/>
                Submitted: {format(new Date(submission.createdAt), "PPP p")}
              </div>
            </div>
          </Card>

          {submission.overrides.length > 0 && (
             <Card className="p-6 shadow-sm bg-orange-50/50 border-orange-100">
              <h3 className="font-bold text-orange-800 mb-2">Override History</h3>
              {submission.overrides.map(ov => (
                <div key={ov.id} className="text-sm text-orange-900/80 mb-2 last:mb-0">
                  <span className="font-semibold">{format(new Date(ov.createdAt), "MMM d, HH:mm")}:</span> Changed to {ov.overrideBand} - "{ov.note}"
                </div>
              ))}
             </Card>
          )}
        </div>

        {/* Right Column: RAG Explanation */}
        <div className="flex flex-col h-full overflow-hidden space-y-6">
          <Card className="p-6 shadow-sm flex-1 flex flex-col min-h-0">
            <div className="mb-4">
              <h2 className="text-lg font-bold font-display mb-1 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                RAG-Cited Triage Explanation
              </h2>
              <p className="text-sm text-slate-500">AI-powered analysis based on clinical guidance documents.</p>
            </div>
            <ScrollArea className="flex-1 pr-4">
              {isLoadingRAG ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : ragData?.explanation ? (
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
                    {ragData.explanation}
                  </div>
                  {ragData.retrievedChunks && ragData.retrievedChunks.length > 0 && (
                    <div className="mt-6 pt-6 border-t">
                      <h3 className="text-sm font-bold text-slate-700 mb-3">Retrieved Sources:</h3>
                      <ul className="space-y-2 text-xs text-slate-600">
                        {ragData.retrievedChunks.map((chunk, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="font-mono text-primary">[{chunk.chunkId}]</span>
                            <span className="font-medium">{chunk.sourceTitle}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-slate-500 text-sm">No explanation available.</div>
              )}
            </ScrollArea>
          </Card>

          <Card className="p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-bold font-display mb-1">Interactive Assistant</h2>
              <p className="text-sm text-slate-500">Ask questions about this case.</p>
            </div>
            <div className="h-64 min-h-0">
              <ChatInterface 
                submissionId={id} 
                initialPrompt={`Explain why this case was categorized as ${submission.riskBand}.`} 
              />
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
