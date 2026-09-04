import urllib.request, re

url = "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/WCuCICUfS.VKjnT8H5.mjs"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
content = urllib.request.urlopen(req).read().decode('utf-8')
imgs = re.findall(r'https://framerusercontent\.com/images/[a-zA-Z0-9_\-\.]+', content)
print("Unique images in WCuCICUfS:", set(imgs))
