/**
 * ESI (EVE Swagger Interface) OAuth scopes used by FirstMate.
 *
 * These are requested during SSO login. The set is intentionally read-only —
 * FirstMate never issues write operations against a character. Trim this list
 * (in Settings, or here) if you want to grant fewer permissions.
 */

export interface ScopeGroup {
  label: string
  description: string
  scopes: string[]
}

export const SCOPE_GROUPS: ScopeGroup[] = [
  {
    label: 'Identity & Location',
    description: 'Who you are, where you are, and what you are flying.',
    scopes: [
      'esi-location.read_location.v1',
      'esi-location.read_ship_type.v1',
      'esi-location.read_online.v1',
      'esi-clones.read_clones.v1',
      'esi-clones.read_implants.v1'
    ]
  },
  {
    label: 'Skills',
    description: 'Trained skills, skill queue, and attributes.',
    scopes: [
      'esi-skills.read_skills.v1',
      'esi-skills.read_skillqueue.v1'
    ]
  },
  {
    label: 'Wallet & Economy',
    description: 'Wallet balance, transactions, journal, and market orders.',
    scopes: [
      'esi-wallet.read_character_wallet.v1',
      'esi-markets.read_character_orders.v1',
      'esi-markets.structure_markets.v1'
    ]
  },
  {
    label: 'Industry & Mining',
    description: 'Mining ledger and industry jobs.',
    scopes: [
      'esi-industry.read_character_mining.v1',
      'esi-industry.read_character_jobs.v1'
    ]
  },
  {
    label: 'Assets',
    description: 'Assets across stations and structures.',
    scopes: [
      'esi-assets.read_assets.v1'
    ]
  }
]

export const ALL_SCOPES: string[] = SCOPE_GROUPS.flatMap((g) => g.scopes)
