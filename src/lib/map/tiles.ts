/**
 * Shared OpenStreetMap raster-tile configuration.
 *
 * Both the map-first discovery view (`src/app/map/map-client.tsx`) and the
 * per-event venue map (`src/app/events/[id]/event-map.tsx`) render Leaflet on
 * top of these key-less OSM base layers. Keeping the tile URLs, attribution and
 * zoom caps in one module means the attribution stays correct everywhere and a
 * tile-host change is a one-line edit rather than a hunt across components.
 *
 * No API key is required for any of these providers — attribution is, so each
 * layer ships the operator's required credit string.
 */

export type BaseLayerId = "standard" | "terrain" | "outdoor";

export interface BaseLayerConfig {
  url: string;
  attribution: string;
  label: string;
  maxZoom: number;
}

export const BASE_LAYERS: Record<BaseLayerId, BaseLayerConfig> = {
  standard: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    label: "Standard",
    maxZoom: 19,
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | ' +
      'Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    label: "Terrain",
    maxZoom: 17,
  },
  outdoor: {
    url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    attribution:
      'CyclOSM | Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    label: "Outdoor",
    maxZoom: 20,
  },
};

/** The base layer used when a surface doesn't let the viewer pick one. */
export const DEFAULT_BASE_LAYER: BaseLayerId = "standard";
