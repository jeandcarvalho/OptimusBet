// Separando a lógica da API em um hook customizado
import { useEffect, useState } from 'react';
import api from '../Services/api';

interface FilesProps {
    'unique id': string;
    visitantes: number;
}

const useFetchFiles = () => {
    const [filesdata, setFiles] = useState<FilesProps[]>([]);
    useEffect(() => {
        const loadFiles = async () => {
            try {
                const response = await api.get<FilesProps[]>("/counter");
                setFiles(response.data);
            } catch (error) {
                console.error("Error loading files:", error);
            }
        };
        loadFiles();
    }, []);
    return filesdata;
};
export default useFetchFiles;
