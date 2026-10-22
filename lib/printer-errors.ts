/** Keep chooser cancellation distinct from missing GATT services/characteristics. */
export function getPrintErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message
    : typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error ?? "")
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : ""

  if (name === "DejenPrintError" || name === "DejenConnectionError" || name === "PrinterChooserCancelled") {
    return message
  }
  if (/user cancelled the requestdevice(?:\(\))? chooser|no device selected|device selection.*cancel/i.test(message)) {
    return "Принтер не выбран. Включите Bluetooth, выберите принтер в окне браузера и повторите печать."
  }
  if (name === "NotFoundError") {
    return `Не найден Bluetooth-ресурс принтера. Это не обязательно отмена выбора устройства. ${message}`.trim()
  }
  if (name === "NotAllowedError") {
    return "Браузеру не разрешён доступ к Bluetooth. Разрешите подключение и выберите принтер."
  }
  if (name === "NetworkError" || /\bGATT\b|disconnected|not connected/i.test(message)) {
    return "Не удалось подключиться к принтеру. Проверьте, что он включён и находится рядом, затем повторите печать."
  }
  return message || "Ошибка при печати"
}
