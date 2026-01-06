# MCP Analysis Server Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose ports: 8085 for health, 8086 for MCP
EXPOSE 8085 8086

# Run the server
CMD ["python", "server.py"]
