// Mirrors the role logic in ../../../backend/accounts/permissions.py exactly.
// If the backend matrix changes, update both sides together.

export const ROLES = ['TUTOR', 'ADMIN', 'OWNER', 'SYS_ADMIN']

// Matches the human-readable labels on backend's Role(TextChoices).
const ROLE_LABELS = {
  TUTOR: 'Tutor',
  ADMIN: 'Admin',
  OWNER: 'Owner',
  SYS_ADMIN: 'System Admin',
}

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role
}

const STAFF_ROLES = new Set(['ADMIN', 'OWNER', 'SYS_ADMIN'])

export function isStaffLevel(role) {
  return STAFF_ROLES.has(role)
}

// can_create_role(creator, target_role) — governs POST /users/create/ and
// role changes on PATCH /users/{id}/.
const CREATABLE_ROLES = {
  SYS_ADMIN: ['TUTOR', 'ADMIN', 'OWNER', 'SYS_ADMIN'],
  OWNER: ['TUTOR', 'ADMIN'],
  ADMIN: ['TUTOR'],
  TUTOR: [],
}

export function canCreateRole(creatorRole, targetRole) {
  return (CREATABLE_ROLES[creatorRole] ?? []).includes(targetRole)
}

export function assignableRoles(creatorRole) {
  return CREATABLE_ROLES[creatorRole] ?? []
}

// Role options for an edit form: always includes the target's current role
// (so the form never breaks on an already-assigned role the actor couldn't
// newly assign, e.g. an Owner editing a SYS_ADMIN's other fields) plus
// whatever the actor could newly assign.
export function roleOptionsForEdit(actorRole, currentTargetRole) {
  const options = new Set([currentTargetRole, ...assignableRoles(actorRole)])
  return ROLES.filter((role) => options.has(role))
}

// has_staff_scope_over(actor, target) — OWNER/SYS_ADMIN over anyone,
// ADMIN over TUTOR only.
export function hasStaffScopeOver(actorRole, targetRole) {
  if (actorRole === 'OWNER' || actorRole === 'SYS_ADMIN') return true
  return actorRole === 'ADMIN' && targetRole === 'TUTOR'
}

export function canView(actor, targetId) {
  if (isStaffLevel(actor.role)) return true
  return actor.id === targetId
}

const STAFF_EDIT_FIELDS = [
  'full_name',
  'phone',
  'employee_id',
  'employment_type',
  'address',
  'start_date',
  'role',
  'is_active',
  'tutor_profile',
]

const SELF_EDIT_FIELDS = ['full_name', 'phone', 'address']

// Fields the actor may PATCH on target, for building the edit form.
//
// The backend's has_staff_scope_over(actor, target) is role-only and
// technically returns true even when actor === target for an OWNER or
// SYS_ADMIN (their role always has staff scope "over anyone", self
// included) — which would let them PATCH their own role/is_active. The
// brief explicitly overrides this for the UI: "role and is_active are
// never self-editable, for anyone" / "never on a 'my profile' self-edit
// form". So self always gets the narrow field set here, regardless of
// staff scope — a deliberate product restriction, not a backend mirror.
export function editableFields(actor, target) {
  const isSelf = actor.id === target.id
  if (isSelf) return SELF_EDIT_FIELDS
  if (hasStaffScopeOver(actor.role, target.role)) return STAFF_EDIT_FIELDS
  return []
}

export function canEdit(actor, target) {
  return editableFields(actor, target).length > 0
}
