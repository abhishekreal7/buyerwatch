import urllib.request, re

url = 'https://icons8.com/illustrations/styles/animated-1'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
html = urllib.request.urlopen(req).read().decode('utf-8')

# Search for any JSON data inside html
for script in re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL):
    if "ouch-prod" in script or "illustrations" in script:
        print("Found script snippet:", script[:500])
        print("Total links in script:", len(re.findall(r'https://[^\s"\'<>]+\.webp', script)))
        for u in set(re.findall(r'https://[^\s"\'<>]+\.webp', script))[:30]:
            print(u)
