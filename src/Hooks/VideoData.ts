// hooks/useVideoData.ts
import { useEffect, useState } from 'react';
import api from '../Services/api';

interface VideoFilesProps {
    id: string;
    VideoFile: string;
    Link: string;
    Date: string;
    District: string;
    City: string;
    State: string;
    Gps_y: string;
    Gps_x: string;
    Area: string;
    RoadType: string;
    Traffic: string;
    Misc: string;
    Weather: string;
    Period: string;
}

interface CsvFileProps {
    videoname: string;
    timestamps: string;
}

const useVideoData = (video: string | undefined) => {
    const [filesdata, setFiles] = useState<VideoFilesProps[]>([]);
    const [csvdata, setCsv] = useState<CsvFileProps[]>([]);

    useEffect(() => {
        loadFiles();
    }, []);

    useEffect(() => {
        loadCsv();
    }, [video]);

    const loadFiles = async () => {
        const response = await api.get("/videofiless?page=1&pageSize=300&searchString=!!!!!");
        setFiles(response.data);
    };

    const loadCsv = async () => {
        if (video) {
            const response = await api.get("vehicle?page=1&pageSize=10&searchString=" + video.substring(0, 28));
            setCsv(response.data);
        }
    };

    return { filesdata, csvdata };
};

export default useVideoData;
