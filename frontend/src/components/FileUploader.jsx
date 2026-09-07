import { useState, useRef, useEffect } from "react";
import {
  uploadDocument,
  getDocument,
  getDocumentChunks,
  getDocumentEntities,
  getDocumentRelationships,
} from "../services/documentService";
import { notifySuccess, notifyError } from "../utils/toast";
import { celebrate } from "../utils/confetti";

function FileUploader({ projectId, onUploadSuccess, onDocumentReady }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadItems, setUploadItems] = useState([]); // [{fileName, documentId, status, error}]
  const [isUploading, setIsUploading] = useState(false);
  const [previewDocId, setPreviewDocId] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [entities, setEntities] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [activeView, setActiveView] = useState(null);
  const fileInputRef = useRef(null);
  const pollIntervalsRef = useRef({});

  useEffect(() => {
    return () => {
      Object.values(pollIntervalsRef.current).forEach(clearInterval);
    };
  }, []);

  const handleFileChange = (e) => {
    setSelectedFiles(Array.from(e.target.files));
    setActiveView(null);
  };

  const pollDocumentStatus = (documentId, fileName) => {
    pollIntervalsRef.current[documentId] = setInterval(async () => {
      try {
        const doc = await getDocument(documentId);

        setUploadItems((prev) =>
          prev.map((item) => (item.documentId === documentId ? { ...item, status: doc.status } : item))
        );

        if (doc.status === "COMPLETED" || doc.status === "FAILED") {
          clearInterval(pollIntervalsRef.current[documentId]);
          delete pollIntervalsRef.current[documentId];

          if (doc.status === "COMPLETED") {
            setPreviewDocId(documentId);
            if (onDocumentReady) onDocumentReady(documentId);

            notifySuccess(`"${fileName}" processed successfully.`);
            celebrate();
          } else {
            setUploadItems((prev) =>
              prev.map((item) =>
                item.documentId === documentId
                  ? { ...item, error: doc.error_message }
                  : item
              )
            );
            notifyError(`"${fileName}" failed to process.`);
          }
          if (onUploadSuccess) onUploadSuccess();

          // Once every active poll has finished, we're done uploading
          if (Object.keys(pollIntervalsRef.current).length === 0) {
            setIsUploading(false);
          }
        }
      } catch {
        clearInterval(pollIntervalsRef.current[documentId]);
        delete pollIntervalsRef.current[documentId];
        setUploadItems((prev) =>
          prev.map((item) =>
            item.documentId === documentId ? { ...item, status: "FAILED", error: "Lost connection while checking status." } : item
          )
        );
      }
    }, 2000);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setActiveView(null);
    const newItems = selectedFiles.map((f) => ({ fileName: f.name, documentId: null, status: "UPLOADING", error: null }));
    setUploadItems(newItems);

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      try {
        const result = await uploadDocument(file, projectId);
        setUploadItems((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, documentId: result.document_id, status: result.status } : item))
        );
        if (onUploadSuccess) onUploadSuccess();
        pollDocumentStatus(result.document_id, file.name);
      } catch (error) {
        const message = error.response?.data?.detail || "Upload failed.";
        setUploadItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, status: "FAILED", error: message } : item)));
      }
    }

    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleViewChunks = async (documentId) => {
    try {
      setChunks(await getDocumentChunks(documentId));
      setPreviewDocId(documentId);
      setActiveView("chunks");
    } catch {
      /* ignore */
    }
  };

  const handleViewEntities = async (documentId) => {
    try {
      setEntities(await getDocumentEntities(documentId));
      setPreviewDocId(documentId);
      setActiveView("entities");
    } catch {
      /* ignore */
    }
  };

  const handleViewRelationships = async (documentId) => {
    try {
      setRelationships(await getDocumentRelationships(documentId));
      setPreviewDocId(documentId);
      setActiveView("relationships");
    } catch {
      /* ignore */
    }
  };

  return (
    <div data-tour="uploader" className="bg-white shadow-md rounded-xl p-6 max-w-md w-full">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Upload Documents</h2>
      <p className="text-xs text-gray-500 mb-3">PDF, TXT, or DOCX. You can select multiple files at once.</p>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full mb-3 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg py-4 text-sm text-gray-600 hover:text-blue-600 transition"
      >
        {selectedFiles.length > 0 ? `${selectedFiles.length} file(s) selected` : "Click to choose file(s)"}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.docx"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      <button
        onClick={handleUpload}
        disabled={isUploading || selectedFiles.length === 0}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-4 py-2 rounded-lg w-full transition"
      >
        {isUploading ? "Processing..." : "Upload"}
      </button>

      {uploadItems.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploadItems.map((item, i) => (
            <div key={i} className="text-xs bg-gray-50 rounded p-2">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700 truncate">{item.fileName}</span>
                <span className={item.status === "FAILED" ? "text-red-500" : item.status === "COMPLETED" ? "text-green-600" : "text-gray-500"}>
                  {item.status}
                </span>
              </div>
              {item.error && <p className="text-red-500 mt-1">{item.error}</p>}
              {item.status === "COMPLETED" && item.documentId && (
                <div className="flex gap-3 mt-1">
                  <button onClick={() => handleViewChunks(item.documentId)} className="text-blue-600 hover:underline">Chunks</button>
                  <button onClick={() => handleViewEntities(item.documentId)} className="text-blue-600 hover:underline">Entities</button>
                  <button onClick={() => handleViewRelationships(item.documentId)} className="text-blue-600 hover:underline">Relationships</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeView === "chunks" && (
        <div className="mt-4 max-h-64 overflow-y-auto border-t pt-3 space-y-2">
          {chunks.map((chunk) => (
            <div key={chunk.chunk_id} className="text-xs bg-gray-50 rounded p-2">
              <p className="font-medium text-gray-600 mb-1">{chunk.chunk_id} — Page {chunk.page_number}</p>
              <p className="text-gray-700">{chunk.text.slice(0, 150)}...</p>
            </div>
          ))}
        </div>
      )}

      {activeView === "entities" && (
        <div className="mt-4 max-h-64 overflow-y-auto border-t pt-3 flex flex-wrap gap-2">
          {entities.map((entity) => (
            <span key={entity.name} className="text-xs bg-blue-50 text-blue-700 rounded-full px-3 py-1">
              {entity.name} · {entity.type}
            </span>
          ))}
        </div>
      )}

      {activeView === "relationships" && (
        <div className="mt-4 max-h-64 overflow-y-auto border-t pt-3 space-y-2">
          {relationships.length === 0 && <p className="text-xs text-gray-500">No relationships found.</p>}
          {relationships.map((rel, index) => (
            <div key={index} className="text-xs bg-gray-50 rounded p-2 flex items-center gap-1">
              <span className="font-medium text-gray-800">{rel.source}</span>
              <span className="text-purple-600 font-mono">— {rel.relation} →</span>
              <span className="font-medium text-gray-800">{rel.target}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FileUploader;