import {
  displayFullRoute,
  findManyRoutes,
  createGeoJson,
  setup,
} from "./route-timer.js";

// TODO: Use arguments for this
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

main(2);
