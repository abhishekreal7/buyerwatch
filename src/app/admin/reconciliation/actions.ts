'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminForAction } from '@/lib/admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function resolveReconciliation(formData: FormData) {
  const auditId = String(formData.get('auditId') ?? '')
  const outcome = String(formData.get('outcome') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  const confirmation = String(formData.get('confirmation') ?? '')

  if (!UUID_PATTERN.test(auditId)) throw new Error('Invalid reconciliation record')
  if (outcome !== 'posted' && outcome !== 'not_posted') throw new Error('Invalid outcome')
  if (note.length < 10 || note.length > 1_000) {
    throw new Error('Resolution evidence must be between 10 and 1,000 characters')
  }
  if (outcome === 'not_posted' && confirmation !== 'NOT POSTED') {
    throw new Error('Type NOT POSTED before making the draft sendable again')
  }

  const { user, admin } = await requireAdminForAction()
  const { data, error } = await admin.rpc('resolve_send_reconciliation', {
    p_audit_id: auditId,
    p_outcome: outcome,
    p_resolution_note: note,
    p_resolved_by: user.id,
  })
  if (error) throw new Error('Unable to resolve reconciliation record')
  if (data !== 'resolved') throw new Error('Reconciliation record is no longer pending')

  revalidatePath('/admin/reconciliation')
}
