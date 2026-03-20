const fs = require("fs");
const csv = require("csv-parser");
require("dotenv").config({ quiet: true });

const GTFS_DIR = process.env.GTFS_DIR || "./data";
const PATH_FILE = process.env.PATH_FILE || "./input/start.csv";
const START_TIME = process.env.START_TIME || "02:00:00";

let path = [];
let stops = {};
let stop_coords = {};
let routes = {};
let trips = {};
let stopTimes = {};
let weekdayServices = new Set();
const SECONDS_IN_DAY = 24 * 60 * 60;

function normalizeStopId(id) {
  return id.replace(/[NS]$/, "");
}

function timeToSeconds(t) {
  if (t.includes(":")) {
    const [h, m, s] = t.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  } else {
    const d = new Date(t * 1000);
    const h = d.getHours();
    const m = d.getMinutes();
    const s = d.getSeconds();
    return h * 3600 + m * 60 + s;
  }
}

function secondsToTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function loadStops() {
  return new Promise((resolve) => {
    fs.createReadStream(`${GTFS_DIR}/stops.txt`)
      .pipe(csv())
      .on("data", (r) => {
        if (r.stop_id === normalizeStopId(r.stop_id)) {
          stops[r.stop_id] = r.stop_name;
          stop_coords[r.stop_id] = {
            lat: r.stop_lat,
            lon: r.stop_lon,
          };
        }

        // stops[r.stop_id] = r.stop_name;
      })
      .on("end", resolve);
  });
}

async function loadRoutes() {
  return new Promise((resolve) => {
    fs.createReadStream(`${GTFS_DIR}/routes.txt`)
      .pipe(csv())
      .on("data", (r) => {
        routes[r.route_id] = {
          name: r.route_short_name || r.route_long_name,
          color: "#" + r.route_color,
        };
      })
      .on("end", resolve);
  });
}

async function loadCalendar() {
  return new Promise((resolve) => {
    fs.createReadStream(`${GTFS_DIR}/calendar.txt`)
      .pipe(csv())
      .on("data", (r) => {
        if (
          r.monday === "1" &&
          r.tuesday === "1" &&
          r.wednesday === "1" &&
          r.thursday === "1" &&
          r.friday === "1"
        ) {
          weekdayServices.add(r.service_id);
        }
      })
      .on("end", resolve);
  });
}

async function loadTrips() {
  return new Promise((resolve) => {
    fs.createReadStream(`${GTFS_DIR}/trips.txt`)
      .pipe(csv())
      .on("data", (r) => {
        if (weekdayServices.has(r.service_id) && r.route_id !== "SI") {
          trips[r.trip_id] = r.route_id;
          trips[r.trip_id + "_PREVDAY"] = r.route_id;
          trips[r.trip_id + "_NEXTDAY"] = r.route_id;
        }
      })
      .on("end", resolve);
  });
}

async function loadStopTimes() {
  return new Promise((resolve) => {
    fs.createReadStream(`${GTFS_DIR}/stop_times.txt`)
      .pipe(csv())
      .on("data", (r) => {
        if (!trips[r.trip_id]) return;

        const stopId = normalizeStopId(r.stop_id);
        const prevDayId = r.trip_id + "_PREVDAY";
        const nextDayId = r.trip_id + "_NEXTDAY";

        if (!stopTimes[r.trip_id]) stopTimes[r.trip_id] = [];
        if (!stopTimes[nextDayId]) stopTimes[nextDayId] = [];
        stopTimes[r.trip_id].push({
          stop_id: stopId,
          arrival: timeToSeconds(r.arrival_time),
          departure: timeToSeconds(r.departure_time),
          seq: Number(r.stop_sequence),
        });
        if (timeToSeconds(r.departure_time) > SECONDS_IN_DAY) {
          if (!stopTimes[prevDayId]) stopTimes[prevDayId] = [];
          stopTimes[prevDayId].push({
            stop_id: stopId,
            arrival: timeToSeconds(r.arrival_time) - SECONDS_IN_DAY,
            departure: timeToSeconds(r.departure_time) - SECONDS_IN_DAY,
            seq: Number(r.stop_sequence),
          });
        }
        stopTimes[nextDayId].push({
          stop_id: stopId,
          arrival: timeToSeconds(r.arrival_time) + SECONDS_IN_DAY,
          departure: timeToSeconds(r.departure_time) + SECONDS_IN_DAY,
          seq: Number(r.stop_sequence),
        });
      })
      .on("end", () => {
        for (const t in stopTimes) {
          stopTimes[t].sort((a, b) => a.seq - b.seq);
        }
        resolve();
      });
  });
}

async function loadPath() {
  return new Promise((resolve) => {
    fs.createReadStream(PATH_FILE)
      .pipe(csv())
      .on("data", (r) => {
        path.push({
          from: r.from_stop,
          to: r.to_stop,
          transfer: Number(r.transfer_time || 0) * 60,
        });
      })
      .on("end", () => resolve());
  });
}

function findTrip(fromStop, toStop, currentTime) {
  let best = null;

  for (const tripId in stopTimes) {
    const seq = stopTimes[tripId];

    let fromIndex = seq.findIndex((x) => x.stop_id === fromStop);
    let toIndex = seq.findIndex((x) => x.stop_id === toStop);

    if (fromIndex === -1 || toIndex === -1) continue;
    if (toIndex <= fromIndex) continue;

    const depart = seq[fromIndex].departure;
    const arrive = seq[toIndex].arrival;

    if (depart < currentTime) continue;

    if (!best || depart < best.depart) {
      best = {
        tripId,
        depart,
        arrive,
        route: routes[trips[tripId]].name,
        color: routes[trips[tripId]].color,
      };
    }
  }

  return best;
}

function createRouteSteps(tripStart, logFullRoute = false) {
  const route = [];
  let currentTime = tripStart;
  let tripOffset = null;

  for (const step of path) {
    const trip = findTrip(step.from, step.to, currentTime);

    if (!trip) {
      console.log("No valid trip", step);
      return;
    }

    if (tripOffset === null) {
      tripOffset = trip.depart - tripStart;
    }

    if (logFullRoute) {
      console.log(
        trip.route,
        stops[step.from],
        "→",
        stops[step.to],
        secondsToTime(trip.depart),
        "→",
        secondsToTime(trip.arrive),
        step.transfer ? `(then walk ${step.transfer / 60} minutes)` : "",
      );
    }

    route.push({
      route: trip.route,
      from: step.from,
      to: step.to,
      arrive: trip.arrive,
      depart: trip.depart,
      transfer: step.transfer,
      color: trip.color,
    });

    currentTime = trip.arrive + step.transfer;
  }

  let total = currentTime - tripStart - tripOffset;
  if (total < 0) total += SECONDS_IN_DAY;

  if (logFullRoute) {
    console.log("\nTotal time:", secondsToTime(total));
  }

  return route;
}

function displayFullRoute() {
  const tripStart = timeToSeconds(START_TIME);
  const route = createRouteSteps(tripStart);
  for (const step of route) {
    console.log(
      step.route,
      stops[step.from],
      "→",
      stops[step.to],
      secondsToTime(step.depart),
      "→",
      secondsToTime(step.arrive),
      step.transfer ? `(then walk ${step.transfer / 60} minutes)` : "",
    );
  }
  const totalTime = route[route.length - 1].arrive - route[0].depart;
  console.log("\nTotal time:", secondsToTime(totalTime));
}

function findManyRoutes(offset) {
  let tripStart = 0;
  while (tripStart < SECONDS_IN_DAY) {
    const route = createRouteSteps(tripStart, false);
    const totalTime = route[route.length - 1].arrive - route[0].depart;
    console.log(
      `Time for ${secondsToTime(tripStart)} start is ${secondsToTime(totalTime)}`,
    );
    tripStart += offset * 60;
  }
}

async function createGeoJson() {
  const tripStart = timeToSeconds(START_TIME);
  const route = createRouteSteps(tripStart);

  const output = {
    type: "FeatureCollection",
    name: "subway",
    crs: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:OGC:1.3:CRS84",
      },
    },
    features: [],
  };

  let i = 1;
  for (const step of route) {
    const feature = {
      type: "Feature",
      properties: {
        step: i,
        line: step.route,
        color: step.color,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [
            Number(stop_coords[step.from].lon),
            Number(stop_coords[step.from].lat),
          ],
          [Number(stop_coords[step.to].lon), Number(stop_coords[step.to].lat)],
        ],
      },
    };
    output.features.push(feature);
    i++;
  }

  fs.writeFileSync("./output/gis.geojson", JSON.stringify(output));
  console.log("Writing to geojson file");
}

async function main(mode = 0) {
  await loadStops();
  await loadRoutes();
  await loadCalendar();
  await loadTrips();
  await loadStopTimes();
  await loadPath();

  if (mode === 0) {
    displayFullRoute();
  } else if (mode === 1) {
    findManyRoutes(60);
  } else if (mode === 2) {
    createGeoJson();
  }
}

main(0);
