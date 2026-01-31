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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowLeft, AlertTriangle, FileText, Activity, BookOpen, Info, FileStack } from "lucide-react";
import { Link } from "wouter";
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
    // Determine decision type based on clinician action
    const originalBand = submission.riskBand; // AI-suggested band
    const hasPriorClinicianDecision = submission.overrides.length > 0;
    
    let decisionType: string;
    if (hasPriorClinicianDecision) {
      // Clinician is changing a prior clinician decision
      decisionType = "overridden";
    } else if (overrideData.band === originalBand) {
      // Clinician accepts the AI suggestion
      decisionType = "accepted";
    } else {
      // Clinician modifies the AI suggestion
      decisionType = "modified";
    }
    
    override(
      { id, data: { 
        overrideBand: overrideData.band, 
        note: overrideData.note,
        originalBand,
        decisionType
      }},
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
          {(submission as { sessionId?: number }).sessionId != null && (
            <Link href={`/triage/session/${(submission as { sessionId: number }).sessionId}/handoff`}>
              <Button variant="outline" size="sm">
                <FileStack className="w-4 h-4 mr-2" />
                View handoff
              </Button>
            </Link>
          )}
          <div className="flex flex-col items-end">
             <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">AI-Flagged Concern Level</span>
             <StatusBadge status={currentBand} size="lg" />
          </div>
          
          <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Clinician Override</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clinician Override - Confirm Priority Level</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Confirmed Priority Level</Label>
                  <Select onValueChange={(v) => setOverrideData({...overrideData, band: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority..." />
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
                    placeholder="Document your clinical reasoning for this decision..." 
                    value={overrideData.note}
                    onChange={(e) => setOverrideData({...overrideData, note: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
                <Button onClick={handleOverride} disabled={isOverriding || !overrideData.band || !overrideData.note}>
                  Confirm Decision
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            AI-generated decision support. Not a diagnosis. Final clinical responsibility rests with the clinician.
          </p>
        </div>
      </div>

      <main className="flex-1 overflow-hidden p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-[1600px] mx-auto w-full">
        {/* Left Column: Patient Data - Red Flags First */}
        <div className="space-y-6 overflow-y-auto pr-2 pb-10">
          {/* Red Flags - Most Prominent */}
          {redFlags.length > 0 && (
            <Card className="p-6 shadow-sm border-2 border-red-200 bg-red-50/50">
              <h2 className="text-lg font-bold text-red-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Potential Risk Indicators
              </h2>
              <ul className="space-y-2">
                {redFlags.map((flag, idx) => (
                  <li key={idx} className="bg-red-100 text-red-900 px-4 py-3 rounded-lg text-sm font-semibold border border-red-200">
                    {flag}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-700 mt-4 italic">
                AI output is advisory only and must not determine patient order or management without clinician confirmation.
              </p>
            </Card>
          )}

          {redFlags.length === 0 && (
            <Card className="p-6 shadow-sm border border-green-200 bg-green-50/50">
              <h2 className="text-lg font-bold text-green-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Potential Risk Indicators
              </h2>
              <p className="text-green-700">No potential risk indicators identified by AI screening.</p>
              <p className="text-xs text-green-600 mt-4 italic">
                AI output is advisory only. Clinical assessment required.
              </p>
            </Card>
          )}

          <Card className="p-6 shadow-sm border-t-4 border-t-primary">
            <h2 className="text-lg font-bold font-display mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Patient Summary
            </h2>
            <div className="bg-slate-50 p-4 rounded-xl text-slate-700 leading-relaxed border border-slate-100">
              {submission.summary || "No summary available."}
            </div>
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
             <Card className="p-6 shadow-sm bg-blue-50/50 border-blue-100">
              <h3 className="font-bold text-blue-800 mb-2">Clinician Decision Log</h3>
              {submission.overrides.map(ov => (
                <div key={ov.id} className="text-sm text-blue-900/80 mb-2 last:mb-0">
                  <span className="font-semibold">{format(new Date(ov.createdAt), "MMM d, HH:mm")}:</span> Confirmed as {ov.overrideBand} - "{ov.note}"
                </div>
              ))}
             </Card>
          )}
        </div>

        {/* Right Column: Decision Support */}
        <div className="flex flex-col h-full overflow-hidden space-y-6">
          <Card className="p-6 shadow-sm flex-1 flex flex-col min-h-0">
            <div className="mb-4">
              <h2 className="text-lg font-bold font-display mb-1 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Decision Support Summary
              </h2>
              <p className="text-sm text-slate-500">AI-generated guidance based on clinical guidelines. Not a diagnosis.</p>
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
                      <h3 className="text-sm font-bold text-slate-700 mb-3">Referenced Guidelines:</h3>
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
                <div className="text-slate-500 text-sm">No decision support available.</div>
              )}
            </ScrollArea>
          </Card>

          <Card className="p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-bold font-display mb-1">Clinical Query Assistant</h2>
              <p className="text-sm text-slate-500">Ask questions about this case. AI responses are advisory only.</p>
            </div>
            <div className="h-64 min-h-0">
              <ChatInterface 
                submissionId={id} 
                initialPrompt={`What are the key considerations for this case?`} 
              />
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
