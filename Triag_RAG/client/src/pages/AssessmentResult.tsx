import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, Lightbulb } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

export default function AssessmentResult() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const band = params.get("band") || "Pending";
  const recsParam = params.get("recs");
  
  let recommendations: string[] = [];
  if (recsParam) {
    try {
      recommendations = JSON.parse(decodeURIComponent(recsParam));
    } catch {
      recommendations = [];
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center space-y-6 shadow-xl border-t-4 border-t-primary">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        
        <h1 className="text-3xl font-bold font-display text-slate-900">Assessment Complete</h1>
        <p className="text-slate-600">
          Your information has been received and prioritized. A clinician will review your case shortly.
        </p>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <p className="text-sm font-medium text-slate-500 mb-2">Preliminary Triage Category</p>
          <StatusBadge status={band} size="lg" />
        </div>

        {band === "Red" && (
          <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-left flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">
              Your symptoms suggest urgent care may be needed. If your condition worsens, please call 999 immediately.
            </p>
          </div>
        )}

        {band === "Green" && recommendations.length > 0 && (
          <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-left space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-green-600" />
              <p className="font-medium text-green-800">Self-Care Recommendations</p>
            </div>
            <ul className="space-y-2">
              {recommendations.map((rec, index) => (
                <li key={index} className="text-sm text-green-700 flex gap-2">
                  <span className="text-green-500 font-medium">{index + 1}.</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-6">
          <Link href="/">
            <Button variant="outline" className="w-full" data-testid="button-return-home">Return Home</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
