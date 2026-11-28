if (!process.connected) throw Error("Start the desktop backend through Kiteva.");

process.env.KITEVA_DESKTOP_BACKEND = "1";
await import("../../src/server/index");

export {};
