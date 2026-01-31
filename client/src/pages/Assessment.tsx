import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, AlertTriangle, MessageCircle, Home } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

interface ChatResponse {
  sessionId: number;
  messages: ChatMessage[];
  state: Record<string, any>;
  stage: string;
  status?: string;
  isComplete?: boolean;
  isEscalation?: boolean;
  submissionId?: number;
  riskBand?: string;
}

interface FinishResponse {
  submissionId: number;
  riskBand: string;
  redFlags: string[];
  summary: string;
  recommendations?: string[];
}

export default function Assessment() {
  const [, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isEscalated, setIsEscalated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startChat();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isLoading && inputRef.current && !isComplete) {
      inputRef.current.focus();
    }
  }, [isLoading, isComplete]);

  const startChat = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/chat/start");
      const response: ChatResponse = await res.json();
      setSessionId(response.sessionId);
      setMessages(response.messages);
    } catch (err) {
      setError("Failed to start the assessment. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/chat/message", {
        sessionId,
        message: userMessage
      });
      const response: ChatResponse = await res.json();

      setMessages(response.messages);

      if (response.isEscalation) {
        setIsEscalated(true);
      }

      // Redirect on completion - including escalations
      if (response.isComplete && response.submissionId) {
        setIsComplete(true);
        const band = response.isEscalation ? 'Red' : (response.riskBand || 'Green');
        setLocation(`/assessment/result?id=${response.submissionId}&band=${band}`);
      }
    } catch (err) {
      setError("Failed to send message. Please try again.");
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const finishAndRedirect = async () => {
    try {
      const res = await apiRequest("POST", "/api/chat/finish", { sessionId });
      const response: FinishResponse = await res.json();
      const recsParam = response.recommendations?.length 
        ? `&recs=${encodeURIComponent(JSON.stringify(response.recommendations))}`
        : '';
      setLocation(`/assessment/result?id=${response.submissionId}&band=${response.riskBand}${recsParam}`);
    } catch (err) {
      setError("Failed to complete assessment. Please contact support.");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex flex-col">
      <div className="bg-amber-100 border-b border-amber-300 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
        Research prototype. Not for clinical use.
      </div>
      <header className="border-b bg-white dark:bg-slate-900 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-6 h-6 text-primary" />
            <h1 className="text-lg font-semibold">Health Assessment</h1>
          </div>
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-home">
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-3xl mx-auto w-full p-4">
        <Card className="flex-1 flex flex-col overflow-hidden shadow-lg">
          <ScrollArea 
            className="flex-1 p-4" 
            ref={scrollRef}
          >
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-slate-100 dark:bg-slate-700 text-foreground rounded-bl-sm"
                      }`}
                      data-testid={`chat-message-${idx}`}
                    >
                      {msg.content.includes("URGENT") ? (
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                          <span className="whitespace-pre-wrap">{msg.content.replace("⚠️ ", "")}</span>
                        </div>
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                </motion.div>
              )}
            </div>
          </ScrollArea>

          {error && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="border-t p-4">
            {isComplete ? (
              <p className="text-center text-muted-foreground py-2">
                Assessment complete. Redirecting...
              </p>
            ) : isEscalated ? (
              <div className="flex flex-col gap-3">
                <p className="text-center text-muted-foreground">
                  Please follow the urgent instructions above.
                </p>
                <Button 
                  onClick={() => setLocation("/")} 
                  variant="outline"
                  data-testid="button-return-home"
                >
                  Return to Home
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Type your answer..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  disabled={isLoading || !sessionId}
                  className="flex-1"
                  data-testid="input-chat-message"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading || !sessionId}
                  size="icon"
                  data-testid="button-send-message"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </Button>
              </div>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
