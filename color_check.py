import cv2
import numpy as np

img = cv2.imread(r"C:\Users\abhis\.gemini\antigravity-ide\brain\886a18bd-e4dd-4327-b624-2463355ad33c\analytics_screenshot.png")
if img is None:
    print("No screenshot")
else:
    print("Top-left pixel (should be page background):", img[10, 10])
    # KPI card is around y=200, x=100
    print("KPI Card pixel (should be card background):", img[200, 100])
