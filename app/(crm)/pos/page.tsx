import { CrmScreen } from "@/app/crm/crm-screen"

export const dynamic = "force-dynamic"

export const metadata = { title: "Касса — GOLDUCHET" }

export default function Page() {
  return <CrmScreen screen="kassa" />
}
