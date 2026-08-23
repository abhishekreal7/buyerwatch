export type DeliveryActivityState = 'sent' | 'failed' | 'uncertain' | 'cancelled'

export type DeliveryActivityPresentation = {
  title: string
  message: string
  actionLabel: string
  actionHref: string
}

/**
 * Converts delivery internals into the only details a customer needs: what
 * happened, whether anything was posted, and the next useful action. Provider
 * error codes deliberately never leave this boundary.
 */
export function deliveryActivityPresentation(input: {
  state: DeliveryActivityState
  threadId: string
  threadUrl: string | null
  replyUrl: string | null
  cancellationReason?: string | null
}): DeliveryActivityPresentation {
  const reviewHref = `/dashboard?thread=${encodeURIComponent(input.threadId)}`
  if (input.state === 'sent') {
    return {
      title: 'Reply sent',
      message: 'We confirmed your reply was published.',
      actionLabel: input.replyUrl ? 'Open reply' : 'View history',
      actionHref: input.replyUrl || '/posted',
    }
  }
  if (input.state === 'uncertain') {
    return {
      title: 'Reply needs verification',
      message: 'We could not confirm whether Reddit accepted it. Check the original post before retrying so you do not duplicate it.',
      actionLabel: input.threadUrl ? 'Open post' : 'Review reply',
      actionHref: input.threadUrl || reviewHref,
    }
  }
  if (input.state === 'failed') {
    return {
      title: 'Reply was not sent',
      message: 'Nothing was posted. Review the draft before trying again.',
      actionLabel: 'Review reply',
      actionHref: reviewHref,
    }
  }

  if (input.cancellationReason?.includes('platform_connection_removed')) {
    return {
      title: 'Auto-reply was stopped',
      message: 'Nothing was posted because your connected account needs attention.',
      actionLabel: 'Review connection',
      actionHref: '/settings?section=connections',
    }
  }
  if (input.cancellationReason?.includes('near_duplicate_reply_requires_review')) {
    return {
      title: 'Auto-reply was held for review',
      message: 'Nothing was posted because the reply was too similar to a recent one.',
      actionLabel: 'Review reply',
      actionHref: reviewHref,
    }
  }
  return {
    title: 'Auto-reply was stopped safely',
    message: 'Nothing was posted and BuyerWatch will not retry it automatically.',
    actionLabel: 'Review reply',
    actionHref: reviewHref,
  }
}
