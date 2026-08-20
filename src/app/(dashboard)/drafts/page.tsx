import { permanentRedirect } from 'next/navigation'

export default function DraftsRedirectPage() {
  permanentRedirect('/opportunities/replies')
}
