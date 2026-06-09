# KRISHISEV

KRISHISEV is a local farmer-assistance web app with:

- AI-style agriculture chatbot
- Crop recommendation API
- Leaf image disease analysis API
- Soil health dashboard
- Responsive frontend with dark mode
- Farmer login with saved conversation history

## Run

Double-click `start_app.bat`, or run the server with `py server.py` / `python server.py`, then open:

```text
http://127.0.0.1:8000
```

## Notes

The app runs fully on the local machine. The current crop and disease engines are heuristic prediction services designed with the same API shape needed for XGBoost and ResNet. When trained model files are available, `server.py` can be extended to load those exact models.

The chat endpoint is keyword-based today, so it uses regex matching rather than an AI model. A future upgrade to Anthropic or another hosted LLM via `/api/chat` would make the assistant much more useful for farmers.

## Login

Use an email id and password to create an account or sign in. Duplicate email ids are rejected, and incorrect email/password combinations are blocked.

## Suggested Upgrades

- Replace the regex chat responder in `/api/chat` with an Anthropic-backed LLM for richer guidance.
- Add real authentication and password storage before deploying beyond a local machine.
- Swap the heuristic crop, soil and disease logic for trained XGBoost and ResNet models when those assets are available.

## Soil Report

Upload a soil image in Soil Scan to generate an approximate moisture report and ranked crop suggestions.
