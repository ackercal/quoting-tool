// Derive a display name from a Machina email.
//   firstname.lastname@machinalabs.ai -> "Firstname Lastname"
//   firstname@machinalabs.ai           -> "Firstname"   (no period before @)
// Handles extra dots (e.g. first.m.last) by capitalizing each segment.
export function nameFromEmail(email: string): string {
  const local = (email || '').split('@')[0].trim()
  if (!local) return ''
  return local
    .split('.')
    .filter(Boolean)
    .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(' ')
}
