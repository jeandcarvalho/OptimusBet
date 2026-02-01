import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./MapVideoFull.css";
import api from '../Services/api';
import yellowicon from "../Components/img/mapicon.png";

const MapVideoFull = ({ videoName }) => {
    const mapRef = useRef(null);
    const defaultCenter = [-21.0505, -44.6333]; // Posição padrão do mapa

    useEffect(() => {
        if (!mapRef.current) {
            mapRef.current = L.map("map", {
                center: defaultCenter,
                zoom: 3,
                minZoom: 3,
                maxZoom: 15,
                doubleClickZoom: false,
                boxZoom: false,
                keyboard: false,
                tap: false,
            });
            mapRef.current.scrollWheelZoom.disable(); // Desativar zoom com a roda do mouse
            mapRef.current.doubleClickZoom.disable(); // Desativar zoom com duplo clique
            L.tileLayer("https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png", {
                attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
            }).addTo(mapRef.current);
        }

        const videoclicked = videoName?.substring(0, 28);

        const loadPoints = async () => {
            try {
                const response = await api.get("/coordinatesfull" + "?page=1&pageSize=3000&searchString=" + videoclicked);
                const points = response.data.filter(point => point.FileName.startsWith(videoclicked));
                let hasCityPoint = false; // Flag para verificar se a cidade tem pontos

                if (points.length > 0) {
                    // Adicionar marcadores para cada ponto correspondente ao videoName
                    points.forEach((point, index) => {
                        hasCityPoint = true;
                        if (index % 5 === 0) {
                            L.marker([point.GPS_y, point.GPS_x], {
                                icon: L.icon({
                                    iconUrl: yellowicon,
                                    iconSize: [32, 30],
                                    iconAnchor: [16, 50],
                                })
                            }).addTo(mapRef.current);
                        }
                    });
                }

                if (hasCityPoint) {
                    // Se houver pontos na cidade, centralize o mapa no primeiro ponto
                    const cityPoint = points[0];
                    mapRef.current.setView([cityPoint.GPS_y, cityPoint.GPS_x], 15);
                } else {
                    // Se não houver pontos na cidade, mantenha a posição padrão do mapa
                    console.log("Video GPS não encontrado");
                }

            } catch (error) {
                console.error("Erro ao carregar pontos do MongoDB:", error);
            }
        };
        loadPoints();
    }, [videoName, defaultCenter]);
    return (
        <div id="map" className="custom-map"></div>
    );
};

export default MapVideoFull;
