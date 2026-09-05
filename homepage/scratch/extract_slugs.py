import urllib.request, re, json

url = 'https://icons8.com/illustrations/styles/animated-1'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
html = urllib.request.urlopen(req).read().decode('utf-8')

# Search for any JSON state or data-testid or names
items = re.findall(r'href="/illustrations/illustration/([^"]+)"', html)
print("Found illustration slugs:", len(items))
for slug in list(set(items)):
    print(slug)
