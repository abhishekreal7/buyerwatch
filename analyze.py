import cv2
import numpy as np
import sys
import base64
import os

img1_path = r"C:\Users\abhis\.gemini\antigravity-ide\brain\886a18bd-e4dd-4327-b624-2463355ad33c\analytics_screenshot.png"
img2_path = r"C:\Users\abhis\.gemini\antigravity-ide\brain\886a18bd-e4dd-4327-b624-2463355ad33c\artifacts\c075191fb4fbc7ddc9557b4c6be672e873ef890a59df74850d53c3f8fefd8c82.png"

# We don't have the exact path to the uploaded image in the prompt, but it's usually in artifacts?
# Wait, the prompt doesn't give the path to the uploaded image. 
# But I can just check my own screenshot to see what it looks like!

img1 = cv2.imread(img1_path)
if img1 is None:
    print("Could not read screenshot.")
    sys.exit()

# Crop the top-left area where the cards are
cards = img1[100:400, 50:1000]
cv2.imwrite(r"C:\Users\abhis\.gemini\antigravity-ide\brain\886a18bd-e4dd-4327-b624-2463355ad33c\cropped_cards.png", cards)
print("Saved cropped_cards.png")
