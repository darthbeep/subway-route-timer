async function loadServerFile(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Could not fetch the file:", error);
  }
}

function onEachFeature(feature, layer) {
  // does this feature have a property named popupContent?
  if (feature.properties && feature.properties.step) {
    console.log(feature.properties);
    layer
      .bindTooltip(`${feature.properties.step}`, {
        permanent: true,
        direction: "center",
        className: "line-label",
        offset: [0, 0],
      })
      .openTooltip();
    layer.bindPopup(feature.properties.description);
  }
}

async function displayData() {
  const data = await loadServerFile("/output/gis.geojson");
  L.geoJSON(data, {
    style: function (feature) {
      return { color: feature.properties.color };
    },
    arrowheads: {},
    onEachFeature,
  }).addTo(map);
}

var map = L.map("map").setView([40.732338 + 0, -73.900495], 13);
var Esri_WorldGrayCanvas = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
    maxZoom: 16,
  },
).addTo(map);

displayData();
