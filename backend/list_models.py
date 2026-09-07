"""
One-off diagnostic script - run this manually to see which Gemini models
your API key can actually access. Not part of the app itself.
"""
from google import genai
from app.config.settings import GEMINI_API_KEY

client = genai.Client(api_key=GEMINI_API_KEY)

print("Models available to this API key:\n")
for model in client.models.list():
    if "generateContent" in (model.supported_actions or []):
        print(model.name)