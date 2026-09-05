import urllib.request, re, json

url = 'https://icons8.com/illustrations/styles/animated-1'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
html = urllib.request.urlopen(req).read().decode('utf-8')

next_data = re.findall(r'<script id="__NEXT_DATA__" type="application/json">({.*?})</script>', html)
if next_data:
    data = json.loads(next_data[0])
    page_props = data.get('props', {}).get('pageProps', {})
    
    # Check if there is an illustrations list
    print("pageProps keys:", list(page_props.keys()))
    
    def find_items(obj, path=""):
        if isinstance(obj, dict):
            if 'name' in obj and ('thumb' in obj or 'id' in obj or 'styles' in obj or 'elements' in obj or 'url' in obj):
                print(f"Item: {obj.get('name')} | ID: {obj.get('id')} | JSON/Thumb: {obj.get('thumb') or obj.get('url') or obj.get('preview')}")
            for k, v in obj.items():
                find_items(v, f"{path}.{k}")
        elif isinstance(obj, list):
            for item in obj:
                find_items(item, path)

    find_items(page_props)
