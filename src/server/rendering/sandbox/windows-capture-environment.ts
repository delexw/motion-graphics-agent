/** Forward only supported capture settings through the Windows launcher. */
export function windowsCaptureEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return {
    ...(env.CI === "true" && env.HYPERFRAMES_CHROME_SANDBOX === "0"
      ? { CI: "true", HYPERFRAMES_CHROME_SANDBOX: "0" }
      : {}),
    ...(env.PRODUCER_DISABLE_GPU === "true" ? { PRODUCER_DISABLE_GPU: "true" } : {}),
    ...(env.PRODUCER_BROWSER_GPU_MODE === "software"
      ? { PRODUCER_BROWSER_GPU_MODE: "software" }
      : {}),
    ...(env.PRODUCER_FORCE_SCREENSHOT === "true" ? { PRODUCER_FORCE_SCREENSHOT: "true" } : {}),
  };
}
