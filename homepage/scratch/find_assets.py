import re

html = open('homepage/scratch/overtake.html', encoding='utf-8').read()
urls = re.findall(r'https://framerusercontent\.com/[^\s"\'<>]+', html)
print(f"Total Framer URLs: {len(urls)}")
for u in sorted(list(set(urls))):
    print(u)
