# src/routes/agents.py
# --- Add new imports ---
import os
from flask import Blueprint, jsonify, request, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.database import db
from src.models.chat import Conversation, Message, MessageStatus
from ..tasks import generate_text_response
from src.models.provider import ProviderService
from src.models.agent import Agent
# --- Add our new tool ---
from ..utils.ai_integration import _get_youtube_transcript
from ..utils.ai_integration import get_decomposed_claims
from ..tasks import verify_sub_claim_task
from ..tasks import process_youtube_summary_task 
# Create a Blueprint for agent routes
agents_bp = Blueprint('agents_bp', __name__)

@agents_bp.route('/agents', methods=['GET'])
@jwt_required()
def get_available_agents():
    """
    Fetches all agents whose underlying AI service is currently active.
    """
    try:
        # Query for agents, joining with the service to check its active status
        active_agents = Agent.query.join(
            ProviderService, Agent.provider_service_id == ProviderService.id
        ).filter(
            ProviderService.is_active == True
        ).all()
        
        # Convert the list of Agent objects to a list of dictionaries
        agents_data = [agent.to_dict() for agent in active_agents]
        
        return jsonify(agents_data)
        
    except Exception as e:
        # Log the error for debugging
        current_app.logger.error(f"Failed to fetch agents: {e}", exc_info=True)
        return jsonify({"message": "Error fetching agent data."}), 500
    
@agents_bp.route('/agents/<int:agent_id>/execute', methods=['POST'])
@jwt_required()
def execute_agent(agent_id):
    current_user_id = get_jwt_identity()
    data = request.get_json()
    agent = Agent.query.get_or_404(agent_id)
    temp_conversation_id = data.get('temp_conversation_id')

    try:
        # --- AGENT-SPECIFIC LOGIC ---

        if agent.name == 'YouTube Summary':
            settings = data.get('youtube_settings')
            prompt = data.get('prompt')

            if not settings or not settings.get('url'):
                return jsonify({"message": "YouTube settings with a URL are required."}), 400
            
            # 1. Create the Conversation with video context
            new_conversation = Conversation(
                title=f"Summary of: {settings.get('url')}",
                user_id=current_user_id,
                agent_id=agent.id,
                video_context_url=settings.get('url'), # Save the context!
                provider_id=agent.provider_service.provider_id,
                provider_service_id=agent.provider_service_id,
                ai_model_id=agent.provider_service.model_api_id,
                service_id=agent.provider_service.service_id
            )
            db.session.add(new_conversation)
            db.session.flush()

            # 2. Create user message and assistant placeholder
            user_message = Message(content=prompt, role='user', conversation_id=new_conversation.id, status=MessageStatus.COMPLETE)
            assistant_placeholder = Message(role='assistant', conversation_id=new_conversation.id, content='', status=MessageStatus.THINKING)
            db.session.add_all([user_message, assistant_placeholder])
            db.session.commit()

            # 3. Trigger the background task for YouTube summarization
            process_youtube_summary_task.delay(
                conversation_id=new_conversation.id,
                assistant_message_id=assistant_placeholder.id,
                youtube_settings=settings,
                prompt=prompt
            )

            # In the final return, create a dictionary from the conversation object
            response_data = new_conversation.to_dict()
            # And add the temporary ID to it
            response_data['temp_conversation_id'] = temp_conversation_id

            return jsonify(response_data), 201

        elif agent.name == 'Fact-Checker':
            user_input = data.get('user_input')
            if not user_input:
                return jsonify({"message": "User input is required."}), 400

            # 1. Create the Conversation for the Fact-Checker
            new_conversation = Conversation(
                title=f"Agent: {agent.name} - \"{user_input[:30]}...\"",
                user_id=current_user_id,
                agent_id=agent.id,
                provider_id=agent.provider_service.provider_id,
                provider_service_id=agent.provider_service_id,
                ai_model_id=agent.provider_service.model_api_id, # Assuming model_api_id is correct
                service_id=agent.provider_service.service_id
            )
            db.session.add(new_conversation)
            db.session.flush()

            # 2. Decompose claims and create initial messages
            sub_claims = get_decomposed_claims(user_input)
            new_conversation.agent_state = {"sub_claims": sub_claims, "current_index": 0}
            
            first_sub_claim = sub_claims[0]
            
            user_message = Message(content=user_input, role='user', conversation_id=new_conversation.id, status=MessageStatus.COMPLETE)
            decomposition_text = "I have decomposed your claim into the following sub-claims:\n\n" + "\n".join([f"{i+1}. {s}" for i, s in enumerate(sub_claims)]) + "\n\nNow, I will verify the first one."
            assistant_message = Message(role='assistant', conversation_id=new_conversation.id, content=decomposition_text, status=MessageStatus.COMPLETE)
            verification_placeholder = Message(role='assistant', conversation_id=new_conversation.id, content='', status=MessageStatus.THINKING)
            db.session.add_all([user_message, assistant_message, verification_placeholder])
            db.session.commit()

            # 3. Trigger the background task for claim verification
            verify_sub_claim_task.delay(
                conversation_id=new_conversation.id,
                sub_claim=first_sub_claim,
                assistant_message_id=verification_placeholder.id
            )

            # In the final return, create a dictionary from the conversation object
            response_data = new_conversation.to_dict()
            # And add the temporary ID to it
            response_data['temp_conversation_id'] = temp_conversation_id

            return jsonify(response_data), 201
        
        else:
            # Fallback for any other agents
            return jsonify({"message": f"Agent '{agent.name}' is not yet implemented."}), 404

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error executing agent {agent_id}: {e}", exc_info=True)
        return jsonify({"message": "Failed to execute agent due to a server error."}), 500