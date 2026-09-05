import urllib.request, re, json

url = 'https://icons8.com/illustrations/styles/animated-1'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    print("Page fetched successfully. Length:", len(html))
    
    # search for image/video assets
    assets = re.findall(r'https://[^\s"\'<>]+\.(?:gif|webp|svg|png|mp4|json)', html)
    print(f"Total asset URLs found: {len(assets)}")
    for a in sorted(list(set(assets)))[:40]:
        print(a)
        
    # search for Ouch JSON / Nuxt state / Next data
    next_data = re.findall(r'<script id="__NEXT_DATA__" type="application/json">({.*?})</script>', html)
    if next_data:
        data = json.loads(next_data[0])
        print("Found __NEXT_DATA__ keys:", list(data.keys()))
        # search for illustrations in props
        props = str(data.get('props', {}))
        matches = re.findall(r'https://[^\s"\'<>]+\.(?:gif|webp|svg|png|mp4)', props)
        print("Matches in __NEXT_DATA__:", len(matches))
        for m in list(set(matches))[:20]:
            print(m)
except Exception as e:
    print("Error:", e)
