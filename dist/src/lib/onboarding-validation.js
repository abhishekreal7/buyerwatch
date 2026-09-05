"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeWebsiteUrl = normalizeWebsiteUrl;
exports.validateProductContext = validateProductContext;
exports.validateWebsiteUrl = validateWebsiteUrl;
exports.validateOnboardingData = validateOnboardingData;
const BUSINESS_TYPES = new Set([
    'saas',
    'ecommerce',
    'agency',
    'freelancer',
    'creator',
    'coach',
    'physical_product',
    'other',
]);
const ALLOWED_PLATFORMS = new Set(['reddit', 'bluesky', 'x']);
const DISCOVERY_SOURCES = new Set([
    'search', 'social', 'recommendation', 'community', 'content', 'other', 'prefer_not_to_say',
]);
function normalizeWebsiteUrl(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
function validateProductContext(input) {
    const businessName = input.businessName.trim();
    const description = input.businessDescription.trim();
    if (!businessName)
        return 'Enter your business name before continuing.';
    if (businessName.length > 120)
        return 'Business name must be 120 characters or fewer.';
    if (description.length < 12)
        return 'Add a short description of the problem your product solves.';
    if (description.length > 5000)
        return 'Product description is too long.';
    return null;
}
function validateWebsiteUrl(value) {
    const websiteValue = normalizeWebsiteUrl(value);
    if (!websiteValue)
        return null;
    if (websiteValue.length > 2048)
        return 'Website URL is too long.';
    try {
        const website = new URL(websiteValue);
        if (!['http:', 'https:'].includes(website.protocol) || website.username || website.password) {
            return 'Enter a valid public website URL.';
        }
    }
    catch {
        return 'Enter a valid public website URL.';
    }
    return null;
}
function validateOnboardingData(data) {
    const productError = validateProductContext({
        businessName: data.business_name,
        businessDescription: data.business_description,
    });
    if (productError)
        return productError;
    const websiteError = validateWebsiteUrl(data.business_url);
    if (websiteError)
        return websiteError;
    if (data.writing_style?.trim().length > 2000)
        return 'Writing style is too long.';
    if (data.reddit_username?.trim().length > 100)
        return 'Reddit username is too long.';
    if (!DISCOVERY_SOURCES.has(data.discovery_source))
        return 'Select how you found BuyerWatch or choose “Prefer not to say.”';
    if (!BUSINESS_TYPES.has(data.business_type))
        return 'Select a valid business category.';
    if (!Array.isArray(data.keywords) || data.keywords.length === 0) {
        return 'Add at least one monitoring rule before launching.';
    }
    if (data.keywords.length > 50)
        return 'Too many monitoring rules were selected.';
    const invalidKeyword = data.keywords.some(keyword => (!keyword
        || typeof keyword.term !== 'string'
        || typeof keyword.target !== 'string'
        || typeof keyword.platform !== 'string'
        || !keyword.term.trim()
        || !keyword.target.trim()
        || keyword.term.trim().length > 200
        || keyword.target.trim().length > 200
        || !ALLOWED_PLATFORMS.has(keyword.platform)));
    return invalidKeyword
        ? 'One or more monitoring rules are invalid. Go back and review your selections.'
        : null;
}
