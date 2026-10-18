export function formatSom(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0)) + " Ñ"
}

export function formatWeight(value: number): string {
  return `${(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} Ð³`
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}
export function formatDateTimeTotal(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function roleLabel(role: string | null): string {
  switch (role) {
    case "super_admin":
      return "Ð¡ÑÐ¿ÐµÑ-Ð°Ð´Ð¼Ð¸Ð½"
    case "admin":
      return "ÐÐ´Ð¼Ð¸Ð½Ð¸ÑÑÑÐ°ÑÐ¾Ñ"
    case "seller":
      return "ÐÑÐ¾Ð´Ð°Ð²ÐµÑ"
    default:
      return "â"
  }
}
