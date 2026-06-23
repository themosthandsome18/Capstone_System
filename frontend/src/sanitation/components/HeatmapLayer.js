import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

export default function HeatmapLayer({ items }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !items || !items.length) return;

    // Convert items to [lat, lng, intensity] array
    const points = items.map((item) => {
      const lat = item.position[0];
      const lng = item.position[1];
      
      // Calculate intensity based on risk score (0 to 100)
      // We map the risk_score directly to intensity. Max is 100.
      const score = Number(item.risk_score || 0);
      let intensity = 0.2; // default low risk
      if (score >= 70) intensity = 1.0; // high risk
      else if (score >= 35) intensity = 0.6; // medium risk
      
      return [lat, lng, intensity];
    });

    const heatLayer = L.heatLayer(points, {
      radius: 30,       // Size of each point
      blur: 20,         // Blur amount
      maxZoom: 15,
      max: 1.0,         // Max intensity value
      gradient: {
        0.3: 'green',   // Low risk
        0.6: 'yellow',  // Medium risk
        1.0: 'red'      // High risk
      }
    });

    heatLayer.addTo(map);

    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, items]);

  return null;
}
