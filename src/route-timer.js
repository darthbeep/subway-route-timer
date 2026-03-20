import fs from "fs";
import dotenv from "dotenv";
import * as dataLoader from "./load-data.js";
import { timeToSeconds, secondsToTime, SECONDS_IN_DAY } from "./utils.js";

dotenv.config({ quiet: true });

const START_TIME = process.env.START_TIME || "02:00:00";

let path = [];
let stops = {};
let routes = {};
let trips = {};
let stopTimes = {};
let weekdayServices = new Set();

function findTrip(fromStop, toStop, currentTime) {
  let best = null;
  let bestFromIndex = -1
  let bestToIndex = -1

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
      bestFromIndex = fromIndex
      bestToIndex = toIndex
      best = {
        tripId,
        depart,
        arrive,
        route: routes[trips[tripId]].name,
        color: routes[trips[tripId]].color,
        fullStops: []
      };
    }
  }

  if (best && bestFromIndex !== -1 && bestToIndex !== -1 && bestToIndex > bestFromIndex) {
    const bestTrip = stopTimes[best.tripId]
    let i = bestFromIndex
    while (i <= bestToIndex) {
      const stop = bestTrip[i].stop_id
      stops[stop].visits += 1
      best.fullStops.push(stop)
      i+=1
    }
  }
  return best;
}

function createRouteSteps(tripStart) {
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

    route.push({
      route: trip.route,
      from: step.from,
      to: step.to,
      arrive: trip.arrive,
      depart: trip.depart,
      transfer: step.transfer,
      color: trip.color,
      fullStops: trip.fullStops
    });

    currentTime = trip.arrive + step.transfer;
  }

  let total = currentTime - tripStart - tripOffset;
  if (total < 0) total += SECONDS_IN_DAY;

  return route;
}

function displayFullRoute() {
  const tripStart = timeToSeconds(START_TIME);
  const route = createRouteSteps(tripStart);
  for (const step of route) {
    console.log(
      step.route,
      stops[step.from].name,
      "→",
      stops[step.to].name,
      secondsToTime(step.depart),
      "→",
      secondsToTime(step.arrive),
      step.transfer ? `(then walk ${step.transfer / 60} minutes)` : "",
    );
  }
  const totalTime = route[route.length - 1].arrive - route[0].depart;
  console.log("\nTotal time:", secondsToTime(totalTime));

  const missingStops = []
  for (const stop of Object.values(stops)) {
    if (stop.visits === 0) {
      missingStops.push(stop.stop_id)
    }
  }
  if (missingStops.length > 0) {
    console.log("Missing stops:", missingStops.join(", "))
  }
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
        coordinates: step.fullStops.map(stopCode => [
          Number(stops[stopCode].lon),
          Number(stops[stopCode].lat)
        ])
      },
    };
    output.features.push(feature);
    i++;
  }

  fs.writeFileSync("./output/gis.geojson", JSON.stringify(output));
  console.log("Writing to geojson file");
}

async function setup() {
  stops = await dataLoader.loadStops();
  routes = await dataLoader.loadRoutes();
  weekdayServices = await dataLoader.loadCalendar();
  trips = await dataLoader.loadTrips(weekdayServices);
  stopTimes = await dataLoader.loadStopTimes(trips);
  path = await dataLoader.loadPath();
}

async function main(mode = 0) {
  await setup();

  if (mode === 0) {
    displayFullRoute();
  } else if (mode === 1) {
    findManyRoutes(60);
  } else if (mode === 2) {
    createGeoJson();
  }
}

main(0);
