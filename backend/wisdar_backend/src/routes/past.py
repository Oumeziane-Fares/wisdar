# ==============================================================================
#  STEP 2.2: MODIFY THE INITIATE CONVERSATION ROUTE
# ==============================================================================
@chat_bp.route('/conversations/initiate', methods=['POST'])
@jwt_required()
def initiate_conversation():
    current_user_id = get_jwt_identity()
    data = request.form
    content = data.get('content', '')
    ai_model_id = data.get('ai_model_id')
    attachment_file = request.files.get('attachment')

    if not ai_model_id: return jsonify({"message": "AI Model ID is required."}), 400
    if not content and not attachment_file: return jsonify({"message": "Cannot start a conversation with no content."}), 400

    title = (content[:30] + '...') if len(content) > 30 else (content or "New Conversation")
    new_conversation = Conversation(title=title, user_id=current_user_id, ai_model_id=ai_model_id)
    db.session.add(new_conversation)
    db.session.flush()

    user_message = Message(content=content, role='user', conversation_id=new_conversation.id)
    db.session.add(user_message)

    if attachment_file:
        # Attachment logic remains the same: it kicks off a transcription job
        # and does NOT trigger an immediate AI response.
        # ... (paste your existing attachment handling logic here) ...
        try:
            file_path, _ = save_file_locally(attachment_file)
            wav_file_path = convert_audio_to_wav(file_path, attachment_file.filename)
            if not wav_file_path: return jsonify({"message": "Failed to convert audio file."}), 500

            unique_filename = os.path.basename(wav_file_path)
            storage_url = url_for('chat.get_uploaded_file', filename=unique_filename, _external=False)
            
            api_key = current_app.config.get('SPEECHMATICS_API_KEY')
            if not api_key: return jsonify({"message": "Speechmatics API key is not configured."}), 500
                
            job_id = start_speechmatics_job(wav_file_path, api_key)
            if not job_id: return jsonify({"message": "Failed to start transcription job."}), 500

            transcription_placeholder = "Transcription in progress..."
            if not user_message.content:
                user_message.content = transcription_placeholder
                
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type="audio/wav",
                storage_url=storage_url,
                transcription=transcription_placeholder,
                speechmatics_job_id=job_id
            )
            user_message.attachment = new_attachment
        except Exception as e:
            current_app.logger.error(f"Error processing file upload: {e}")
            return jsonify({"message": "Error processing file."}), 500
    else:
        # --- CHANGE: For text-only, trigger the background task ---
        db.session.commit() # Commit here so the task can find the new data
        generate_text_response.delay(new_conversation.id, request.url_root)
        
        # We now return immediately, without the 'assistant_message'
        return jsonify({
            "new_conversation": new_conversation.to_dict(),
            "user_message": user_message.to_dict(request.host_url)
        }), 201

    # This part only runs if there was an attachment
    db.session.commit()
    return jsonify({
        "new_conversation": new_conversation.to_dict(),
        "user_message": user_message.to_dict(request.host_url)
    }), 201


# ==============================================================================
#  STEP 2.2: MODIFY THE POST MESSAGE ROUTE
# ==============================================================================
@chat_bp.route('/messages', methods=['POST'])
@jwt_required()
def post_message():
    current_user_id = get_jwt_identity()
    data = request.form
    conversation_id = data.get('conversation_id')
    content = data.get('content', '')
    attachment_file = request.files.get('attachment')

    if not conversation_id: return jsonify({"message": "Conversation ID is required."}), 400

    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    user_message = Message(content=content, role='user', conversation_id=conversation.id)
    db.session.add(user_message)

    if attachment_file:
        # Attachment logic remains the same
        # ... (paste your existing attachment handling logic here) ...
        try:
            file_path, _ = save_file_locally(attachment_file)
            wav_file_path = convert_audio_to_wav(file_path, attachment_file.filename)
            if not wav_file_path: return jsonify({"message": "Failed to convert audio file."}), 500
            
            unique_filename = os.path.basename(wav_file_path)
            storage_url = url_for('chat.get_uploaded_file', filename=unique_filename, _external=False)
            
            api_key = current_app.config.get('SPEECHMATICS_API_KEY')
            if not api_key: return jsonify({"message": "Speechmatics API key is not configured."}), 500
                
            job_id = start_speechmatics_job(wav_file_path, api_key)
            if not job_id: return jsonify({"message": "Failed to start transcription job."}), 500

            transcription_placeholder = "Transcription in progress..."
            if not user_message.content:
                user_message.content = transcription_placeholder
                
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type="audio/wav",
                storage_url=storage_url,
                transcription=transcription_placeholder,
                speechmatics_job_id=job_id
            )
            user_message.attachment = new_attachment
        except Exception as e:
            current_app.logger.error(f"Error processing file upload: {e}")
            return jsonify({"message": "Error processing file."}), 500
    else:
        # --- CHANGE: For text-only, trigger the background task ---
        db.session.commit()
        generate_text_response.delay(conversation.id, request.url_root)
        
        # Return immediately
        return jsonify({"user_message": user_message.to_dict(request.host_url)}), 200

    # This part only runs if there was an attachment
    db.session.commit()
    return jsonify({"user_message": user_message.to_dict(request.host_url)}), 200





@chat_bp.route('/conversations/initiate', methods=['POST'])
@jwt_required()
def initiate_conversation():
    current_user_id = get_jwt_identity()
    ai_model_id = request.form.get('ai_model_id')
    content = request.form.get('content', '')
    attachment_file = request.files.get('attachment')

    if not ai_model_id: return jsonify({"message": "AI Model ID is required."}), 400
    if not content and not attachment_file: return jsonify({"message": "Cannot start with no content."}), 400

    title_content = content if content else "Voice Note"
    title = (title_content[:30] + '...') if len(title_content) > 30 else title_content
    
    new_conversation = Conversation(title=title, user_id=current_user_id, ai_model_id=ai_model_id)
    db.session.add(new_conversation)
    db.session.flush() 

    user_message = Message(conversation_id=new_conversation.id, role='user', content=content)
    
    if attachment_file:
        try:
            # --- This logic is now only for transcription ---
            file_path, _ = save_file_locally(attachment_file)
            # --- FIX: Pass both arguments to the function ---
            wav_file_path = convert_audio_to_wav(file_path, attachment_file.filename)
            if not wav_file_path: return jsonify({"message": "Failed to convert audio file."}), 500

            unique_filename = os.path.basename(wav_file_path)
            storage_url = url_for('chat.get_uploaded_file', filename=unique_filename, _external=False)
            
            api_key = current_app.config.get('SPEECHMATICS_API_KEY')
            if not api_key: return jsonify({"message": "Speechmatics API key is not configured."}), 500
                
            job_id = start_speechmatics_job(wav_file_path, api_key)
            if not job_id: return jsonify({"message": "Failed to start transcription job."}), 500

            transcription_placeholder = "Transcription in progress..."
            if not user_message.content:
                user_message.content = transcription_placeholder
                
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type="audio/wav",
                storage_url=storage_url,
                transcription=transcription_placeholder,
                speechmatics_job_id=job_id
            )
            user_message.attachment = new_attachment
        except Exception as e:
            current_app.logger.error(f"Error processing file upload: {e}")
            return jsonify({"message": "Error processing file."}), 500
    
    db.session.add(user_message)
    
    # --- MODIFIED: Only call AI if there is NO attachment ---
    if not attachment_file:
        context_messages = [user_message]
        assistant_content = get_ai_response(new_conversation.ai_model_id, context_messages)
        assistant_message = Message(conversation_id=new_conversation.id, role='assistant', content=assistant_content)
        db.session.add(assistant_message)
    # --------------------------------------------------------

    db.session.commit()
    
    host_url = request.host_url
    # The response will now only contain the user's message if an attachment was sent.
    # The AI message will be created later by the webhook.
    response_data = {
        "new_conversation": new_conversation.to_dict(),
        "user_message": user_message.to_dict(host_url), 
    }
    if 'assistant_message' in locals():
        response_data['assistant_message'] = assistant_message.to_dict(host_url)

    return jsonify(response_data), 201


@chat_bp.route('/messages', methods=['POST'])
@jwt_required()
def post_message():
    current_user_id = get_jwt_identity()
    conversation_id = request.form.get('conversation_id')
    content = request.form.get('content', '')
    attachment_file = request.files.get('attachment')

    if not conversation_id: return jsonify({"message": "Conversation ID is required"}), 400
    
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    user_message = Message(conversation_id=conversation.id, role='user', content=content)
    
    if attachment_file:
        try:
            # --- This logic is now only for transcription ---
            file_path, _ = save_file_locally(attachment_file)
            # --- FIX: Pass both arguments to the function ---
            wav_file_path = convert_audio_to_wav(file_path, attachment_file.filename)
            if not wav_file_path: return jsonify({"message": "Failed to convert audio file."}), 500
            
            unique_filename = os.path.basename(wav_file_path)
            storage_url = url_for('chat.get_uploaded_file', filename=unique_filename, _external=False)
            
            api_key = current_app.config.get('SPEECHMATICS_API_KEY')
            if not api_key: return jsonify({"message": "Speechmatics API key is not configured."}), 500
                
            job_id = start_speechmatics_job(wav_file_path, api_key)
            if not job_id: return jsonify({"message": "Failed to start transcription job."}), 500

            transcription_placeholder = "Transcription in progress..."
            if not user_message.content:
                user_message.content = transcription_placeholder
                
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type="audio/wav",
                storage_url=storage_url,
                transcription=transcription_placeholder,
                speechmatics_job_id=job_id
            )
            user_message.attachment = new_attachment
        except Exception as e:
            current_app.logger.error(f"Error processing file upload: {e}")
            return jsonify({"message": "Error processing file."}), 500
    
    db.session.add(user_message)
    db.session.commit()
    
    # --- MODIFIED: Only call AI if there is NO attachment ---
    if not attachment_file:
        context_messages = conversation.messages.order_by(Message.created_at.asc()).all()
        assistant_content = get_ai_response(conversation.ai_model_id, context_messages)
        assistant_message = Message(conversation_id=conversation.id, role='assistant', content=assistant_content)
        db.session.add(assistant_message)
        db.session.commit()
    # --------------------------------------------------------

    host_url = request.host_url
    response_data = {
        "user_message": user_message.to_dict(host_url), 
    }
    if 'assistant_message' in locals():
        response_data['assistant_message'] = assistant_message.to_dict(host_url)

    return jsonify(response_data), 201
 