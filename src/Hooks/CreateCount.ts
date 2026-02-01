// Classes/apiService.ts
import api from '../Services/api';

export const loadHomeCounter = async () => {
    try {
        await api.post("/homecounter");
    } catch (error) {
        console.error("Error loading home counter:", error);
        throw error;
    }
};
