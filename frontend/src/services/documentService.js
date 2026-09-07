import api from "./api";

export const uploadDocument = async (file, projectId) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", projectId);

    const response = await api.post("/api/documents/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });

    return response.data;
};

export const getDocuments = async (projectId) => {
    const response = await api.get("/api/documents/", { params: { project_id: projectId } });
    return response.data;
};

export const getDocumentChunks = async (documentId) => {
    const response = await api.get(`/api/documents/${documentId}/chunks`);
    return response.data;
};

export const getDocumentEntities = async (documentId) => {
    const response = await api.get(`/api/documents/${documentId}/entities`);
    return response.data;
};

export const getDocumentRelationships = async (documentId) => {
    const response = await api.get(`/api/documents/${documentId}/relationships`);
    return response.data;
};

export const getDocumentGraph = async (documentId) => {
    const response = await api.get(`/api/documents/${documentId}/graph`);
    return response.data;
};

export const semanticSearch = async (query, projectId, limit = 5) => {
    const response = await api.get("/api/documents/search/semantic", {
        params: { q: query, project_id: projectId, limit },
    });
    return response.data;
};

export const getDocument = async (documentId) => {
    const response = await api.get(`/api/documents/${documentId}`);
    return response.data;
};