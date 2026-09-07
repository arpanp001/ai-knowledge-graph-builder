import { Route } from "lucide-react";
import TypewriterText from "./TypewriterText";

function ChatMessage({ role, text, sources, entities, reasoningPath, animate = false, onShowReasoning }) {
  const isUser = role === "user";
  const hasReasoningPath = reasoningPath && reasoningPath.nodes && reasoningPath.nodes.length > 2;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "bg-brand-600 text-white rounded-br-sm"
            : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-sm"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <TypewriterText text={text} enabled={animate} />
        )}

        {!isUser && hasReasoningPath && (
          <button
            onClick={() => onShowReasoning(reasoningPath)}
            className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
          >
            <Route size={13} />
            Show reasoning in graph ({reasoningPath.nodes.length} steps)
          </button>
        )}

        {!isUser && entities && entities.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {entities.map((name) => (
              <span key={name} className="text-[10px] bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 rounded-full px-2 py-0.5">
                {name}
              </span>
            ))}
          </div>
        )}

        {!isUser && sources && sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">Sources</p>
            <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
              {sources.map((source, i) => (
                <li key={i}>
                  {source.file_name}
                  {source.page_number != null && ` — Page ${source.page_number}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatMessage;