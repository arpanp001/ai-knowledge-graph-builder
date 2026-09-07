import ProjectSelector from "./ProjectSelector";

function Sidebar({ selectedProjectId, onSelectProject }) {
  return (
    <aside
      data-tour="sidebar"
      className="w-full md:w-72 md:min-h-[calc(100vh-57px)] bg-white dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-4 transition-colors"
    >
      <ProjectSelector selectedProjectId={selectedProjectId} onSelectProject={onSelectProject} />
    </aside>
  );
}

export default Sidebar;