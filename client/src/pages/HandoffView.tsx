import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  MapPin,
  Activity,
  FileText,
  Stethoscope,
  Info,
  AlertCircle
} from "lucide-react";

interface HandoffResponse {
  presenting_complaint: {
    chief_complaint: string;
    onset: string;
    duration: string;
    severity: string;
    location: string;
    associated_symptoms: string[];
  };
  key_positives: string[];
  key_negatives: string[];
  red_flags: {
    triggered: Array<{ flag: string; evidence: string }>;
    not_triggered: string[];
    not_assessed: string[];
  };
  severity: {
    rules_engine_category: "GREEN" | "AMBER" | "RED";
    ai_suggested_category: "GREEN" | "AMBER" | "RED";
    ai_confidence: "LOW" | "MEDIUM" | "HIGH";
    rationale: string;
  };
  differentials: Array<{
    condition: string;
    why_consider: string;
    supporting_features: string[];
  }>;
  consultation_focus: {
    questions_to_confirm: string[];
    exam_checks: string[];
    immediate_actions: string[];
    safety_net: string;
  };
  summary_for_reception: string;
}

export default function HandoffView() {
  const [, params] = useRoute("/triage/session/:sessionId/handoff");
  const [, setLocation] = useLocation();
  const sessionId = params?.sessionId;
  
  const [handoff, setHandoff] = useState<HandoffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    fetch(`/api/triage/session/${sessionId}/handoff`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to load handoff");
        return res.json();
      })
      .then(data => {
        setHandoff(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600">Loading handoff...</p>
        </div>
      </div>
    );
  }

  if (error || !handoff) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-600">{error || "Handoff not found"}</p>
          <Button onClick={() => setLocation("/clinician")} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const severityColor = {
    RED: "bg-red-100 text-red-800 border-red-300",
    AMBER: "bg-amber-100 text-amber-800 border-amber-300",
    GREEN: "bg-green-100 text-green-800 border-green-300"
  };

  const confidenceColor = {
    HIGH: "bg-blue-100 text-blue-800",
    MEDIUM: "bg-yellow-100 text-yellow-800",
    LOW: "bg-gray-100 text-gray-800"
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/clinician")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Clinical Handoff</h1>
                <p className="text-sm text-slate-500">Session #{sessionId}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">
                  Rules Engine
                </p>
                <Badge className={severityColor[handoff.severity.rules_engine_category]}>
                  {handoff.severity.rules_engine_category}
                </Badge>
              </div>
              <div className="text-right" title="Category + confidence (advisory only; not a numeric score)">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">
                  AI Suggestion
                </p>
                <p className="text-[10px] text-slate-400 mb-1">Category + confidence</p>
                <div className="flex items-center gap-2">
                  <Badge className={severityColor[handoff.severity.ai_suggested_category]}>
                    {handoff.severity.ai_suggested_category}
                  </Badge>
                  <Badge variant="outline" className={confidenceColor[handoff.severity.ai_confidence]}>
                    {handoff.severity.ai_confidence}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Safety Banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            AI-assisted clinical assistant. Not a diagnosis. Final category set by rules engine.
          </p>
        </div>
      </div>

      {/* Red Flags Banner - if triggered */}
      {handoff.red_flags.triggered.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h2 className="text-lg font-bold text-red-800">Red Flags Triggered - Escalate Now</h2>
            </div>
            <div className="space-y-2">
              {handoff.red_flags.triggered.map((rf, idx) => (
                <div key={idx} className="bg-red-100 border border-red-300 rounded-lg p-3">
                  <p className="font-semibold text-red-900">{rf.flag}</p>
                  <p className="text-sm text-red-700 mt-1">{rf.evidence}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Presenting Complaint */}
            <Card className="p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Presenting Complaint
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-1">Chief Complaint</p>
                  <p className="text-slate-900">{handoff.presenting_complaint.chief_complaint}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-1 flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Onset
                    </p>
                    <p className="text-slate-900">{handoff.presenting_complaint.onset}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-1">Duration</p>
                    <p className="text-slate-900">{handoff.presenting_complaint.duration}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-1 flex items-center gap-1">
                      <Activity className="w-4 h-4" />
                      Severity
                    </p>
                    <p className="text-slate-900">{handoff.presenting_complaint.severity}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-1 flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      Location
                    </p>
                    <p className="text-slate-900">{handoff.presenting_complaint.location}</p>
                  </div>
                </div>
                {handoff.presenting_complaint.associated_symptoms.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-2">Associated Symptoms</p>
                    <div className="flex flex-wrap gap-2">
                      {handoff.presenting_complaint.associated_symptoms.map((symptom, idx) => (
                        <Badge key={idx} variant="secondary">{symptom}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Key Positives */}
            {handoff.key_positives.length > 0 && (
              <Card className="p-6 border-green-200 bg-green-50/50">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-green-800">
                  <CheckCircle2 className="w-5 h-5" />
                  Key Positives
                </h2>
                <ul className="space-y-2">
                  {handoff.key_positives.map((positive, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      <span className="text-slate-900">{positive}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Key Negatives */}
            {handoff.key_negatives.length > 0 && (
              <Card className="p-6 border-slate-200">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-slate-500" />
                  Key Negatives
                </h2>
                <ul className="space-y-2">
                  {handoff.key_negatives.map((negative, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <span className="text-slate-700">{negative}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Red Flags Detail */}
            <Card className="p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Red Flags Assessment
              </h2>
              <div className="space-y-4">
                {handoff.red_flags.triggered.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-red-800 mb-2">Triggered</p>
                    <ul className="space-y-2">
                      {handoff.red_flags.triggered.map((rf, idx) => (
                        <li key={idx} className="bg-red-50 border border-red-200 rounded p-2">
                          <p className="font-semibold text-red-900">{rf.flag}</p>
                          <p className="text-sm text-red-700">{rf.evidence}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {handoff.red_flags.not_triggered.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-green-700 mb-2">Not Triggered (Assessed)</p>
                    <ul className="space-y-1">
                      {handoff.red_flags.not_triggered.map((flag, idx) => (
                        <li key={idx} className="text-sm text-slate-600 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {handoff.red_flags.not_assessed.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-amber-700 mb-2">Not Assessed</p>
                    <ul className="space-y-1">
                      {handoff.red_flags.not_assessed.map((flag, idx) => (
                        <li key={idx} className="text-sm text-amber-700 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          {flag}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-amber-600 mt-2 italic">
                      These items were not assessed during intake. Consider evaluating during consultation.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Severity Rationale */}
            <Card className="p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Severity Assessment
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-1">Rules Engine Category</p>
                  <Badge className={severityColor[handoff.severity.rules_engine_category]}>
                    {handoff.severity.rules_engine_category}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-1">AI Suggested Category</p>
                  <div className="flex items-center gap-2">
                    <Badge className={severityColor[handoff.severity.ai_suggested_category]}>
                      {handoff.severity.ai_suggested_category}
                    </Badge>
                    <Badge variant="outline" className={confidenceColor[handoff.severity.ai_confidence]}>
                      Confidence: {handoff.severity.ai_confidence}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-1">Rationale</p>
                  <p className="text-slate-700 text-sm">{handoff.severity.rationale}</p>
                </div>
              </div>
            </Card>

            {/* Differentials */}
            {handoff.differentials.length > 0 && (
              <Card className="p-6">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-primary" />
                  Possible Causes to Consider (Non-Diagnostic)
                </h2>
                <div className="space-y-4">
                  {handoff.differentials.map((diff, idx) => (
                    <div key={idx} className="border-l-4 border-primary pl-4">
                      <p className="font-semibold text-slate-900 mb-1">{diff.condition}</p>
                      <p className="text-sm text-slate-600 mb-2">{diff.why_consider}</p>
                      {diff.supporting_features.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1">Supporting Features:</p>
                          <ul className="text-xs text-slate-600 space-y-1">
                            {diff.supporting_features.map((feature, fIdx) => (
                              <li key={fIdx} className="flex items-start gap-1">
                                <span className="text-primary">•</span>
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Consultation Focus */}
            <Card className="p-6 border-blue-200 bg-blue-50/50">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-blue-800">
                <Stethoscope className="w-5 h-5" />
                Suggested Focus for Consultation
              </h2>
              <div className="space-y-4">
                {handoff.consultation_focus.questions_to_confirm.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-blue-800 mb-2">Questions to Confirm</p>
                    <ul className="space-y-1">
                      {handoff.consultation_focus.questions_to_confirm.map((q, idx) => (
                        <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                          <span className="text-blue-600">•</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {handoff.consultation_focus.exam_checks.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-blue-800 mb-2">Exam Checks</p>
                    <ul className="space-y-1">
                      {handoff.consultation_focus.exam_checks.map((check, idx) => (
                        <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                          <span className="text-blue-600">•</span>
                          <span>{check}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {handoff.consultation_focus.immediate_actions.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-blue-800 mb-2">Immediate Actions</p>
                    <ul className="space-y-1">
                      {handoff.consultation_focus.immediate_actions.map((action, idx) => (
                        <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                          <span className="text-blue-600">•</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {handoff.consultation_focus.safety_net && (
                  <div className="mt-4 pt-4 border-t border-blue-200">
                    <p className="text-sm font-semibold text-blue-800 mb-1">Safety Net</p>
                    <p className="text-sm text-slate-700">{handoff.consultation_focus.safety_net}</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Summary for Reception */}
        <Card className="mt-6 p-6 bg-slate-900 text-white">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Summary for Reception
          </h2>
          <p className="text-slate-100 leading-relaxed whitespace-pre-line">
            {handoff.summary_for_reception}
          </p>
        </Card>
      </main>
    </div>
  );
}
