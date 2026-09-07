import axios from "axios";
import { getToken } from "./authService";

const api = axios.create({
    baseURL: "http://127.0.0.1:8000",
});

// Automatically attach the JWT (if we have one) to every outgoing request
api.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;