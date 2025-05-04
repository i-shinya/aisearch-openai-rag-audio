import logging
import os
from pathlib import Path

import aiohttp
from aiohttp import web
from aiohttp.web_response import StreamResponse
from azure.core.credentials import AzureKeyCredential
from azure.identity import AzureDeveloperCliCredential, DefaultAzureCredential
from dotenv import load_dotenv

from ragtools import attach_rag_tools, search_tool_schema, grounding_tool_schema
from rtmt import RTMiddleTier

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voicerag")

async def get_token(request) -> StreamResponse:
    # azure open aiがweb rtcに対応していなかったのでOpenAIで代用
    url = "https://api.openai.com/v1/realtime/sessions"
    headers = {
        "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
        "Content-Type": "application/json",
    }

    instructions = """
        You are a helpful assistant. Only answer questions based on information you searched in the knowledge base, accessible with the 'search' tool.
        The user is listening to answers with audio, so it's *super* important that answers are as short as possible, a single sentence if at all possible.
        Never read file names or source names or keys out loud.
        常に日本語で回答してね
    """.strip()

    # instructions = """
    #     You are a helpful assistant. Only answer questions based on information you searched in the knowledge base, accessible with the 'search' tool.
    #     The user is listening to answers with audio, so it's *super* important that answers are as short as possible, a single sentence if at all possible.
    #     Never read file names or source names or keys out loud.
    #     Always use the following step-by-step instructions to respond:
    #     1. Always use the 'search' tool to check the knowledge base before answering a question.
    #     2. Always use the 'report_grounding' tool to report the source of information from the knowledge base.
    #     3. Produce an answer that's as short as possible. If the answer isn't in the knowledge base, say you don't know.
    # """.strip()

    tools = [
        # search_tool_schema,
        # grounding_tool_schema
    ]
    payload = {
        "model": "gpt-4o-realtime-preview-2024-12-17",
        "voice": "verse",
        "instructions": instructions,
        "tools": tools,
        "tool_choice": "auto",
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url=url, json=payload, headers=headers) as resp:
            print(resp.status)
            json = await resp.json()
            print(json)
            client_secret = json.pop("client_secret").pop("value")
            print(client_secret)
    return web.json_response({"key": client_secret})

async def create_app():
    if not os.environ.get("RUNNING_IN_PRODUCTION"):
        logger.info("Running in development mode, loading from .env file")
        load_dotenv()

    llm_key = os.environ.get("AZURE_OPENAI_API_KEY")
    search_key = os.environ.get("AZURE_SEARCH_API_KEY")

    credential = None
    if not llm_key or not search_key:
        if tenant_id := os.environ.get("AZURE_TENANT_ID"):
            logger.info("Using AzureDeveloperCliCredential with tenant_id %s", tenant_id)
            credential = AzureDeveloperCliCredential(tenant_id=tenant_id, process_timeout=60)
        else:
            logger.info("Using DefaultAzureCredential")
            credential = DefaultAzureCredential()
    llm_credential = AzureKeyCredential(llm_key) if llm_key else credential
    search_credential = AzureKeyCredential(search_key) if search_key else credential
    
    app = web.Application()
    app.router.add_get("/session", get_token)
    # app.router.add_get("/tools", tools_action)

    current_directory = Path(__file__).parent
    app.add_routes([web.get('/', lambda _: web.FileResponse(current_directory / 'static/index.html'))])
    app.router.add_static('/', path=current_directory / 'static', name='static')
    
    return app

if __name__ == "__main__":
    host = "localhost"
    port = 8765
    web.run_app(create_app(), host=host, port=port)
