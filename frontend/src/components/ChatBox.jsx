import { useState, useRef, useEffect } from "react";
import { askQuestion, getChatHistory } from "../services/chatService";
import ChatMessage from "./ChatMessage";
import { buildChatMarkdown, downloadTextFile, downloadChatAsPDF } from "../utils/exportChat";
import { MessageSquareText } from "lucide-react";
import { notifyError } from "../utils/toast";

function ChatBox({ projectId, projectName,onShowReasoning  }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!projectId) return;
    setMessages([]);
    getChatHistory(projectId)
      .then((history) => {
        setMessages(history.map((m) => ({ role: m.role, text: m.message, animate: false })));
      })
      .catch(() => {
        // No history yet, or a transient error - not critical, just start fresh
      });
  }, [projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAsking]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isAsking || !projectId) return;

    setError("");
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setIsAsking(true);

    try {
      const result = await askQuestion(projectId, question);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: result.answer,
          sources: result.sources,
          entities: result.graph_entities_used,
          reasoningPath: result.reasoning_path,
          animate: true,
        },
      ]);
    } catch (err) {
      const message = err.response?.data?.detail || "Something went wrong while getting an answer. Please try again.";
      setError(message);
      notifyError(message);
    } finally {
      setIsAsking(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSend();
  };

  const handleClear = () => setMessages([]);

  return (
    <div data-tour="chat" className="card p-6 max-w-3xl w-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Chat with your documents</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Answers are grounded in this project's documents only.</p>
        </div>
        {messages.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => downloadTextFile(`chat-export-${Date.now()}.md`, buildChatMarkdown(messages, projectName))}
              className="text-xs text-gray-500 hover:text-blue-600 transition"
            >
              Export .md
            </button>
            <button
              onClick={() => downloadChatAsPDF(messages, projectName)}
              className="text-xs text-gray-500 hover:text-blue-600 transition"
            >
              Export .pdf
            </button>
            <button onClick={handleClear} className="text-xs text-gray-500 hover:text-red-500 transition">
              Clear Chat
            </button>
          </div>
        )}
      </div>

      <div className="h-72 sm:h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 mb-3 bg-slate-50 dark:bg-slate-950">
        {messages.length === 0 && !isAsking && (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-sm text-slate-400 dark:text-slate-500 text-center px-6">
            <MessageSquareText size={28} strokeWidth={1.5} />
            Ask a question about any document in this project to get started.
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            role={msg.role}
            text={msg.text}
            sources={msg.sources}
            entities={msg.entities}
            reasoningPath={msg.reasoningPath}
            animate={msg.animate}
            onShowReasoning={onShowReasoning}
          />
        ))}

        {isAsking && (
          <div className="flex justify-start mb-3">
            <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
              <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          disabled={isAsking}
          className="input-field flex-1 disabled:opacity-60"
        />
        <button onClick={handleSend} disabled={isAsking || !input.trim()} className="btn-primary text-sm px-4 py-2">
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatBox;