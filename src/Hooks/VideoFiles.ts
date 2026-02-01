// src/Hooks/useVideoFiles.ts
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

const useVideoFiles = (city: string) => {
  const [filesdata, setFiles] = useState<VideoFilesProps[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  useEffect(() => {
    const loadFiles = async () => {
      setIsLoading(true);
      try {
        const response = await api.get(`/videofiless?page=1&pageSize=300&searchString=${city}`);
        setFiles(response.data);
      } catch (error) {
        console.error("Error loading files:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadFiles();
  }, [city]);

  return { filesdata, isLoading };
};
export default useVideoFiles;
