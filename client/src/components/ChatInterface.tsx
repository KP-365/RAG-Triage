import { useState, useRef, useEffect } from "react";
import { useRagQuery } from "@/hooks/use-rag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Bot, User, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ChatInterfaceProps {
  submissionId?: number;
  initialPrompt?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ docName: string; text: string; chunkId: number }>;
}

export function ChatInterface({ submissionId, initialPrompt }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { mutate: sendMessage, isPending } = useRagQuery();

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Initial prompt handling (e.g., "Why is this Red?")
  useEffect(() => {
    if (initialPrompt && messages.length === 0) {
      handleSend(initialPrompt);
    }
  }, [initialPrompt]);

  const handleSend = (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    sendMessage(
      { question: text, submissionId },
      {
        onSuccess: (data) => {
          setMessages(prev => [
            ...prev,
            { 
              role: "assistant", 
              content: data.answer,
              citations: data.citations 
            }
          ]);
        },
        onError: () => {
          setMessages(prev => [
            ...prev,
            { role: "assistant", content: "Sorry, I encountered an error processing your request." }
          ]);
        }
      }
    );
  };

  return (
    <div className="flex flex-col h-[600px] border rounded-xl overflow-hidden bg-background">
      <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
        <Bot className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-sm">Clinical Assistant (AI)</h3>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              
              <div className={`flex flex-col gap-2 max-w-[85%]`}>
                <div
                  className={`p-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-muted/50 border rounded-tl-none"
                  }`}
                >
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>

                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sources</p>
                    {msg.citations.map((cite, idx) => (
                      <Card key={idx} className="p-2 bg-background/50 border-dashed text-xs text-muted-foreground">
                        <div className="flex items-center gap-1 mb-1 text-primary font-medium">
                          <FileText className="w-3 h-3" />
                          {cite.docName}
                        </div>
                        <p className="line-clamp-2 italic opacity-80">"{cite.text}"</p>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isPending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-muted/50 p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Analyzing guidelines...</span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-background">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about this case..."
            className="flex-1"
            disabled={isPending}
          />
          <Button type="submit" size="icon" disabled={isPending || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
