export const TREE_KINDS = [
  'facet',
  'paper',
  'pine',
  'spruce',
  'origami',
  'spiral',
  'woodCone',
  'woodPawn',
  'woodStack',
  'woodEgg',
  'bare',
  'gold',
  'mist',
  'willow',
  'sapling',
  'bush',
  'rock',
] as const

export type TreeKind = (typeof TREE_KINDS)[number]

export type TreeCatalogItem = {
  id: TreeKind
  label: string
  swatch: string
  shape: 'fan' | 'cone' | 'round' | 'stick' | 'lump'
}

export const TREE_CATALOG: TreeCatalogItem[] = [
  { id: 'facet', label: 'Facet', swatch: '#b7c46a', shape: 'fan' },
  { id: 'paper', label: 'Paper', swatch: '#2f6b3a', shape: 'fan' },
  { id: 'pine', label: 'Pine', swatch: '#8fb86a', shape: 'cone' },
  { id: 'spruce', label: 'Spruce', swatch: '#1f5c32', shape: 'cone' },
  { id: 'origami', label: 'Fold', swatch: '#3d8a4a', shape: 'fan' },
  { id: 'spiral', label: 'Spiral', swatch: '#c5d48a', shape: 'round' },
  { id: 'woodCone', label: 'Wood cone', swatch: '#c4a06a', shape: 'cone' },
  { id: 'woodPawn', label: 'Pawn', swatch: '#b8894a', shape: 'round' },
  { id: 'woodStack', label: 'Stack', swatch: '#d2b48c', shape: 'round' },
  { id: 'woodEgg', label: 'Egg', swatch: '#e0c9a0', shape: 'round' },
  { id: 'bare', label: 'Bare', swatch: '#9a9a9a', shape: 'stick' },
  { id: 'gold', label: 'Gold', swatch: '#e2c35a', shape: 'stick' },
  { id: 'mist', label: 'Mist', swatch: '#c5d6b0', shape: 'stick' },
  { id: 'willow', label: 'Willow', swatch: '#d4b43a', shape: 'stick' },
  { id: 'sapling', label: 'Sapling', swatch: '#7aa35a', shape: 'stick' },
  { id: 'bush', label: 'Bush', swatch: '#c8b86a', shape: 'round' },
  { id: 'rock', label: 'Rock', swatch: '#8a8680', shape: 'lump' },
]

export const DEFAULT_TREE_KIND: TreeKind = 'facet'

export function isTreeKind(value: string): value is TreeKind {
  return (TREE_KINDS as readonly string[]).includes(value)
}

export function treeCanopy(kind: TreeKind) {
  switch (kind) {
    case 'facet':
      return { h: 0.78, r: 0.26 }
    case 'paper':
      return { h: 0.55, r: 0.18 }
    case 'pine':
      return { h: 0.58, r: 0.2 }
    case 'spruce':
      return { h: 0.76, r: 0.22 }
    case 'origami':
      return { h: 0.62, r: 0.2 }
    case 'spiral':
      return { h: 0.72, r: 0.14 }
    case 'woodCone':
      return { h: 0.6, r: 0.18 }
    case 'woodPawn':
      return { h: 0.42, r: 0.12 }
    case 'woodStack':
      return { h: 0.4, r: 0.14 }
    case 'woodEgg':
      return { h: 0.42, r: 0.14 }
    case 'bare':
      return { h: 0.74, r: 0.28 }
    case 'gold':
      return { h: 0.7, r: 0.28 }
    case 'mist':
      return { h: 0.72, r: 0.3 }
    case 'willow':
      return { h: 0.55, r: 0.32 }
    case 'sapling':
      return { h: 0.6, r: 0.18 }
    case 'bush':
      return { h: 0.32, r: 0.22 }
    case 'rock':
      return { h: 0.18, r: 0.16 }
  }
}
