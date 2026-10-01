import os
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
from .agent import AgentLoop

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[WebSocket, AgentLoop] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        # Initialize an AgentLoop instance for this connection
        agent_loop = AgentLoop(websocket)
        self.active_connections[websocket] = agent_loop

        # Send init state with available skills
        try:
            from . import skills_manager
            available_skills = skills_manager.get_all_skills()
            await websocket.send_json({
                "type": "init_state",
                "available_skills": list(available_skills.keys()),
                "active_skills": []
            })
        except Exception as e:
            print(f"Error sending init state: {e}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            agent_loop = self.active_connections[websocket]
            agent_loop.stop() # Ensure the loop is stopped
            del self.active_connections[websocket]

    async def send_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

manager = ConnectionManager()

@router.websocket("/ws/agent")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    agent_loop = manager.active_connections[websocket]

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "start_goal":
                goal = data.get("goal")
                hitl_enabled = data.get("hitl_enabled", False)
                if goal:
                    # Start the agent loop in an async task so we don't block the receiver
                    asyncio.create_task(agent_loop.run(goal, hitl_enabled))

            elif action == "abort":
                agent_loop.stop()
                await manager.send_message({"type": "status", "message": "Agent loop aborted by user."}, websocket)

            elif action == "approve_action":
                agent_loop.set_hitl_approval(True)

            elif action == "reject_action":
                agent_loop.set_hitl_approval(False)
                await manager.send_message({"type": "status", "message": "Action rejected by user. Aborting loop."}, websocket)
                agent_loop.stop()

    except WebSocketDisconnect:
        manager.disconnect(websocket)
