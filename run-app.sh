#!/bin/bash

# Excel/CSV Merger - Run Buntralino Desktop App
echo "🚀 Starting Excel/CSV Merger Buntralino Desktop App..."

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install Bun first:"
    echo "   curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Build the app
echo "🔨 Building the app..."
bun run build

# Run the desktop app
echo "🖥️ Starting Buntralino desktop application..."
echo "📱 This will open as a native desktop app window"
echo "💡 Press Ctrl+C to stop the app"
echo ""

bun run start
