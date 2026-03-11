import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { 
  FileText, 
  Upload, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Scale, 
  Gavel, 
  FileSearch,
  ChevronRight,
  History
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- AI Service ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface Message {
  role: "user" | "model";
  text: string;
}

interface Precedent {
  caseName: string;
  summary: string;
  outcome: string;
  strategy: string;
}

interface SummaryResult {
  executiveSummary: string;
  keyParties: string[];
  legalSignificance: string[];
  criticalDeadlines: string[];
  riskAssessment: string;
  precedents: Precedent[];
}

// --- Components ---

const Header = () => (
  <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-20">
    <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="bg-zinc-900 p-1.5 rounded-lg">
          <Scale className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">LexiSummarize <span className="text-zinc-400 font-normal ml-2">| AI Legal Workspace</span></h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest bg-zinc-100 px-2 py-1 rounded">Beta v2.0</span>
      </div>
    </div>
  </header>
);

const FileUploader = ({ onUpload, isProcessing, hasFile }: { onUpload: (file: File) => void, isProcessing: boolean, hasFile: boolean }) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onUpload(acceptedFiles[0]);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    multiple: false,
    disabled: isProcessing
  } as any);

  if (hasFile && !isProcessing) {
    return (
      <div 
        {...getRootProps()} 
        className="p-4 border border-zinc-200 rounded-xl bg-white hover:bg-zinc-50 transition-colors cursor-pointer flex items-center gap-3"
      >
        <input {...getInputProps()} />
        <div className="bg-zinc-100 p-2 rounded-lg">
          <FileText className="w-5 h-5 text-zinc-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 truncate">Change Document</p>
          <p className="text-xs text-zinc-500">Click or drag to replace</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      {...getRootProps()} 
      className={cn(
        "relative group cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300",
        isDragActive ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-400 bg-white",
        isProcessing && "opacity-50 cursor-not-allowed"
      )}
    >
      <input {...getInputProps()} />
      <div className="p-8 flex flex-col items-center text-center gap-3">
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-110",
          isDragActive ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-400"
        )}>
          <Upload className="w-6 h-6" />
        </div>
        <div>
          <p className="text-base font-medium text-zinc-900">
            {isDragActive ? "Drop document here" : "Upload legal document"}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            PDF or DOCX (Max 20MB)
          </p>
        </div>
      </div>
    </div>
  );
};

const SummaryCard = ({ title, icon: Icon, children, className }: { title: string, icon: any, children: React.ReactNode, className?: string }) => (
  <div className={cn("bg-white border border-zinc-200 rounded-xl p-5 shadow-sm", className)}>
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-zinc-500" />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
    </div>
    <div className="text-zinc-900 leading-relaxed text-sm">
      {children}
    </div>
  </div>
);

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [fileData, setFileData] = useState<{ base64: string, mimeType: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [isHealthChecked, setIsHealthChecked] = useState(false);

  // Early health check to detect AI Studio cookie issues
  useEffect(() => {
    const checkHealth = async () => {
      try {
        // Try a simple fetch first
        const response = await fetch("/api/health", { credentials: "include" });
        const text = await response.text();
        
        // If we get the cookie check page, it means we're blocked
        if (text.includes("Cookie check") || text.includes("Action required to load your app") || text.includes("redirectToReturnUrl")) {
          setError("Browser security settings are blocking the connection to the legal workspace. This is common in Safari or Incognito mode.");
        }
      } catch (e) {
        console.warn("Initial health check failed", e);
        // If the fetch itself fails (e.g. CORS or network), it might also be cookie related in this environment
        setError("Unable to connect to the legal workspace. Please ensure you are logged in and third-party cookies are allowed.");
      } finally {
        setIsHealthChecked(true);
      }
    };
    checkHealth();
  }, []);

  const handleFixConnection = async () => {
    // Try to request storage access if supported (modern browsers)
    if (typeof document.requestStorageAccess === 'function') {
      try {
        await document.requestStorageAccess();
        window.location.reload();
        return;
      } catch (e) {
        console.log("Storage access request failed, falling back to new tab");
      }
    }
    // Fallback: Open in new tab
    window.open(window.location.href, '_blank');
  };

  const handleUpload = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setMessages([]);
    setExtractedText("");
    setProgress("Extracting text from document...");

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);

      const extractResponse = await fetch("/api/extract", {
        method: "POST",
        body: formData,
        // Ensure cookies are sent even in cross-origin iframe context
        credentials: "include",
      });

      const contentType = extractResponse.headers.get("content-type");
      if (!extractResponse.ok) {
        let errorMessage = "Failed to extract text";
        if (contentType && contentType.includes("application/json")) {
          const errorData = await extractResponse.json();
          errorMessage = errorData.error || errorMessage;
        } else {
          const textError = await extractResponse.text();
          if (textError.includes("Cookie check") || textError.includes("Action required to load your app")) {
            errorMessage = "Browser security settings are blocking the request. Please open the app in a new tab using the button in the top right, or ensure third-party cookies are enabled.";
          } else {
            errorMessage = `Server error (${extractResponse.status}): ${textError.substring(0, 200)}...`;
          }
        }
        throw new Error(errorMessage);
      }

      if (!contentType || !contentType.includes("application/json")) {
        const textError = await extractResponse.text();
        if (textError.includes("Cookie check") || textError.includes("Action required to load your app")) {
          throw new Error("Browser security settings are blocking the request. Please open the app in a new tab using the button in the top right, or ensure third-party cookies are enabled.");
        }
        console.error("Expected JSON but got:", textError);
        throw new Error(`Server returned non-JSON response: ${textError.substring(0, 100)}...`);
      }

      const { text, html, base64, mimeType } = await extractResponse.json();
      setExtractedText(html || text);
      setFileData({ base64, mimeType });

      // 2. Summarize & Precedents via Gemini
      setProgress("Analyzing legal context and identifying precedents...");
      
      const contents: any[] = [];
      
      // For PDFs, use multimodal input for better layout analysis
      if (mimeType === "application/pdf") {
        contents.push({
          inlineData: {
            data: base64,
            mimeType: "application/pdf"
          }
        });
        contents.push({
          text: `Analyze the attached legal document and provide:
          1. A structured summary.
          2. A list of 2-3 similar real-world historical cases (precedents) that give context to this situation, including how advocates proceeded and the outcome.
          
          Required JSON structure:
          {
            "executiveSummary": "Concise overview",
            "keyParties": ["Entity names"],
            "legalSignificance": ["Key precedents or rulings mentioned in THIS document"],
            "criticalDeadlines": ["Important dates"],
            "riskAssessment": "Analysis of risks",
            "precedents": [
              {
                "caseName": "Name of historical similar case",
                "summary": "Brief summary of the historical case",
                "outcome": "How it was resolved",
                "strategy": "How advocates/lawyers handled it"
              }
            ]
          }`
        });
      } else {
        // For DOCX, use the HTML/Text representation
        contents.push({
          text: `Analyze the following legal document (provided in ${html ? 'HTML' : 'text'} format to preserve structure/tables) and provide:
          1. A structured summary.
          2. A list of 2-3 similar real-world historical cases (precedents) that give context to this situation, including how advocates proceeded and the outcome.
          
          Document Content:
          ${(html || text).substring(0, 100000)}
          
          Required JSON structure:
          {
            "executiveSummary": "Concise overview",
            "keyParties": ["Entity names"],
            "legalSignificance": ["Key precedents or rulings mentioned in THIS document"],
            "criticalDeadlines": ["Important dates"],
            "riskAssessment": "Analysis of risks",
            "precedents": [
              {
                "caseName": "Name of historical similar case",
                "summary": "Brief summary of the historical case",
                "outcome": "How it was resolved",
                "strategy": "How advocates/lawyers handled it"
              }
            ]
          }`
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: contents },
        config: {
          responseMimeType: "application/json"
        }
      });

      const summaryData = JSON.parse(response.text || "{}");
      
      // Ensure all required arrays exist to prevent .map() errors
      const safeSummaryData: SummaryResult = {
        executiveSummary: summaryData.executiveSummary || "No summary available.",
        keyParties: Array.isArray(summaryData.keyParties) ? summaryData.keyParties : [],
        legalSignificance: Array.isArray(summaryData.legalSignificance) ? summaryData.legalSignificance : [],
        criticalDeadlines: Array.isArray(summaryData.criticalDeadlines) ? summaryData.criticalDeadlines : [],
        riskAssessment: summaryData.riskAssessment || "No risk assessment available.",
        precedents: Array.isArray(summaryData.precedents) ? summaryData.precedents : []
      };
      
      setResult(safeSummaryData);
      
      // Initial greeting
      setMessages([{
        role: "model",
        text: `I've analyzed "${uploadedFile.name}". I've identified the key parties, risks, and some relevant historical precedents. How can I help you understand this document better?`
      }]);
      
      setProgress("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during processing. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isChatting || !extractedText) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMessage }]);
    setIsChatting(true);

    try {
      // Simple history conversion
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `You are a specialized legal assistant. You are helping a user understand a document they uploaded. 
          Use the provided document context to answer questions accurately and professionally. 
          The document may contain complex tables, footnotes, and formatting which you should interpret correctly.
          If the answer isn't in the document, say so, but you can provide general legal context if relevant.
          
          Document Context:
          ${extractedText.substring(0, 100000)}`,
        },
        history: history,
      });

      // For PDFs, we can also include the file data in the message for even better accuracy
      const messageParts: any[] = [{ text: userMessage }];
      if (fileData?.mimeType === "application/pdf") {
        messageParts.unshift({
          inlineData: {
            data: fileData.base64,
            mimeType: "application/pdf"
          }
        });
      }

      const response = await chat.sendMessage({ message: messageParts });
      setMessages(prev => [...prev, { role: "model", text: response.text || "I'm sorry, I couldn't process that." }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "model", text: "Error: Failed to get response from AI." }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      <Header />

      <main className="flex-1 flex overflow-hidden max-w-[1600px] mx-auto w-full">
        
        {/* Left Sidebar: Document & Summary */}
        <div className="w-[400px] border-r border-zinc-200 flex flex-col bg-white overflow-hidden">
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            <div className="space-y-4">
              <h2 className="text-xl font-bold tracking-tight">Source</h2>
              <FileUploader onUpload={handleUpload} isProcessing={isProcessing} hasFile={!!file} />
            </div>

            {isProcessing && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-900 text-white p-5 rounded-2xl flex items-center gap-4"
              >
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                <div className="flex-1">
                  <p className="text-xs font-medium">{progress}</p>
                  <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-white"
                      animate={{ width: ["0%", "100%"] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex flex-col gap-3 text-red-900">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p className="text-xs leading-relaxed">{error}</p>
                </div>
                {(error.includes("Browser security settings") || error.includes("Unable to connect")) && (
                  <button 
                    onClick={handleFixConnection}
                    className="text-xs font-semibold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors w-fit shadow-sm flex items-center gap-2"
                  >
                    <Scale className="w-3 h-3" />
                    Fix Connection
                  </button>
                )}
              </div>
            )}

            {result && !isProcessing && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <SummaryCard title="Executive Summary" icon={Gavel}>
                  <p>{result.executiveSummary}</p>
                </SummaryCard>

                <SummaryCard title="Risk Assessment" icon={AlertCircle} className="border-red-100 bg-red-50/30">
                  <p className="text-zinc-800">{result.riskAssessment}</p>
                </SummaryCard>

                <div className="grid grid-cols-1 gap-4">
                  <SummaryCard title="Key Parties" icon={History}>
                    <ul className="space-y-1.5">
                      {result.keyParties?.map((party, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs">
                          <ChevronRight className="w-3 h-3 text-zinc-400" />
                          {party}
                        </li>
                      ))}
                      {(!result.keyParties || result.keyParties.length === 0) && (
                        <li className="text-xs text-zinc-400 italic">No key parties detected.</li>
                      )}
                    </ul>
                  </SummaryCard>

                  <SummaryCard title="Critical Deadlines" icon={FileSearch}>
                    <ul className="space-y-1.5">
                      {result.criticalDeadlines?.length > 0 ? (
                        result.criticalDeadlines.map((date, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-red-600 font-medium">
                            <AlertCircle className="w-3 h-3" />
                            {date}
                          </li>
                        ))
                      ) : (
                        <li className="text-xs text-zinc-400 italic">No deadlines detected.</li>
                      )}
                    </ul>
                  </SummaryCard>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Center: Chat Interface */}
        <div className="flex-1 flex flex-col bg-zinc-50 relative overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {!file && (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-4 opacity-50">
                <FileText className="w-16 h-16" />
                <p className="text-sm font-medium">Upload a document to start the legal workspace</p>
              </div>
            )}
            
            {messages.map((m, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex flex-col max-w-[80%]",
                  m.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                <div className={cn(
                  "p-4 rounded-2xl text-sm leading-relaxed",
                  m.role === "user" 
                    ? "bg-zinc-900 text-white rounded-tr-none" 
                    : "bg-white border border-zinc-200 text-zinc-900 rounded-tl-none shadow-sm"
                )}>
                  {m.text}
                </div>
              </motion.div>
            ))}
            {isChatting && (
              <div className="flex items-center gap-2 text-zinc-400 text-xs animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                AI is thinking...
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="p-6 bg-zinc-50 border-t border-zinc-200">
            <form onSubmit={handleSendMessage} className="relative max-w-3xl mx-auto">
              <input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={file ? "Ask a question about the document..." : "Upload a document first"}
                disabled={!file || isChatting}
                className="w-full bg-white border border-zinc-200 rounded-2xl px-6 py-4 pr-16 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all disabled:opacity-50"
              />
              <button 
                type="submit"
                disabled={!file || isChatting || !input.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-zinc-900 text-white p-2 rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Sidebar: Precedents & Analysis */}
        <div className="w-[400px] border-l border-zinc-200 flex flex-col bg-white overflow-hidden">
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight">Precedents & Analysis</h2>
              <p className="text-xs text-zinc-500">Historical cases and legal context similar to your document.</p>
            </div>

            {!result && !isProcessing && (
              <div className="h-[200px] flex flex-col items-center justify-center text-zinc-300 gap-3">
                <Scale className="w-10 h-10 opacity-20" />
                <p className="text-xs">Analysis will appear here</p>
              </div>
            )}

            {result?.precedents && (
              <div className="space-y-6">
                {result.precedents.map((p, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="p-5 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-sm text-zinc-900 leading-tight">{p.caseName}</h4>
                      <span className="text-[10px] font-bold uppercase tracking-tighter bg-zinc-200 px-1.5 py-0.5 rounded">Precedent</span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Case Summary</p>
                        <p className="text-xs text-zinc-600">{p.summary}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Advocate Strategy</p>
                        <p className="text-xs text-zinc-600 italic">"{p.strategy}"</p>
                      </div>
                      <div className="pt-2 border-t border-zinc-200">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Outcome</p>
                        <p className="text-xs font-medium text-emerald-700">{p.outcome}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
