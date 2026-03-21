import { createGeoJson, setup } from "./route-timer.js";

async function main() {
  await setup();
  createGeoJson();
}

main();
