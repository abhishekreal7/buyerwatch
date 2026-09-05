import urllib.request, re, json

url = 'https://icons8.com/illustrations/styles/animated-1'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
html = urllib.request.urlopen(req).read().decode('utf-8')

next_data = re.findall(r'<script id="__NEXT_DATA__" type="application/json">({.*?})</script>', html)
if next_data:
    data = json.loads(next_data[0])
    print(json.dumps(data['props'], indent=2)[:3000])
