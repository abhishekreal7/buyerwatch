import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'
import { resolveReconciliation } from './actions'

export const dynamic = 'force-dynamic'

interface ReconciliationRow {
  id: string
  platform: string
  trigger_type: string
  permalink: string | null
  error_message: string | null
  created_at: string
  monitored_threads: {
    id: string
    external_id: string
    url: string | null
    text_content: string | null
  } | null
  profiles: {
    business_name: string | null
  } | null
}

export default async function ReconciliationPage() {
  const { admin } = await requireAdmin()
  const { data, error } = await admin
    .from('send_audit_log')
    .select(`
      id,
      platform,
      trigger_type,
      permalink,
      error_message,
      created_at,
      monitored_threads (id, external_id, url, text_content),
      profiles (business_name)
    `)
    .eq('status', 'reconciliation_required')
    .order('created_at', { ascending: true })

  if (error) throw new Error('Unable to load reconciliation queue')
  const rows = (data ?? []) as unknown as ReconciliationRow[]

  return (
    <main className="min-h-screen bg-background p-6 text-text-primary md:p-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-500">
              Operator-only safety queue
            </p>
            <h1 className="mt-2 text-3xl font-bold">Send reconciliation</h1>
            <p className="mt-2 max-w-3xl text-text-secondary">
              These providers may have accepted a reply before local persistence failed.
              Verify the public platform before choosing an outcome.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/usage" className="btn-secondary">Usage</Link>
            <Link href="/dashboard" className="btn-secondary">Dashboard</Link>
          </div>
        </header>

        {rows.length === 0 ? (
          <section className="glass rounded-2xl border border-border p-10 text-center">
            <h2 className="text-xl font-semibold">Queue clear</h2>
            <p className="mt-2 text-text-secondary">No replies currently need reconciliation.</p>
          </section>
        ) : (
          <div className="space-y-5">
            {rows.map((row) => (
              <article key={row.id} className="glass rounded-2xl border border-amber-500/30 p-6">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      {row.profiles?.business_name ?? 'Unknown account'} · {row.platform}
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      {row.trigger_type} send · {new Date(row.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-4 text-sm">
                    {row.monitored_threads?.url && (
                      <a href={row.monitored_threads.url} target="_blank" rel="noreferrer" className="text-[#0A84FF] hover:underline">
                        Original thread
                      </a>
                    )}
                    {row.permalink && (
                      <a href={row.permalink} target="_blank" rel="noreferrer" className="text-[#0A84FF] hover:underline">
                        Provider result
                      </a>
                    )}
                  </div>
                </div>

                <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <dt className="font-medium text-text-secondary">External ID</dt>
                    <dd className="mt-1 break-all font-mono">{row.monitored_threads?.external_id}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-text-secondary">Persistence error</dt>
                    <dd className="mt-1">{row.error_message ?? 'No error detail recorded'}</dd>
                  </div>
                </dl>

                <form action={resolveReconciliation} className="mt-6 grid gap-4 rounded-xl border border-border p-4">
                  <input type="hidden" name="auditId" value={row.id} />
                  <label className="grid gap-2 text-sm font-medium">
                    Verification evidence
                    <textarea
                      name="note"
                      required
                      minLength={10}
                      maxLength={1000}
                      rows={3}
                      placeholder="What you checked, where, and the observed result"
                      className="rounded-lg border border-border bg-transparent p-3 font-normal"
                    />
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      type="submit"
                      name="outcome"
                      value="posted"
                      className="rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-500"
                    >
                      Confirm reply was posted
                    </button>
                    <div className="grid gap-2 rounded-lg border border-red-500/30 p-3">
                      <label className="text-sm">
                        Type <strong>NOT POSTED</strong> only after checking the provider:
                        <input
                          name="confirmation"
                          autoComplete="off"
                          className="mt-2 w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono"
                        />
                      </label>
                      <button
                        type="submit"
                        name="outcome"
                        value="not_posted"
                        className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-600"
                      >
                        Return to draft
                      </button>
                    </div>
                  </div>
                </form>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
