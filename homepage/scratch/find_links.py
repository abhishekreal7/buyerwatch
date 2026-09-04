import urllib.request, re

url = 'https://icons8.com/illustrations/styles/animated-1'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
html = urllib.request.urlopen(req).read().decode('utf-8')

links = re.findall(r'href="(/illustrations/[^"]+)"', html)
print("Found /illustrations/ links:", len(links))
for l in list(set(links))[:30]:
    print(l)
