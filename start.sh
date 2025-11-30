#!/bin/bash
# Quick start script for the flood monitor application

echo "🚀 Starting Rio Flood Monitor..."
echo ""

# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    echo "✅ Python 3 found"
    echo "📡 Starting HTTP server on http://localhost:8000"
    echo ""
    echo "🌐 Open your browser and navigate to:"
    echo "   http://localhost:8000"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    python3 server.py
elif command -v python &> /dev/null; then
    echo "✅ Python found"
    echo "📡 Starting HTTP server on http://localhost:8000"
    echo ""
    echo "🌐 Open your browser and navigate to:"
    echo "   http://localhost:8000"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    python server.py
else
    echo "❌ Python not found. Please install Python 3 to run the server."
    echo ""
    echo "Alternative: Use any HTTP server:"
    echo "  - Node.js: npx http-server"
    echo "  - PHP: php -S localhost:8000"
    echo "  - Ruby: ruby -run -e httpd . -p 8000"
    exit 1
fi

