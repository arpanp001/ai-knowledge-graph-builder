import api from "./api";

export const createProject = async (name, description) => {
    const response = await api.post("/api/projects/", { name, description });
    return response.data;
};

export const getProjects = async () => {
    const response = await api.get("/api/projects/");
    return response.data;
};

export const deleteProject = async (projectId) => {
    const response = await api.delete(`/api/projects/${projectId}`);
    return response.data;
};