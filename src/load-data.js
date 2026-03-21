import fs from "fs";
import csv from "csv-parser";
import dotenv from "dotenv";
import { normalizeStopId, timeToSeconds, SECONDS_IN_DAY } from "./utils.js";

dotenv.config({ quiet: true });

const GTFS_DIR = process.env.GTFS_DIR || "./data";
const PATH_FILE = process.env.PATH_FILE || "./input/start.csv";

export async function loadStops() {
  return new Promise((resolve) => {
    const stops = {};
    fs.createReadStream(`${GTFS_DIR}/stops.txt`)
      .pipe(csv())
      .on("data", (r) => {
        if (
          r.stop_id === normalizeStopId(r.stop_id) &&
          (!r.stop_id.startsWith("S") ||
            r.stop_id === "S01" ||
            r.stop_id === "S03" ||
            r.stop_id === "S04")
        ) {
          stops[r.stop_id] = {
            stop_id: r.stop_id,
            name: r.stop_name,
            lat: r.stop_lat,
            lon: r.stop_lon,
            visits: 0,
          };
        }
      })
      .on("end", resolve(stops));
  });
}

export async function loadRoutes() {
  return new Promise((resolve) => {
    const routes = {};
    fs.createReadStream(`${GTFS_DIR}/routes.txt`)
      .pipe(csv())
      .on("data", (r) => {
        routes[r.route_id] = {
          name: r.route_short_name || r.route_long_name,
          color: "#" + r.route_color,
        };
      })
      .on("end", resolve(routes));
  });
}

export async function loadCalendar() {
  return new Promise((resolve) => {
    const weekdayServices = new Set();
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
      .on("end", resolve(weekdayServices));
  });
}

export async function loadTrips(weekdayServices) {
  return new Promise((resolve) => {
    const trips = {};
    fs.createReadStream(`${GTFS_DIR}/trips.txt`)
      .pipe(csv())
      .on("data", (r) => {
        if (weekdayServices.has(r.service_id) && r.route_id !== "SI") {
          trips[r.trip_id] = r.route_id;
          trips[r.trip_id + "_PREVDAY"] = r.route_id;
          trips[r.trip_id + "_NEXTDAY"] = r.route_id;
        }
      })
      .on("end", resolve(trips));
  });
}

export async function loadStopTimes(trips) {
  return new Promise((resolve) => {
    const stopTimes = {};
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
        resolve(stopTimes);
      });
  });
}

export async function loadPath() {
  return new Promise((resolve) => {
    const path = [];
    fs.createReadStream(PATH_FILE)
      .pipe(csv())
      .on("data", (r) => {
        path.push({
          from: r.from_stop,
          to: r.to_stop,
          transfer: Number(r.transfer_time || 0) * 60,
        });
      })
      .on("end", () => resolve(path));
  });
}
