# Octa API Documentation

This document provides context and documentation for the Octa API responses to assist in frontend development. It details the data structures available for Polygons, Cameras, Waze Alerts, and Weather Stations.

## System Overview & Logic

The system aggregates data from various sources (Waze, Cameras, Weather Stations) and maps them to Polygons representing specific areas.

### General Data Flow
- **Polygons Update:** Polygon data is updated automatically by the backend on a scheduled basis (e.g., every 5, 15 minutes).
- **Timestamp:** The `timestamp` field in the response indicates when the polygon data was last updated.

### Status & Alerts Logic
The status of a polygon depends on alerts from Waze and detections from cameras.

1.  **Normal Status:**
    -   If `status_code` = 0, then `status_name` = 'NORMALIDADE'.

2.  **Waze Alerts (Attention):**
    -   `waze_flood_status` (0 or 1): Indicates presence of Waze alerts inside the polygon.
    -   If `waze_flood_status` = 1 (one or more alerts), then:
        -   `status_code` >= 1
        -   `status_name` = 'ATENÇÃO'

3.  **Camera Detections (Alert):**
    -   `camera_flood_status` (0 or 1): Indicates if one or more cameras inside the polygon had a positive flood detection.
    -   If `camera_flood_status` = 1, then:
        -   `status_code` >= 2
        -   `status_name` = 'ALERTA'
    -   **Additional Camera Data:**
        -   `camera_flood_count`: Number of cameras with positive flood detection in the polygon.
        -   `camera_flood_ids`: List of IDs of the cameras with detections.

### Rain Accumulation Logic
Polygon data includes rain accumulation metrics relative to the closest weather stations.
-   `acumulado_chuva_15_min_1`: 15-minute cumulative rain on the station **closest** to the polygon.
-   `acumulado_chuva_15_min_2`: 15-minute cumulative rain on the **second closest** station.
-   ...and so on for subsequent indices.

---

## API Endpoints & Response Schemas

### 1. `/cameras`
Returns a list of cameras monitored by the system.

**Response Example:**
```json
[
  {
    "Codigo": 1,
    "Latitude": -22.900259,
    "Longitude": -43.177031,
    "Nome da Camera": "Av. Pres.Vargas X R. 1º Março",
    "_id": null,
    "avg_prob": null,
    "cluster_id": -1.0,
    "label": null
  },
  {
    "Codigo": 2,
    "Latitude": -22.901392,
    "Longitude": -43.179391,
    "Nome da Camera": "Av. Pres.Vargas X Av. Rio Branco",
    "_id": "674e8ba523dbc61aac320340",
    "avg_prob": 0.0,
    "cluster_id": 241.0,
    "label": 0.0
  }
]
```

### 2. `/waze/alerts`
Returns active alerts reported by Waze users.

**Response Example:**
```json
[
  {
    "city": "Nova Iguaçu",
    "cluster_id": -1.0,
    "confidence": 0,
    "country": "BR",
    "latitude": -22.761347,
    "longitude": -43.471959,
    "magvar": 359,
    "pubMillis": "2025-11-30 07:59:37",
    "reliability": 5,
    "reportByMunicipalityUser": "false",
    "reportDescription": null,
    "reportRating": 1,
    "roadType": 1.0,
    "street": "R. Kennedy",
    "subtype": "HAZARD_ON_ROAD",
    "type": "HAZARD",
    "uuid": "3beed708-61e3-4678-a2dd-e8aa815083c5"
  }
]
```

### 3. `/mongo/Polygons/latest`
Returns the latest aggregated status data for all defined polygons. This is the primary endpoint for map visualization.

**Response Example:**
```json
[
  {
    "_id": "6926f7173d7a5372124efe2a",
    "acumulado_chuva_15_min_1": 0.0,
    "acumulado_chuva_15_min_2": 0.0,
    "acumulado_chuva_15_min_3": 0.0,
    "acumulado_chuva_15_min_4": 0.0,
    "acumulado_chuva_15_min_5": 0.0,
    "alagamento_count": 0,
    "alagamento_enchente_count": 0,
    "alagamento_enchente_ids": [],
    "alagamento_enchente_status": 0,
    "alagamento_ids": [],
    "alagamento_status": 0,
    "area_km2": 2.627518,
    "bolsão_count": 0,
    "bolsão_ids": [],
    "bolsão_status": 0,
    "camera_flood_count": 0,
    "camera_flood_ids": [],
    "camera_flood_status": 0,
    "cluster_id": 0,
    "density_km2": 37.297556,
    "enchente_count": 0,
    "enchente_ids": [],
    "enchente_status": 0,
    "geometry": [ ... ], 
    "label_count": 98,
    "lat_centroid": -22.96180127598135,
    "lng_centroid": -43.2049238773291,
    "lâmina_count": 0,
    "lâmina_ids": [],
    "lâmina_status": 0,
    "main_neighborhood": "Lagoa",
    "main_route": "Rua Professor Abelardo Lóbo",
    "main_street_number_range": "30",
    "rank": 4.0,
    "sirene_count": 0,
    "sirene_ids": [],
    "sirene_status": 0,
    "status_code": 0,
    "status_name": "NORMALIDADE",
    "timestamp": "2025-11-26 09:48:01",
    "title": "R. Prof. Abelardo Lóbo, 30 - Lagoa, Rio de Janeiro - RJ, 22470-240, Brazil",
    "vazamento_count": 0,
    "vazamento_ids": [],
    "vazamento_status": 0,
    "waze_flood_count": 0,
    "waze_flood_ids": [],
    "waze_flood_status": 0
  }
]
```

### 4. `/stations/alertario/api`
Returns weather data from Alerta Rio stations.

**Response Example:**
```json
[
  {
    "acumulado_chuva_15_min": 0.0,
    "acumulado_chuva_1_h": 0.0,
    "acumulado_chuva_1_mes": 44.8,
    "acumulado_chuva_24_h": 0.0,
    "acumulado_chuva_2_h": 0.0,
    "acumulado_chuva_3_h": 0.0,
    "acumulado_chuva_4_h": 0.0,
    "acumulado_chuva_5_min": 0.0,
    "acumulado_chuva_96_h": 1.6,
    "estacao": "Vidigal",
    "id_estacao": "1",
    "is_new": true,
    "latitude": -22.9925,
    "longitude": -43.233056,
    "read_at": "2025-11-30T08:20:00-03:00"
  }
]