import uvicorn
from fastapi import FastAPI
from dotenv import load_dotenv
from .router import router

load_dotenv()

app = FastAPI(title="Castor Backend API")

app.include_router(router)

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
