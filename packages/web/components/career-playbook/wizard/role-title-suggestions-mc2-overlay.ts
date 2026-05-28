import type { RoleTitleSuggestion } from './role-title-suggestions.types'
import { mc2ProductRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay.product'
import { mc2EngineeringRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay.engineering'
import { mc2DataRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay.data'
import { mc2DesignRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay.design'
import { mc2SalesRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay.sales'
import { mc2MarketingRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay.marketing'
import { mc2SupportRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay.support'
import { mc2OperationsRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay.operations'
import { mc2HrRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay.hr'
import { mc2FinanceRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay.finance'
import { mc2LegalRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay.legal'

export const mc2OverlayRoleTitleSuggestions: RoleTitleSuggestion[] = [
  ...mc2ProductRoleTitleSuggestions,
  ...mc2EngineeringRoleTitleSuggestions,
  ...mc2DataRoleTitleSuggestions,
  ...mc2DesignRoleTitleSuggestions,
  ...mc2SalesRoleTitleSuggestions,
  ...mc2MarketingRoleTitleSuggestions,
  ...mc2SupportRoleTitleSuggestions,
  ...mc2OperationsRoleTitleSuggestions,
  ...mc2HrRoleTitleSuggestions,
  ...mc2FinanceRoleTitleSuggestions,
  ...mc2LegalRoleTitleSuggestions,
]
