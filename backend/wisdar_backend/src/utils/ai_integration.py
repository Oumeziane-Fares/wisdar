# backend/wisdar_backend/src/utils/ai_integration.py

import google.generativeai as genai
import openai
import anthropic
from flask import current_app
from ..models.ai_model import AIModel

def _get_gemini_response(api_key: str, model_id: str, messages: list[dict]):
    """Handles getting a streamed response from Google Gemini API"""
    try:
        genai.configure(api_key=api_key)
        
        # Map model ID to SDK model name
        model_name_map = {
            "gemini-2.5-pro": "gemini-1.5-pro-latest",
            "gemini-1.5-pro": "gemini-1.5-pro-latest",
            "gemini-1.0-pro": "gemini-1.0-pro"
        }
        sdk_model_name = model_name_map.get(model_id, "gemini-1.5-pro-latest")
        model = genai.GenerativeModel(sdk_model_name)
        
        # Format messages for Gemini
        history = []
        for msg in messages:
            # Skip empty messages
            if not msg.get('content', '').strip():
                continue
                
            role = 'model' if msg['role'] == 'assistant' else 'user'
            history.append({'role': role, 'parts': [msg['content']]})
        
        # Start streaming chat
        request_options = {"timeout": 180}  
        chat = model.start_chat(history=history[:-1])
        response = chat.send_message(
            history[-1]['parts'], 
            stream=True,
            request_options=request_options # Add the new options here
        )        
        # Yield text chunks
        for chunk in response:
            if chunk.text:
                yield chunk.text
                
    except Exception as e:
        current_app.logger.error(f"Gemini API error: {e}", exc_info=True)
        yield f"⚠️ Gemini API Error: {str(e)}"

def _get_openai_response(api_key: str, model_id: str, messages: list[dict]):
    """Handles getting a streamed response from OpenAI API"""
    try:
        client = openai.OpenAI(api_key=api_key)
        
        # Filter out empty messages
        filtered_messages = [
            {"role": msg['role'], "content": msg['content']} 
            for msg in messages 
            if msg.get('content', '').strip()
        ]
        
        # Start streaming
        stream = client.chat.completions.create(
            model=model_id,
            messages=filtered_messages,
            stream=True
        )
        
        # Yield content chunks
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
                
    except Exception as e:
        current_app.logger.error(f"OpenAI API error: {e}", exc_info=True)
        yield f"⚠️ OpenAI API Error: {str(e)}"

def _get_anthropic_response(api_key: str, model_id: str, messages: list[dict]):
    """Handles getting a streamed response from Anthropic API"""
    try:
        client = anthropic.Anthropic(api_key=api_key)
        
        # Build conversation history
        conversation = []
        for msg in messages:
            # Skip empty messages
            if not msg.get('content', '').strip():
                continue
                
            role = "assistant" if msg['role'] == 'assistant' else "user"
            conversation.append({
                "role": role,
                "content": msg['content']
            })
        
        # Start streaming
        with client.messages.stream(
            model=model_id,
            messages=conversation,
            max_tokens=4096,
        ) as stream:
            for text_chunk in stream.text_stream:
                if text_chunk:
                    yield text_chunk
                    
    except Exception as e:
        current_app.logger.error(f"Anthropic API error: {e}", exc_info=True)
        yield f"⚠️ Anthropic API Error: {str(e)}"

def get_ai_response(model_id: str, context_messages: list):
    """
    Generates an AI response with streaming support
    Returns a generator that yields text chunks
    """
    ai_model = AIModel.query.get(model_id)
    if not ai_model:
        yield "❌ Error: AI model not found in database"
        return

    api_key = ai_model.get_api_key()
    if not api_key or api_key == 'key_not_set':
        yield f"🔑 Error: API key for {ai_model.display_name} is not configured"
        return

    # Process messages to handle attachments
    processed_messages = []
    for message in context_messages:
        # Handle attachment if exists
        if hasattr(message, 'attachment') and message.attachment:
            content = ""
            attachment = message.attachment
            
            # Prefer transcription if available
            if attachment.transcription:
                content += attachment.transcription
            elif attachment.file_path:
                content += f"[Attachment: {attachment.file_path}]"
            
            # Use attachment content if available, otherwise keep original
            msg_content = content or message.content
        else:
            msg_content = message.content
            
        processed_messages.append({
            "role": message.role,
            "content": msg_content
        })

    try:
        # Route to appropriate provider with streaming
        if "gemini" in model_id:
            yield from _get_gemini_response(api_key, model_id, processed_messages)
        elif "gpt" in model_id:
            yield from _get_openai_response(api_key, model_id, processed_messages)
        elif "claude" in model_id:
            yield from _get_anthropic_response(api_key, model_id, processed_messages)
        else:
            yield f"❌ Error: Unsupported model type '{model_id}'"
            
    except Exception as e:
        current_app.logger.error(f"AI Response Error: {e}", exc_info=True)
        yield f"⚠️ AI System Error: {str(e)}"