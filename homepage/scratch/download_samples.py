import urllib.request, os

os.makedirs('homepage/scratch/preview', exist_ok=True)
headers = {'User-Agent': 'Mozilla/5.0'}

# List of thumbs from animated-1 style
urls = [
    ("img_01.webp", "https://ouch-prod-var-cdn.icons8.com/ac/illustrations/thumbs/R8Opq6aclQOTbdRC.webp"),
    ("img_02.webp", "https://ouch-prod-var-cdn.icons8.com/ae/illustrations/thumbs/_wiXrtOPBNz3Ldyd.webp"),
    ("img_03.webp", "https://ouch-prod-var-cdn.icons8.com/aj/illustrations/thumbs/HZnGbECaRQqfMKpo.webp"),
    ("img_04.webp", "https://ouch-prod-var-cdn.icons8.com/au/illustrations/thumbs/0f6QevYskSYgn8NQ.webp"),
    ("img_05.webp", "https://ouch-prod-var-cdn.icons8.com/az/illustrations/thumbs/qwLeU0VyhrYIRZr6.webp"),
    ("img_06.webp", "https://ouch-prod-var-cdn.icons8.com/ba/illustrations/thumbs/KxzjtKHFg3GOzDpq.webp"),
    ("img_07.webp", "https://ouch-prod-var-cdn.icons8.com/bc/illustrations/thumbs/oHPU4mbRbSM_RPtW.webp"),
    ("img_08.webp", "https://ouch-prod-var-cdn.icons8.com/bk/illustrations/thumbs/aL-xiyMFfyILf-nc.webp"),
    ("img_09.webp", "https://ouch-prod-var-cdn.icons8.com/bt/illustrations/thumbs/LCKjTWrvQICzeZnB.webp"),
    ("img_10.webp", "https://ouch-prod-var-cdn.icons8.com/bx/illustrations/thumbs/ebjCzNrV4hGFaMot.webp"),
    ("img_11.webp", "https://ouch-prod-var-cdn.icons8.com/by/illustrations/thumbs/eVbN-rKZSs4mdPG5.webp"),
    ("img_12.webp", "https://ouch-prod-var-cdn.icons8.com/cj/illustrations/thumbs/alfdHZnHUDiGC6JD.webp"),
    ("img_13.webp", "https://ouch-prod-var-cdn.icons8.com/co/illustrations/thumbs/B32h4mNxw3KIouEl.webp"),
    ("img_14.webp", "https://ouch-prod-var-cdn.icons8.com/cr/illustrations/thumbs/EqLNaxW4aq-i890A.webp"),
    ("img_15.webp", "https://ouch-prod-var-cdn.icons8.com/da/illustrations/thumbs/_ExY-qJRFA1NylEd.webp"),
    ("img_16.webp", "https://ouch-prod-var-cdn.icons8.com/di/illustrations/thumbs/hNZ-WkuT0yTVIOfI.webp"),
    ("img_17.webp", "https://ouch-prod-var-cdn.icons8.com/dm/illustrations/thumbs/J3sL9WjIFpW0bnOl.webp"),
    ("img_18.webp", "https://ouch-prod-var-cdn.icons8.com/dt/illustrations/thumbs/6A7h3_dkuaLctPT0.webp"),
    ("img_19.webp", "https://ouch-prod-var-cdn.icons8.com/dz/illustrations/thumbs/wZJiSna5s_0iPb2o.webp"),
    ("img_20.webp", "https://ouch-prod-var-cdn.icons8.com/eh/illustrations/thumbs/WSavM8Rn1IJ1izI8.webp"),
    ("img_21.webp", "https://ouch-prod-var-cdn.icons8.com/el/illustrations/thumbs/SjlwnTSETxAYMDUT.webp"),
    ("img_22.webp", "https://ouch-prod-var-cdn.icons8.com/eo/illustrations/thumbs/THsHZGY_e1b72kWM.webp"),
    ("img_23.webp", "https://ouch-prod-var-cdn.icons8.com/fr/illustrations/thumbs/b8-YTaSvGCFJgbek.webp"),
]

for filename, url in urls:
    try:
        req = urllib.request.Request(url, headers=headers)
        data = urllib.request.urlopen(req).read()
        with open(os.path.join('homepage/scratch/preview', filename), 'wb') as f:
            f.write(data)
        print(f"Downloaded {filename}, size: {len(data)} bytes")
    except Exception as e:
        print(f"Error {filename}: {e}")
