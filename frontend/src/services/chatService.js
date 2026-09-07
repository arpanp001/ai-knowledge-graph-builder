import api from "./api";

export const askQuestion = async (projectId, question) => {
    const response = await api.post(`/api/projects/${projectId}/chat`, { question });
    return response.data;
};

export const getChatHistory = async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/chat/history`);
    return response.data;
};