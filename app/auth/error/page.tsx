import Link from "next/link"
import { Button } from "@/components/shared/ui/button"
import { AuthShell } from "@/components/shared/auth/auth-shell"

export default function AuthErrorPage() {
  return (
    <AuthShell title="Ошибка авторизации" subtitle="Не удалось подтвердить ссылку. Попробуйте войти снова.">
      <Button asChild className="w-full">
        <Link href="/auth/login">Вернуться ко входу</Link>
      </Button>
    </AuthShell>
  )
}
