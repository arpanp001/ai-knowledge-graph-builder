import { useState } from "react";
import { askQuestion } from "../services/chatService";

function ChatTest() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState("");

  const handleAsk = async () => {
    if (!question.trim()) return;

    setIsAsking(true);
    setError("");
    setResult(null);

    try {
      const data = await askQuestion(question);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setIsAsking(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleAsk();
  };

  return (
    <div className="bg-white shadow-md rounded-xl p-6 max-w-3xl w-full">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">
        Test Hybrid RAG (Ask a Question)
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        Combines document search + graph relationships to answer grounded questions.
        This is a temporary test view - the full chat interface comes in Phase 11.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your uploaded documents..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={handleAsk}
          disabled={isAsking}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          {isAsking ? "Thinking..." : "Ask"}
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {result && (
        <div className="space-y-3">
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{result.answer}</p>
          </div>

          {result.graph_entities_used.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Entities recognized in your question:</p>
              <div className="flex flex-wrap gap-1">
                {result.graph_entities_used.map((name) => (
                  <span key={name} className="text-xs bg-purple-50 text-purple-700 rounded-full px-2 py-1">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.sources.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Sources:</p>
              <ul className="text-xs text-gray-600 space-y-1">
                {result.sources.map((source, i) => (
                  <li key={i}>
                    {source.file_name} — Page {source.page_number}
                    {source.similarity_score != null && (
                      <span className="text-gray-400"> (score: {source.similarity_score})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ChatTest;