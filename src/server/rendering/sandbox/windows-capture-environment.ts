/** Forward only supported software capture settings through the Windows launcher. */
export function windowsCaptureEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return {
    ...(env.PRODUCER_DISABLE_GPU === "true" ? { PRODUCER_DISABLE_GPU: "true" } : {}),
    ...(env.PRODUCER_BROWSER_GPU_MODE === "software"
      ? { PRODUCER_BROWSER_GPU_MODE: "software" }
      : {}),
    ...(env.PRODUCER_FORCE_SCREENSHOT === "true" ? { PRODUCER_FORCE_SCREENSHOT: "true" } : {}),
  };
}
