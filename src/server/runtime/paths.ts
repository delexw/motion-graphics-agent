import path from "node:path";
import { fileURLToPath } from "node:url";

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const dataRoot = path.join(appRoot, ".data");

export const desktopBackend = process.env.KITEVA_DESKTOP_BACKEND === "1";
export const jobsDatabasePath = path.join(dataRoot, "jobs.sqlite");
export const roomLibraryRoot = path.join(appRoot, "user-data", "room", "library");
