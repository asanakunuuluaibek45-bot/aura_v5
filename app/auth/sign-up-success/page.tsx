import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth/auth-shell"
import { MailCheck } from "lucide-react"

export default function SignUpSuccessPage() {
  return (
    <AuthShell title="ÐÐ¾ÑÑÐ¸ Ð³Ð¾ÑÐ¾Ð²Ð¾" subtitle="ÐÑÑÐ°Ð»Ð¾ÑÑ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ´Ð¸ÑÑ email Ð¸ Ð´Ð¾Ð¶Ð´Ð°ÑÑÑÑ Ð¾Ð´Ð¾Ð±ÑÐµÐ½Ð¸Ñ.">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <MailCheck className="h-7 w-7" />
        </div>
        <p className="text-sm text-muted-foreground text-pretty">
          ÐÑ Ð¾ÑÐ¿ÑÐ°Ð²Ð¸Ð»Ð¸ Ð¿Ð¸ÑÑÐ¼Ð¾ Ð´Ð»Ñ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ¶Ð´ÐµÐ½Ð¸Ñ. ÐÐ¾ÑÐ»Ðµ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ¶Ð´ÐµÐ½Ð¸Ñ Ð°Ð´Ð¼Ð¸Ð½Ð¸ÑÑÑÐ°ÑÐ¾Ñ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð° Ð°ÐºÑÐ¸Ð²Ð¸ÑÑÐµÑ Ð²Ð°Ñ Ð´Ð¾ÑÑÑÐ¿, Ð¸ Ð²Ñ
          ÑÐ¼Ð¾Ð¶ÐµÑÐµ Ð²Ð¾Ð¹ÑÐ¸ Ð² ÑÐ¸ÑÑÐµÐ¼Ñ.
        </p>
        
        <Button asChild className="w-full">
          <Link href="/auth/login">ÐÐµÑÐµÐ¹ÑÐ¸ ÐºÐ¾ Ð²ÑÐ¾Ð´Ñ</Link>
        </Button>
      </div>
    </AuthShell>
  )
}