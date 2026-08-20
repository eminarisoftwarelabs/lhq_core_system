import { describe, expect, it } from 'vitest'
import {
  assignableRoles,
  canCreateRole,
  canEdit,
  canView,
  editableFields,
  hasStaffScopeOver,
  isStaffLevel,
  roleOptionsForEdit,
} from './permissions'

describe('isStaffLevel', () => {
  it('is true for ADMIN, OWNER, SYS_ADMIN', () => {
    expect(isStaffLevel('ADMIN')).toBe(true)
    expect(isStaffLevel('OWNER')).toBe(true)
    expect(isStaffLevel('SYS_ADMIN')).toBe(true)
  })

  it('is false for TUTOR', () => {
    expect(isStaffLevel('TUTOR')).toBe(false)
  })
})

describe('canCreateRole — matches backend can_create_role', () => {
  it('SYS_ADMIN can create any role, including OWNER and another SYS_ADMIN', () => {
    for (const role of ['TUTOR', 'ADMIN', 'OWNER', 'SYS_ADMIN']) {
      expect(canCreateRole('SYS_ADMIN', role)).toBe(true)
    }
  })

  it('OWNER can create ADMIN and TUTOR, not OWNER or SYS_ADMIN', () => {
    expect(canCreateRole('OWNER', 'ADMIN')).toBe(true)
    expect(canCreateRole('OWNER', 'TUTOR')).toBe(true)
    expect(canCreateRole('OWNER', 'OWNER')).toBe(false)
    expect(canCreateRole('OWNER', 'SYS_ADMIN')).toBe(false)
  })

  it('ADMIN can only create TUTOR', () => {
    expect(canCreateRole('ADMIN', 'TUTOR')).toBe(true)
    expect(canCreateRole('ADMIN', 'ADMIN')).toBe(false)
    expect(canCreateRole('ADMIN', 'OWNER')).toBe(false)
    expect(canCreateRole('ADMIN', 'SYS_ADMIN')).toBe(false)
  })

  it('TUTOR can create nobody', () => {
    for (const role of ['TUTOR', 'ADMIN', 'OWNER', 'SYS_ADMIN']) {
      expect(canCreateRole('TUTOR', role)).toBe(false)
    }
  })

  it('treats a missing/invalid creator role as unable to create anything', () => {
    expect(canCreateRole(undefined, 'TUTOR')).toBe(false)
    expect(canCreateRole('BOGUS', 'TUTOR')).toBe(false)
  })
})

describe('assignableRoles', () => {
  it('mirrors canCreateRole for each creator role', () => {
    expect(assignableRoles('SYS_ADMIN')).toEqual(['TUTOR', 'ADMIN', 'OWNER', 'SYS_ADMIN'])
    expect(assignableRoles('OWNER')).toEqual(['TUTOR', 'ADMIN'])
    expect(assignableRoles('ADMIN')).toEqual(['TUTOR'])
    expect(assignableRoles('TUTOR')).toEqual([])
  })
})

describe('roleOptionsForEdit', () => {
  it('includes the target current role plus what the actor can newly assign', () => {
    // Owner editing an Admin: assignable = [ADMIN, TUTOR]; current role ADMIN
    // is already in that set.
    expect(roleOptionsForEdit('OWNER', 'ADMIN')).toEqual(['TUTOR', 'ADMIN'])
  })

  it('keeps the current role selectable even when the actor could not newly assign it', () => {
    // Owner "editing" a SYS_ADMIN's other fields (has_staff_scope_over
    // allows this) shouldn't drop SYS_ADMIN off the role select, even
    // though Owner could never promote someone new to SYS_ADMIN.
    expect(roleOptionsForEdit('OWNER', 'SYS_ADMIN')).toEqual(['TUTOR', 'ADMIN', 'SYS_ADMIN'])
  })

  it('Admin editing a Tutor only ever offers TUTOR', () => {
    expect(roleOptionsForEdit('ADMIN', 'TUTOR')).toEqual(['TUTOR'])
  })
})

describe('hasStaffScopeOver — matches backend has_staff_scope_over', () => {
  it('OWNER has scope over anyone', () => {
    for (const target of ['TUTOR', 'ADMIN', 'OWNER', 'SYS_ADMIN']) {
      expect(hasStaffScopeOver('OWNER', target)).toBe(true)
    }
  })

  it('SYS_ADMIN has scope over anyone', () => {
    for (const target of ['TUTOR', 'ADMIN', 'OWNER', 'SYS_ADMIN']) {
      expect(hasStaffScopeOver('SYS_ADMIN', target)).toBe(true)
    }
  })

  it('ADMIN has scope only over TUTOR', () => {
    expect(hasStaffScopeOver('ADMIN', 'TUTOR')).toBe(true)
    expect(hasStaffScopeOver('ADMIN', 'ADMIN')).toBe(false)
    expect(hasStaffScopeOver('ADMIN', 'OWNER')).toBe(false)
    expect(hasStaffScopeOver('ADMIN', 'SYS_ADMIN')).toBe(false)
  })

  it('TUTOR has no staff scope over anyone', () => {
    for (const target of ['TUTOR', 'ADMIN', 'OWNER', 'SYS_ADMIN']) {
      expect(hasStaffScopeOver('TUTOR', target)).toBe(false)
    }
  })
})

describe('canView', () => {
  it('staff-level actors can view anyone', () => {
    expect(canView({ id: 1, role: 'OWNER' }, 999)).toBe(true)
    expect(canView({ id: 1, role: 'ADMIN' }, 999)).toBe(true)
    expect(canView({ id: 1, role: 'SYS_ADMIN' }, 999)).toBe(true)
  })

  it('a TUTOR can only view their own id', () => {
    const tutor = { id: 5, role: 'TUTOR' }
    expect(canView(tutor, 5)).toBe(true)
    expect(canView(tutor, 6)).toBe(false)
  })
})

describe('editableFields', () => {
  it('self-edit is always the narrow field set, even for OWNER/SYS_ADMIN editing themselves', () => {
    // The backend's has_staff_scope_over is role-only and would technically
    // return true for an OWNER/SYS_ADMIN acting on their own record, which
    // would open role/is_active. The brief explicitly forbids surfacing
    // that in the UI ("role and is_active are never self-editable, for
    // anyone" / never on a "my profile" form) — this is the deliberate
    // override under test.
    for (const role of ['TUTOR', 'ADMIN', 'OWNER', 'SYS_ADMIN']) {
      const self = { id: 1, role }
      expect(editableFields(self, self)).toEqual(['full_name', 'phone', 'address'])
    }
  })

  it('OWNER editing someone else gets the full staff field set, including role/is_active', () => {
    const owner = { id: 1, role: 'OWNER' }
    const tutor = { id: 2, role: 'TUTOR' }
    expect(editableFields(owner, tutor)).toEqual([
      'full_name',
      'phone',
      'employee_id',
      'employment_type',
      'address',
      'start_date',
      'role',
      'is_active',
      'tutor_profile',
    ])
  })

  it('ADMIN editing a TUTOR gets the full staff field set', () => {
    const admin = { id: 1, role: 'ADMIN' }
    const tutor = { id: 2, role: 'TUTOR' }
    expect(editableFields(admin, tutor)).toContain('role')
    expect(editableFields(admin, tutor)).toContain('is_active')
  })

  it('ADMIN editing an OWNER (out of scope) gets nothing', () => {
    const admin = { id: 1, role: 'ADMIN' }
    const owner = { id: 2, role: 'OWNER' }
    expect(editableFields(admin, owner)).toEqual([])
  })

  it('TUTOR editing another TUTOR gets nothing', () => {
    const tutorA = { id: 1, role: 'TUTOR' }
    const tutorB = { id: 2, role: 'TUTOR' }
    expect(editableFields(tutorA, tutorB)).toEqual([])
  })
})

describe('canEdit', () => {
  it('is true whenever editableFields is non-empty', () => {
    const owner = { id: 1, role: 'OWNER' }
    const tutor = { id: 2, role: 'TUTOR' }
    expect(canEdit(owner, tutor)).toBe(true)
    expect(canEdit(tutor, tutor)).toBe(true)
  })

  it('is false when the actor has no scope and it is not their own record', () => {
    const admin = { id: 1, role: 'ADMIN' }
    const owner = { id: 2, role: 'OWNER' }
    expect(canEdit(admin, owner)).toBe(false)
  })
})
