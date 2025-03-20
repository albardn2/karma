# run.py
import os
from dotenv import load_dotenv, find_dotenv
from app import create_app

print(find_dotenv())
load_dotenv(dotenv_path="/Users/zaid/Desktop/karma/backend/.env")
print(os.getenv('GOOGLE_APPLICATION_CREDENTIALS'))

app = create_app()

if __name__ == '__main__':
    app.run()