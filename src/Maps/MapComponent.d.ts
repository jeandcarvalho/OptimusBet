import { FunctionComponent } from "react";
import { LatLngLiteral } from "leaflet";

interface MapComponentProps {
    states: LatLngLiteral[];
}

declare const MapComponent: FunctionComponent<MapComponentProps>;
export default MapComponent;
