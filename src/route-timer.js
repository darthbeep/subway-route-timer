const fs = require("fs");
const csv = require("csv-parser");

const GTFS_DIR = "./data";
const PATH_FILE = "./input/start.csv";
const START_TIME = "02:00:00";

let stops = {};
let routes = {};
let trips = {};
let stopTimes = {};
let weekdayServices = new Set();
let visitedStops = new Set();
const SECONDS_IN_DAY = 24 * 60 * 60;

function normalizeStopId(id) {
  return id.replace(/[NS]$/, "");
}

function timeToSeconds(t) {
  if (t.includes(":")) {
    const [h, m, s] = t.split(":").map(Number);
    return (h % 24) * 3600 + m * 60 + s;
  } else {
    const d = new Date(t * 1000);
    const h = d.getHours();
    const m = d.getMinutes();
    const s = d.getSeconds();
    return (h % 24) * 3600 + m * 60 + s;
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
        if (r.stop_id === normalizeStopId(r.stop_id))
          stops[r.stop_id] = r.stop_name;
        stops[r.stop_id] = r.stop_name;
      })
      .on("end", resolve);
  });
}

async function loadRoutes() {
  return new Promise((resolve) => {
    fs.createReadStream(`${GTFS_DIR}/routes.txt`)
      .pipe(csv())
      .on("data", (r) => {
        routes[r.route_id] = r.route_short_name || r.route_long_name;
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
        if (weekdayServices.has(r.service_id)) {
          trips[r.trip_id] = r.route_id;
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
        const nextDayId = r.trip_id + "_NEXTDAY";

        if (!stopTimes[r.trip_id]) stopTimes[r.trip_id] = [];
        if (!stopTimes[nextDayId]) stopTimes[nextDayId] = [];
        stopTimes[r.trip_id].push({
          stop_id: stopId,
          arrival: timeToSeconds(r.arrival_time),
          departure: timeToSeconds(r.departure_time),
          seq: Number(r.stop_sequence),
        });
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
  const rows = [];
  return new Promise((resolve) => {
    fs.createReadStream(PATH_FILE)
      .pipe(csv())
      .on("data", (r) => {
        rows.push({
          from: r.from_stop,
          to: r.to_stop,
          transfer: Number(r.transfer_time || 0) * 60,
        });
      })
      .on("end", () => resolve(rows));
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
        route: routes[trips[tripId]],
      };
    }
  }

  return best;
}

async function main() {
  await loadStops();
  await loadRoutes();
  await loadCalendar();
  await loadTrips();
  await loadStopTimes();

  const path = await loadPath();

  let currentTime = timeToSeconds(START_TIME);

  const tripStart = currentTime;

  for (const step of path) {
    const trip = findTrip(step.from, step.to, currentTime);

    if (!trip) {
      console.log("No valid trip", step);
      return;
    }

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

    visitedStops.add(step.from);
    visitedStops.add(step.to);

    currentTime = trip.arrive + step.transfer;
  }

  let total = currentTime - tripStart;
  if (total < 0) total += SECONDS_IN_DAY;

  console.log("\nTotal time:", secondsToTime(total));

  const missing = [];

  for (const id in stops) {
    if (!visitedStops.has(id) && !id.startsWith("SIR")) {
      missing.push(id);
    }
  }

  //console.log("\nUnvisited stops:");
  //console.log(missing.join(", "));
}

main();
