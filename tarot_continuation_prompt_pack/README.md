# Tarot Domain Conversation Continuation Prompt Pack

This prompt pack generates gentle, non-repetitive conversation directions after a multiplayer Tarot interaction.

The application may call this generator when a participant's predicted Tarot-domain tendency does not match the target participant's actual choice. The mismatch is an internal routing signal only. It must never be shown to either participant as a mistake, score, evaluation, or lack of understanding.

## Files

- `system_prompt.txt` — fixed model instructions.
- `user_prompt_template.txt` — runtime input template with placeholders.
- `tarot_continuation_output_schema.json` — strict JSON Schema for model output.
- `generator_config.json` — integration metadata and placeholder definitions.

## Runtime flow

1. Load `system_prompt.txt` as the model instructions.
2. Fill every placeholder in `user_prompt_template.txt`.
3. Call the OpenAI Responses API with Structured Outputs using the supplied schema.
4. Parse and validate the returned JSON.
5. Show only the three generated directions to the relevant participant.
6. Keep the target's actual option, score, and the prediction comparison server-side.

## Privacy and product rules

- Do not send names, contact information, or sensitive personal data.
- Do not reveal the target's actual answer or numeric score in the generated content.
- Do not mention prediction, correctness, mismatch, hidden answers, Tarot diagnosis, or personality labels.
- Use Tarot as a narrative lens for a conversation domain, not as a scientific assessment or fortune-telling system.
- If the API call fails, the application should use safe static fallback directions rather than blocking the activity.
