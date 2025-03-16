import { useEffect, useRef, useState } from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  PauseCircle,
  PlayArrow,
  PlayArrowOutlined,
  RestartAltOutlined,
} from "@mui/icons-material";
import axios from "axios";

const {
  Container,
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Slider,
  ButtonGroup,
  Button,
} = require("@mui/material");

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

const createAircraftIcon = (heading) => {
  return L.divIcon({
    html: `<div style="
      width: 25px;
      height: 25px;
      transform: rotate(${heading}deg)
    ">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z" fill="#2196F3" />
      </svg>
    </div>`,
    className: "",
    iconSize: [25, 25],
    iconAnchor: [12, 12],
  });
};

const AircraftMarker = ({ position, heading }) => {
  const map = useMap();
  const markerRef = useRef(null);

  useEffect(() => {
    if (!markerRef.current) {
      markerRef.current = L.marker(position, {
        icon: createAircraftIcon(heading),
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      markerRef.current.setLatLng(position);
      markerRef.current.setIcon(createAircraftIcon(heading));
    }
  }, [map, position, heading]);

  return null;
};

const MapController = ({ position, heading }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(position, map.getZoom(), { animate: true });
    map._rotate = heading;
    map._container.style.transform = `rotate(${-heading}deg)`;
  }, [position, heading, map]);
  return null;
};

const App = () => {
  const [flightData, setFlightData] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mapCenter, setMapCenter] = useState([50.3168118, -4.2199067]);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(15);
  const animationReference = useRef(null);
  const lastUpdateTimeReference = useRef(0);
  const [currentFrame, setCurrentFrame] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(
          "http://localhost:8000/flight-data/?file_name=001_assessment_flight.tlog"
        );

        const formattedFlightData = response?.data;

        setFlightData(formattedFlightData);
        if (formattedFlightData.length > 0) {
          const firstPoint = formattedFlightData[0];
          setMapCenter([firstPoint.lat, firstPoint.lon]);
        }
      } catch (error) {
        console.error("Error fetching flight data:", error);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (!isPlaying || flightData.length === 0) return;

    const animate = (timestamp) => {
      if (!lastUpdateTimeReference.current)
        lastUpdateTimeReference.current = timestamp;

      const deltaTime = timestamp - lastUpdateTimeReference.current;

      if (deltaTime > 1000 / (speed * 2)) {
        lastUpdateTimeReference.current = timestamp;
        setCurrentFrame((prev) => {
          if (prev >= flightData.length - 1) {
            setIsPlaying(false);
            return flightData.length - 1;
          }
          return prev + 1;
        });
      }
      animationReference.current = requestAnimationFrame(animate);
    };

    animationReference.current = requestAnimationFrame(animate);

    return () => {
      if (animationReference.current) {
        cancelAnimationFrame(animationReference.current);
      }
    };
  }, [isPlaying, flightData, speed]);

  const flightPath = flightData.map((point) => [point.lat, point.lon]);

  const currentPosition = flightData[currentFrame]
    ? [flightData[currentFrame].lat, flightData[currentFrame].lon]
    : mapCenter;

  const currentHeading = flightData[currentFrame]
    ? flightData[currentFrame].heading
    : 0;

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    lastUpdateTimeReference.current = 0;
  };

  const handleRestart = () => {
    setCurrentFrame(0);
    setIsPlaying(false);
    lastUpdateTimeReference.current = 0;
  };

  const handleSpeedChange = (event) => {
    setSpeed(Number(event.target.value));
  };

  const handleSliderChange = (event, newValue) => {
    setCurrentFrame(newValue);
  };
  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Project Marble - Flight Plan Replay
        </Typography>
      </Box>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ position: "relative", height: "500px" }}>
            <MapContainer
              center={mapCenter}
              zoom={zoom}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Polyline positions={flightPath} color="blue" />
              {flightData.length > 0 && currentFrame < flightData.length && (
                <>
                  <AircraftMarker
                    position={currentPosition}
                    heading={currentHeading}
                  />
                  <MapController
                    position={currentPosition}
                    heading={currentHeading}
                  />
                </>
              )}
            </MapContainer>
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={8}>
              <Slider
                value={currentFrame}
                onChange={handleSliderChange}
                min={0}
                max={flightData.length - 1}
                disabled={flightData.length === 0}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => {
                  return flightData[value]
                    ? `Alt: ${flightData[value].alt.toFixed(
                        1
                      )}m, Heading: ${flightData[value].heading.toFixed(1)}°`
                    : "";
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="body2" color="text.secondary">
                Frame: {currentFrame} / {flightData.length - 1}
              </Typography>
              {flightData[currentFrame] && (
                <Typography variant="body2" color="text.secondary">
                  Alt: {flightData[currentFrame].alt.toFixed(1)}m, Heading:{" "}
                  {flightData[currentFrame].heading.toFixed(1)}°
                </Typography>
              )}
            </Grid>
          </Grid>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              mt: 2,
              flexWrap: "wrap",
              gap: 2,
            }}
          >
            <ButtonGroup variant="contained">
              <Button onClick={handleRestart}>
                <RestartAltOutlined />
              </Button>
              <Button onClick={handlePlayPause}>
                {isPlaying ? <PauseCircle /> : <PlayArrowOutlined />}
              </Button>
            </ButtonGroup>
            <FormControl sx={{ minWidth: 120 }}>
              <InputLabel id="speed-select-label">Speed</InputLabel>
              <Select
                labelId="speed-select-label"
                id="speed-select"
                value={speed}
                label="Speed"
                onChange={handleSpeedChange}
              >
                <MenuItem value={1}>1x</MenuItem>
                <MenuItem value={2}>2x</MenuItem>
                <MenuItem value={3}>3x</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
};

export default App;
