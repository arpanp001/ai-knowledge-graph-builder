import { useEffect, useState } from "react";
import { FolderPlus } from "lucide-react";
import { createProject, getProjects, deleteProject } from "../services/projectService";
import { notifySuccess, notifyError } from "../utils/toast";
import { celebrate } from "../utils/confetti";

function ProjectSelector({ selectedProjectId, onSelectProject }) {
  const [projects, setProjects] = useState([]);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setProjects(await getProjects());
    } catch {
      setError("Could not load projects.");
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    setError("");
    try {
      const project = await createProject(newName.trim(), "");
      setNewName("");
      await loadProjects();
      onSelectProject(project.id, project.name);
      notifySuccess(`Project "${project.name}" created.`);
      celebrate();
    } catch {
      setError("Could not create project.");
      notifyError("Could not create project.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (projectId, e) => {
    e.stopPropagation();
    if (!confirm("Delete this project and all its documents, graph, and chat history? This cannot be undone.")) return;
    try {
      await deleteProject(projectId);
      if (selectedProjectId === projectId) onSelectProject(null);
      await loadProjects();
      notifySuccess("Project deleted.");
    } catch {
      setError("Could not delete project.");
      notifyError("Could not delete project.");
    }
  };

  return (
    <div className="w-full">
      <h2 className="section-label mb-3">Projects</h2>

      <div className="flex flex-col gap-2 mb-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="New project name..."
          className="input-field"
        />
        <button onClick={handleCreate} disabled={isCreating} className="btn-primary text-sm px-4 py-2 flex items-center justify-center gap-1.5">
          <FolderPlus size={15} /> Create
        </button>
      </div>

      {error && <p className="text-xs text-red-500 dark:text-red-400 mb-2">{error}</p>}

      {projects.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">No projects yet — create one to get started.</p>
      ) : (
        <ul className="space-y-1">
          {projects.map((p) => (
            <li
              key={p.id}
              onClick={() => onSelectProject(p.id, p.name)}
                className={`flex justify-between items-center text-sm rounded-xl px-3 py-2 cursor-pointer transition-all hover:translate-x-0.5 ${
                selectedProjectId === p.id
                  ? "bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-medium"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              }`}
            >
              <span className="truncate">{p.name}</span>
              <button onClick={(e) => handleDelete(p.id, e)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 shrink-0 ml-2">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ProjectSelector;