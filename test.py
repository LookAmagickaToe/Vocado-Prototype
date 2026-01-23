import google.generativeai as genai
import os

# Ensure your key is set
genai.configure(api_key=os.environ["GEMINI_API_KEY"])

print("Available models:")
for m in genai.list_models():
    if 'generateContent' in m.supported_generation_methods:
        print(f"- {m.name}")