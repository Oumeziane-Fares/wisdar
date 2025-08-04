# backend/wisdar_backend/src/utils/ai_integration.py


import openai
import anthropic
import re
import time
from flask import current_app
from ..models.provider import Provider
from typing import Dict, List, Generator, Optional
import importlib
import logging
import os
from urllib.parse import urlparse
import uuid
import requests # Add requests for making API calls
import json
from datetime import datetime # Import datetime for getting the current date
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
from src.models.provider import ProviderService
import logging
from PIL import Image
from io import BytesIO
import base64
import google.genai as genai
from google.genai import types
from google.api_core.retry import Retry
from google.protobuf import duration_pb2

# --- Add these lines to set up the logger ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Gemini Search Client Wrapper ---
class GeminiSearchClient:
    """
    A robust wrapper around the Gemini API (via google.genai) with optional
    web search grounding, streaming responses, and automatic retry/backoff.
    Supports customizing generation parameters for accuracy and depth.
    """

    def __init__(
        self,
        api_key: str,
        model_id: str = "models/chat-bison-001",
        service_id: Optional[str] = None,
        max_retries: int = 3,
        backoff_factor: float = 0.5,
        temperature: float = 0.2,
        top_p: float = 0.9,
        max_output_tokens: int = 1024,
    ):
        self.client = genai.Client(api_key=api_key)
        self.model_id = model_id
        self.service_id = service_id
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self.temperature = temperature
        self.top_p = top_p
        self.max_output_tokens = max_output_tokens
        self.logger = logging.getLogger(__name__)

        # Configure search grounding and generation parameters
        if self.service_id == "chat-search":
            search_tool = types.Tool(
                google_search_retrieval=types.GoogleSearchRetrieval()
            )
            self.config = types.GenerateContentConfig(
                tools=[search_tool],
                temperature=self.temperature,
                top_p=self.top_p,
                max_output_tokens=self.max_output_tokens
            )
        else:
            self.config = types.GenerateContentConfig(
                temperature=self.temperature,
                top_p=self.top_p,
                max_output_tokens=self.max_output_tokens
            )

    def _prepare_contents(self, messages: List[Dict[str, str]]) -> List[types.Content]:
        """
        Convert simple message dicts into google.genai Content objects.
        """
        contents: List[types.Content] = []
        # Note: Gemini API does not support 'system' role, so we embed any system instructions as user messages
        for msg in messages:
            text = msg.get("content", "").strip()
            if not text:
                continue
            # If this is the first user message and we want to guide depth/accuracy, prepend a prompt
            if msg.get("role") == "user" and not any(c.role == "user" for c in contents):
                guide = (
                    "Please provide accurate, well‑researched, and in‑depth answers, "
                    "grounded in the latest information. "
                )
                contents.append(types.Content(role="user", parts=[types.Part(text=guide)]))
            role_str = "model" if msg.get("role") == "assistant" else "user"
            contents.append(
                types.Content(
                    role=role_str,
                    parts=[types.Part(text=text)]
                )
            )
        return contents

    def get_response_stream(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        contents = self._prepare_contents(messages)
        last_exc = None

        for attempt in range(1, self.max_retries + 1):
            try:
                stream = self.client.models.generate_content_stream(
                    model=self.model_id,
                    contents=contents,
                    config=self.config
                )
                for chunk in stream:
                    text = getattr(chunk, 'text', None) or getattr(chunk, 'content', None)
                    if text:
                        yield text
                return
            except Exception as exc:
                last_exc = exc
                self.logger.warning(f"Gemini attempt {attempt} failed: {exc}")
                time.sleep(self.backoff_factor * attempt)

        yield f"⚠️ Gemini API Error after {self.max_retries} attempts: {last_exc}"

    def get_full_response(self, messages: List[Dict[str, str]]) -> str:
        return ''.join(self.get_response_stream(messages))


def _describe_image_with_vision(api_key: str, image_path: str) -> str:
    """
    Use GPT-4 Vision to describe the image for contextual generation.
    """
    try:
        client = openai.OpenAI(api_key=api_key)
        
        with open(image_path, "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this image in detail, focusing on the main elements, composition, style, lighting, and atmosphere. Be specific about objects, colors, and spatial relationships. This description will be used to generate a similar image with modifications."},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}", "detail": "high"}}
                    ]
                }
            ],
            max_tokens=500
        )
        description = response.choices[0].message.content.strip()
        current_app.logger.info(f"Generated image description: {description[:100]}...")
        return description
    except Exception as e:
        current_app.logger.error(f"Failed to describe image: {e}")
        return "A detailed image of the scene." # Fallback description

def _create_contextual_prompt(api_key: str, image_description: str, modification: str, original_prompt: str = None) -> str:
    """
    Create a new prompt that maintains context while applying modifications.
    """
    try:
        client = openai.OpenAI(api_key=api_key)
        system_message = (
            "You are a prompt engineer for DALL-E 3. Create a detailed image generation prompt that:\n"
            "1. Maintains the core elements and style from the image description.\n"
            "2. Incorporates the requested modification seamlessly.\n"
            "3. Is optimized for DALL-E 3 (detailed, specific, artistic).\n"
            "4. Ensures visual continuity with the original.\n"
            "Return only the final prompt, nothing else."
        )
        context_info = f"Image Description: {image_description}"
        if original_prompt:
            context_info += f"\nOriginal Prompt: {original_prompt}"
        user_message = f"{context_info}\n\nModification Request: {modification}"
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message}
            ],
            temperature=0.7
        )
        contextual_prompt = response.choices[0].message.content.strip()
        current_app.logger.info(f"Created contextual prompt: {contextual_prompt[:100]}...")
        return contextual_prompt
    except Exception as e:
        current_app.logger.error(f"Failed to create contextual prompt: {e}")
        return f"{image_description}. {modification}" # Fallback prompt

def _get_augmented_prompt(api_key: str, original_prompt: str, new_instruction: str) -> str:
    """Uses GPT-4o to combine an original prompt with a new instruction."""
    try:
        client = openai.OpenAI(api_key=api_key)
        system_message = (
            "You are a prompt rewriting assistant. The user will provide an original image prompt and a new instruction. "
            "Your task is to combine them into a single, new, cohesive prompt that describes the final desired image. "
            "Only respond with the rewritten prompt and nothing else."
        )
        
        user_message = f"Original Prompt: \"{original_prompt}\"\n\nNew Instruction: \"{new_instruction}\""
        
        response = client.chat.completions.create(
            model="gpt-4o", # Using a powerful model for best results
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message}
            ],
            temperature=0.5,
        )
        augmented_prompt = response.choices[0].message.content.strip()
        current_app.logger.info(f"Augmented prompt created: '{augmented_prompt}'")
        return augmented_prompt
    except Exception as e:
        current_app.logger.error(f"Failed to augment prompt: {e}")
        # Fallback to just using the new instruction if augmentation fails
        return new_instruction

# --- [MODIFIED] Web Search Execution Function ---
def _execute_web_search(query: str) -> str:
    """
    Executes a web search using the Serper.dev API.
    Adds the current date to the query for more relevant results.
    """
    api_key = os.environ.get('SEARCH_API_KEY')
    if not api_key:
        current_app.logger.error("SEARCH_API_KEY not found in environment variables.")
        return "Error: Search API key is not configured."

    # --- [NEW] Add the current date to the query for better accuracy ---
    current_date = datetime.now().strftime("%B %d, %Y")
    search_query_with_date = f"{query} (current date: {current_date})"
    # --- END NEW ---

    url = "https://google.serper.dev/search"
    payload = json.dumps({"q": search_query_with_date}) # Use the new, more specific query
    headers = {
        'X-API-KEY': api_key,
        'Content-Type': 'application/json'
    }
    
    try:
        current_app.logger.info(f"Executing web search for dated query: '{search_query_with_date}'")
        response = requests.post(url, headers=headers, data=payload, timeout=10)
        response.raise_for_status()
        results = response.json()
        
        # Extract and format the search results into a concise string
        snippets = []
        if results.get("organic"):
            for result in results["organic"][:5]: # Get top 5 results
                title = result.get("title", "No Title")
                link = result.get("link", "#")
                snippet = result.get("snippet", "No snippet available.")
                snippets.append(f"Title: {title}\nLink: {link}\nSnippet: {snippet}\n---")
        
        if not snippets:
            return "No search results found."
            
        return "\n".join(snippets)

    except requests.exceptions.RequestException as e:
        current_app.logger.error(f"Web search request failed: {e}")
        return f"Error: Failed to execute web search. {e}"

def _get_gemini_response(
    api_key: str,
    model_id: str,
    messages: List[Dict[str, str]],
    service_id: Optional[str] = None,
) -> Generator[str, None, None]:
    """
    Handles a streamed response from the Gemini API using the modern google.genai library.
    Enables Google Search grounding when service_id is 'chat-search'.
    """
    try:
        # Initialize the client with API key
        client = genai.Client(api_key=api_key)
        
        # Configure tools and generation config
        config = None
        if service_id == "chat-search":
            grounding_tool = types.Tool(
                google_search=types.GoogleSearch()
            )
            config = types.GenerateContentConfig(
                tools=[grounding_tool]
            )
        
        # Convert messages to the format expected by google.genai using proper Content objects
        contents = []
        for msg in messages:
            if msg.get("content", "").strip():
                role = "model" if msg["role"] == "assistant" else "user"
                content_obj = types.Content(
                    role=role,
                    parts=[types.Part(text=msg["content"])]
                )
                contents.append(content_obj)
        
        # Generate streamed response
        if config:
            response = client.models.generate_content_stream(
                model=model_id,
                contents=contents,
                config=config
            )
        else:
            response = client.models.generate_content_stream(
                model=model_id,
                contents=contents,
            )
        
        # Yield text chunks as they arrive
        for chunk in response:
            if hasattr(chunk, 'text') and chunk.text:
                yield chunk.text
            elif hasattr(chunk, 'content') and chunk.content:
                yield chunk.content
                
    except Exception as exc:
        logging.exception("Gemini API error")
        yield f"⚠️ Gemini API Error: {str(exc)}"

# --- [MODIFIED] This function now handles the full tool-use lifecycle for OpenAI ---
def _get_openai_response(
    api_key: str,
    model_id: str,
    messages: List[Dict[str, str]],
    service_id: Optional[str] = None,
) -> Generator[str, None, None]:
    """
    Handles a full conversation with OpenAI, including multi-step tool use.
    Streams the final response after executing tools.
    """
    client = openai.OpenAI(api_key=api_key)
    
    # Filter out empty messages
    convo = [
        {"role": m["role"], "content": m["content"]}
        for m in messages if m.get("content", "").strip()
    ]

    # --- Handle Web Search via Tool Use ---
    if service_id == "chat-search":
        # Define the custom web search tool
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "web_search",
                    "description": "Search the web for up-to-date information on a given topic, event, or person.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "The search query to use. Be specific for best results."
                            }
                        },
                        "required": ["query"],
                    },
                },
            }
        ]
        
        try:
            # Step 1: Make the initial API call to see if the model wants to use a tool
            current_app.logger.info("Making initial call to OpenAI to check for tool use...")
            initial_response = client.chat.completions.create(
                model=model_id,
                messages=convo,
                tools=tools,
                tool_choice={"type": "function", "function": {"name": "web_search"}},
            )
            response_message = initial_response.choices[0].message

            # Step 2: Check if the model responded with a tool call
            if response_message.tool_calls:
                # Append the assistant's request to the conversation history
                convo.append(response_message)
                
                # Step 3: Execute the requested tool
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    current_app.logger.info(f"OpenAI model requested to use tool: '{function_name}'")

                    if function_name == "web_search":
                        query = json.loads(tool_call.function.arguments).get("query")
                        search_result = _execute_web_search(query)
                        
                        # Step 4: Append the tool's result to the conversation
                        convo.append({
                            "tool_call_id": tool_call.id,
                            "role": "tool",
                            "name": function_name,
                            "content": search_result,
                        })

                # Step 5: Send the tool results back to the model for a final, streamed response
                current_app.logger.info("Sending tool results to OpenAI for final, streamed response...")
                stream = client.chat.completions.create(
                    model=model_id,
                    messages=convo,
                    stream=True,
                )
                for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            else:
                # Fallback: No tool was used, just yield the initial response content
                current_app.logger.info("No tool use detected by OpenAI. Yielding initial response.")
                if response_message.content:
                    yield response_message.content

        except Exception as exc:
            logging.exception("OpenAI API tool-use error")
            yield f"⚠️ OpenAI API Error: {str(exc)}"

    else:
        # --- Original Behavior: No tool use, just stream the response ---
        try:
            stream = client.chat.completions.create(
                model=model_id,
                messages=convo,
                stream=True
            )
            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as exc:
            logging.exception("OpenAI API stream error")
            yield f"⚠️ OpenAI API Error: {str(exc)}"
            
# --- [MODIFIED] This function now handles the full tool-use lifecycle ---
def _get_anthropic_response(
    api_key: str,
    model_id: str,
    messages: List[Dict[str, str]],
    service_id: Optional[str] = None,
) -> Generator[str, None, None]:
    """
    Handles a full conversation with Anthropic, including multi-step tool use.
    """
    client = anthropic.Anthropic(api_key=api_key)
    
    # Convert message format for the Anthropic API
    convo = [{"role": m["role"], "content": m["content"]} for m in messages if m.get("content", "").strip()]

    # Define the tools if web search is enabled
    tools = []
    if service_id == "chat-search":
        tools.append({
            "name": "web_search", 
            "description": "Search the web for information on a given topic. Use this for recent events or when you need up-to-date information.", 
            "input_schema": {
                "type": "object", 
                "properties": {
                    "query": {
                        "type": "string", 
                        "description": "The search query to use."
                    }
                }, 
                "required": ["query"]
            }
        })

    try:
        # --- Step 1: Make the initial API call (non-streaming) ---
        current_app.logger.info("Making initial call to Anthropic API...")
        
        # Fix: Only pass tools if the list is not empty
        api_params = {
            "model": model_id,
            "max_tokens": 4096,
            "messages": convo,
        }
        if tools:  # Only add tools if the list is not empty
            api_params["tools"] = tools
            
        initial_response = client.messages.create(**api_params)
        current_app.logger.info(f"Initial response received. Stop reason: {initial_response.stop_reason}")

        # --- Step 2: Check if the model wants to use a tool ---
        if initial_response.stop_reason == "tool_use":
            # Append the assistant's request to use a tool to our conversation history
            convo.append({"role": "assistant", "content": initial_response.content})

            tool_results = []
            for tool_call in initial_response.content:
                if tool_call.type == "tool_use":
                    tool_name = tool_call.name
                    tool_input = tool_call.input
                    tool_id = tool_call.id
                    
                    current_app.logger.info(f"AI requested to use tool: '{tool_name}' with input: {tool_input}")

                    if tool_name == "web_search":
                        search_result = _execute_web_search(tool_input.get("query", ""))
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": search_result,
                        })

            # --- Step 3: Send the tool results back to the model in a second API call ---
            if tool_results:
                # Append the results of our tool execution to the conversation
                convo.append({"role": "user", "content": tool_results})

                current_app.logger.info("Sending tool results back to Anthropic API for final response...")
                # Make the second call, this time streaming the final answer
                with client.messages.stream(
                    model=model_id,
                    max_tokens=4096,
                    messages=convo,
                ) as stream:
                    for text_chunk in stream.text_stream:
                        yield text_chunk
            else:
                # If for some reason no tool results were generated, yield an error.
                yield "Error: AI requested a tool but no results were generated."

        else:
            # --- Fallback: If no tool was used, just stream the initial response ---
            current_app.logger.info("No tool use detected. Streaming initial response.")
            for content_block in initial_response.content:
                if content_block.type == "text":
                    yield content_block.text

    except Exception as e:
        current_app.logger.error(f"Anthropic tool-use lifecycle error: {e}", exc_info=True)
        yield f"⚠️ An error occurred during the AI conversation: {str(e)}"
# --- Image Generation Logic (Unchanged) ---

def _generate_openai_image(api_key: str, model_id: str, prompt: str, image_context_url: str = None, original_prompt: str = None) -> str:
    """
    Enhanced OpenAI image generation with DALL-E 3 contextual generation.
    """
    try:
        client = openai.OpenAI(api_key=api_key)

        if image_context_url:
            current_app.logger.info(f"Context detected. Using DALL-E 3 with image context for prompt: {prompt[:50]}...")

            parsed_path = urlparse(image_context_url).path
            filename = os.path.basename(parsed_path)
            if not filename:
                raise ValueError(f"Could not extract filename from URL: {image_context_url}")
            
            local_image_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
            if not os.path.exists(local_image_path):
                raise FileNotFoundError(f"Context image not found: {local_image_path}")

            # Step 1: Describe the existing image using the vision model
            image_description = _describe_image_with_vision(api_key, local_image_path)
            
            # Step 2: Create a new, context-aware prompt
            contextual_prompt = _create_contextual_prompt(api_key, image_description, prompt, original_prompt)
            
            # Step 3: Generate a new image with DALL-E 3 using the enhanced prompt
            current_app.logger.info(f"Generating contextual image with DALL-E 3...")
            generate_response = client.images.generate(
                model="dall-e-3",
                prompt=contextual_prompt,
                n=1,
                size="1024x1024",
                quality="standard",
                response_format="url"
            )
            image_url = generate_response.data[0].url

        else:
            # Original logic for generating a new image from scratch
            current_app.logger.info(f"Generating new image with {model_id} for prompt: {prompt[:50]}...")
            generate_response = client.images.generate(
                model=model_id,
                prompt=prompt,
                n=1,
                size="1024x1024",
                response_format="url"
            )
            image_url = generate_response.data[0].url

        if not image_url:
            raise ValueError("API did not return an image URL.")

        current_app.logger.info(f"Successfully generated image URL.")
        return image_url

    except Exception as e:
        current_app.logger.error(f"OpenAI Image API error: {e}", exc_info=True)
        raise

# --- Image Generation Logic for Google (Unchanged) ---
def _generate_google_image(api_key: str, model_id: str, prompt: str) -> str:
    """
    Calls the Google AI API to generate an image (e.g., using Imagen).
    Saves the image locally and returns a public URL to it.
    """
    try:
        # This part requires the google.generativeai library
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_id) # e.g., 'imagegeneration@006'

        current_app.logger.info(f"Generating image with Google for prompt: {prompt[:50]}...")
        
        response = model.generate_content(prompt)
        
        image_part = next((part for part in response.parts if part.mime_type.startswith("image/")), None)
        if not image_part:
            raise ValueError("API did not return image data.")
            
        image_bytes = image_part.inline_data.data
        
        image_filename = f"{uuid.uuid4()}.png"
        save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], image_filename)
        
        with open(save_path, "wb") as f:
            f.write(image_bytes)
        
        current_app.logger.info(f"Successfully saved generated image to {save_path}")

        server_url = current_app.config.get("PUBLIC_SERVER_URL", "").rstrip('/')
        image_url = f"{server_url}/api/chat/uploads/{image_filename}"
        
        return image_url

    except Exception as e:
        current_app.logger.error(f"Google Image Generation API error: {e}", exc_info=True)
        raise

# --- ADD THIS NEW TOOL FUNCTION ---
def _get_youtube_transcript(text_containing_url: str) -> tuple[str | None, str | None]:
    """
    Finds a YouTube URL within a block of text, then fetches its transcript.
    Returns a tuple: (transcript_text, error_message).
    """
    # Regex to find YouTube URLs
    youtube_regex = r"(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|googleusercontent\.com\/youtube\.com\/[0-9])([a-zA-Z0-9_-]{11})"
    
    match = re.search(youtube_regex, text_containing_url)
    
    if not match:
        return None, "A valid YouTube URL was not found in your message."

    video_id = match.group(1)

    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        full_transcript = " ".join([item['text'].replace('\n', ' ') for item in transcript_list])
        return full_transcript, None

    except (NoTranscriptFound, TranscriptsDisabled):
        return None, "A transcript for this video could not be found. It may be disabled or unavailable."
    except Exception as e:
        current_app.logger.error(f"Error fetching YouTube transcript for video ID {video_id}: {e}", exc_info=True)
        return None, "An unexpected error occurred while fetching the transcript."
    
# --- Main Dispatcher Functions ---
def get_ai_response(provider_id: str, model_id: str, context_messages: list, service_id: str):
    provider = Provider.query.get(provider_id)
    if not provider:
        yield f"❌ Error: AI provider '{provider_id}' not found"
        return

    api_key = provider.get_api_key()
    if not api_key:
        yield f"🔑 Error: API key for {provider.name} not configured."
        return

    try:
        logger.info(f"[GET_AI_RESPONSE] provider={provider_id}, service_id={service_id}")
        if provider_id == 'google':
            gem_client = GeminiSearchClient(api_key, model_id, service_id)
            yield from gem_client.get_response_stream(context_messages)
        elif provider_id == 'openai':
            yield from _get_openai_response(api_key, model_id, context_messages, service_id)
        elif provider_id == 'anthropic':
            yield from _get_anthropic_response(api_key, model_id, context_messages, service_id)
        else:
            yield f"❌ Error: Unsupported provider '{provider_id}'"
    except Exception as e:
        logger.error(f"AI Response Error: {e}", exc_info=True)
        yield f"⚠️ AI System Error: {str(e)}"



def generate_image(provider_id: str, model_id: str, prompt: str, image_context_url: str = None, original_prompt: str = None) -> str:
    """
    Generates an image by routing to the correct provider.
    """
    provider = Provider.query.get(provider_id)
    if not provider:
        raise ValueError(f"AI provider '{provider_id}' not found in database")

    api_key = provider.get_api_key()
    if not api_key:
        raise ValueError(f"API key for {provider.name} is not configured.")

    if provider_id == 'openai':
        return _generate_openai_image(api_key, model_id, prompt, image_context_url, original_prompt)
    elif provider_id == 'google':
        return _generate_google_image(api_key, model_id, prompt)
    else:
        raise ValueError(f"Image generation is not supported for provider '{provider_id}'.")

def get_decomposed_claims(claim_text: str) -> list[str]:
    """
    Uses a powerful AI model to decompose a complex claim into a list of
    simple, verifiable sub-claims.
    """
    # For a critical task like this, we hard-code a powerful model
    provider = Provider.query.get('openai')
    service = ProviderService.query.filter_by(provider_id='openai', model_api_id='gpt-4o').first()
    
    if not provider or not service:
        raise ValueError("GPT-4o service not configured for claim decomposition.")

    api_key = provider.get_api_key()
    client = openai.OpenAI(api_key=api_key)

    system_prompt = (
        "You are an expert at breaking down complex claims into simple, independently verifiable statements. "
        "Analyze the user's text and extract every distinct claim. "
        "Return your response ONLY as a single, flat JSON array of strings. Do not include any other text or explanation."
        'Example: For the input "The sun is a planet and the moon is made of cheese", you must output ["The sun is a planet.", "The moon is made of cheese."]'
    )

    response = client.chat.completions.create(
        model=service.model_api_id,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": claim_text}
        ],
        temperature=0.0
    )

    try:
        sub_claims = json.loads(response.choices[0].message.content)
        if isinstance(sub_claims, list) and all(isinstance(s, str) for s in sub_claims):
            return sub_claims
        else:
            raise ValueError("AI did not return a valid list of strings.")
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"Failed to parse sub-claims from AI response: {e}", exc_info=True)
        # Fallback: just treat the whole claim as one
        return [claim_text]

# =========== ===================================================================
#  Text-To-Voice implmentation
# ==============================================================================

def generate_tts_audio(provider_id: str, text_input: str, voice: str = 'alloy') -> bytes:
    """
    Calls the appropriate provider's TTS API to generate audio with a specified voice.
    """
    if provider_id != 'openai':
        raise NotImplementedError("TTS is currently only supported for OpenAI.")

    # Fetch the provider and its API key from the database
    provider = Provider.query.get('openai')
    if not provider or not provider.api_key_encrypted:
        raise ValueError("OpenAI provider or API key not configured.")
    
    client = openai.OpenAI(api_key=provider.get_api_key())

    # Generate the speech using the provided voice parameter
    response = client.audio.speech.create(
        model="tts-1-hd",
        voice=voice,
        input=text_input
    )

    return response.content




def extract_tts_parameters(prompt: str) -> dict:
    """
    Uses GPT-4o to interpret a natural language prompt and extract structured TTS parameters.
    """
    logger.info(f"--- Extracting TTS parameters from prompt: '{prompt[:50]}...' ---")
    
    # We use a powerful model for the interpretation step
    provider = Provider.query.get('openai')
    if not provider or not provider.get_api_key():
        raise ValueError("OpenAI provider (for parameter extraction) is not configured.")
    
    client = openai.OpenAI(api_key=provider.get_api_key())

    system_prompt = (
        "You are an intelligent assistant that processes user requests for a Text-to-Speech (TTS) service. "
        "The user will provide a single line of text. Your task is to analyze this text and extract two key pieces of information: "
        "1. The exact text that needs to be converted to speech (the 'input'). "
        "2. The instructions describing the desired tone, style, or emotion of the speech (the 'instructions'). "
        "You must return your response ONLY as a single, valid JSON object with the keys 'input' and 'instructions'. "
        "If no specific instructions are given for the tone, the value for 'instructions' should be an empty string. "
        "Example 1: User says 'Read the following text in a very happy and energetic voice: Hello world!' -> "
        '{"input": "Hello world!", "instructions": "Speak in a very happy and energetic voice."}'
        "Example 2: User says 'Hello world!' -> "
        '{"input": "Hello world!", "instructions": ""}'
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.0
        )
        
        params = json.loads(response.choices[0].message.content)
        
        if 'input' not in params or 'instructions' not in params:
            raise ValueError("AI did not return the required 'input' and 'instructions' keys.")
        
        logger.info(f"--- Successfully extracted TTS parameters: {params} ---")
        return params

    except Exception as e:
        logger.error(f"Failed to extract TTS parameters from AI response: {e}", exc_info=True)
        # Fallback for simple prompts if JSON parsing fails
        return {"input": prompt, "instructions": ""}


def stream_openai_tts_audio(api_key: str, model_id: str, voice: str, input_text: str, instructions: str) -> Generator[bytes, None, None]:
    """
    Calls the OpenAI TTS API with streaming enabled and yields audio chunks.
    """
    logger.info("--- Calling OpenAI Streaming TTS API ---")
    client = openai.OpenAI(api_key=api_key)

    try:
        # 1. Create a dictionary with the required parameters.
        params = {
            "model": model_id,
            "voice": voice,
            "input": input_text,
            "response_format": "mp3"
        }

        # 2. Conditionally add the optional 'instructions' parameter.
        #    This ensures the key is not sent at all if instructions are empty or None.
        if instructions:
            params["instructions"] = instructions

        # 3. Make the API call by unpacking the parameters dictionary.
        with client.audio.speech.with_streaming_response.create(**params) as response:
            for chunk in response.iter_bytes():
                yield chunk
        
        logger.info("--- Finished streaming audio from OpenAI ---")

    except Exception as e:
        logger.error(f"OpenAI Streaming TTS API error: {e}", exc_info=True)
        raise

def generate_google_tts_audio(api_key: str, text_input: str, voice_config: dict) -> bytes:
    """
    Calls the Google Cloud TTS API to generate audio.
    NOTE: This is a placeholder for the real implementation.
    """
    logger.info("--- (Placeholder) Calling Google TTS API ---")
    # In a real scenario, you would make an API call to Google Cloud Text-to-Speech here.
    # For now, we will raise an error to indicate it's not yet implemented.
    raise NotImplementedError("Google TTS is not yet implemented with a live API call.")

# =========== ===================================================================
#  Video generation
# ==============================================================================

# Replace the old generate_google_video function with this one
def generate_google_video(api_key: str, model_id: str, prompt: str, aspect_ratio: str):
    """
    Starts an asynchronous video generation job with the Google Veo API and
    returns the initial operation object.
    Based on the latest Veo documentation.
    """
    logger.info(f"--- Initiating Google Video Generation Job ---")
    logger.info(f"Model: {model_id}, Prompt: '{prompt[:50]}...'")
    
    try:
        # The client is now configured inside the function
        client = genai.Client(api_key=api_key)
        
        # This is the new asynchronous call from your provided code
        # FIX: Pass the aspect_ratio to the config
        operation = client.models.generate_videos(
            model=model_id,
            prompt=prompt,
            config=types.GenerateVideosConfig(
                aspect_ratio=aspect_ratio.split(' ')[0]
            )
        )
        
        logger.info(f"--- Successfully initiated video job. Operation Name: {operation} ---")
        return client, operation # Return both the client and the operation

    except Exception as e:
        logger.error(f"Google Video Generation API error on initiation: {e}", exc_info=True)
        raise

def parse_edit_request(edit_prompt: str, original_scenes: list) -> dict:
    """
    Uses GPT-4o to parse a natural language edit request and identify
    the target scene and the modification instructions.
    """
    logger.info(f"--- Parsing edit request: '{edit_prompt[:60]}...' ---")
    provider = Provider.query.get('openai')
    if not provider or not provider.get_api_key():
        raise ValueError("OpenAI provider not configured for edit parsing.")
    
    client = openai.OpenAI(api_key=provider.get_api_key())

    scene_list_str = "\n".join([f"{i+1}. {scene}" for i, scene in enumerate(original_scenes)])

    system_prompt = (
        "You are an intelligent video editing assistant. Your task is to analyze a user's edit request "
        "and the list of original video scenes. You must identify which scene the user wants to change and what "
        "the specific change is. Return ONLY a single, valid JSON object with two keys: "
        "'target_scene_index' (a zero-based integer) and 'modification_instruction' (a string). "
        f"Here is the list of scenes:\n{scene_list_str}"
    )

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": edit_prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0.0
    )
    
    parsed_data = json.loads(response.choices[0].message.content)
    logger.info(f"--- Successfully parsed edit request: {parsed_data} ---")
    return parsed_data


def rewrite_scene_prompt(original_prompt: str, modification: str) -> str:
    """
    Uses GPT-4o to combine an original scene prompt with a modification
    request to create a new, cohesive prompt.
    """
    logger.info(f"--- Rewriting scene prompt. Original: '{original_prompt[:50]}...', Mod: '{modification}' ---")
    provider = Provider.query.get('openai')
    if not provider or not provider.get_api_key():
        raise ValueError("OpenAI provider not configured for prompt rewriting.")
        
    client = openai.OpenAI(api_key=provider.get_api_key())

    system_prompt = (
        "You are a creative assistant who rewrites video scene descriptions. "
        "You will be given an original scene description and a requested modification. "
        "Combine them into a single, new, detailed prompt that seamlessly incorporates the change. "
        "Return ONLY the new prompt string."
    )

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Original Scene: \"{original_prompt}\"\n\nModification: \"{modification}\""}
        ],
        temperature=0.7
    )
    
    rewritten_prompt = response.choices[0].message.content.strip()
    logger.info(f"--- Successfully rewrote prompt: '{rewritten_prompt[:60]}...' ---")
    return rewritten_prompt

def get_gemini_video_understanding_response(api_key: str, model_id: str, video_path: str, prompt: str) -> Generator[dict, None, None]:
    """
    Uploads a video, asks a question about it using the Gemini API,
    streams the text response, and cleans up the uploaded file.
    """
    logger.info("--- VIDEO UNDERSTANDING TASK STARTED ---") # <-- ADDED LOGGING
    video_file = None
    try:
        client = genai.Client(api_key=api_key)
        
        # --- LOGGING INPUTS ---
        logger.info(f"  Model ID: {model_id}")
        logger.info(f"  Video Path: {video_path}")
        logger.info(f"  Initial Prompt: {prompt}")

        yield {"type": "status", "data": "1/3: Uploading video..."}
        
        logger.info("Step 1: Uploading file to Google AI File API...") # <-- ADDED LOGGING
        video_file = client.files.upload(file=video_path)
        logger.info(f"Step 1 COMPLETE. File Name: {video_file.name}, URI: {video_file.uri}") # <-- ADDED LOGGING
        
        yield {"type": "status", "data": "2/3: Processing video..."}
        
        logger.info("Step 2: Polling for file processing status...") # <-- ADDED LOGGING
        while video_file.state.name == "PROCESSING":
            time.sleep(5) # Shortened for faster debugging
            video_file = client.files.get(name=video_file.name)
            logger.info(f"  Polling... Current state is: {video_file.state.name}") # <-- ADDED LOGGING

        if video_file.state.name == "FAILED":
            logger.error(f"Step 2 FAILED. Google AI could not process the file: {video_file.name}") # <-- ADDED LOGGING
            raise ValueError("Google AI failed to process the video file.")

        logger.info(f"Step 2 COMPLETE. File state is ACTIVE.") # <-- ADDED LOGGING
        yield {"type": "status", "data": "3/3: Analyzing content..."}
        

        contents = [
            video_file,
            prompt
        ]
        
        # --- LOGGING THE FINAL REQUEST ---
        logger.info("Step 3: Sending final request to generate_content with the following parts:") # <-- ADDED LOGGING
        logger.info(f"  Part 1 (File): {video_file.uri}") # <-- ADDED LOGGING
        logger.info(f"  Part 2 (Prompt): {prompt}") # <-- ADDED LOGGING

        response = client.models.generate_content_stream(
            model=f'models/{model_id}',
            contents=contents
        )

        for chunk in response:
            if chunk.text:
                yield {"type": "chunk", "data": chunk.text}

    except Exception as e:
        logger.error(f"An exception occurred in Gemini video understanding: {e}", exc_info=True) # <-- ADDED LOGGING
        raise
    finally:
        if video_file:
            logger.info(f"Step 4: Cleaning up file {video_file.name}.") # <-- ADDED LOGGING
            client.files.delete(name=video_file.name)


#*****************************************************
def _get_youtube_video_id(url: str) -> str | None:
    """
    Extracts the YouTube video ID from a URL using regex.
    Returns the video ID string or None if not found.
    """
    # This regex handles various YouTube URL formats like:
    # - https://www.youtube.com/watch?v=VIDEO_ID
    # - https://youtu.be/VIDEO_ID
    # - https://www.youtube.com/embed/VIDEO_ID
    youtube_regex = (
        r'(https?://)?(www\.)?'
        '(youtube|youtu|youtube-nocookie)\.(com|be)/'
        '(watch\?v=|embed/|v/|.+\?v=)?([^&=%\?]{11})')
    
    match = re.search(youtube_regex, url)
    if match:
        # The 6th capturing group is the 11-character video ID
        return match.group(6)
    return None

def summarize_youtube_video(video_url: str, prompt: str, start_time: str = None, end_time: str = None) -> Generator[str, None, None]:
    """
    Summarizes a YouTube video using the Gemini API, with optional time clipping,
    and streams the response.

    Args:
        video_url: The full URL of the YouTube video.
        prompt: The user's text prompt (e.g., "Summarize this in 3 sentences").
        start_time: Optional start time string (e.g., "1m10s").
        end_time: Optional end time string (e.g., "5m30s").

    Yields:
        Text chunks of the summary as they are generated.
        
    Raises:
        ValueError: If the YouTube URL is invalid.
        Exception: For any errors during the API call.
    """
    video_id = _get_youtube_video_id(video_url)
    if not video_id:
        raise ValueError("Invalid YouTube URL provided.")

    try:
        # 1. Instantiate the client with the API key
        google_provider = Provider.query.get('google')
        api_key = google_provider.get_api_key() if google_provider else None
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not configured in the application.")
        client = genai.Client(api_key=api_key)
        
        # The Gemini API documentation specifies this URI format for the YouTube Reader
        video_uri = f"https://www.youtube.com/watch?v={video_id}"
        
        # 2. Prepare the request parts (video and prompt)
        video_part = types.Part(
            file_data=types.FileData(
                mime_type='video/youtube',
                file_uri=video_uri
            )
        )
        text_part = types.Part(text=prompt)
        
        # 3. Construct the 'contents' object exactly as requested
        request_contents = types.Content(parts=[video_part, text_part])

        # 4. Build the parameters for the API call
        request_params = {
            'model': 'models/gemini-1.5-flash',
            'contents': request_contents
        }

        # 5. Dynamically add time offsets if they are provided
        if start_time:
            minutes = 0
            seconds = 0
            if 'm' in start_time:
                parts = start_time.split('m')
                minutes = int(parts[0])
                if len(parts) > 1 and parts[1]:
                    seconds = int(parts[1].replace('s', ''))
            elif 's' in start_time:
                seconds = int(start_time.replace('s', ''))
            
            request_params['start_offset'] = duration_pb2.Duration(seconds=(minutes * 60) + seconds)
        
        if end_time:
            minutes = 0
            seconds = 0
            if 'm' in end_time:
                parts = end_time.split('m')
                minutes = int(parts[0])
                if len(parts) > 1 and parts[1]:
                    seconds = int(parts[1].replace('s', ''))
            elif 's' in end_time:
                seconds = int(end_time.replace('s', ''))

            request_params['end_offset'] = duration_pb2.Duration(seconds=(minutes * 60) + seconds)

        current_app.logger.info(f"Submitting streaming video summarization to Gemini with params: {request_params}")

        # 6. Make the streaming API call using the client
        response_stream = client.models.generate_content_stream(**request_params)
        
        # --- START MODIFICATION: ADDED LOGGING ---
        # 7. Yield each chunk of text from the stream
        chunk_count = 0
        for chunk in response_stream:
            chunk_count += 1
            current_app.logger.info(f"Received chunk #{chunk_count} from Gemini API.")
            if chunk.text:
                current_app.logger.info(f"  - Chunk contains text, yielding: '{chunk.text[:50]}...'")
                yield chunk.text
            else:
                current_app.logger.warning(f"  - Chunk #{chunk_count} did not contain any text to yield.")
        
        if chunk_count == 0:
            current_app.logger.warning("Gemini API stream finished but returned zero chunks.")
        # --- END MODIFICATION ---

    except Exception as e:
        current_app.logger.error(f"Gemini API call failed for YouTube summary: {e}", exc_info=True)
        # Re-raise the exception so the route can handle it and return a 500 error
        raise
