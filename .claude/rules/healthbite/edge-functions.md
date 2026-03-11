# Edge Function Contracts

All edge functions live in `~/Projects/healthbite/supabase/functions/`. Both Healix and HealthBite call the same functions.

## Calling Convention (from Healix)

```javascript
var response = await fetch(SUPABASE_URL + '/functions/v1/<function-name>', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + session.access_token
  },
  body: JSON.stringify(payload)
});
```

All functions require a valid auth token. They verify the user via Supabase's `getUser()` on the server side.

## chat-with-ai

AI chat with SSE streaming. Uses GPT-5.2 with conversation memory and health context.

**Request:**
```json
{
  "conversation_id": "uuid | null",
  "user_message": "string",
  "stream": true,
  "ui_metadata": {
    "source": "web | mobile",
    "timezone": "America/New_York"
  }
}
```

- Omit `conversation_id` for new conversations (server creates one, returned in `start` event)
- `stream: true` returns SSE; without it returns a single JSON response

**SSE Event Types:**

| Event | Payload | Notes |
|-------|---------|-------|
| `start` | `{ conversation_id }` | Save this ID for follow-up messages |
| `content` | `{ content: "text chunk" }` | Append to message buffer |
| `tool_call` | `{ tool_name }` | Show "thinking"/"searching" indicator |
| `tool_result` | `{ chart_data? }` | Optional visualization data |
| `done` | `{}` | Finalize message, re-enable input |
| `error` | `{ error: "message" }` | Show error, re-enable input |

**Token Budgets:** total 8000, system 400, developer 1200, history 2500, tools 800, user_message 500, buffer 600. Max 20 history messages, summarization after 10 turns.

## analyze-meal-ai

Parse a text meal description into structured nutrition data.

**Request:**
```json
{
  "mealLog": "grilled chicken breast with rice and broccoli",
  "meal_type": "Lunch"
}
```

**Response:** JSON with structured nutrition categories (Macronutrients, Vitamins, Minerals) matching the `meal_log.data` schema. Uses GPT-4o with a `extract_meal_nutrition` tool call. Optionally uses Nutritionix API for lookup if available.

## analyze-meal-from-image

Analyze a food photo to detect items and estimate nutrition.

**Request:** Image data (base64 or URL) with meal context.

**Response:** Same nutrition structure as analyze-meal-ai.

## process-document

Upload and process documents. Auto-detects blood work PDFs and extracts biomarkers.

**Request:**
```json
{
  "upload_id": "uuid",
  "file_url": "supabase-storage-url"
}
```

**Processing pipeline:**
1. Download file from Supabase storage
2. Extract text (plain text, pdf-parse, mammoth for DOCX, GPT vision for scanned PDFs)
3. Detect if blood work via keyword matching (reference range, CBC, CMP, etc.)
4. If blood work: parse biomarkers → upsert into `blood_work_samples` with `upload_id` link
5. Update `uploads.status` to completed/failed

**Blood work detection signals:** "reference range", "laboratory report", "CBC", "CMP", "lipid panel" (need 2+ strong signals or 1 signal + 3 biomarker names)

**Biomarker name mapping:** 40+ variant names mapped to canonical keys (e.g., "Fasting Glucose", "Blood Glucose", "GLUCOSE" all → "Glucose")

**Constants:** MAX_CONTENT_LENGTH=50k chars, MIN_TEXT_CHARS_FOR_PDF=100

## generate-health-insight

Generate a single-metric health insight with color-coded labels.

**Request:** Metric type and recent data for that metric.

**Response:** Insight text with risk level and color coding.

## generate-unified-health-summary

"Boss Insight" — aggregated health summary for the home screen.

**Request:** User ID (from auth token). Aggregates all available health data.

**Response:** Summary covering activity, vitals, sleep, nutrition with actionable insights.

**Sleep data note:** This function reads sleep data from both:
- `text_value` column (human-readable: "in_bed", "asleep", "awake", "core", "deep", "rem")
- `metadata` jsonb column (`{ sleep_state: "..." }`)

## featurebase-generate-code

SSO auth code generation for the Featurebase feedback portal. Not used by Healix.
