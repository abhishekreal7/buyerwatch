import urllib.request, re

url = 'https://icons8.com/illustrations/styles/animated-1'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
html = urllib.request.urlopen(req).read().decode('utf-8')

thumbs = re.findall(r'https://ouch-prod-var-cdn\.icons8\.com/[a-zA-Z0-9_\-/]+\.webp', html)
print(f"Total thumbs: {len(thumbs)}")
for t in sorted(list(set(thumbs))):
    print(t)
