import api from "./api";

export const register = async (name, email, password) => {
    const response = await api.post("/api/auth/register", { name, email, password });
    return response.data;
};

export const login = async (email, password) => {
    const response = await api.post("/api/auth/login", { email, password });
    return response.data;
};

export const getCurrentUser = async () => {
    const response = await api.get("/api/auth/me");
    return response.data;
};

export const saveToken = (token) => localStorage.setItem("access_token", token);
export const getToken = () => localStorage.getItem("access_token");
export const clearToken = () => localStorage.removeItem("access_token");