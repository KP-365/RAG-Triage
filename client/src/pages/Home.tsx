import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Activity, ShieldCheck, Clock } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white relative overflow-hidden">
      {/* Prototype disclaimer – must stay visible when releasing as non-clinical demo */}
      <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-sm font-medium text-amber-900">
        Research prototype only. Not for clinical use. Not a medical device.
      </div>
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-blue-100/50 rounded-bl-[200px] -z-10 blur-3xl" />

      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-white p-2 rounded-lg">
            <Activity className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold text-slate-900 font-display">NHS Clinical<span className="text-primary">Assistant</span></span>
        </div>
        <div className="space-x-4">
          <Link href="/clinician">
            <Button variant="ghost" className="text-muted-foreground hover:text-primary">Clinician Login</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 mb-6 font-display">
              Your clinical assistant. <br />
              <span className="text-primary">Better care.</span>
            </h1>
            <p className="text-xl text-slate-600 mb-8 max-w-lg leading-relaxed">
              Our AI-assisted clinical assistant helps patients get the right care at the right time. Fast, safe, and reliable.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/assessment">
                <Button size="lg" className="text-lg px-8 py-6 h-auto shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all rounded-xl">
                  Start Assessment <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            </div>

            <div className="mt-12 grid grid-cols-3 gap-6 border-t pt-8 border-slate-200">
              <div className="space-y-2">
                <div className="text-primary font-bold text-3xl font-display">24/7</div>
                <div className="text-sm text-muted-foreground font-medium">Always Available</div>
              </div>
              <div className="space-y-2">
                <div className="text-primary font-bold text-3xl font-display">&lt; 5m</div>
                <div className="text-sm text-muted-foreground font-medium">Average Time</div>
              </div>
              <div className="space-y-2">
                <div className="text-primary font-bold text-3xl font-display">AI</div>
                <div className="text-sm text-muted-foreground font-medium">Assisted Review</div>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-primary/5 rounded-3xl transform rotate-3 scale-105 -z-10" />
            <Card className="p-8 border-0 shadow-2xl rounded-3xl bg-white/80 backdrop-blur-sm">
              <div className="flex flex-col gap-6">
                <div className="flex items-start gap-4 p-4 rounded-xl bg-blue-50/50 border border-blue-100">
                  <div className="bg-white p-2 rounded-full shadow-sm text-primary">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Protocol-based</h3>
                    <p className="text-sm text-slate-600">Uses rule-based red flags and severity; AI assists structure only.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-xl bg-green-50/50 border border-green-100">
                  <div className="bg-white p-2 rounded-full shadow-sm text-green-600">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Structured intake</h3>
                    <p className="text-sm text-slate-600">Immediate categorization into risk bands.</p>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <p className="text-sm text-slate-500 font-medium italic">
                    "Helping clinicians make faster, safer decisions."
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
