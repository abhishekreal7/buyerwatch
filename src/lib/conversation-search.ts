import { createContext, createElement, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

type ConversationSearchContextValue = {
  conversationSearch: string
  setConversationSearch: Dispatch<SetStateAction<string>>
}

const ConversationSearchContext = createContext<ConversationSearchContextValue | null>(null)

export function ConversationSearchProvider({ children }: { children: ReactNode }) {
  const [conversationSearch, setConversationSearch] = useState('')

  return createElement(
    ConversationSearchContext.Provider,
    { value: { conversationSearch, setConversationSearch } },
    children,
  )
}

export function useConversationSearch() {
  const search = useContext(ConversationSearchContext)

  if (!search) {
    throw new Error('useConversationSearch must be used within ConversationSearchProvider')
  }

  return search
}
