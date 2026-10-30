import { basename, extname } from "node:path";
import type { Offer } from "./model";

function shorten(value: string, limit = 64): string {
  if (value.length <= limit) return value;
  const end = Math.floor((limit - 1) / 2);
  return `${value.slice(0, limit - end - 1)}…${value.slice(-end)}`;
}

export function targetSummary(item: Offer): string {
  if (item.kind === "url") {
    const url = new URL(item.target);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `Web link · ${shorten(`${url.host}${path}${url.search}`)}`;
  }
  const name = basename(item.target) || item.target;
  const type = item.kind === "directory" ? "Folder" : extname(name).slice(1).toUpperCase() || "File";
  return `${type} · ${shorten(name)}`;
}
