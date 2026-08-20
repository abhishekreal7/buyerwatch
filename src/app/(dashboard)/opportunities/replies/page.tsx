import { ReplyQueueWorkspace } from '@/components/ReplyQueueWorkspace'

type ReplyQueuePageProps = {
  searchParams: Promise<{ thread?: string | string[] }>
}

export default async function ReplyQueuePage({ searchParams }: ReplyQueuePageProps) {
  const params = await searchParams
  const initialThreadId = typeof params.thread === 'string' ? params.thread : undefined

  return <ReplyQueueWorkspace initialThreadId={initialThreadId} />
}
