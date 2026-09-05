"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationSearchProvider = ConversationSearchProvider;
exports.useConversationSearch = useConversationSearch;
const react_1 = require("react");
const ConversationSearchContext = (0, react_1.createContext)(null);
function ConversationSearchProvider({ children }) {
    const [conversationSearch, setConversationSearch] = (0, react_1.useState)('');
    return (0, react_1.createElement)(ConversationSearchContext.Provider, { value: { conversationSearch, setConversationSearch } }, children);
}
function useConversationSearch() {
    const search = (0, react_1.useContext)(ConversationSearchContext);
    if (!search) {
        throw new Error('useConversationSearch must be used within ConversationSearchProvider');
    }
    return search;
}
