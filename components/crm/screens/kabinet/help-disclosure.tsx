"use client"

import type { ReactNode } from "react"
import { CircleHelp } from "lucide-react"

export function HelpDisclosure({
  children,
  label = "Показать пояснение",
  preview,
}: {
  children: ReactNode
  label?: string
  preview?: string
}) {
  return (
    <details className="min-w-0 text-xs text-muted-foreground">
      <summary
        aria-label={label}
        title={label}
        className="flex max-w-full cursor-pointer list-none items-start gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {preview
          ? <span className="min-w-0 line-clamp-2">{preview}</span>
          : <span className="sr-only">{label}</span>}
      </summary>
      <div className="mt-2 rounded-lg border border-border/70 bg-muted/30 p-3 leading-relaxed">
        {children}
      </div>
    </details>
  )
}
