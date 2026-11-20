type TourSectionStep = { screen?: string }

/** Start a card-selected tour at that section's explanation, without navigation. */
export function getTourStartIndex(steps: readonly TourSectionStep[], sectionId?: string): number {
  if (!sectionId) return 0
  const index = steps.findIndex((step) => step.screen === sectionId)
  return index < 0 ? 0 : index
}
