import urllib.request, json

# Query Icons8 public illustration API
api_url = "https://api-icons.icons8.com/public/illustrations/style/animated-1?amount=50"
req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    data = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
    print("API Success! Keys:", list(data.keys()))
    if 'illustrations' in data:
        for it in data['illustrations']:
            print(f"Title: {it.get('name')} | JSON: {it.get('json')} | GIF: {it.get('gif')} | MP4: {it.get('mp4')} | Preview: {it.get('preview')}")
except Exception as e:
    print("API Error:", e)
    # try search API
    try:
        search_url = "https://api-icons.icons8.com/public/illustrations/search?style=animated-1&amount=50"
        req = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0'})
        data = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
        print("Search API Success! Keys:", list(data.keys()))
        for it in data.get('illustrations', []):
            print(f"Title: {it.get('name')} | Thumb: {it.get('thumb') or it.get('url')}")
    except Exception as e2:
        print("Search API Error:", e2)
