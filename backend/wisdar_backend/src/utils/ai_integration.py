# backend/wisdar_backend/src/utils/ai_integration.py

import google.generativeai as genai
import openai
import anthropic
from flask import current_app
from ..models.ai_model import AIModel

def _get_gemini_response(api_key: str, model_id: str, messages: list[dict]):
    """Handles getting a response from the Google Gemini API."""
    try:
        genai.configure(api_key=api_key)

        model_name_map = {
            "gemini-2.5-pro": "gemini-1.5-pro-latest"
        }
        sdk_model_name = model_name_map.get(model_id, "gemini-1.5-pro-latest")
        model = genai.GenerativeModel(sdk_model_name)

        # --- THIS IS THE FIX ---
        # The 'messages' list now contains dictionaries, not objects.
        # We access items using bracket notation, e.g., msg['role'].
        history = [
            {'role': 'model' if msg['role'] == 'assistant' else 'user', 'parts': [msg['content']]} 
            for msg in messages
        ]
        # -----------------------

        # The last message is the current prompt
        current_prompt = history.pop() if history else {'parts': ['']}

        chat = model.start_chat(history=history)
        response = chat.send_message(current_prompt['parts'])
        
        return response.text
    except Exception as e:
        current_app.logger.error(f"Error calling Gemini API: {e}")
        raise ValueError(f"Gemini API Error: {e}") from e
    
def _get_openai_response(api_key, model_id, messages):
    """Handles getting a response from the OpenAI API."""
    try:
        client = openai.OpenAI(api_key=api_key)
        history = [{"role": msg.role, "content": msg.content} for msg in messages]
        response = client.chat.completions.create(model=model_id, messages=history)
        return response.choices[0].message.content
    except Exception as e:
        current_app.logger.error(f"Error calling OpenAI API: {e}")
        raise ValueError(f"OpenAI API Error: {e}") from e

def _get_anthropic_response(api_key, model_id, messages):
    """Handles getting a response from the Anthropic API."""
    try:
        client = anthropic.Anthropic(api_key=api_key)
        # Anthropic API expects the user's prompt to be the last message
        system_prompt = "You are a helpful assistant." # Optional
        history = [{"role": msg.role, "content": msg.content} for msg in messages]

        response = client.messages.create(
            model=model_id,
            max_tokens=2048,
            system=system_prompt,
            messages=history
        )
        return response.content[0].text
    except Exception as e:
        current_app.logger.error(f"Error calling Anthropic API: {e}")
        raise ValueError(f"Anthropic API Error: {e}") from e

def get_ai_response(model_id, messages):
    """Main dispatcher function to route the request to the correct AI model API."""
    ai_model = AIModel.query.get(model_id)
    if not ai_model:
        return "Error: AI model not found."

    api_key = ai_model.get_api_key()
    if not api_key or api_key == 'key_not_set':
        return f"Error: API key for {ai_model.display_name} is not configured."

    # Process messages to handle attachments
    processed_messages = []
    for message in messages:
        # FIXED: Changed from attachments (plural) to attachment (singular)
        if message.attachment:
            content = ""
            # Since it's a one-to-one relationship, we don't need to loop
            attachment = message.attachment
            if attachment.transcription:
                content += attachment.transcription
            elif attachment.file_path:
                content += f"[Attachment: {attachment.file_path}]"
            
            # Use attachment content if available, otherwise keep original content
            msg_dict = {
                "role": message.role,
                "content": content or message.content
            }
        else:
            # Regular text message
            msg_dict = {
                "role": message.role,
                "content": message.content
            }
        processed_messages.append(msg_dict)

    # Now route based on model type
    if "gemini" in model_id:
        return _get_gemini_response(api_key, model_id, processed_messages)
    elif "gpt" in model_id:
        return _get_openai_response(api_key, model_id, processed_messages)
    elif "claude" in model_id:
        return _get_anthropic_response(api_key, model_id, processed_messages)
    else:
        return "Error: The specified model is not supported by the dispatcher."