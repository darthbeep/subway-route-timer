export const SECONDS_IN_DAY = 24 * 60 * 60;

export function normalizeStopId(id) {
  return id.replace(/[NS]$/, "");
}

export function timeToSeconds(t) {
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

export function secondsToTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
