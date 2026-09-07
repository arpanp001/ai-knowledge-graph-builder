import { useEffect, useState } from "react";
import api from "./services/api";
import { getDocuments } from "./services/documentService";
import { getProjects } from "./services/projectService";
import { getToken, getCurrentUser, clearToken } from "./services/authService";
import AuthForm from "./components/AuthForm";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import FileUploader from "./components/FileUploader";
import GraphViewer from "./components/GraphViewer";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import SemanticSearch from "./components/SemanticSearch";
import ChatBox from "./components/ChatBox";
import LoadingSpinner from "./components/LoadingSpinner";
import CommandPalette, { paletteIcons } from "./components/CommandPalette";
import OnboardingTour, { shouldShowOnboarding } from "./components/OnboardingTour";
import { SkeletonCard } from "./components/Skeleton";
import { FolderOpen } from "lucide-react";
import { useDarkMode } from "./hooks/useDarkMode";

function App() {
  const [isDark, setIsDark] = useDarkMode();
  const [isConnected, setIsConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedProjectName, setSelectedProjectName] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [graphDocumentId, setGraphDocumentId] = useState(null);
  const [showProjectGraph, setShowProjectGraph] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [allProjects, setAllProjects] = useState([]);
  const [showTour, setShowTour] = useState(false);
  const [reasoningPathPreset, setReasoningPathPreset] = useState(null);

  useEffect(() => {
    api
      .get("/")
      .then(() => setIsConnected(true))
      .catch(() => setIsConnected(false));

    if (getToken()) {
      getCurrentUser()
        .then((user) => {
          setCurrentUser(user);
          if (shouldShowOnboarding()) setShowTour(true);
        })
        .catch(() => clearToken())
        .finally(() => setCheckingAuth(false));
    } else {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    setDocuments([]);
    setGraphDocumentId(null);
    setShowProjectGraph(false);
    setShowAnalytics(false);
    setReasoningPathPreset(null);
    if (selectedProjectId) loadDocuments();
  }, [selectedProjectId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (paletteOpen && currentUser) {
      getProjects().then(setAllProjects).catch(() => {});
    }
  }, [paletteOpen, currentUser]);

  const loadDocuments = async () => {
    setDocumentsLoading(true);
    try {
      const docs = await getDocuments(selectedProjectId);
      setDocuments(docs);
    } catch {
      // Silently ignore for now - not critical to page load
    } finally {
      setDocumentsLoading(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    setCurrentUser(null);
    setSelectedProjectId(null);
    setSelectedProjectName(null);
  };

  const handleSelectProject = (id, name) => {
    setSelectedProjectId(id);
    setSelectedProjectName(name || null);
  };

  const handleShowReasoning = (path) => {
    setShowProjectGraph(true);
    setGraphDocumentId(null);
    setShowAnalytics(false);
    setReasoningPathPreset(path);
  };

  const paletteActions = selectedProjectId
    ? [
        {
          label: "View Full Project Graph",
          icon: paletteIcons.Network,
          onRun: () => {
            setShowProjectGraph(true);
            setGraphDocumentId(null);
            setShowAnalytics(false);
            setPaletteOpen(false);
          },
        },
        {
          label: "View Analytics",
          icon: paletteIcons.BarChart3,
          onRun: () => {
            setShowAnalytics(true);
            setPaletteOpen(false);
          },
        },
        {
          label: isDark ? "Switch to Light Mode" : "Switch to Dark Mode",
          icon: isDark ? paletteIcons.Sun : paletteIcons.Moon,
          onRun: () => {
            setIsDark(!isDark);
            setPaletteOpen(false);
          },
        },
      ]
    : [
        {
          label: isDark ? "Switch to Light Mode" : "Switch to Dark Mode",
          icon: isDark ? paletteIcons.Sun : paletteIcons.Moon,
          onRun: () => {
            setIsDark(!isDark);
            setPaletteOpen(false);
          },
        },
      ];

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner label="Loading..." />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <Navbar
          isConnected={isConnected}
          currentUser={null}
          onLogout={handleLogout}
          isDark={isDark}
          onToggleTheme={setIsDark}
          onReplayTour={() => setShowTour(true)}
        />
        <div className="flex-1 flex items-center justify-center p-6">
          <AuthForm
            onAuthenticated={(user) => {
              setCurrentUser(user);
              if (shouldShowOnboarding()) setShowTour(true);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Navbar
        isConnected={isConnected}
        currentUser={currentUser}
        onLogout={handleLogout}
        isDark={isDark}
        onToggleTheme={setIsDark}
        onReplayTour={() => setShowTour(true)}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        projects={allProjects}
        onSelectProject={handleSelectProject}
        actions={paletteActions}
      />

      {showTour && <OnboardingTour onFinish={() => setShowTour(false)} />}

      <div className="flex-1 flex flex-col md:flex-row">
        <Sidebar selectedProjectId={selectedProjectId} onSelectProject={handleSelectProject} />

        <main className="flex-1 p-6 flex flex-col items-center gap-6">
          {!selectedProjectId && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-slate-400 dark:text-slate-500 text-center px-6">
              <FolderOpen size={40} strokeWidth={1.5} />
              Select or create a project in the sidebar to get started.
            </div>
          )}

          {selectedProjectId && (
            <>
              <FileUploader
                projectId={selectedProjectId}
                onUploadSuccess={loadDocuments}
                onDocumentReady={(docId) => setGraphDocumentId(docId)}
              />

              {documentsLoading && documents.length === 0 && <SkeletonCard />}

              {documents.length > 0 && (
                <div className="card p-6 max-w-md w-full fade-in">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                      Documents in this Project
                    </h2>
                    <div data-tour="graph-actions" className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowProjectGraph(true);
                          setGraphDocumentId(null);
                          setShowAnalytics(false);
                        }}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        View Full Project Graph
                      </button>
                      <button
                        onClick={() => setShowAnalytics((prev) => !prev)}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        {showAnalytics ? "Hide Analytics" : "View Analytics"}
                      </button>
                    </div>
                  </div>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    {documents.map((doc) => (
                      <li key={doc.document_id} className="flex justify-between items-center">
                        <span>
                          {doc.file_name} —{" "}
                          <span className="text-slate-500 dark:text-slate-400">{doc.status}</span>
                        </span>
                        {doc.status === "COMPLETED" && (
                          <button
                            onClick={() => {
                              setGraphDocumentId(doc.document_id);
                              setShowProjectGraph(false);
                            }}
                            className="text-brand-600 dark:text-brand-400 hover:underline text-xs"
                          >
                            View Graph
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(graphDocumentId || showProjectGraph) && (
                <div className="card p-6 max-w-3xl w-full fade-in">
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
                    {showProjectGraph ? "Full Project Knowledge Graph" : "Document Knowledge Graph"}
                  </h2>
                  {showProjectGraph ? (
                    <GraphViewer
                      projectId={selectedProjectId}
                      presetPath={reasoningPathPreset}
                      documents={documents}
                    />
                  ) : (
                    <GraphViewer documentId={graphDocumentId} />
                  )}
                </div>
              )}

              {showAnalytics && <AnalyticsDashboard projectId={selectedProjectId} />}

              <SemanticSearch projectId={selectedProjectId} />
              <ChatBox
                projectId={selectedProjectId}
                projectName={selectedProjectName}
                onShowReasoning={handleShowReasoning}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;