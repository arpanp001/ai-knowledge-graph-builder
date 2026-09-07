import { useState } from "react";
import { semanticSearch } from "../services/documentService";

function SemanticSearch({projectId}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const data = await semanticSearch(query, projectId);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="bg-white shadow-md rounded-xl p-6 max-w-3xl w-full">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">
        Test Semantic Search
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        Searches across all uploaded documents by meaning, not exact keywords. This is a temporary test view - the real chat interface comes in a later phase.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask something about your documents..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          {isSearching ? "Searching..." : "Search"}
        </button>
      </div>

      {hasSearched && !isSearching && results.length === 0 && (
        <p className="text-sm text-gray-500">No matching chunks found.</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((result, i) => (
            <div key={i} className="text-xs bg-gray-50 rounded p-3">
              <div className="flex justify-between text-gray-500 mb-1">
                <span>{result.file_name} — Page {result.page_number}</span>
                <span>Score: {result.similarity_score}</span>
              </div>
              <p className="text-gray-700">{result.text.slice(0, 250)}...</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SemanticSearch;