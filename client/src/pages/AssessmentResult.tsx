import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Info } from "lucide-react";

export default function AssessmentResult() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center space-y-6 shadow-xl border-t-4 border-t-primary">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        
        <h1 className="text-3xl font-bold font-display text-slate-900">Information Received</h1>
        <p className="text-slate-600">
          Thank you. Your responses have been recorded and will be reviewed by a clinician.
        </p>

        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-left flex gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            This form does not provide medical advice. Your responses will be reviewed by a clinician.
          </p>
        </div>

        <p className="text-sm text-slate-500">
          If your symptoms worsen or you develop new concerning symptoms before you are contacted, please seek medical help immediately by calling 999 or visiting A&E.
        </p>

        <div className="pt-6">
          <Link href="/">
            <Button variant="outline" className="w-full" data-testid="button-return-home">Return Home</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
