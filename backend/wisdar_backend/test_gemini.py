import os
import google.generativeai as genai
from dotenv import load_dotenv

# Make sure you have a .env file with your GOOGLE_API_KEY
load_dotenv() 

try:
    print("Configuring API key...")
    api_key = os.getenv("GOOGLE_API_KEY") # Ensure this matches your .env file
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not found in .env file")
        
    genai.configure(api_key=api_key)
    
    print("Initializing model...")
    model = genai.GenerativeModel('gemini-1.5-pro')
    
    print("Sending request to Gemini API...")
    # Use a very short timeout to fail fast if there's a problem
    response = model.generate_content("Hello, world.", request_options={'timeout': 30})
    
    print("SUCCESS! Response received:")
    print(response.text)

except Exception as e:
    print(f"\n--- FAILED ---")
    print(f"An error occurred: {e}")