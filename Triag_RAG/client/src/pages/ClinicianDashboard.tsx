import { Link } from "wouter";
import { useSubmissions } from "@/hooks/use-triage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Loader2, Search, ArrowRight, User, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function ClinicianDashboard() {
  const { data: submissions, isLoading, isError } = useSubmissions();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive">
        Failed to load submissions
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold font-display text-slate-900">Triage<span className="text-primary">Dashboard</span></span>
          <span className="bg-slate-100 text-xs px-2 py-1 rounded font-mono text-slate-500">v1.0</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost">Home</Button>
          </Link>
           <Link href="/admin">
            <Button variant="ghost">Admin Tools</Button>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium">System Online</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold font-display text-slate-900">Patient Queue</h1>
            <p className="text-slate-500 mt-1">Reviewing {submissions?.length} active cases</p>
          </div>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input className="pl-9 w-full sm:w-[300px]" placeholder="Search patients or symptoms..." />
          </div>
        </div>

        <div className="grid gap-4">
          {submissions?.map((submission) => (
            <Link key={submission.id} href={`/clinician/submission/${submission.id}`}>
              <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer group border-l-4 border-l-transparent hover:border-l-primary">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 text-primary">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">Case #{submission.id}</h3>
                        <span className="text-slate-400 text-sm">•</span>
                        <span className="text-slate-600">{submission.age} yrs • {submission.sex}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-medium text-slate-900">{submission.complaint}</span>
                        {(submission.redFlags as string[]).length > 0 && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                            <AlertCircle className="w-3 h-3" />
                            {(submission.redFlags as string[]).length} Flags
                          </span>
                        )}
                        <span className="text-sm text-slate-400">
                          {format(new Date(submission.createdAt), "MMM d, HH:mm")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide font-medium">Risk Band</div>
                      <StatusBadge status={submission.riskBand} size="lg" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          
          {submissions?.length === 0 && (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed">
              <p className="text-slate-500">No active cases in the queue.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
