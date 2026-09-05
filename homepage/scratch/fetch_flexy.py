import urllib.request, re, os

url = 'https://icons8.com/illustrations/style--flexy/animated--y'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
html = urllib.request.urlopen(req).read().decode('utf-8')

print("Flexy Animated Page Fetched. Length:", len(html))
thumbs = re.findall(r'https://ouch-prod-var-cdn\.icons8\.com/[a-zA-Z0-9_\-/]+\.webp', html)
print(f"Total Flexy Animated thumbs found: {len(thumbs)}")

os.makedirs('homepage/scratch/flexy', exist_ok=True)
headers = {'User-Agent': 'Mozilla/5.0'}

unique_thumbs = list(set(thumbs))
for i, t_url in enumerate(unique_thumbs[:30]):
    try:
        req = urllib.request.Request(t_url, headers=headers)
        data = urllib.request.urlopen(req).read()
        fname = f"flexy_{i+1:02d}.webp"
        with open(os.path.join('homepage/scratch/flexy', fname), 'wb') as f:
            f.write(data)
        print(f"Saved {fname} ({len(data)} bytes) from {t_url}")
    except Exception as e:
        print(f"Error {i}: {e}")
