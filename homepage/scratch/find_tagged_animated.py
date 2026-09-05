import urllib.request, re, json

# Search for the animated illustration pages or links
search_terms = ['social', 'target', 'message', 'send', 'paper-plane', 'chat', 'search', 'email', 'check']
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for term in search_terms:
    try:
        url = f"https://icons8.com/illustrations/style--animated-1/tag--{term}"
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req).read().decode('utf-8')
        thumbs = re.findall(r'https://ouch-prod-var-cdn\.icons8\.com/[a-zA-Z0-9_\-/]+\.webp', html)
        print(f"Term '{term}': found {len(thumbs)} items")
        for t in list(set(thumbs))[:5]:
            print(f"  {t}")
    except Exception as e:
        print(f"Term '{term}' error: {e}")
