/** Uploaded brand artwork. Both themes keep the original gold mark. */
export function GoldUchetLogo({ className }: { className?: string }) {
  return (
    <span className={className}>
      <img src="/golduchet-logo.svg" alt="GOLDUCHET.com" width={278} height={76} className="h-auto w-full dark:hidden" />
      <img src="/golduchet-logo-dark.svg" alt="GOLDUCHET.com" width={278} height={76} className="hidden h-auto w-full dark:block" />
    </span>
  )
}
