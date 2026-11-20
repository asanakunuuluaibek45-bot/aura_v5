import { NativeCrm } from "../../native-crm"

export function generateStaticParams() {
  return [
    "money", "showcase", "inventory", "revisions", "customers",
    "reports", "cabinet", "stores", "notifications", "suppliers",
  ].map((section) => ({ section }))
}

export default function NativeSectionPage() {
  return <NativeCrm />
}
