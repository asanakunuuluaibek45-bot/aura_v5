export type CameraPermissionState = "granted" | "denied" | "prompt" | "unknown"

export async function readCameraPermissionState(
  permissions: Pick<Permissions, "query"> | undefined,
): Promise<CameraPermissionState> {
  if (!permissions?.query) return "unknown"
  try {
    const result = await permissions.query({ name: "camera" as PermissionName })
    return result.state
  } catch {
    // Safari and some WebViews do not expose camera through Permissions API.
    return "unknown"
  }
}

export function getCameraPermissionError(
  permissionState: CameraPermissionState,
): string {
  if (permissionState === "denied") {
    return "Камера запрещена в разрешениях сайта. В Chrome откройте управление сайтом слева от адреса → Разрешения → Камера → Разрешить, вернитесь сюда и нажмите «Повторить запрос»."
  }
  return "Браузер не показал запрос камеры. Закройте другие окна и всплывающие диалоги, затем нажмите «Повторить запрос» и выберите «Разрешить»."
}
