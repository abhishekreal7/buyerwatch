import urllib.request, re

mjs_urls = [
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/BHvI68cF1.BXKE_ydS.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/HbGoCZnRW.BOdNP-_0.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/K6ze5TZdW.BUfkUaoC.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/MWk9ZEIuG.D6p071RM.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/QvyBFOXEnssYrtIxVxyXM5hvdVVNNOmd3XjDFyqxndw.Cx03iiWQ.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/RLvsso9mI.BigjPNIu.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/SvykXNUeM.DgR7WfL_.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/TprMwlm16.Do06wRXU.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/WCuCICUfS.VKjnT8H5.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/YuDvpLkPx.DuUdqFVq.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/axLui96OO.B5lwLSax.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/illOaNZak.BlxwEbLk.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/inu791J09.CVX-__Ov.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/jF5ICIo_1.BeDiWnes.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/nZ7uZOdIi.DM0ajh7z.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/pZqnPKk83._FMBVys3.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/sTdUitqhD.DfulbiTo.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/uvHzqV759.CzjX0UcD.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/xmbPpQMys.ESH708mc.mjs",
    "https://framerusercontent.com/sites/6c0vd6w9uC5hwzL159XWdU/zYeVpsAdB.BsILkL12.mjs"
]

req_headers = {'User-Agent': 'Mozilla/5.0'}
for url in mjs_urls:
    try:
        req = urllib.request.Request(url, headers=req_headers)
        content = urllib.request.urlopen(req).read().decode('utf-8')
        if "Growth you can point at" in content:
            print(f"FOUND SECTION IN {url}")
            for img in set(re.findall(r'https://framerusercontent\.com/images/[a-zA-Z0-9_\-\.]+', content)):
                print("Image:", img)
    except Exception as e:
        pass
