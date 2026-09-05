import urllib.request, re

url = 'https://icons8.com/illustrations/styles/animated-1'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
html = urllib.request.urlopen(req).read().decode('utf-8')

# Find all ouch cdn links and their alt text / context
matches = re.findall(r'<img[^>]*src=[\'"]([^\'"]*ouch-prod-var-cdn[^\'"]*)[\'"][^>]*alt=[\'"]([^\'"]*)[\'"]', html)
print("Found img matches with alt:", len(matches))
for src, alt in matches:
    print(f"Alt: {alt} -> {src}")
