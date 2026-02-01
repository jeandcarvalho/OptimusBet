import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css"; // Importe o CSS do Leaflet
import "./MapComponent.css"; // Importe o arquivo de estilos CSS personalizados
import yellowicon from "../Components/img/mapicon.png"

const MapComponent = () => {
    const mapRef = useRef(null);
    useEffect(() => {
        if (!mapRef.current) {
            // Cria o mapa se ainda não existir
            mapRef.current = L.map("map", {
                center: [0, 0], // Defina o centro do mapa
                zoom: 3, // Defina o nível de zoom inicial
                minZoom: 3, // Defina o zoom mínimo
                maxZoom: 3, // Defina o zoom máximo
                style: "",
                doubleClickZoom: false, // Desativa o zoom ao clicar duas vezes
                boxZoom: false, // Desativa o zoom ao arrastar para selecionar uma área
                keyboard: false, // Desativa a interação com o teclado
                tap: false, // Desativa a interação de toque em dispositivos móveis
            });
            L.tileLayer("https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png", {
                attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
            }).addTo(mapRef.current);
        }
        // Define as coordenadas manualmente
        const states = [
            { name: "sp", latitude: -22.13062389844448, longitude: -48.72747603716756 }, 
            { name: "rj", latitude: -22.264209227742157, longitude: -42.35377775762752 }, 
            { name: "es", latitude: -19.427163500479125, longitude: -39.99113515702372 }, 
            { name: "pr", latitude: -24.469343535920643, longitude: -52.049116211978536 },  
            { name: "mg", latitude: -18.246247268507634, longitude: -44.23527152369491 } , 
        ];
        mapRef.current.scrollWheelZoom.disable(); // Desativar zoom com a roda do mouse
        //   mapRef.current.dragging.disable(); // Desativar arrastar o mapa com o mouse
      //     mapRef.current.touchZoom.disable(); // Desativar zoom com gestos de toque
           mapRef.current.doubleClickZoom.disable();
        states.forEach(state => {
            L.marker([state.latitude, state.longitude], {
                icon: L.icon({
                    iconUrl: yellowicon,
                    iconSize: [40, 41], // Tamanho padrão do ícone do marcador
                    iconAnchor: [16, 50], // Ponto de ancoragem do ícone do marcador            
                })
            }).addTo(mapRef.current);
        });
        // Ajusta o mapa para que todos os marcadores estejam visíveis
        if (states.length > 0) {
            const bounds = L.latLngBounds(states.map(state => [state.latitude, state.longitude]));
            mapRef.current.fitBounds(bounds);
        }
    }, []);
    return (
        <div id="map" className="custom-map"></div> // Adicionando a classe 'custom-map'
    );
};

export default MapComponent;
