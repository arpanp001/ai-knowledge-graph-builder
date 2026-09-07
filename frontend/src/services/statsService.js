import api from "./api";

export const getProjectStats = async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/stats`);
    return response.data;
};