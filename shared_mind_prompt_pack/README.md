# Shared Mind Tarot Generator Prompt Pack

Files:
- system_prompt.txt — fixed system instructions for the model
- user_prompt_template.txt — dynamic prompt template with placeholders
- shared_mind_output_schema.json — schema for validating generated output
- generator_config.json — small config describing how the files fit together

Recommended flow:
1. Load system_prompt.txt as the system message.
2. Fill placeholders in user_prompt_template.txt.
3. Send both to the model.
4. Validate the returned JSON against shared_mind_output_schema.json.
5. Check for duplicate card/trial ids.
6. Append valid new content to the main scenario library.

Important:
Generated content should be append-only. Do not ask the model to rewrite the full existing library.
