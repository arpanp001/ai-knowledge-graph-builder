import api from "./api";

export const getProjectGraph = async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/graph`);
    return response.data;
};

export const findEntityPath = async (projectId, sourceKey, targetKey) => {
    const response = await api.get(`/api/projects/${projectId}/graph/path`, {
        params: { source: sourceKey, target: targetKey },
    });
    return response.data;
};