export const MANUFACTURING_METHODS: { value: string; label: string; roboformed: boolean }[] = [
  { value: 'roboformed', label: 'Roboformed',  roboformed: true  },
  { value: 'cnc',        label: 'CNC',          roboformed: false },
  { value: 'hydroform',  label: 'Hydroform',    roboformed: false },
  { value: 'waterjet',   label: 'Water Jet',    roboformed: false },
  { value: '3dprint',    label: '3D Print',     roboformed: false },
  { value: 'cast',       label: 'Cast',         roboformed: false },
  { value: 'stamped',    label: 'Stamped',      roboformed: false },
  { value: 'purchased',  label: 'Purchased',    roboformed: false },
  { value: 'other',      label: 'Other',        roboformed: false },
]

export function mfgLabel(method: string): string {
  return MANUFACTURING_METHODS.find(m => m.value === method)?.label ?? method
}

export function partDisplayName(name: string, method: string): string {
  if (!method || method === 'roboformed') return name
  return `${name} - ${mfgLabel(method)}`
}
